import { listen } from '@tauri-apps/api/event';
import {
  BinaryDownloadStartPayload,
  BinaryDownloadProgressPayload,
  BinaryDownloadCompletePayload, BinaryDownloadErrorPayload,
} from '../types/binaries';
import { useBinariesStore } from '../../stores/binaries';

export function registerBinaryListeners() {
  const binariesStore = useBinariesStore();

  void listen<BinaryDownloadStartPayload>('binary_download_start', (event) => {
    console.log('[flow] event binary_download_start', event.payload);
    binariesStore.processBinaryDownloadStart(event.payload);
  });

  void listen<BinaryDownloadProgressPayload>(
    'binary_download_progress',
    (event) => {
      console.log('[flow] event binary_download_progress', event.payload.tool, event.payload.received, event.payload.total);
      binariesStore.processBinaryDownloadProgress(event.payload);
    },
  );

  void listen<BinaryDownloadCompletePayload>(
    'binary_download_complete',
    (event) => {
      console.log('[flow] event binary_download_complete', event.payload);
      binariesStore.processBinaryDownloadComplete(event.payload);
    },
  );

  void listen<BinaryDownloadErrorPayload>('binary_download_error', (event) => {
    console.log('[flow] event binary_download_error', event.payload);
    binariesStore.processBinaryDownloadError(event.payload);
  });
}
