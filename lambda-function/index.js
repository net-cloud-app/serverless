const AWS = require('aws-sdk');
const axios = require('axios');
const { Storage } = require('@google-cloud/storage');
const nodemailer = require('nodemailer');

const s3 = new AWS.S3();
const storage = new Storage();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

exports.handler = async (event, context) => {
  console.log('Lambda function triggered by SNS:', JSON.stringify(event));
  try {
    const snsMessage = JSON.parse(event.Records[0].Sns.Message);

    const { userId, assignment_Id, submissionUrl } = snsMessage;

    // Download the release from the provided URL
    const releaseBuffer = await downloadRelease(submissionUrl);

    if (!releaseBuffer || releaseBuffer.length === 0) {
      await sendEmail(userId, 'Error', 'Invalid release URL or empty release payload.');
      return { statusCode: 500, body: 'Error: Invalid release URL or empty release payload.' };
    }

    // Store the release in Google Cloud Storage
    const objectPath = await uploadToGoogleCloud(userId, assignment_Id, releaseBuffer);

    // Email the user with the status and GCS path
    await sendEmail(userId, 'Success', `Release stored in GCS at ${objectPath}`);

    // Track the email in DynamoDB
    await updateDynamoDB(userId, assignment_Id, objectPath, "Success", "");

    return { statusCode: 200, body: 'Success' };
  } catch (error) {
    console.error('Error:', error);
    await updateDynamoDB(userId, assignment_Id, null, "Failed", error.message);
    return { statusCode: 500, body: `Error: ${error.message}` };
  }
};

async function downloadRelease(submissionUrl) {
  try {
    const response = await axios.get(submissionUrl, { responseType: 'arraybuffer' });
    return response.data;
  } catch (error) {
    console.error('Error downloading release:', error);
    return null;
  }
}

async function uploadToGoogleCloud(userId, assignment_Id, releaseBuffer) {
  const objectPath = `${userId}/${assignment_Id}/release.zip`;
  const bucketName = GCS_BUCKET_NAME;

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectPath);

  await file.save(releaseBuffer);
  return `https://storage.googleapis.com/${bucketName}/${objectPath}`;
}

async function sendEmail(userId, subject, message) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: 'postmaster@demo.harishnetcloud.site',
    to: 'harishrao9121@gmail.com', // Assuming userId is the user's email
    subject,
    text: message,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully!');
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

async function updateDynamoDB(userId, assignmentId, fileURL, status, errorMessage) {
  const params = {
    TableName: DYNAMODB_TABLE_NAME,
    Item: {
      userId,
      assignmentId,
      fileURL,
      timestamp: new Date().toISOString(),
      status,
      errorMessage,
    },
  };

  await dynamoDB.put(params).promise();
}


// const AWS = require('aws-sdk');
// const axios = require('axios');
// const { Storage } = require('@google-cloud/storage');
// const nodemailer = require('nodemailer');

// const s3 = new AWS.S3();
// const storage = new Storage();
// const dynamoDB = new AWS.DynamoDB();

// const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
// const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

// exports.handler = async (event, context) => {
//   console.log('Lambda function triggered by SNS:', JSON.stringify(event));
//   try {
//     const snsMessage = JSON.parse(event.Records[0].Sns.Message);

//     const { userId, assignment_Id, submissionUrl } = snsMessage;

//     // Download the release from the provided URL
//     const releaseBuffer = await downloadRelease(submissionUrl);

//     if (!releaseBuffer || releaseBuffer.length === 0) {
//       await sendEmail(userId, 'Error', 'Invalid release URL or empty release payload.');
//       return { statusCode: 500, body: 'Error: Invalid release URL or empty release payload.' };
//     }

//     // Store the release in Google Cloud Storage
//     const objectPath = await storeInGCS(userId, assignment_Id, submissionUrl);

//     // Email the user with the status and GCS path
//     await sendEmail(userId, 'Success', `Release stored in GCS at ${objectPath}`);

//     // Track the email in DynamoDB
//     await trackEmail(userId, assignment_Id, objectPath);

//     return { statusCode: 200, body: 'Success' };
//   } catch (error) {
//     console.error('Error:', error);
//     return { statusCode: 500, body: `Error: ${error.message}` };
//   }
// };

// async function downloadRelease(submissionUrl) {
//   try {
//     const response = await axios.get(submissionUrl, { responseType: 'arraybuffer' });
//     return response.data;
//   } catch (error) {
//     console.error('Error downloading release:', error);
//     return null;
//   }
// }

// async function storeInGCS(userId, assignment_Id, releaseBuffer) {
//   const objectPath = `${userId}/${assignment_Id}/release.zip`;
//   await storage.bucket(GCS_BUCKET_NAME).file(objectPath).save(releaseBuffer);
//   return `gs://${GCS_BUCKET_NAME}/${objectPath}`;
// }

// async function sendEmail(userId, subject, message) {
//   // Configure your email transport (Mailgun SMTP or other)
//   const transporter = nodemailer.createTransport({
//     host: 'smtp.mailgun.org',
//     port: 587, // or 465 for SSL
//     secure: false, // true for 465, false for other ports
//     auth: {
//       user: process.env.EMAIL_USERNAME,
//       pass: process.env.EMAIL_PASSWORD,
//     },
//   });

//   const mailOptions = {
//     from: 'postmaster@demo.harishnetcloud.site', // Replace with your email address
//     to: 'takkallapally.h@northeastern.edu', // Replace with the user's email
//     subject,
//     text: message,
//   };

//   try {
//     await transporter.sendMail(mailOptions);
//     console.log('Email sent successfully!');
//   } catch (error) {
//     console.error('Error sending email:', error);
//     throw error; // Rethrow the error for handling at a higher level
//   }
// }

// async function trackEmail(userId, assignment_Id, objectPath) {
//   const params = {
//     TableName: DYNAMODB_TABLE_NAME,
//     Item: {
//       userId: { S: userId },
//       assignmentId: { S: assignment_Id },
//       objectPath: { S: objectPath },
//       timestamp: { N: `${Math.floor(new Date().getTime() / 1000)}` },
//     },
//   };

//   await dynamoDB.putItem(params).promise();
// }
