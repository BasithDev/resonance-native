jest.mock('./engine', () => ({ engine: { onStatus: () => () => {}, onRemote: () => () => {} } }));
jest.mock('../youtube/client', () => ({ resolveStream: jest.fn() }));
const mockNet = { online: true, wifi: true };
jest.mock('../net/connectivity', () => ({ getConnectivity: () => mockNet }));
jest.mock('../components/Toast', () => ({
  showToast: jest.fn(),
  NOTHING_TO_SHUFFLE: 'Nothing downloaded to shuffle',
  NO_PLAYLIST_SONGS: 'Add songs to a playlist to super shuffle',
}));

import { showToast } from '../components/Toast';
import { runSuperShuffle } from './superShuffle';
import { usePlayer } from './store';

beforeEach(() => {
  (showToast as jest.Mock).mockClear();
  mockNet.online = true;
});
afterEach(() => jest.restoreAllMocks());

it('offline with nothing downloaded says so', async () => {
  mockNet.online = false;
  jest.spyOn(usePlayer.getState(), 'superShuffle').mockResolvedValue('nothing-playable');
  expect(await runSuperShuffle()).toBe('nothing-playable');
  expect(showToast).toHaveBeenCalledWith('Nothing downloaded to shuffle');
});

it('online with no songs in any playlist asks to add some', async () => {
  jest.spyOn(usePlayer.getState(), 'superShuffle').mockResolvedValue('nothing-playable');
  expect(await runSuperShuffle()).toBe('nothing-playable');
  expect(showToast).toHaveBeenCalledWith('Add songs to a playlist to super shuffle');
});

it('shows no toast when started', async () => {
  jest.spyOn(usePlayer.getState(), 'superShuffle').mockResolvedValue('started');
  await runSuperShuffle();
  expect(showToast).not.toHaveBeenCalled();
});
