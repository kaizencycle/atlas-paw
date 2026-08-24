import { createHmac, timingSafeEqual } from "crypto";

export const OAA_AGENT_HEADER = "x-oaa-agent";
export const OAA_TIMESTAMP_HEADER = "x-oaa-timestamp";
export const OAA_SIGNATURE_HEADER = "x-oaa-signature";

const DEFAULT_AGENT_ID = "mobius-atlas-claude";

export type OaaHmacHeaders = {
  [OAA_AGENT_HEADER]: string;
  [OAA_TIMESTAMP_HEADER]: string;
  [OAA_SIGNATURE_HEADER]: string;
};

export function timingSafeEqualString(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

export function verifyWebhookSecret(
  authorization: string | null,
  secret: string
): boolean {
  if (!secret) return false;
  const token = extractBearerToken(authorization);
  if (!token) return false;
  return timingSafeEqualString(token, secret);
}

export function signOaaEnvelope(params: {
  bodyText: string;
  secret: string;
  agentId?: string;
  timestampSeconds?: number;
}): { payload: string; headers: OaaHmacHeaders } {
  const agentId = params.agentId?.trim() || DEFAULT_AGENT_ID;
  const timestamp = String(params.timestampSeconds ?? Math.floor(Date.now() / 1000));
  const payload = `${timestamp}.${params.bodyText}`;
  const signature = createHmac("sha256", params.secret)
    .update(payload, "utf8")
    .digest("hex");

  return {
    payload,
    headers: {
      [OAA_AGENT_HEADER]: agentId,
      [OAA_TIMESTAMP_HEADER]: timestamp,
      [OAA_SIGNATURE_HEADER]: signature,
    },
  };
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}
