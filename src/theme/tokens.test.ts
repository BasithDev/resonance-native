import { colors, radii } from './tokens';

describe('theme tokens', () => {
  it('matches the Resonance palette', () => {
    expect(colors.primary).toBe('#ffb3af');
    expect(colors.primaryStrong).toBe('#ff5959');
    expect(colors.mint).toBe('#5adcb2');
    expect(colors.bg).toBe('#0f0e10');
  });
  it('defines radii', () => {
    expect(radii).toEqual({ sm: 8, md: 12, lg: 16, xl: 22, pill: 999 });
  });
});
