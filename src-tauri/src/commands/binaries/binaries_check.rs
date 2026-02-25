use crate::binaries::binaries_manager::BinariesManager;
use crate::binaries::binaries_state::CheckResult;
use tauri::State;
use tracing::info;

#[tauri::command]
pub async fn binaries_check(
  binaries_manager: State<'_, BinariesManager>,
) -> Result<CheckResult, String> {
  info!("[binaries_check] command entry");
  let result = binaries_manager.check().await.map_err(|e| {
    info!("[binaries_check] manager.check() error: {}", e);
    e.to_string()
  });
  match &result {
    Ok(r) => info!(
      "[binaries_check] ok tools_len={} all_tools_len={} all_tools={:?}",
      r.tools.len(),
      r.all_tools.len(),
      r.all_tools
    ),
    Err(_) => {}
  }
  result
}
