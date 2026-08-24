/**
 * Keep OAuth return URLs on-site. Absolute URLs are accepted only when they
 * match the current origin; everything else falls back to `/`.
 */
export function safeCallbackUrl(
  value: string | null | undefined,
  origin?: string
): string {
  if (!value) return "/";
  const trimmed = value.trim();
  if (!trimmed) return "/";

  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) {
    return trimmed;
  }

  if (!origin) return "/";

  try {
    const url = new URL(trimmed);
    if (url.origin !== origin) return "/";
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}
