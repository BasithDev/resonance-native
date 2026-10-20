export type ParsedInput =
  | { kind: 'query'; q: string }
  | { kind: 'video'; id: string }
  | { kind: 'playlist'; url: string };

const HOSTS = /^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)$/i;
const VIDEO_ID = /^[A-Za-z0-9_-]{6,}$/;

function asUrl(text: string): URL | null {
  if (/\s/.test(text)) return null;
  try {
    return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
}

/** Classifies search-box text: a pasted YouTube link (video / playlist) or a plain query. */
export function parseInput(text: string): ParsedInput {
  const trimmed = text.trim();
  const query: ParsedInput = { kind: 'query', q: trimmed };
  const url = asUrl(trimmed);
  if (!url || !HOSTS.test(url.hostname)) return query;

  // A `list` parameter means playlist, even on a watch URL.
  if (url.searchParams.get('list')) return { kind: 'playlist', url: url.toString() };

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | null | undefined;
  if (host === 'youtu.be') id = parts[0];
  else if (parts[0] === 'watch') id = url.searchParams.get('v');
  else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') id = parts[1];

  return id && VIDEO_ID.test(id) ? { kind: 'video', id } : query;
}
