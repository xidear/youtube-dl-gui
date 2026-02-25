use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Default)]
pub struct BinariesState {
  running: AtomicBool,
}

impl BinariesState {
  pub(crate) fn try_start(&self) -> bool {
    self
      .running
      .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
      .is_ok()
  }
  pub(crate) fn finish(&self) {
    self.running.store(false, Ordering::SeqCst);
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
  /// 需要下载的工具名
  pub tools: Vec<String>,
  /// 当前平台 manifest 中的全部工具名（用于安装页展示）
  pub all_tools: Vec<String>,
}

/// 辅助软件页列表项：来自 manifest 的版本 + 是否已安装
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelperToolStatus {
  pub name: String,
  pub version: String,
  pub installed: bool,
}

/// 手动下载说明：当前平台的下载 URL 与目标目录
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualToolInfo {
  pub url: String,
  pub bin_dir: String,
}
