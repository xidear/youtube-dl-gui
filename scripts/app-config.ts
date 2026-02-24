import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAURI_CONF_PATH = join(__dirname, '..', 'src-tauri', 'tauri.conf.json');

export interface TauriAppConfig {
  productName: string;
  identifier: string;
  version: string;
}

let _config: TauriAppConfig | undefined;

export function getTauriAppConfig(): TauriAppConfig {
  if (!_config) {
    const json = JSON.parse(readFileSync(TAURI_CONF_PATH, 'utf8'));
    _config = {
      productName: json.productName ?? '宾纳瑞视频下载器',
      identifier: json.identifier ?? 'com.binnarui.video-downloader',
      version: json.version ?? '1.0.0',
    };
  }
  return _config;
}
