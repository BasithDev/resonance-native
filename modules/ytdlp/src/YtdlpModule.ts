import { NativeModule, requireNativeModule } from 'expo';

import { YtdlpModuleEvents, YtTrack } from './YtdlpModule.types';

declare class YtdlpModule extends NativeModule<YtdlpModuleEvents> {
  search(query: string, limit: number): Promise<YtTrack[]>;
  playlistEntries(url: string): Promise<YtTrack[]>;
  videoInfo(urlOrId: string): Promise<YtTrack>;
  resolveStream(youtubeId: string): Promise<{ url: string }>;
  download(jobId: string, youtubeId: string, destDir: string): Promise<{ path: string; sizeBytes: number }>;
  cancel(jobId: string): void;
  version(): Promise<string>;
  update(): Promise<'updated' | 'up-to-date'>;
}

// Android only: the module is not registered on other platforms.
export default requireNativeModule<YtdlpModule>('Ytdlp');
