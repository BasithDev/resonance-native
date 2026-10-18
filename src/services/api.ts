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

async function request(method: string, path: string, body?: any, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  // 1. Try currentBaseUrl first
  try {
    const res = await fetchWithTimeout(`${currentBaseUrl}${path}`, opts, timeoutMs);
    return await parseResponse(res);
  } catch (err: any) {
    // The backend answered (including its own 502s, e.g. a YouTube resolve failure): don't retry candidates
    if (err.status) throw err;

    // 2. Network error / Timeout / Gateway error: Trigger fast parallel auto-discovery (< 1.5s)
    const workingUrl = await discoverWorkingServerUrl();
    const retryRes = await fetchWithTimeout(`${workingUrl}${path}`, opts, timeoutMs);
    return await parseResponse(retryRes);
  }
}

// Backend errors are shaped { error: { message } }. A 502/503/504 without that
// shape came from a proxy/tunnel, meaning the backend itself was not reached.
async function parseResponse(res: Response) {
  if (res.ok) return res.status === 204 ? null : await res.json();
  const body = await res.json().catch(() => null);
  const backendMessage = body?.error?.message;
  if (!backendMessage && (res.status === 502 || res.status === 503 || res.status === 504)) {
    throw new Error(`Gateway Error (${res.status})`);
  }
  const message = backendMessage || body?.message || `Request failed (${res.status})`;
  throw Object.assign(new Error(message), { status: res.status });
}

// Endpoints backed by yt-dlp take several seconds (playlists and batches longer)
const DEFAULT_TIMEOUT_MS = 10000;
const YOUTUBE_TIMEOUT_MS = 120000;

const get = (path: string, timeoutMs?: number) => request('GET', path, undefined, timeoutMs);
const post = (path: string, body?: any, timeoutMs?: number) => request('POST', path, body, timeoutMs);
const del = (path: string) => request('DELETE', path);
const patch = (path: string, body?: any) => request('PATCH', path, body);

// ---------- Stream Streamer helper ----------
export function getStreamUrl(songId: string) {
  const songIdentifier = songId;
  return `${currentBaseUrl}/stream/${songIdentifier}`;
}

// ---------- Preview ----------
export const previewVideo = (url: string) => post('/preview', { url }, YOUTUBE_TIMEOUT_MS);
export const previewPlaylist = (url: string) => post('/preview/playlist', { url }, YOUTUBE_TIMEOUT_MS);

// ---------- Import ----------
export const batchImportSongs = (songs: any[], playlistId?: string) =>
  post('/songs/batch', { songs, playlistId }, YOUTUBE_TIMEOUT_MS);

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
export const searchYouTube = (q: string) => get(`/search?q=${encodeURIComponent(q)}`, YOUTUBE_TIMEOUT_MS);
export const getSuperShuffle = () => get('/shuffle/super');

// ---------- Portability ----------
export const exportLibrary = () => get('/export');
export const importLibrary = (data: any) => post('/import', data);
