/** A release-notes line for the update dialog: just enough markdown for CHANGELOG sections. */
export type NoteLine = { kind: 'heading' | 'bullet' | 'text'; text: string };

/** Strips **bold**, `code` and [links](url) down to their text. */
const plain = (t: string) =>
  t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1').replace(/\[(.+?)\]\(.+?\)/g, '$1').trim();

/** Headings, bullets and plain lines; blank lines dropped. */
export function parseNotes(md: string): NoteLine[] {
  const out: NoteLine[] = [];
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue;
    const h = raw.match(/^\s*#{1,6}\s+(.*)/);
    const b = raw.match(/^\s*[-*+]\s+(.*)/);
    if (h) out.push({ kind: 'heading', text: plain(h[1]) });
    else if (b) out.push({ kind: 'bullet', text: plain(b[1]) });
    else out.push({ kind: 'text', text: plain(raw) });
  }
  return out;
}
