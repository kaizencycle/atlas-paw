const URL_ENV =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN_ENV =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export function kvConfigured(): boolean {
  return Boolean(URL_ENV && TOKEN_ENV);
}

async function kvCall(path: string, init?: RequestInit): Promise<unknown> {
  if (!kvConfigured()) return null;
  try {
    const res = await fetch(`${URL_ENV.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN_ENV}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const body = (await kvCall(`/get/${encodeURIComponent(key)}`)) as
    | { result?: string | null }
    | null;
  if (!body || body.result == null) return null;
  try {
    return JSON.parse(body.result) as T;
  } catch {
    return body.result as unknown as T;
  }
}

export async function kvSet(
  key: string,
  value: unknown,
  opts: { ex?: number } = {}
): Promise<boolean> {
  const ex = opts.ex;
  const path = ex
    ? `/set/${encodeURIComponent(key)}?EX=${ex}`
    : `/set/${encodeURIComponent(key)}`;
  const bodyRaw = JSON.stringify(value);
  const body = (await kvCall(path, {
    method: "POST",
    body: bodyRaw,
  })) as { result?: string } | null;
  return body?.result === "OK";
}

export async function kvDel(key: string): Promise<boolean> {
  const body = (await kvCall(`/del/${encodeURIComponent(key)}`, {
    method: "POST",
  })) as { result?: number } | null;
  return (body?.result ?? 0) > 0;
}
