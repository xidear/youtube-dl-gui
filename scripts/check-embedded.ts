/**
 * tauri dev / tauri build 前执行：仅检查 embedded/manifest.json 是否存在。
 * 辅助程序改为首次启动时在线下载，不再嵌入平台二进制，故无需在构建前下载。
 */

import path from 'node:path';
import fs from 'node:fs';

const EMBEDDED_ROOT = path.join(process.cwd(), 'src-tauri', 'src', 'embedded');
const MANIFEST_PATH = path.join(EMBEDDED_ROOT, 'manifest.json');

function main() {
  if (fs.existsSync(MANIFEST_PATH)) {
    process.exit(0);
    return;
  }
  console.error(
    '[check-embedded] 缺少 manifest.json。辅助程序为首次启动时在线下载，构建仅需该清单文件。',
  );
  console.error(
    `请确保存在：${MANIFEST_PATH}\n（可从项目仓库或 npm run embedded:download 生成后保留 manifest 即可）`,
  );
  process.exit(1);
}

main();
