const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const URL_EXPIRATION = 24 * 60 * 60; // 24 hours in seconds

async function uploadToS3(filePath, contentType = "video/webm") {
  let fileStream;
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }

    fileStream = fs.createReadStream(filePath);
    const fileName = `${uuidv4()}.webm`;

    console.log(`Uploading file to S3...`);
    console.log(`Bucket: ${BUCKET_NAME}`);
    console.log(`File name: ${fileName}`);
    console.log(`Content type: ${contentType}`);

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: fileStream,
      ContentType: contentType,
    };

    // Upload to S3
    console.log("Sending PutObjectCommand to S3...");
    await s3Client.send(new PutObjectCommand(uploadParams));
    console.log("File uploaded successfully");

    // Generate a signed URL for downloading
    console.log("Generating signed URL...");
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: URL_EXPIRATION,
    });
    console.log("Signed URL generated successfully");

    // Clean up the local file
    fileStream.close();
    fs.unlinkSync(filePath);
    console.log("Local file cleaned up");

    return {
      url: signedUrl,
      key: fileName,
    };
  } catch (error) {
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      code: error.code,
      requestId: error.$metadata?.requestId,
      cfId: error.$metadata?.cfId,
      statusCode: error.$metadata?.httpStatusCode,
    });

    // Clean up resources in case of error
    if (fileStream) {
      fileStream.close();
    }

    // Don't delete the local file in case of upload error
    // This allows for retry attempts

    throw error; // Throw the original error to preserve the stack trace
  }
}

module.exports = {
  uploadToS3,
};
