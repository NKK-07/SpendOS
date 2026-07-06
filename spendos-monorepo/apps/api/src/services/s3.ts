import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';

export const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock_access_key',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock_secret_key',
  },
  maxAttempts: 2,
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 2000,
    requestTimeout: 2000,
  }),
});

export const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'spendos-receipts';

/**
 * Generate a pre-signed URL for an expense receipt upload.
 * @param key The object key (e.g., `company_id/expense_id/filename`)
 * @param contentType The MIME type of the file
 * @returns The pre-signed URL string
 */
export async function generateUploadUrl(key: string, contentType: string): Promise<string> {
  if (process.env.AWS_ACCESS_KEY_ID === 'mock_access_key' || !process.env.AWS_ACCESS_KEY_ID) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error("SRE SECURITY VIOLATION: AWS credentials missing in production. Cannot fallback to local S3.");
    }
    return `http://localhost:3000/local-s3/${encodeURIComponent(key)}`;
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 900 });
}

export async function generateDownloadUrl(key: string, fileName: string): Promise<string> {
  if (process.env.AWS_ACCESS_KEY_ID === 'mock_access_key' || !process.env.AWS_ACCESS_KEY_ID) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error("SRE SECURITY VIOLATION: AWS credentials missing in production. Cannot fallback to local S3.");
    }
    return `http://localhost:3000/local-s3/${encodeURIComponent(key)}`;
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${fileName}"`,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 900 });
}
