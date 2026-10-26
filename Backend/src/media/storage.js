const fs = require("fs");
const path = require("path");
const { createPresignedPost } = require("@aws-sdk/s3-presigned-post");

const uploadDir = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
let s3;
let s3Commands;
if (bucket) {
  try {
    s3Commands = require("@aws-sdk/client-s3");
    s3 = new s3Commands.S3Client({ region: process.env.AWS_REGION });
  } catch (error) {
    throw new Error("S3_BUCKET is set but @aws-sdk/client-s3 is not installed");
  }
}

const isS3Enabled = Boolean(bucket);

async function putObject({ key, body, contentType }) {
  if (isS3Enabled) {
    await s3.send(new s3Commands.PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION || "AES256",
    }));
    return;
  }

  await fs.promises.writeFile(path.join(uploadDir, path.basename(key)), body);
}

async function createUploadForm({ key, contentType, maxSize }) {
  if (!isS3Enabled) return null;
  return createPresignedPost(s3, {
    Bucket: bucket,
    Key: key,
    Expires: 600,
    Fields: { "Content-Type": contentType },
    Conditions: [
      ["content-length-range", 1, maxSize],
      ["eq", "$Content-Type", contentType],
    ],
  });
}

async function finalizeUpload({ stagingKey, finalKey, contentType, maxSize, verifySignature }) {
  const head = await s3.send(new s3Commands.HeadObjectCommand({ Bucket: bucket, Key: stagingKey }));
  if (!head.ContentLength || head.ContentLength > maxSize || head.ContentType !== contentType) {
    await deleteObject(stagingKey);
    throw new Error("Uploaded file does not match its signed upload details");
  }

  const range = await s3.send(new s3Commands.GetObjectCommand({
    Bucket: bucket,
    Key: stagingKey,
    Range: "bytes=0-15",
  }));
  const chunks = [];
  for await (const chunk of range.Body) chunks.push(Buffer.from(chunk));
  const signature = Buffer.concat(chunks);
  if (!verifySignature(signature, contentType)) {
    await deleteObject(stagingKey);
    throw new Error("File contents do not match an allowed type");
  }

  const copySource = `${bucket}/${stagingKey.split("/").map(encodeURIComponent).join("/")}`;
  await s3.send(new s3Commands.CopyObjectCommand({
    Bucket: bucket,
    Key: finalKey,
    CopySource: copySource,
    MetadataDirective: "REPLACE",
    ContentType: contentType,
    ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION || "AES256",
  }));
  await deleteObject(stagingKey);
  return { size: head.ContentLength };
}

async function getDownloadTarget(key, range) {
  const localPath = path.join(uploadDir, path.basename(key));
  if (!isS3Enabled) return { path: localPath };

  try {
    const result = await s3.send(new s3Commands.GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(range ? { Range: range } : {}),
    }));
    return {
      body: result.Body,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      contentRange: result.ContentRange,
      acceptRanges: result.AcceptRanges,
    };
  } catch (error) {
    // Let older local uploads continue to work during storage migration.
    if (error.name !== "NoSuchKey" && error.name !== "NotFound" && error.$metadata?.httpStatusCode !== 404) throw error;
    if (fs.existsSync(localPath)) return { path: localPath };
    throw error;
  }
}

async function objectExists(key) {
  if (!isS3Enabled) return fs.existsSync(path.join(uploadDir, path.basename(key)));
  try {
    await s3.send(new s3Commands.HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error.name === "NoSuchKey" || error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}

async function deleteObject(key) {
  if (isS3Enabled) {
    await s3.send(new s3Commands.DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }
  await fs.promises.unlink(path.join(uploadDir, path.basename(key))).catch(() => {});
}

module.exports = { isS3Enabled, putObject, createUploadForm, finalizeUpload, getDownloadTarget, objectExists, deleteObject };
