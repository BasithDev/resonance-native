import { canDownloadNow } from './rules';

describe('canDownloadNow', () => {
  it('wifi → true', () => {
    expect(canDownloadNow({ online: true, wifi: true, cellularAllowed: false })).toBe(true);
  });

  it('cellular with cellularAllowed=false → false', () => {
    expect(canDownloadNow({ online: true, wifi: false, cellularAllowed: false })).toBe(false);
  });

  it('cellular with cellularAllowed=true → true', () => {
    expect(canDownloadNow({ online: true, wifi: false, cellularAllowed: true })).toBe(true);
  });

  it('offline → false', () => {
    expect(canDownloadNow({ online: false, wifi: false, cellularAllowed: true })).toBe(false);
  });
});
