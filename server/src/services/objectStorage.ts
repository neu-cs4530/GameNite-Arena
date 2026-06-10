/**
 * Node side of the shared .pth store. Mirror of the Python storage.py used by
 * the inference service. On Render the worker and the inference service are
 * separate services with separate ephemeral disks, so they share an
 * S3-compatible bucket instead of a local directory.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import * as fs from "node:fs";
import { Readable } from "node:stream";

export class StorageError extends Error {}

function getBucket(): string {
  const b = process.env["OBJECT_STORE_BUCKET"];
  if (!b) throw new StorageError("OBJECT_STORE_BUCKET is not set");
  return b;
}

let s3Client: S3Client | undefined;
function getClient(): S3Client {
  if (s3Client) return s3Client;
  s3Client = new S3Client({
    endpoint: process.env["OBJECT_STORE_ENDPOINT"] || undefined,
    region: process.env["OBJECT_STORE_REGION"] ?? "auto",
    credentials: {
      accessKeyId: process.env["OBJECT_STORE_ACCESS_KEY"] ?? "",
      secretAccessKey: process.env["OBJECT_STORE_SECRET_KEY"] ?? "",
    },
    forcePathStyle: true,
  });
  return s3Client;
}

/** Upload a local file to `key`. Returns the key. */
export async function uploadFile(localPath: string, key: string): Promise<string> {
  try {
    const body = fs.readFileSync(localPath);
    /* eslint-disable @typescript-eslint/naming-convention */
    await getClient().send(new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: body }));
    /* eslint-enable @typescript-eslint/naming-convention */
    return key;
  } catch (err) {
    throw new StorageError(`Failed to upload ${key}: ${(err as Error).message}`);
  }
}

/** Download object `key` to local `destPath`. Returns destPath. */
export async function downloadTo(key: string, destPath: string): Promise<string> {
  try {
    /* eslint-disable @typescript-eslint/naming-convention */
    const out = await getClient().send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
    /* eslint-enable @typescript-eslint/naming-convention */
    const body = out.Body as Readable;
    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(destPath);
      body.pipe(ws);
      body.on("error", reject);
      ws.on("finish", () => {
        resolve();
      });
      ws.on("error", reject);
    });
    return destPath;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("NoSuchKey") || msg.includes("NotFound")) {
      throw new StorageError(`Object not found: ${key}`);
    }
    throw new StorageError(`Failed to download ${key}: ${msg}`);
  }
}

/** True if `key` exists in the bucket. */
export async function exists(key: string): Promise<boolean> {
  try {
    /* eslint-disable @typescript-eslint/naming-convention */
    await getClient().send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));
    /* eslint-enable @typescript-eslint/naming-convention */
    return true;
  } catch {
    return false;
  }
}
