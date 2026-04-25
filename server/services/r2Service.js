const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');

function getR2Client() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Missing R2 env vars (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

function getBucket() {
  if (!process.env.R2_BUCKET_NAME) throw new Error('Missing R2_BUCKET_NAME env var');
  return process.env.R2_BUCKET_NAME;
}

/**
 * Generate a presigned PUT URL for direct client-side upload to R2.
 * expiresIn: seconds (default 3600 = 1 hour)
 */
async function getPresignedUploadUrl(key, contentType, expiresIn = 3600) {
  const client = getR2Client();
  const cmd = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  });
  return getSignedUrl(client, cmd, { expiresIn });
}

/**
 * Generate a presigned GET URL for serving files via a redirect.
 * expiresIn: seconds (default 3600 = 1 hour)
 */
async function getPresignedGetUrl(key, expiresIn = 3600) {
  const client = getR2Client();
  const cmd = new GetObjectCommand({ Bucket: getBucket(), Key: key });
  return getSignedUrl(client, cmd, { expiresIn });
}

/**
 * Upload a local file to R2 (used by server-side PUT /photos and /documents).
 */
async function uploadLocalFile(key, localPath, contentType) {
  const client = getR2Client();
  const body = fs.createReadStream(localPath);
  await client.send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
  }));
}

/**
 * Return a Node.js Readable stream for a key (used during Drive upload).
 */
async function getReadStream(key) {
  const client = getR2Client();
  const res = await client.send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
  return res.Body; // Node.js Readable in Node.js runtime
}

/**
 * Delete a single object from R2 (silent if key doesn't exist).
 */
async function deleteObject(key) {
  try {
    const client = getR2Client();
    await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
  } catch {
    // Non-fatal — key may already be gone
  }
}

/**
 * Delete multiple objects from R2 in one batch call.
 * Silent errors — missing keys are ignored.
 */
async function deleteObjects(keys) {
  if (!keys || keys.length === 0) return;
  try {
    const client = getR2Client();
    // R2 batch delete supports up to 1000 objects per call
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await client.send(new DeleteObjectsCommand({
        Bucket: getBucket(),
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      }));
    }
  } catch {
    // Non-fatal
  }
}

module.exports = {
  getPresignedUploadUrl,
  getPresignedGetUrl,
  uploadLocalFile,
  getReadStream,
  deleteObject,
  deleteObjects,
};
