const API_BASE = process.env.MOLTBOOK_API_BASE || "https://www.moltbook.com/api/v1";
const API_KEY = process.env.MOLTBOOK_API_KEY || "";

export async function moltbookFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
}

export async function getMe() {
  const res = await moltbookFetch("agents/me");
  if (!res.ok) throw new Error(`Moltbook /agents/me: ${res.status}`);
  return res.json();
}

export async function getPosts(sort = "new", limit = 15) {
  const res = await moltbookFetch(`posts?sort=${sort}&limit=${limit}`);
  if (!res.ok) throw new Error(`Moltbook /posts: ${res.status}`);
  return res.json();
}

export async function getPost(id: string) {
  const res = await moltbookFetch(`posts/${id}`);
  if (!res.ok) throw new Error(`Moltbook /posts/${id}: ${res.status}`);
  return res.json();
}
