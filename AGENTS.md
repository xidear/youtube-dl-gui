# AGENTS

## Overview
This project uses Vue 3 with TypeScript for the frontend and Rust for the backend.
Vue code lives in `src/` and `src/components`, while the Rust Tauri backend lives in `src-tauri/`.

## Testing
Before committing changes, run the following commands:

### JavaScript/TypeScript
- `npm run lint:fix` to apply ESLint fixes and formatting.
- `npm run test:unit` to run unit tests.
- `npm run test:e2e` to run end-to-end tests.
- `npm run build` to ensure the app builds.

To run e2e tests locally, install Playwright browsers and required system packages:

- `npx playwright install --with-deps`

### Rust (inside `src-tauri/`)
- `cargo fmt --all` to format Rust code.
- `cargo clippy --all-targets -- -D warnings` to lint.
- `cargo test` to run backend tests.

Rust linting and tests may fail in this environment because the `glib-2.0` system library is missing.

## Searching
Use `rg` for searching the codebase; avoid recursive `grep` or `ls` commands.

## Commit style
Write commit messages in the form `type: summary`, e.g. `fix: update progress bar logic`.

## 辅助程序（binaries）与打包
- 最终用户**仅**使用「内置 → 释放」流程，程序**不会**从网络下载辅助程序（yt-dlp、ffmpeg 等）。
- 打包前**必须**先下载当前平台（或目标平台）的内置文件，否则运行时会报错「此版本未内置辅助程序」。
- 在项目根目录执行：
  - `npm run embedded:download` — 下载当前平台到 `src-tauri/src/embedded/<platform>/`
  - `npm run embedded:download:all` — 下载全部平台（用于跨平台打包）
- 然后再执行 `npm run tauri build` 或 `npm run tauri dev`。
