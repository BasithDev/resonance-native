jest.mock('./engine', () => ({ engine: { onStatus: () => () => {}, onRemote: () => () => {} } }));
jest.mock('../youtube/client', () => ({ resolveStream: jest.fn() }));
jest.mock('../net/connectivity', () => ({ getConnectivity: () => ({ online: true, wifi: true }) }));
jest.mock('../components/Toast', () => ({ showToast: jest.fn(), NOTHING_TO_SHUFFLE: 'Nothing downloaded to shuffle' }));

import { showToast } from '../components/Toast';
import { runSuperShuffle } from './superShuffle';
import { usePlayer } from './store';

afterEach(() => jest.restoreAllMocks());

it('shows the toast on nothing-playable', async () => {
  jest.spyOn(usePlayer.getState(), 'superShuffle').mockResolvedValue('nothing-playable');
  expect(await runSuperShuffle()).toBe('nothing-playable');
  expect(showToast).toHaveBeenCalledWith('Nothing downloaded to shuffle');
});

it('shows no toast when started', async () => {
  (showToast as jest.Mock).mockClear();
  jest.spyOn(usePlayer.getState(), 'superShuffle').mockResolvedValue('started');
  await runSuperShuffle();
  expect(showToast).not.toHaveBeenCalled();
});
