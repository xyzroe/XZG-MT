// Fire a GET with a timeout; on CORS-related failures, retry with no-cors and accept opaque response.
export async function httpGetWithFallback(
  url: string,
  timeoutMs = 8000
): Promise<{ text: string | null; opaque: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status} ${resp.statusText}${body ? ` - ${body}` : ""}`);
    }
    if (resp.type === "opaque") return { text: null, opaque: true };
    const text = await resp.text();
    return { text, opaque: false };
  } catch (e: unknown) {
    const err = e as Error;
    const msg = err?.message || String(e);
    if (/Failed to fetch|TypeError|CORS|NetworkError/i.test(msg)) {
      try {
        await fetch(url, { mode: "no-cors", signal: controller.signal });
        return { text: null, opaque: true };
      } catch {
        throw e;
      }
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
