import { parseSyncQr } from './qr';

describe('parseSyncQr', () => {
  it('accepts the exact payload', () => {
    const text = JSON.stringify({ v: 1, urls: ['http://192.168.1.5:3000/api', 'http://172.17.0.1:3000/api'], code: 'ABCD2345' });
    expect(parseSyncQr(text)).toEqual({
      urls: ['http://192.168.1.5:3000/api', 'http://172.17.0.1:3000/api'],
      code: 'ABCD2345',
    });
  });

  it('rejects non-JSON, v!==1, missing code, bad urls', () => {
    expect(parseSyncQr('https://example.com')).toBeNull();
    expect(parseSyncQr('null')).toBeNull();
    expect(parseSyncQr(JSON.stringify({ v: 2, urls: ['http://a/api'], code: 'X' }))).toBeNull();
    expect(parseSyncQr(JSON.stringify({ v: 1, urls: ['http://a/api'] }))).toBeNull();
    expect(parseSyncQr(JSON.stringify({ v: 1, urls: ['http://a/api'], code: '' }))).toBeNull();
    expect(parseSyncQr(JSON.stringify({ v: 1, urls: [], code: 'X' }))).toBeNull();
    expect(parseSyncQr(JSON.stringify({ v: 1, urls: ['ftp://a'], code: 'X' }))).toBeNull();
  });
});
