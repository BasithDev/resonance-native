import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY_SERVER = 'resonance:server_url';

const CANDIDATE_URLS = [
  'http://192.168.60.114:4000/api',
  'http://10.0.2.2:4000/api',
  'https://resonance-api.loca.lt/api',
  'http://127.0.0.1:4000/api',
];

let currentBaseUrl = Platform.OS === 'android' ? 'http://192.168.60.114:4000/api' : 'http://127.0.0.1:4000/api';

export async function initApi() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_SERVER);
    if (saved) {
      currentBaseUrl = saved.endsWith('/api') ? saved : `${saved.replace(/\/$/, '')}/api`;
    }
  } catch (e) {
    console.warn('Failed to load server URL from storage:', e);
  }
  return currentBaseUrl;
}

export function getBaseUrl() {
  return currentBaseUrl;
}

export async function setBaseUrl(url: string) {
  let clean = url.trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `http://${clean}`;
  }
  clean = clean.replace(/\/$/, '');
  if (!clean.endsWith('/api')) {
    clean = `${clean}/api`;
  }
  currentBaseUrl = clean;
  await AsyncStorage.setItem(STORAGE_KEY_SERVER, currentBaseUrl);
  return currentBaseUrl;
}

async function request(method: string, path: string, body?: any) {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  // Try currentBaseUrl first
  try {
    const url = `${currentBaseUrl}${path}`;
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = err.message || `Request failed (${res.status})`;
      throw Object.assign(new Error(message), { status: res.status });
    }
    if (res.status === 204) return null;
    return await res.json();
  } catch (err: any) {
    // If it's a standard HTTP application error (like 400/401/404/500), don't try candidate URLs.
    // But if it's 502/503/504 (tunnel gateway error), fall back to other candidate URLs!
    if (err.status && err.status !== 502 && err.status !== 503 && err.status !== 504) throw err;

    // Network error: Auto-discover working server URL among candidates
    for (const candidate of CANDIDATE_URLS) {
      if (candidate === currentBaseUrl) continue;
      try {
        const testRes = await fetch(`${candidate}/health`, { method: 'GET' });
        if (testRes.ok) {
          console.log(`Auto-connected backend to working URL: ${candidate}`);
          currentBaseUrl = candidate;
          await AsyncStorage.setItem(STORAGE_KEY_SERVER, candidate);
          // Retry original request with working candidate
          const retryRes = await fetch(`${candidate}${path}`, opts);
          if (!retryRes.ok) throw new Error(`Request failed (${retryRes.status})`);
          if (retryRes.status === 204) return null;
          return await retryRes.json();
        }
      } catch (retryErr) {
        // continue to next candidate
      }
    }
    throw err;
  }
}

const get = (path: string) => request('GET', path);
const post = (path: string, body?: any) => request('POST', path, body);
const del = (path: string) => request('DELETE', path);
const patch = (path: string, body?: any) => request('PATCH', path, body);

// ---------- Stream Streamer helper ----------
export function getStreamUrl(songId: string) {
  const songIdentifier = songId;
  return `${currentBaseUrl}/stream/${songIdentifier}`;
}

// ---------- Preview ----------
export const previewVideo = (url: string) => post('/preview', { url });
export const previewPlaylist = (url: string) => post('/preview/playlist', { url });

// ---------- Import ----------
export const batchImportSongs = (songs: any[], playlistId?: string) =>
  post('/songs/batch', { songs, playlistId });

// ---------- Songs ----------
export const getSongs = () => get('/songs');
export const deleteSong = (id: string) => del(`/songs/${id}`);

// ---------- Playlists ----------
export const getPlaylists = () => get('/playlists');
export const getPlaylistDetails = (id: string) => get(`/playlists/${id}`);
export const createPlaylist = (name: string) => post('/playlists', { name });
export const updatePlaylist = (id: string, name: string) => patch(`/playlists/${id}`, { name });
export const deletePlaylist = (id: string) => del(`/playlists/${id}`);
export const addSongToPlaylist = (playlistId: string, songId: string) =>
  post(`/playlists/${playlistId}/songs`, { songId });
export const removeSongFromPlaylist = (playlistId: string, songId: string) =>
  del(`/playlists/${playlistId}/songs/${songId}`);

// ---------- Search ----------
export const searchYouTube = (q: string) => get(`/search?q=${encodeURIComponent(q)}`);
export const getSuperShuffle = () => get('/shuffle/super');

// ---------- Portability ----------
export const exportLibrary = () => get('/export');
export const importLibrary = (data: any) => post('/import', data);
