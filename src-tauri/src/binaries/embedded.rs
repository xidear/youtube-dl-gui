//! 内置辅助程序：manifest 与当前平台工具二进制，在构建时嵌入，运行时释放到 bin 目录。

use include_dir::Dir;

// 路径相对于本文件 (src/binaries/embedded.rs)，../embedded 即 src/embedded
/// 内置 manifest.json（与线上 manifest 结构一致）
pub static EMBEDDED_MANIFEST: &[u8] = include_bytes!("../embedded/manifest.json");

// include_dir! 在过程宏中解析路径时以 Cargo 清单目录为基准
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
static EMBEDDED_PLATFORM_DIR: Dir = include_dir::include_dir!("src/embedded/windows-x86_64");

#[cfg(all(target_os = "windows", target_arch = "aarch64"))]
static EMBEDDED_PLATFORM_DIR: Dir = include_dir::include_dir!("src/embedded/windows-aarch64");

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
static EMBEDDED_PLATFORM_DIR: Dir = include_dir::include_dir!("src/embedded/linux-x86_64");

#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
static EMBEDDED_PLATFORM_DIR: Dir = include_dir::include_dir!("src/embedded/linux-aarch64");

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
static EMBEDDED_PLATFORM_DIR: Dir = include_dir::include_dir!("src/embedded/darwin-x86_64");

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
static EMBEDDED_PLATFORM_DIR: Dir = include_dir::include_dir!("src/embedded/darwin-aarch64");

/// 未提供嵌入目录的平台使用空目录，此时 has_embedded_binaries() 为 false。
#[cfg(not(any(
  all(target_os = "windows", target_arch = "x86_64"),
  all(target_os = "windows", target_arch = "aarch64"),
  all(target_os = "linux", target_arch = "x86_64"),
  all(target_os = "linux", target_arch = "aarch64"),
  all(target_os = "macos", target_arch = "x86_64"),
  all(target_os = "macos", target_arch = "aarch64"),
)))]
static EMBEDDED_PLATFORM_DIR: Dir = include_dir::include_dir!("src/embedded/empty");

/// 返回当前平台下内置的某个工具的二进制内容；若无则返回 None。
pub fn embedded_tool_bytes(tool_name: &str) -> Option<&'static [u8]> {
  let file = EMBEDDED_PLATFORM_DIR.get_file(tool_name)?;
  Some(file.contents())
}

/// 当前构建是否包含内置辅助程序（仅当存在当前平台目录时为 true）。
pub fn has_embedded_binaries() -> bool {
  embedded_tool_bytes("yt-dlp").is_some()
}
