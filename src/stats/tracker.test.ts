import { createListenTracker } from './tracker';

it('flags the first chunk of each play: song change and replay after ended', () => {
  let t = 0;
  const out: [string, number, boolean][] = [];
  const tr = createListenTracker((id, sec, _at, start) => out.push([id, sec, start]), () => t);
  const run = (id: string, ticks: number, ended = false) => {
    for (let i = 0; i < ticks; i++) {
      t += 500;
      tr.tick(id, !ended, ended);
    }
  };
  run('a', 41); // 20 s -> two chunks, only the first starts a play
  run('a', 1, true); // ended
  run('a', 21); // replay: 10 s chunk starts a new play
  run('b', 21);
  expect(out.slice(0, 2)).toEqual([['a', 10, true], ['a', 10, false]]);
  expect(out.filter((o) => o[2]).map((o) => o[0])).toEqual(['a', 'a', 'b']);
});
