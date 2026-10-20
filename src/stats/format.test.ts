import { formatDuration } from './format';

it('formats durations', () => {
  expect(formatDuration(0)).toBe('0m');
  expect(formatDuration(40)).toBe('40s');
  expect(formatDuration(125)).toBe('2m');
  expect(formatDuration(4320)).toBe('1h 12m');
});
