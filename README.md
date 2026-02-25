# 宾纳瑞视频下载器（Open Video Downloader）

基于 [Open Video Downloader (youtube-dl-gui)](https://github.com/jely2002/youtube-dl-gui) 的桌面应用，支持从众多网站下载视频、音频、字幕与元数据（不限于 YouTube）。  
提供简洁图形界面，无需使用命令行，底层使用 [yt-dlp](https://github.com/yt-dlp/yt-dlp)。

## 功能概览

- **跨平台**：支持 Windows、macOS、Linux
- **音视频下载**：可下载完整视频或仅提取音频
- **字幕与元数据**：自动保存可用字幕与视频信息
- **画质与格式**：可选分辨率、帧率及 MP4/MKV 等输出格式
- **播放列表**：支持整份播放列表一键下载
- **自定义输出**：自定义保存路径与文件名模板
- **队列与限速**：多任务队列，避免占用过高
- **认证**：支持浏览器 Cookie、基本认证与视频密码
- **自动更新**：应用与 yt-dlp 均可自动更新
- **浅色/深色**：随系统主题，进度与错误提示清晰
- **快捷键与通知**：快捷添加下载、进度通知

## 下载

**Windows**、**macOS**、**Linux** 最新版本见 [Releases](https://gitee.com/binnarui/binary-video-downloader/releases)。

下载对应平台的安装包或压缩包，按常规步骤安装即可，无需配置命令行环境。

### 该下载哪个文件？

| 系统 | 文件名示例 |
|------|------------|
| **Windows** | `宾纳瑞视频下载器_x.x.x_x64-setup.exe` |
| **Mac（Intel）** | `宾纳瑞视频下载器_x.x.x_x64.dmg` |
| **Mac（Apple Silicon，M1/M2 等）** | `宾纳瑞视频下载器_x.x.x_aarch64.dmg` |
| **Linux 通用（x64）** | `宾纳瑞视频下载器_x.x.x_amd64.AppImage` |
| **Linux 通用（aarch64）** | `宾纳瑞视频下载器_x.x.x_aarch64.AppImage` |
| **Linux Debian/Ubuntu（x64）** | `宾纳瑞视频下载器_x.x.x_amd64.deb` |
| **Linux Debian/Ubuntu（aarch64）** | `宾纳瑞视频下载器_x.x.x_arm64.deb` |
| **Linux Fedora/RHEL（x64）** | `宾纳瑞视频下载器_x.x.x-x_amd64.rpm` |
| **Linux Fedora/RHEL（aarch64）** | `宾纳瑞视频下载器_x.x.x-x_aarch64.rpm` |

## 技术说明

前端使用 **Vue 3**，后端使用 **Rust** + [Tauri](https://tauri.app/)。  
添加视频或播放列表后，应用通过 yt-dlp 获取信息、处理选项并执行下载，进度与错误会在界面中显示。

## 参与开发

欢迎贡献代码。需安装 **Node.js（v24+）** 和 **Rust**。

```bash
npm install
npm run tauri dev
```

构建需要 `src-tauri/src/embedded/manifest.json`，仓库已包含；若缺失可执行 `npm run embedded:download` 生成。辅助程序（yt-dlp、ffmpeg 等）在**首次启动时在线下载**，无需预先下载。
更多说明见 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [AGENTS.md](./AGENTS.md)。

## 许可证与免责声明

本项目采用 [AGPL-3.0](./LICENSE) 许可证。

**请合法、负责任地使用本软件。**  
维护者不对滥用行为承担责任（见 AGPL-3.0 第 16 条）。请勿用于违反当地法律或平台服务条款（包括 DMCA）的行为，使用责任由用户自行承担。
