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

/**
 * Save data to a file with auto-generated filename
 * @param data - Data to save (Uint8Array for binary, string for text)
 * @param mimeType - MIME type (e.g., "application/octet-stream", "text/plain", "application/json")
 * @param extension - File extension without dot (e.g., "bin", "hex", "json")
 * @param prefix - Filename prefix (e.g., "dump", "NVRAM")
 * @param chipModel - Chip model name (optional)
 * @param ieeeAddress - IEEE MAC address (optional)
 * @returns The generated filename
 */
export function saveToFile(
  data: Uint8Array | string,
  mimeType: string,
  extension: string,
  prefix: string,
  chipModel?: string,
  ieeeAddress?: string,
  extraInfo?: string
): string {
  // Sanitize chip model: replace spaces with dashes, remove non-alphanumeric chars
  const modelSafe = (chipModel || "unknown")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "");

  // Sanitize IEEE address: keep only hex chars (remove colons, etc.)
  const ieeeSafe = (ieeeAddress || "unknown").toUpperCase().replace(/[^A-F0-9]/g, "");

  // Generate timestamp: YYYY-MM-DDTHH-MM-SS
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, -5);

  // Build filename
  let filename = `${prefix}_${modelSafe}`;
  if (ieeeAddress) {
    filename += `_${ieeeSafe}`;
  }
  if (extraInfo) {
    filename += `_${extraInfo}`;
  }

  filename += `_${timestamp}.${extension}`;

  // Create blob based on data type
  let blob: Blob;
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data);
    blob = new Blob([copy], { type: mimeType });
  } else {
    blob = new Blob([data], { type: mimeType });
  }

  // Create download link and trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
}
