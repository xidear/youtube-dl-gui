use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::binaries::binaries_extractor::{
  extract_tar_bz2, extract_tar_bz2_bundle, extract_zip, extract_zip_bundle,
};
use crate::binaries::binaries_state::CheckResult;
use crate::binaries::binaries_state::{HelperToolStatus, ManualToolInfo};
use crate::binaries::embedded;
use crate::paths::PathsManager;
use fs_extra::dir::{move_dir, CopyOptions};
use indexmap::IndexMap;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Error, Manager, Wry};
use tokio::fs;
use tokio::io::AsyncWriteExt;

/// GitHub 直连前缀
const GITHUB_RAW: &str = "https://github.com/";

/// 内置 GH 代理列表（仅当 use_proxy 时使用）
const BUILTIN_GH_PROXIES: &[&str] = &[
  "https://gh-proxy.org",
  "https://hk.gh-proxy.org",
  "https://cdn.gh-proxy.org",
  "https://edgeone.gh-proxy.org",
];

/// 每个下载 URL 的超时时间（秒），避免断网时长时间卡死。
/// 目前有「直连 + 最多 3 个代理」，10 秒一轮，单个工具最坏也就 ~40 秒。
const DOWNLOAD_TIMEOUT_SECS: u64 = 10;

type AnyError = Box<dyn std::error::Error + Send + Sync + 'static>;

#[derive(Deserialize, Serialize)]
struct Manifest {
  #[serde(rename = "generatedAt")]
  generated_at: String,
  tools: IndexMap<String, ToolInfo>,
}

#[derive(Deserialize, Serialize)]
struct ToolInfo {
  version: String,
  files: HashMap<String, FileInfo>,
}

#[derive(Deserialize, Serialize)]
struct FileInfo {
  url: String,
  sha256: String,
  #[serde(default)]
  entry: Option<String>,
  #[serde(default)]
  bundle: Option<BundleInfo>,
}

#[derive(Deserialize, Serialize)]
struct BundleInfo {
  #[serde(default)]
  keep_folder: bool,
  #[serde(default)]
  folder_name: Option<String>,
  entry: String,
  #[serde(default)]
  rename_entry_to: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct Metadata {
  versions: HashMap<String, String>,
  is_locked: bool,
}

#[derive(Default, Serialize, Deserialize, Clone)]
struct ToolError {
  tool: String,
  version: String,
  stage: String,
  error: String,
}

#[derive(Default, Serialize, Deserialize, Clone)]
struct ToolResult {
  successes: Vec<String>,
  failures: Vec<ToolError>,
  error: Option<String>,
}

#[derive(Default, Serialize, Deserialize, Clone)]
struct ToolStart {
  tool: String,
  version: String,
}

#[derive(Default, Serialize, Deserialize, Clone)]
struct ToolProgress {
  tool: String,
  total: u64,
  received: u64,
}

#[derive(Default, Serialize, Deserialize, Clone)]
struct ToolComplete {
  tool: String,
}

pub struct BinariesManager {
  app: AppHandle<Wry>,
  bin_dir: PathBuf,
  client: Client,
}

impl BinariesManager {
  pub fn new(app: &AppHandle<Wry>) -> Self {
    let paths_manager = app.state::<PathsManager>();
    let client = Client::builder()
      .timeout(std::time::Duration::from_secs(DOWNLOAD_TIMEOUT_SECS))
      .build()
      .unwrap_or_else(|_| Client::new());
    Self {
      app: app.clone(),
      bin_dir: paths_manager.bin_dir().clone(),
      client,
    }
  }

  /// 生成下载 URL 列表：use_proxy 为 false 时仅直连；为 true 时先直连，再（若为 GitHub）依次为环境变量代理、内置代理。
  fn download_urls(&self, url: &str, use_proxy: bool) -> Vec<String> {
    let mut out = vec![url.to_string()];
    if !use_proxy || !url.starts_with(GITHUB_RAW) {
      return out;
    }
    if let Ok(env_proxy) = std::env::var("BINARIES_GH_PROXY") {
      let custom = env_proxy.trim_end_matches('/').to_string();
      if !custom.is_empty() {
        out.push(format!("{}/{}", custom, url));
      }
    }
    for p in BUILTIN_GH_PROXIES {
      out.push(format!("{}/{}", p, url));
    }
    out
  }

  fn canonical_path(&self, tool: &str) -> Result<PathBuf, Error> {
    let base = &self.bin_dir;
    #[cfg(windows)]
    {
      Ok(base.join(format!("{tool}.exe")))
    }
    #[cfg(not(windows))]
    {
      Ok(base.join(tool))
    }
  }

  fn current_platform() -> String {
    let os = match std::env::consts::OS {
      "macos" => "darwin",
      other => other,
    };
    format!("{}-{}", os, std::env::consts::ARCH)
  }

  fn select_file<'a>(
    files: &'a HashMap<String, FileInfo>,
    arch: &'a str,
  ) -> Option<(&'a str, &'a FileInfo)> {
    if let Some(f) = files.get(arch) {
      return Some((arch, f));
    }
    let platform = arch.split('-').next().unwrap_or("");
    files
      .iter()
      .find(|(k, _)| k.starts_with(platform))
      .map(|(k, v)| (k.as_str(), v))
  }

  async fn build_plan<'a>(
    &self,
    manifest: &'a Manifest,
    meta: &Metadata,
    arch: &str,
    allow: Option<&[String]>,
  ) -> Result<Vec<(&'a str, &'a ToolInfo)>, AnyError> {
    let mut plan = Vec::new();
    for (name, info) in &manifest.tools {
      if let Some(allow) = allow {
        if !allow.iter().any(|n| n == name) {
          continue;
        }
      }

      if Self::select_file(&info.files, arch).is_none() {
        continue;
      }

      let version_ok = meta.versions.get(name).is_some_and(|v| v == &info.version);
      let canonical = self.canonical_path(name)?;
      let exists = tokio::fs::metadata(&canonical).await.is_ok();

      if !version_ok || !exists {
        plan.push((name.as_str(), info));
      }
    }
    Ok(plan)
  }

  pub async fn check(&self) -> Result<CheckResult, AnyError> {
    let bin = &self.bin_dir;
    tokio::fs::create_dir_all(bin).await?;

    let meta_path = bin.join("metadata.json");
    let meta = self.load_metadata(&meta_path).await?;
    if meta.is_locked {
      return Ok(CheckResult {
        tools: Vec::new(),
        all_tools: Vec::new(),
      });
    }
    let arch = Self::current_platform();

    let manifest = self.get_manifest()?;
    let all_tools: Vec<String> = manifest
      .tools
      .iter()
      .filter(|(_, info)| Self::select_file(&info.files, &arch).is_some())
      .map(|(name, _)| name.clone())
      .collect();

    let plan = self.build_plan(&manifest, &meta, &arch, None).await?;
    let tools: Vec<String> = plan.iter().map(|(n, _)| (*n).to_string()).collect();

    Ok(CheckResult { tools, all_tools })
  }

  pub async fn ensure(
    &self,
    allow: Option<&[String]>,
    use_proxy: bool,
  ) -> Result<(), AnyError> {
    let bin = &self.bin_dir;
    tokio::fs::create_dir_all(bin).await?;

    let meta_path = bin.join("metadata.json");
    let mut meta = self.load_metadata(&meta_path).await?;
    if meta.is_locked {
      return Ok(());
    }
    let arch = Self::current_platform();

    let manifest = self.get_manifest()?;
    let plan = self.build_plan(&manifest, &meta, &arch, allow).await?;
    if plan.is_empty() {
      return Ok(());
    }

    let mut successes: Vec<String> = Vec::new();
    let mut failures: Vec<ToolError> = Vec::new();

    for (name, info) in plan {
      match self
        .install_single_tool(bin, &arch, name, info, use_proxy)
        .await
      {
        Ok(()) => {
          meta.versions.insert(name.to_string(), info.version.clone());
          successes.push(name.to_string());
        }
        Err(err) => {
          failures.push(err);
        }
      }
    }

    meta.is_locked = false;

    if let Err(e) = self.save_metadata(&meta_path, &meta).await {
      let msg = e.to_string();
      let _ = self.app.emit(
        "binary_update_complete",
        ToolResult {
          successes,
          failures: failures.clone(),
          error: Some(msg),
        },
      );
      return Err(e);
    }

    let _ = self.app.emit(
      "binary_update_complete",
      ToolResult {
        successes,
        failures: failures.clone(),
        error: None,
      },
    );

    if !failures.is_empty() {
      return Err("one or more tools failed to install".into());
    }

    Ok(())
  }

  /// 清空已记录版本并重新下载全部辅助程序（全部覆盖）。
  pub async fn redownload_all(&self) -> Result<(), AnyError> {
    let meta_path = self.bin_dir.join("metadata.json");
    let mut meta = self.load_metadata(&meta_path).await?;
    meta.versions.clear();
    meta.is_locked = false;
    self.save_metadata(&meta_path, &meta).await?;
    self.ensure(None, true).await
  }

  async fn install_single_tool(
    &self,
    bin: &Path,
    arch: &str,
    name: &str,
    info: &ToolInfo,
    use_proxy: bool,
  ) -> Result<(), ToolError> {
    let Some((_key, file)) = Self::select_file(&info.files, arch) else {
      return self.fail_stage(
        name,
        &info.version,
        "select_file",
        "no compatible file for current platform".to_string(),
      );
    };

    let Some(filename) = file.url.rsplit('/').next() else {
      return self.fail_stage(
        name,
        &info.version,
        "parse_filename",
        "missing file name in URL".to_string(),
      );
    };
    let dest = bin.join(filename);

    let _ = self.app.emit(
      "binary_download_start",
      ToolStart {
        tool: name.to_string(),
        version: info.version.to_string(),
      },
    );

    let urls = self.download_urls(&file.url, use_proxy);
    let mut last_err: Option<AnyError> = None;
    for url in &urls {
      // 对单个 URL 增加显式超时，避免网络不通时长时间无响应。
      match tokio::time::timeout(
        std::time::Duration::from_secs(DOWNLOAD_TIMEOUT_SECS),
        self.download_and_verify(
          name,
          url,
          &file.sha256,
          &dest,
          file.entry.as_deref(),
          file.bundle.as_ref(),
        ),
      )
      .await
      {
        Ok(Ok(())) => {
          last_err = None;
          break;
        }
        Ok(Err(e)) => {
          last_err = Some(e);
          continue;
        }
        Err(_) => {
          // 超时：清理临时文件，记录错误后尝试下一个 URL / 代理。
          let _ = fs::remove_file(dest.with_extension("tmp")).await;
          let _ = fs::remove_file(&dest).await;
          last_err = Some("download timeout".into());
          continue;
        }
      }
    }

    if let Some(_e) = last_err {
      let canonical = self.canonical_path(name).unwrap_or_else(|_| self.bin_dir.join(name));
      let manual_msg = format!(
        "所有下载方式均失败。\n\n请手动操作：\n1. 在浏览器中打开：{}\n2. 下载后解压，将 {} 放到目录：\n{}",
        file.url,
        canonical.display(),
        self.bin_dir.display()
      );
      return self.fail_stage(name, &info.version, "download_verify", manual_msg);
    }

    let canonical = self.canonical_path(name).map_err(|e| {
      self
        .fail_stage(name, &info.version, "canonical_path", e.to_string())
        .err()
        .unwrap()
    })?;

    if tokio::fs::metadata(&canonical).await.is_err() {
      let err = format!(
        "canonical binary missing after install: {}",
        canonical.display()
      );
      return self.fail_stage(name, &info.version, "post_install_check", err);
    }

    let _ = self.app.emit(
      "binary_download_complete",
      ToolComplete {
        tool: name.to_string(),
      },
    );

    Ok(())
  }

  fn fail_stage(
    &self,
    name: &str,
    version: &str,
    stage: &str,
    msg: String,
  ) -> Result<(), ToolError> {
    self.emit_tool_error(name, version, stage, &msg);
    Err(ToolError {
      tool: name.to_string(),
      version: version.to_string(),
      stage: stage.to_string(),
      error: msg,
    })
  }

  /// 使用内置 manifest（主程序与辅助软件版本对应），不拉取网络。
  fn get_manifest(&self) -> Result<Manifest, AnyError> {
    let manifest: Manifest = serde_json::from_slice(embedded::EMBEDDED_MANIFEST)?;
    Ok(manifest)
  }

  /// 列出 manifest 中声明的所有工具名称（前端用于展示完整列表）。
  pub fn list_tools(&self) -> Result<Vec<String>, AnyError> {
    let manifest = self.get_manifest()?;
    Ok(manifest.tools.keys().cloned().collect())
  }

  /// 辅助软件页用：带版本与是否已安装的列表（只读 manifest + meta，不修改现有逻辑）。
  pub async fn list_tools_with_status(&self) -> Result<Vec<HelperToolStatus>, AnyError> {
    let manifest = self.get_manifest()?;
    let arch = Self::current_platform();
    let meta_path = self.bin_dir.join("metadata.json");
    let meta = self.load_metadata(&meta_path).await?;
    let mut out = Vec::new();
    for (name, info) in &manifest.tools {
      if Self::select_file(&info.files, &arch).is_none() {
        continue;
      }
      let version_ok = meta.versions.get(name) == Some(&info.version);
      let canonical = self.canonical_path(name).map_err(|e| {
        Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())) as AnyError
      })?;
      let exists = tokio::fs::metadata(&canonical).await.is_ok();
      out.push(HelperToolStatus {
        name: name.clone(),
        version: info.version.clone(),
        installed: version_ok && exists,
      });
    }
    Ok(out)
  }

  /// 移除指定工具的已安装记录与文件，便于下次 ensure 时重新下载。
  pub async fn remove_tool(&self, name: &str) -> Result<(), AnyError> {
    let meta_path = self.bin_dir.join("metadata.json");
    let mut meta = self.load_metadata(&meta_path).await?;
    meta.versions.remove(name);
    self.save_metadata(&meta_path, &meta).await?;
    let canonical = self.canonical_path(name).map_err(|e| {
      Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())) as AnyError
    })?;
    let _ = tokio::fs::remove_file(&canonical).await;
    Ok(())
  }

  /// 手动下载用：当前平台的下载 URL 与目标目录。
  pub fn tool_manual_info(&self, name: &str) -> Result<ManualToolInfo, AnyError> {
    let manifest = self.get_manifest()?;
    let info = manifest.tools.get(name).ok_or_else(|| {
      Box::new(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "tool not found",
      )) as AnyError
    })?;
    let arch = Self::current_platform();
    let (_key, file) = Self::select_file(&info.files, &arch).ok_or_else(|| {
      Box::new(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "no file for current platform",
      )) as AnyError
    })?;
    let bin_dir = self.bin_dir.to_string_lossy().to_string();
    Ok(ManualToolInfo {
      url: file.url.clone(),
      bin_dir,
    })
  }

  /// 从 url 下载并校验 sha256，再按类型解压/重命名（与上游一致）。
  async fn download_and_verify(
    &self,
    tool: &str,
    url: &str,
    sha256_expected: &str,
    dest: &Path,
    entry: Option<&str>,
    bundle: Option<&BundleInfo>,
  ) -> Result<(), AnyError> {
    let mut res = self.client.get(url).send().await?;
    res.error_for_status_ref()?;

    let tmp = dest.with_extension("tmp");
    let mut file = fs::File::create(&tmp).await?;
    let mut hasher = Sha256::new();

    let total = res.content_length().unwrap_or(0);
    let mut received: u64 = 0;

    while let Some(chunk) = res.chunk().await? {
      received += chunk.len() as u64;
      hasher.update(&chunk);
      file.write_all(&chunk).await?;
      let _ = self.app.emit(
        "binary_download_progress",
        ToolProgress {
          tool: tool.to_string(),
          total,
          received,
        },
      );
    }
    file.flush().await?;
    drop(file);

    let hash = hex::encode(hasher.finalize());
    if hash != sha256_expected {
      let _ = fs::remove_file(&tmp).await;
      return Err("sha256 mismatch".into());
    }

    fs::rename(&tmp, dest).await?;

    let canonical = self.canonical_path(tool)?;
    let parent = dest.parent().unwrap();

    if let Some(ext) = dest.extension().and_then(|e| e.to_str()) {
      match ext {
        "zip" => {
          if let Some(b) = bundle {
            let (dir, _) = extract_zip_bundle(
              dest,
              parent,
              b.folder_name.as_deref(),
              Path::new(&b.entry),
              b.rename_entry_to.as_deref(),
            )
            .await?;
            fs::remove_file(dest).await?;
            self.hoist_bundle_contents_into_bin(&dir, &canonical).await?;
          } else {
            extract_zip(tool, canonical.clone(), dest, parent, entry).await?;
            fs::remove_file(dest).await?;
          }
        }
        "bz2" => {
          if let Some(b) = bundle {
            let (dir, _) = extract_tar_bz2_bundle(
              dest,
              parent,
              b.folder_name.as_deref(),
              Path::new(&b.entry),
              b.rename_entry_to.as_deref(),
            )
            .await?;
            fs::remove_file(dest).await?;
            self.hoist_bundle_contents_into_bin(&dir, &canonical).await?;
          } else {
            extract_tar_bz2(tool, canonical.clone(), dest, parent, entry).await?;
            fs::remove_file(dest).await?;
          }
        }
        _ => {
          fs::rename(dest, &canonical).await?;
        }
      }
    } else {
      fs::rename(dest, &canonical).await?;
    }

    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      let mut perms = std::fs::metadata(&canonical)?.permissions();
      if perms.mode() & 0o111 == 0 {
        perms.set_mode(0o755);
        std::fs::set_permissions(&canonical, perms)?;
      }
    }

    Ok(())
  }

  async fn load_metadata(&self, path: &Path) -> Result<Metadata, AnyError> {
    if let Ok(bytes) = fs::read(path).await {
      let meta = serde_json::from_slice(&bytes)?;
      Ok(meta)
    } else {
      Ok(Metadata::default())
    }
  }

  async fn save_metadata(&self, path: &Path, meta: &Metadata) -> Result<(), AnyError> {
    let bytes = serde_json::to_vec(meta)?;
    fs::write(path, bytes).await?;
    Ok(())
  }

  fn emit_tool_error(&self, tool: &str, version: &str, stage: &str, error: impl Into<String>) {
    let _ = self.app.emit(
      "binary_download_error",
      ToolError {
        tool: tool.to_string(),
        version: version.to_string(),
        stage: stage.to_string(),
        error: error.into(),
      },
    );
  }

  pub async fn hoist_bundle_contents_into_bin(
    &self,
    bundle_root: &Path,
    canonical: &Path,
  ) -> Result<(), AnyError> {
    let bin_dir = canonical
      .parent()
      .ok_or("canonical has no parent directory")?
      .to_path_buf();

    tokio::fs::create_dir_all(&bin_dir).await?;

    let src = bundle_root.to_path_buf();
    let dest = bin_dir.clone();

    tokio::task::spawn_blocking(move || {
      let mut opts = CopyOptions::new();
      opts.overwrite = true;
      opts.copy_inside = false;
      opts.content_only = true;
      move_dir(&src, &dest, &opts)?;
      Ok::<(), fs_extra::error::Error>(())
    })
    .await??;

    let _ = fs::remove_dir_all(bundle_root).await;

    Ok(())
  }
}
