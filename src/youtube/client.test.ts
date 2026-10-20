import { download, resolveStream, search, update, YoutubeError } from './client';

jest.mock('../../modules/ytdlp/src/YtdlpModule', () => ({
  __esModule: true,
  default: {
    search: jest.fn(),
    playlistEntries: jest.fn(),
    videoInfo: jest.fn(),
    resolveStream: jest.fn(),
    download: jest.fn(),
    cancel: jest.fn(),
    version: jest.fn(),
    update: jest.fn(),
    addListener: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const native = require('../../modules/ytdlp/src/YtdlpModule').default as Record<string, jest.Mock>;

function nativeError(code: string, message = 'native failure') {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => jest.resetAllMocks());

describe('youtube client', () => {
  it('maps EXTRACTION_FAILED to extraction kind with update message', async () => {
    native.resolveStream.mockRejectedValue(nativeError('EXTRACTION_FAILED', 'ERROR: HTTP Error 403'));

    const err = await resolveStream('eIeIkZ5Li88').catch((e) => e);

    expect(err).toBeInstanceOf(YoutubeError);
    expect(err).toMatchObject({
      kind: 'extraction',
      message: 'YouTube changed something — update yt-dlp in Settings',
    });
  });

  it('maps NETWORK and CANCELLED codes', async () => {
    native.search.mockRejectedValue(nativeError('NETWORK'));
    native.download.mockRejectedValue(nativeError('CANCELLED'));

    const netErr = await search('x').catch((e) => e);
    const cancelErr = await download('job1', 'abc', '/data/music').catch((e) => e);

    expect(netErr).toBeInstanceOf(YoutubeError);
    expect(netErr.kind).toBe('network');
    expect(cancelErr).toBeInstanceOf(YoutubeError);
    expect(cancelErr.kind).toBe('cancelled');
  });

  it('maps unknown native failures to extraction', async () => {
    native.update.mockRejectedValue(new Error('boom'));

    await expect(update()).rejects.toMatchObject({ kind: 'extraction' });
  });

  it('search passes limit through and returns tracks unchanged', async () => {
    const tracks = [
      { youtubeId: 'a1', title: 'A', channel: 'C', durationSec: 200, thumbnailUrl: 'https://i.ytimg.com/vi/a1/hqdefault.jpg' },
      { youtubeId: 'b2', title: 'B', channel: null, durationSec: null, thumbnailUrl: 'https://i.ytimg.com/vi/b2/hqdefault.jpg' },
    ];
    native.search.mockResolvedValue(tracks);

    await expect(search('aane wala star', 5)).resolves.toEqual(tracks);
    expect(native.search).toHaveBeenCalledWith('aane wala star', 5);

    await search('default limit');
    expect(native.search).toHaveBeenLastCalledWith('default limit', 20);
  });
});
