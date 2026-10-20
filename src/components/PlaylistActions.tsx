import { useState } from 'react';
import { Alert } from 'react-native';

import { getDb } from '@/db/instance';
import { playlistName } from '@/library/actions';
import { libraryEvents } from '@/library/events';
import * as repo from '@/library/repo';
import type { Playlist } from '@/library/types';

import { NameDialog } from './NameDialog';
import { showToast } from './Toast';

type Dialog = { kind: 'create' } | { kind: 'rename'; playlist: Playlist } | null;

const failed = (what: string) => (e: unknown) => {
  console.warn(`[playlists] ${what} failed`, e);
  showToast(`Couldn't ${what} the playlist`);
};

/**
 * Create / rename / delete for playlists, with their dialogs. Render `dialog` once.
 * The Liked playlist can't be renamed or deleted.
 */
export function usePlaylistActions(opts: { onCreated?: (p: Playlist) => void } = {}) {
  const [state, setState] = useState<Dialog>(null);

  const create = () => setState({ kind: 'create' });

  const confirmDelete = (p: Playlist) =>
    Alert.alert(`Delete "${p.name}"?`, 'The songs stay in your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await repo.deletePlaylist(await getDb(), p.id);
            libraryEvents.emit();
          })().catch(failed('delete'));
        },
      },
    ]);

  /** Long-press / ⋯ on a playlist: rename or delete. */
  const openOptions = (p: Playlist) => {
    if (p.kind === 'liked') {
      showToast(`${playlistName(p)} can't be renamed or deleted`);
      return;
    }
    Alert.alert(p.name, undefined, [
      { text: 'Rename', onPress: () => setState({ kind: 'rename', playlist: p }) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(p) },
      { text: 'Cancel', style: 'cancel' },
    ], { cancelable: true });
  };

  const submit = (name: string) => {
    const d = state;
    setState(null);
    if (!d) return;
    void (async () => {
      const db = await getDb();
      if (d.kind === 'create') {
        const p = await repo.createPlaylist(db, name);
        libraryEvents.emit();
        opts.onCreated?.(p);
      } else {
        await repo.renamePlaylist(db, d.playlist.id, name);
        libraryEvents.emit();
      }
    })().catch(failed(d.kind === 'create' ? 'create' : 'rename'));
  };

  const dialog = (
    <NameDialog
      open={state !== null}
      title={state?.kind === 'rename' ? 'Rename playlist' : 'New playlist'}
      initial={state?.kind === 'rename' ? state.playlist.name : ''}
      confirmLabel={state?.kind === 'rename' ? 'Rename' : 'Create'}
      onCancel={() => setState(null)}
      onSubmit={submit}
    />
  );

  return { create, openOptions, dialog };
}
