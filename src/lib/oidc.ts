import { randomBytes } from "node:crypto";
import { Issuer, type Client, type TokenSet } from "openid-client";
import { env } from "../config/env.js";

let clientPromise: Promise<Client> | null = null;

function hasOidcEnv(): boolean {
  return Boolean(env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET && env.OIDC_REDIRECT_URI);
}

async function buildClient(): Promise<Client> {
  if (!hasOidcEnv()) {
    throw new Error("OIDC 环境变量未配置完整");
  }
  const issuer = await Issuer.discover(env.OIDC_ISSUER!);
  return new issuer.Client({
    client_id: env.OIDC_CLIENT_ID!,
    client_secret: env.OIDC_CLIENT_SECRET!,
    redirect_uris: [env.OIDC_REDIRECT_URI!],
    response_types: ["code"],
  });
}

export function isOidcReady(): boolean {
  return hasOidcEnv();
}

export async function getOidcClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = buildClient();
  }
  return clientPromise;
}

export function generateState(): string {
  return randomBytes(24).toString("hex");
}

export function generateNonce(): string {
  return randomBytes(24).toString("hex");
}

export async function buildAuthorizationUrl(params: { state: string; nonce: string }): Promise<string> {
  const client = await getOidcClient();
  return client.authorizationUrl({
    scope: env.OIDC_SCOPE,
    state: params.state,
    nonce: params.nonce,
  });
}

export async function exchangeCode(params: {
  callbackParams: Record<string, string | string[] | undefined>;
  state: string;
  nonce: string;
}): Promise<TokenSet> {
  const client = await getOidcClient();
  return client.callback(env.OIDC_REDIRECT_URI!, params.callbackParams, {
    state: params.state,
    nonce: params.nonce,
  });
}

export function sanitizeUsername(raw: string): string {
  const normalized = raw
    .trim()
    .replace(/[^\w.-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 24);
  return normalized.length >= 2 ? normalized : "elysia_user";
}
