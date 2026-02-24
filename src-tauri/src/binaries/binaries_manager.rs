use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::binaries::binaries_extractor::{
  extract_tar_bz2, extract_tar_bz2_bundle, extract_zip, extract_zip_bundle,
};
use crate::binaries::binaries_state::CheckResult;
use crate::binaries::embedded;
use crate::paths::PathsManager;
use fs_extra::dir::{move_dir, CopyOptions};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Error, Manager, Wry};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::time::{sleep, Duration};

/// 未内置辅助程序时的错误提示（面向最终用户）。
const ERR_NO_EMBEDDED: &str =
  "此版本未内置辅助程序，无法使用。请从官方渠道获取已打包的完整版本。";

/// 释放写入限速：约 50 MiB/s，避免一次性写满磁盘导致卡死
const RELEASE_MAX_BYTES_PER_SEC: u64 = 50 * 1024 * 1024;
const RELEASE_CHUNK_SIZE: usize = 1024 * 1024;

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
}

impl BinariesManager {
  pub fn new(app: &AppHandle<Wry>) -> Self {
    let paths_manager = app.state::<PathsManager>();
    Self {
      app: app.clone(),
      bin_dir: paths_manager.bin_dir().clone(),
    }
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
    if !embedded::has_embedded_binaries() {
      return Err(ERR_NO_EMBEDDED.into());
    }

    let bin = &self.bin_dir;
    tokio::fs::create_dir_all(&bin).await?;

    let meta_path = bin.join("metadata.json");
    let meta = self.load_metadata(&meta_path).await?;
    if meta.is_locked {
      return Ok(CheckResult { tools: Vec::new() });
    }
    let arch = Self::current_platform();

    let manifest = self.get_manifest()?;
    let plan = self.build_plan(&manifest, &meta, &arch, None).await?;
    let tools: Vec<String> = plan.iter().map(|(n, _)| (*n).to_string()).collect();

    Ok(CheckResult { tools })
  }

  pub async fn ensure(&self, allow: Option<&[String]>) -> Result<(), AnyError> {
    if !embedded::has_embedded_binaries() {
      return Err(ERR_NO_EMBEDDED.into());
    }

    let bin = &self.bin_dir;
    tokio::fs::create_dir_all(&bin).await?;

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
      match self.install_single_tool(bin, &arch, name, info).await {
        Ok(()) => {
          // only update meta + successes on fully successful install
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

  async fn install_single_tool(
    &self,
    bin: &Path,
    arch: &str,
    name: &str,
    info: &ToolInfo,
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

    let Some(bytes) = embedded::embedded_tool_bytes(name) else {
      return self.fail_stage(
        name,
        &info.version,
        "embedded",
        "此版本未内置该辅助程序，请使用已正确打包的完整版本。".to_string(),
      );
    };

    if let Err(e) = self
      .release_embedded_and_verify(
        name,
        bytes,
        &file.sha256,
        &dest,
        file.entry.as_deref(),
        file.bundle.as_ref(),
      )
      .await
    {
      return self.fail_stage(name, &info.version, "release_verify", e.to_string());
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

  /// 仅使用内置 manifest，不进行任何网络拉取。
  fn get_manifest(&self) -> Result<Manifest, AnyError> {
    let manifest: Manifest = serde_json::from_slice(embedded::EMBEDDED_MANIFEST)?;
    Ok(manifest)
  }

  /// 限速写入文件并发送进度，避免一次性写满磁盘导致卡死。
  async fn write_throttled(
    &self,
    tool: &str,
    dest: &Path,
    bytes: &[u8],
  ) -> Result<(), AnyError> {
    let total = bytes.len() as u64;
    let mut file = fs::File::create(dest).await?;
    let mut received: u64 = 0;
    let mut pos = 0;
    while pos < bytes.len() {
      let end = (pos + RELEASE_CHUNK_SIZE).min(bytes.len());
      let chunk = &bytes[pos..end];
      file.write_all(chunk).await?;
      received += chunk.len() as u64;
      pos = end;
      let _ = self.app.emit(
        "binary_download_progress",
        ToolProgress {
          tool: tool.to_string(),
          total,
          received,
        },
      );
      if end < bytes.len() {
        let chunk_len = chunk.len() as u64;
        let sleep_ms = (chunk_len * 1000) / RELEASE_MAX_BYTES_PER_SEC;
        sleep(Duration::from_millis(sleep_ms.max(1))).await;
      }
    }
    file.flush().await?;
    Ok(())
  }

  /// 将内置二进制写入 dest，校验 sha256 后按类型解压/重命名到 bin 目录。
  async fn release_embedded_and_verify(
    &self,
    tool: &str,
    bytes: &[u8],
    sha256_expected: &str,
    dest: &Path,
    entry: Option<&str>,
    bundle: Option<&BundleInfo>,
  ) -> Result<(), AnyError> {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let hash = hex::encode(hasher.finalize());
    if hash != sha256_expected {
      return Err("sha256 mismatch".into());
    }

    self
      .write_throttled(tool, dest, bytes)
      .await?;

    let canonical = self.canonical_path(tool)?;
    let parent = dest.parent().unwrap();

    if let Some(ext) = dest.extension().and_then(|e| e.to_str()) {
      match ext {
        "zip" => {
          if let Some(b) = bundle {
            let (dir, _entry_abs) = extract_zip_bundle(
              dest,
              parent,
              b.folder_name.as_deref(),
              Path::new(&b.entry),
              b.rename_entry_to.as_deref(),
            )
            .await?;
            fs::remove_file(dest).await?;
            self
              .hoist_bundle_contents_into_bin(&dir, &canonical)
              .await?;
          } else {
            extract_zip(tool, canonical.clone(), dest, parent, entry).await?;
            fs::remove_file(dest).await?;
          }
        }
        "bz2" => {
          if let Some(b) = bundle {
            let (dir, _entry_abs) = extract_tar_bz2_bundle(
              dest,
              parent,
              b.folder_name.as_deref(),
              Path::new(&b.entry),
              b.rename_entry_to.as_deref(),
            )
            .await?;
            fs::remove_file(dest).await?;
            self
              .hoist_bundle_contents_into_bin(&dir, &canonical)
              .await?;
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
