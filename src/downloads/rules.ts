/** Downloads run on Wi-Fi (or Ethernet), and on mobile data only when the user allows it. */
export function canDownloadNow(c: { online: boolean; wifi: boolean; cellularAllowed: boolean }): boolean {
  return c.online && (c.wifi || c.cellularAllowed);
}
