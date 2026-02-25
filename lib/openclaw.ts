const TUNNEL_URL = process.env.OPENCLAW_TUNNEL_URL || "";
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";

export async function openclawFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${TUNNEL_URL.replace(/\/$/, "")}${path}`;
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
  if (!TUNNEL_URL) return false;
  try {
    const res = await fetch(
      `${TUNNEL_URL.replace(/\/$/, "")}/__openclaw__/health`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}
