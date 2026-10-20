/** `3720` -> `1h 2m`, `125` -> `2m`, `40` -> `40s`, `0` -> `0m`. */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return s > 0 ? `${s}s` : '0m';
}
