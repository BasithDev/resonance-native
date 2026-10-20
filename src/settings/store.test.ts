jest.mock('../db/instance', () => ({ getDb: () => new Promise(() => {}) }));

import { createTestDb } from '../../test/sqliteAdapter';
import { migrate } from '../library/repo';
import { createSettingsStore } from './store';

describe('settings store', () => {
  it('starts Wi-Fi only with auto-download of liked songs on', async () => {
    const db = createTestDb();
    await migrate(db);
    const { store, ready } = createSettingsStore(async () => db);
    await ready();
    expect(store.getState()).toMatchObject({ downloadOnCellular: false, autoDownloadLiked: true });
  });

  it('persists changes in kv and loads them next launch', async () => {
    const db = createTestDb();
    await migrate(db);
    const first = createSettingsStore(async () => db);
    await first.ready();
    first.store.getState().set('downloadOnCellular', true);
    first.store.getState().set('autoDownloadLiked', false);
    await new Promise((r) => setImmediate(r));

    const next = createSettingsStore(async () => db);
    await next.ready();
    expect(next.store.getState()).toMatchObject({ downloadOnCellular: true, autoDownloadLiked: false });
  });
});
