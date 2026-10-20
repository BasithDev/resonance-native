import { parseInput } from './parseInput';

const ID = 'dQw4w9WgXcQ';

describe('parseInput', () => {
  it('watch?v= is a video', () => {
    expect(parseInput(`https://www.youtube.com/watch?v=${ID}`)).toEqual({ kind: 'video', id: ID });
  });
  it('youtu.be/<id> is a video', () => {
    expect(parseInput(`https://youtu.be/${ID}?si=abc`)).toEqual({ kind: 'video', id: ID });
  });
  it('music.youtube.com watch with list is a playlist', () => {
    const url = `https://music.youtube.com/watch?v=${ID}&list=PLabc123`;
    expect(parseInput(url)).toEqual({ kind: 'playlist', url });
  });
  it('playlist?list= is a playlist', () => {
    const url = 'https://www.youtube.com/playlist?list=PLabc123';
    expect(parseInput(url)).toEqual({ kind: 'playlist', url });
  });
  it('shorts/<id> is a video', () => {
    expect(parseInput(`https://www.youtube.com/shorts/${ID}`)).toEqual({ kind: 'video', id: ID });
  });
  it('plain text is a trimmed query', () => {
    expect(parseInput('  daft punk  ')).toEqual({ kind: 'query', q: 'daft punk' });
  });
  it('non-youtube URLs are queries', () => {
    expect(parseInput('https://example.com/watch?v=abc')).toEqual({
      kind: 'query',
      q: 'https://example.com/watch?v=abc',
    });
  });
  it('scheme-less links work', () => {
    expect(parseInput(`youtube.com/watch?v=${ID}`)).toEqual({ kind: 'video', id: ID });
  });
});
