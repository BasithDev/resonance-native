export type SyncPayload = { urls: string[]; code: string };

/** Parses the web's pairing QR; returns null for anything else (other apps' QRs, old versions). */
export function parseSyncQr(text: string): SyncPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { v, urls, code } = data as Record<string, unknown>;
  if (v !== 1) return null;
  if (typeof code !== 'string' || code.length === 0) return null;
  if (!Array.isArray(urls) || urls.length === 0) return null;
  if (!urls.every((u) => typeof u === 'string' && /^https?:\/\//.test(u))) return null;
  return { urls: urls as string[], code };
}
