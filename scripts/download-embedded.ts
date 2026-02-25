/**
 * 根据 manifest 下载各平台辅助程序到 src-tauri/embedded/<platform>/<tool>，
 * 供程序内置嵌入使用。可指定平台或下载全部平台。
 *
 * 用法:
 *   npx tsx scripts/download-embedded.ts              # 仅当前平台
 *   npx tsx scripts/download-embedded.ts --all        # 所有平台
 *   npx tsx scripts/download-embedded.ts --minimal  # 仅核心工具（安装包约 <100MB）
 *   npx tsx scripts/download-embedded.ts --no-update-manifest  # 使用本地 manifest 固定版本，不拉取上游
 *   npx tsx scripts/download-embedded.ts windows-x86_64 linux-x86_64  # 指定平台
 *
 * 大陆镜像（环境变量或 --mirror）：
 *   EMBEDDED_MIRROR=https://ghproxy.com/https://github.com/  npx tsx scripts/download-embedded.ts
 *   或  npx tsx scripts/download-embedded.ts --mirror=https://ghproxy.com/https://github.com/
 * 将把 GitHub 上的文件经该前缀代理下载。也可使用 gh-proxy.com、mirror.ghproxy.com 等。
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
// @ts-expect-error lzma-native 无类型定义
import lzma from 'lzma-native';

const MANIFEST_URL =
  'https://jely2002.github.io/youtube-dl-gui/manifest/manifest.json';
const EMBEDDED_ROOT = path.join(process.cwd(), 'src-tauri', 'src', 'embedded');

/** GitHub 原始前缀，用于被镜像替换 */
const GITHUB_BASE = 'https://github.com/';

/** 使用 --minimal 时只嵌入这些工具（不含 deno），安装包可控制在约 65MB */
const MINIMAL_TOOLS = ['yt-dlp', 'ffmpeg', 'ffprobe', 'AtomicParsley'];

/** 若设置，将把以 GITHUB_BASE 开头的下载 URL 替换为该镜像前缀（大陆加速） */
function getMirrorPrefix(): string | undefined {
  const env = process.env.EMBEDDED_MIRROR;
  if (env && env.trim()) return env.trim();
  const arg = process.argv.find((a) => a.startsWith('--mirror='));
  if (arg) return arg.slice('--mirror='.length).trim();
  return undefined;
}

function resolveDownloadUrl(url: string, mirrorPrefix: string | undefined): string {
  if (!mirrorPrefix || !url.startsWith(GITHUB_BASE)) return url;
  return url.replace(GITHUB_BASE, mirrorPrefix);
}

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
  /** 主程序版本，与 package.json / tauri.conf.json 一致，用于固定辅助软件版本对应关系 */
  appVersion?: string;
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

/** 使用 XZ 极限压缩（preset 9）将文件压缩为 .xz，并删除原文件。 */
async function compressToXzAndReplace(filePath: string): Promise<void> {
  const xzPath = `${filePath}.xz`;
  const compressor = lzma.createCompressor({ preset: 9 });
  await pipeline(
    fs.createReadStream(filePath),
    compressor,
    fs.createWriteStream(xzPath),
  );
  await fsp.rm(filePath, { force: true });
  console.log(`[download-embedded] Compressed to ${path.basename(xzPath)}`);
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
  const minimal = args.includes('--minimal');
  const noUpdateManifest = args.includes('--no-update-manifest');
  const explicitPlatforms = args.filter(
    (a) =>
      a !== '--all' &&
      a !== '--minimal' &&
      a !== '--no-update-manifest' &&
      !a.startsWith('--mirror='),
  );

  const mirrorPrefix = getMirrorPrefix();
  if (mirrorPrefix) {
    console.log('[download-embedded] Using mirror for GitHub:', mirrorPrefix);
  }

  const platformsToFetch: string[] = all
    ? [...PLATFORMS]
    : explicitPlatforms.length > 0
      ? explicitPlatforms
      : [detectPlatformKey()];

  let manifest: Manifest;

  if (noUpdateManifest) {
    const manifestPath = path.join(EMBEDDED_ROOT, 'manifest.json');
    try {
      const raw = await fsp.readFile(manifestPath, 'utf8');
      manifest = JSON.parse(raw) as Manifest;
      if (!manifest.appVersion) {
        throw new Error(
          'Local manifest must contain appVersion (fix version correspondence with main app).',
        );
      }
      console.log(
        '[download-embedded] Using local manifest (appVersion=%s), tools: %s',
        manifest.appVersion,
        Object.keys(manifest.tools).join(', '),
      );
    } catch (e) {
      console.error('[download-embedded] --no-update-manifest requires existing', manifestPath);
      throw e;
    }
  } else {
    console.log('[download-embedded] Fetching manifest from', MANIFEST_URL);
    manifest = await fetchManifest();
    const pkgPath = path.join(process.cwd(), 'package.json');
    try {
      const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf8')) as { version?: string };
      if (pkg.version) {
        manifest.appVersion = pkg.version;
      }
    } catch {
      // ignore
    }
  }

  const toolsToFetch = minimal
    ? Object.fromEntries(
        MINIMAL_TOOLS.filter((k) => manifest.tools[k]).map((k) => [k, manifest.tools[k]]),
      )
    : manifest.tools;
  if (minimal) {
    manifest = { ...manifest, tools: toolsToFetch as Manifest['tools'] };
    console.log(
      '[download-embedded] Minimal mode: only',
      Object.keys(toolsToFetch).join(', '),
    );
  }

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

    for (const [toolName, tool] of Object.entries(toolsToFetch)) {
      const file = tool.files[platformKey];
      if (!file) {
        console.log(
          `[download-embedded] Skip ${toolName}: no file for ${platformKey}`,
        );
        continue;
      }

      const destPath = path.join(platformDir, toolName);
      const downloadUrl = resolveDownloadUrl(file.url, mirrorPrefix);
      console.log(
        `[download-embedded] Downloading ${toolName} (${platformKey}) from ${downloadUrl === file.url ? file.url : '[mirror] ' + downloadUrl}`,
      );
      await downloadWithSha256(downloadUrl, file.sha256, destPath);
      console.log(`[download-embedded] Compressing ${toolName} with XZ (max)...`);
      await compressToXzAndReplace(destPath);
    }
  }

  console.log('[download-embedded] Done.');
}

main().catch((err) => {
  console.error('[download-embedded] ERROR:', err);
  process.exit(1);
});
