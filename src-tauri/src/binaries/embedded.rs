//! 内置 manifest（主程序版本与辅助软件版本对应）。首次启动时按此 manifest 从网络下载指定版本的辅助程序，不嵌入二进制。

/// 内置 manifest.json，含 appVersion 与各工具固定版本，与 package.json 主版本对应。
pub static EMBEDDED_MANIFEST: &[u8] = include_bytes!("../embedded/manifest.json");
