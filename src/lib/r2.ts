import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export async function createR2UploadUrl(params: {
  key: string;
  mimeType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: params.key,
    ContentType: params.mimeType,
  });
  return getSignedUrl(r2Client, cmd, {
    expiresIn: params.expiresInSeconds ?? 60 * 10,
  });
}

export async function checkR2ObjectExists(key: string): Promise<boolean> {
  try {
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function createR2DownloadUrl(params: {
  key: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: params.key,
  });
  return getSignedUrl(r2Client, cmd, {
    expiresIn: params.expiresInSeconds ?? 60 * 15,
  });
}
