import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const ALGO = "aes-256-gcm";

function deriveKey(): Buffer {
  return createHash("sha256").update(env.JWT_SECRET).digest();
}

export function encryptSecret(value: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(value: string): string {
  if (!value.startsWith("v1:")) {
    return value;
  }

  const [, ivHex, tagHex, payloadHex] = value.split(":");
  if (!ivHex || !tagHex || !payloadHex) {
    throw new Error("密钥格式无效");
  }

  const key = deriveKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const payload = Buffer.from(payloadHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(payload), decipher.final()]);
  return plain.toString("utf8");
}

export function maskSecret(value: string): string {
  if (!value) {
    return "";
  }
  const tail = value.slice(-4);
  return `${"*".repeat(Math.max(4, value.length - 4))}${tail}`;
}
