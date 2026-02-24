/**
 * 根据 manifest 下载各平台辅助程序到 src-tauri/embedded/<platform>/<tool>，
 * 供程序内置嵌入使用。可指定平台或下载全部平台。
 *
 * 用法:
 *   npx tsx scripts/download-embedded.ts              # 仅当前平台
 *   npx tsx scripts/download-embedded.ts --all        # 所有平台
 *   npx tsx scripts/download-embedded.ts windows-x86_64 linux-x86_64  # 指定平台
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { createHash } from 'node:crypto';

const MANIFEST_URL =
  'https://jely2002.github.io/youtube-dl-gui/manifest/manifest.json';
const EMBEDDED_ROOT = path.join(process.cwd(), 'src-tauri', 'src', 'embedded');

interface FileEntry {
  url: string;
  sha256: string;
  entry?: string;
  bundle?: {
    keep_folder: boolean;
    folder_name?: string;
    entry: string;
    rename_entry_to?: string;
  };
}

interface ToolEntry {
  version: string;
  files: Record<string, FileEntry>;
}

interface Manifest {
  generatedAt: string;
  tools: Record<string, ToolEntry>;
}

const PLATFORMS = [
  'windows-x86_64',
  'windows-aarch64',
  'linux-x86_64',
  'linux-aarch64',
  'darwin-x86_64',
  'darwin-aarch64',
] as const;

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
  throw new Error(`Unsupported platform/arch: ${platform} ${arch}`);
}

function getClient(url: string): typeof https | typeof http {
  return url.startsWith('https:') ? https : http;
}

function downloadWithSha256(
  url: string,
  expectedSha256: string,
  destPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpPath = `${destPath}.download`;
    const fileStream = fs.createWriteStream(tmpPath);
    const hash = createHash('sha256');

    const client = getClient(url);
    client
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.destroy();
          return downloadWithSha256(
            res.headers.location,
            expectedSha256,
            destPath,
          )
            .then(resolve)
            .catch(reject);
        }
        if (res.statusCode !== 200) {
          fileStream.close();
          return reject(
            new Error(`Failed to download ${url}: HTTP ${res.statusCode}`),
          );
        }
        res.on('data', (chunk: Buffer) => hash.update(chunk));
        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(async (err) => {
            if (err) return reject(err);
            try {
              const digest = hash.digest('hex');
              if (digest.toLowerCase() !== expectedSha256.toLowerCase()) {
                await fsp.rm(tmpPath, { force: true });
                return reject(
                  new Error(
                    `SHA256 mismatch for ${url}. Expected ${expectedSha256}, got ${digest}`,
                  ),
                );
              }
              await fsp.mkdir(path.dirname(destPath), { recursive: true });
              await fsp.rename(tmpPath, destPath);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        });
      })
      .on('error', (err) => {
        fileStream.close();
        reject(err);
      });
  });
}

async function fetchManifest(): Promise<Manifest> {
  const client = getClient(MANIFEST_URL);
  return new Promise((resolve, reject) => {
    client.get(MANIFEST_URL, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const loc = res.headers.location;
        if (loc) return fetch(loc).then((r) => r.json()).then(resolve).catch(reject);
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve(JSON.parse(body) as Manifest);
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const explicitPlatforms = args.filter((a) => a !== '--all');

  const platformsToFetch: string[] = all
    ? [...PLATFORMS]
    : explicitPlatforms.length > 0
      ? explicitPlatforms
      : [detectPlatformKey()];

  console.log('[download-embedded] Fetching manifest from', MANIFEST_URL);
  const manifest = await fetchManifest();

  // 保持 manifest 与线上一致
  const manifestPath = path.join(EMBEDDED_ROOT, 'manifest.json');
  await fsp.mkdir(EMBEDDED_ROOT, { recursive: true });
  await fsp.writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  console.log('[download-embedded] Wrote', manifestPath);

  for (const platformKey of platformsToFetch) {
    const platformDir = path.join(EMBEDDED_ROOT, platformKey);
    await fsp.mkdir(platformDir, { recursive: true });

    for (const [toolName, tool] of Object.entries(manifest.tools)) {
      const file = tool.files[platformKey];
      if (!file) {
        console.log(
          `[download-embedded] Skip ${toolName}: no file for ${platformKey}`,
        );
        continue;
      }

      const destPath = path.join(platformDir, toolName);
      console.log(
        `[download-embedded] Downloading ${toolName} (${platformKey}) from ${file.url}`,
      );
      await downloadWithSha256(file.url, file.sha256, destPath);
    }
  }

  console.log('[download-embedded] Done.');
}

main().catch((err) => {
  console.error('[download-embedded] ERROR:', err);
  process.exit(1);
});
