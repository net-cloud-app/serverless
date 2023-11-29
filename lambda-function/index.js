const AWS = require('aws-sdk');
const axios = require('axios');
const { Storage } = require('@google-cloud/storage');
const nodemailer = require('nodemailer');

const s3 = new AWS.S3();
const storage = new Storage();
const dynamoDB = new AWS.DynamoDB();

const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

exports.handler = async (event, context) => {
  try {
    const snsMessage = JSON.parse(event.Records[0].Sns.Message);

    const { userId, assignmentId, releaseUrl } = snsMessage;

    // Download the release from the provided URL
    const releaseBuffer = await downloadRelease(releaseUrl);

    if (!releaseBuffer || releaseBuffer.length === 0) {
      await sendEmail(userId, 'Error', 'Invalid release URL or empty release payload.');
      return { statusCode: 500, body: 'Error: Invalid release URL or empty release payload.' };
    }

    // Store the release in Google Cloud Storage
    const objectPath = await storeInGCS(userId, assignmentId, releaseBuffer);

    // Email the user with the status and GCS path
    await sendEmail(userId, 'Success', `Release stored in GCS at ${objectPath}`);

    // Track the email in DynamoDB
    await trackEmail(userId, assignmentId, objectPath);

    return { statusCode: 200, body: 'Success' };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: `Error: ${error.message}` };
  }
};

async function downloadRelease(releaseUrl) {
  try {
    const response = await axios.get(releaseUrl, { responseType: 'arraybuffer' });
    return response.data;
  } catch (error) {
    console.error('Error downloading release:', error);
    return null;
  }
}

async function storeInGCS(userId, assignmentId, releaseBuffer) {
  const objectPath = `${userId}/${assignmentId}/release.zip`;
  await storage.bucket(GCS_BUCKET_NAME).file(objectPath).save(releaseBuffer);
  return `gs://${GCS_BUCKET_NAME}/${objectPath}`;
}

async function sendEmail(userId, subject, message) {
  // Configure your email transport (Mailgun SMTP or other)
  const transporter = nodemailer.createTransport({
    host: 'smtp.mailgun.org',
    port: 587, // or 465 for SSL
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: 'postmaster@demo.harishnetcloud.site', // Replace with your email address
    to: 'harishrao9121@gmail.com', // Replace with the user's email
    subject,
    text: message,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully!');
  } catch (error) {
    console.error('Error sending email:', error);
    throw error; // Rethrow the error for handling at a higher level
  }
}

async function trackEmail(userId, assignmentId, objectPath) {
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    Item: {
      userId: { S: userId },
      assignmentId: { S: assignmentId },
      objectPath: { S: objectPath },
      timestamp: { N: `${Math.floor(new Date().getTime() / 1000)}` },
    },
  };

  await dynamoDB.putItem(params).promise();
}
