import { parseNotes } from './notes';

describe('parseNotes', () => {
  it('turns a CHANGELOG section into headings, bullets and text', () => {
    const md = 'First public release.\r\n\r\n### Player\n- **Sleep** timer\n* Uses `yt-dlp`\n\n## More\n- See [the site](https://x)';
    expect(parseNotes(md)).toEqual([
      { kind: 'text', text: 'First public release.' },
      { kind: 'heading', text: 'Player' },
      { kind: 'bullet', text: 'Sleep timer' },
      { kind: 'bullet', text: 'Uses yt-dlp' },
      { kind: 'heading', text: 'More' },
      { kind: 'bullet', text: 'See the site' },
    ]);
  });

  it('returns nothing for empty notes', () => {
    expect(parseNotes('  \n\n')).toEqual([]);
  });
});
