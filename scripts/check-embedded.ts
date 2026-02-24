/**
 * tauri dev / tauri build 前执行：检查当前平台的内置二进制是否存在，没有则自动下载。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const EMBEDDED_ROOT = path.join(process.cwd(), 'src-tauri', 'src', 'embedded');

function detectPlatformKey(): string {
  const arch = process.arch;
  const platform = process.platform;
  if (platform === 'win32' && arch === 'x64') return 'windows-x86_64';
  if (platform === 'win32' && (arch === 'arm64' || arch === 'arm'))
    return 'windows-aarch64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x86_64';
  if (platform === 'linux' && (arch === 'arm64' || arch === 'arm'))
    return 'linux-aarch64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x86_64';
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'arm'))
    return 'darwin-aarch64';
  return '';
}

function hasEmbeddedForPlatform(): boolean {
  const platform = detectPlatformKey();
  if (!platform) return false;
  const manifestPath = path.join(EMBEDDED_ROOT, 'manifest.json');
  const platformDir = path.join(EMBEDDED_ROOT, platform);
  const sentinel = path.join(platformDir, 'yt-dlp'); // 至少要有 yt-dlp
  try {
    return (
      fs.existsSync(manifestPath) &&
      fs.existsSync(platformDir) &&
      fs.existsSync(sentinel)
    );
  } catch {
    return false;
  }
}

function main() {
  if (hasEmbeddedForPlatform()) {
    console.log('[check-embedded] 当前平台内置已存在，跳过下载。');
    process.exit(0);
    return;
  }
  console.log('[check-embedded] 当前平台内置缺失，正在下载…');
  const r = spawnSync('npm', ['run', 'embedded:download'], {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
  });
  if (r.status !== 0) {
    console.error('[check-embedded] 下载失败，请手动执行: npm run embedded:download');
    process.exit(1);
  }
  console.log('[check-embedded] 下载完成。');
  process.exit(0);
}

main();
