import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY_SERVER = 'resonance:server_url';

const CANDIDATE_URLS = [
  'https://resonance-api.loca.lt/api',
  'http://192.168.60.114:4000/api',
  'http://10.0.2.2:4000/api',
  'http://127.0.0.1:4000/api',
];

let currentBaseUrl = 'https://resonance-api.loca.lt/api';

// Fast fetch with AbortSignal timeout
async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

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

// Fast parallel auto-discovery of working candidate URL
async function discoverWorkingServerUrl(): Promise<string> {
  const promises = CANDIDATE_URLS.map(async (candidate) => {
    const res = await fetchWithTimeout(`${candidate}/health`, { method: 'GET' }, 1500);
    if (res.ok) return candidate;
    throw new Error(`Health check failed for ${candidate}`);
  });

  try {
    const workingCandidate = await Promise.any(promises);
    console.log(`⚡ Fast auto-discovered server URL: ${workingCandidate}`);
    currentBaseUrl = workingCandidate;
    await AsyncStorage.setItem(STORAGE_KEY_SERVER, workingCandidate);
    return workingCandidate;
  } catch (err) {
    console.warn('All backend candidates failed health check.');
    throw new Error('Could not connect to Resonance backend server. Please check your network or server URL in Settings.');
  }
}

async function request(method: string, path: string, body?: any) {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  // 1. Try currentBaseUrl first with 3-second timeout
  try {
    const url = `${currentBaseUrl}${path}`;
    const res = await fetchWithTimeout(url, opts, 3000);
    if (!res.ok) {
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new Error(`Gateway Error (${res.status})`);
      }
      const err = await res.json().catch(() => ({}));
      const message = err.message || `Request failed (${res.status})`;
      throw Object.assign(new Error(message), { status: res.status });
    }
    if (res.status === 204) return null;
    return await res.json();
  } catch (err: any) {
    // If it's a standard HTTP application error (like 400/401/404/500), don't retry candidates
    if (err.status && err.status !== 502 && err.status !== 503 && err.status !== 504) {
      throw err;
    }

    // 2. Network error / Timeout / Gateway error: Trigger fast parallel auto-discovery (< 1.5s)
    const workingUrl = await discoverWorkingServerUrl();
    const retryRes = await fetchWithTimeout(`${workingUrl}${path}`, opts, 4000);
    if (!retryRes.ok) throw new Error(`Request failed (${retryRes.status})`);
    if (retryRes.status === 204) return null;
    return await retryRes.json();
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
