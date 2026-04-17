import { kvConfigured, kvGet, kvSet } from "@/lib/kv";

const TUNNEL_URL_ENV = process.env.OPENCLAW_TUNNEL_URL || "";
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";

const KV_TUNNEL_URL = "atlas:paw:tunnel-url";
const KV_TUNNEL_HEALTH = "atlas:paw:tunnel-health";
const HEALTH_TTL_SECONDS = 10;

type CachedHealth = { ok: boolean; at: string };

async function resolveTunnelUrl(): Promise<string> {
  if (kvConfigured()) {
    const fromKv = await kvGet<string>(KV_TUNNEL_URL);
    if (typeof fromKv === "string" && fromKv.startsWith("https://")) {
      return fromKv;
    }
  }
  return TUNNEL_URL_ENV;
}

export function openclawConfigured(): boolean {
  return Boolean(TOKEN && (TUNNEL_URL_ENV || kvConfigured()));
}

export async function openclawFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const tunnel = await resolveTunnelUrl();
  if (!tunnel) throw new Error("No tunnel URL configured");
  const url = `${tunnel.replace(/\/$/, "")}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
}

export async function openclawRPC(
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const res = await openclawFetch("/__openclaw__/rpc", {
    method: "POST",
    body: JSON.stringify({ method, params }),
  });
  if (!res.ok) throw new Error(`OpenClaw RPC ${method}: ${res.status}`);
  return res.json();
}

export async function openclawExec(command: string): Promise<string> {
  const res = await openclawFetch("/__openclaw__/rpc", {
    method: "POST",
    body: JSON.stringify({
      method: "exec.run",
      params: { command, timeout: 30000 },
    }),
  });
  if (!res.ok) throw new Error(`exec failed: ${res.status}`);
  const data = (await res.json()) as { result?: { stdout?: string } };
  return data.result?.stdout || "";
}

export async function checkTunnelHealth(): Promise<boolean> {
  if (kvConfigured()) {
    const cached = await kvGet<CachedHealth>(KV_TUNNEL_HEALTH);
    if (cached && typeof cached.ok === "boolean") {
      const at = new Date(cached.at).getTime();
      if (Number.isFinite(at) && Date.now() - at < HEALTH_TTL_SECONDS * 1000) {
        return cached.ok;
      }
    }
  }

  const tunnel = await resolveTunnelUrl();
  if (!tunnel) return false;

  let ok = false;
  try {
    const res = await fetch(
      `${tunnel.replace(/\/$/, "")}/__openclaw__/health`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    ok = res.ok;
  } catch {
    ok = false;
  }

  if (kvConfigured()) {
    void kvSet(
      KV_TUNNEL_HEALTH,
      { ok, at: new Date().toISOString() } satisfies CachedHealth,
      { ex: HEALTH_TTL_SECONDS }
    );
  }

  return ok;
}

export async function registerTunnelUrl(url: string): Promise<boolean> {
  if (!kvConfigured()) return false;
  if (!url.startsWith("https://")) return false;
  return kvSet(KV_TUNNEL_URL, url, { ex: 3600 });
}

export async function getRegisteredTunnelUrl(): Promise<string | null> {
  if (!kvConfigured()) return null;
  return kvGet<string>(KV_TUNNEL_URL);
}
