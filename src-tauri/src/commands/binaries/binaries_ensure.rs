use crate::binaries::binaries_manager::BinariesManager;
use crate::binaries::binaries_state::BinariesState;
use tauri::State;
use tracing::info;

#[tauri::command]
pub async fn binaries_ensure(
  binaries_manager: State<'_, BinariesManager>,
  state: State<'_, BinariesState>,
  tools: Option<Vec<String>>,
  use_proxy: Option<bool>,
) -> Result<(), String> {
  info!(
    "[binaries_ensure] command entry tools={:?} use_proxy={:?}",
    tools,
    use_proxy
  );
  let started = state.try_start();
  info!("[binaries_ensure] try_start() => {}", started);
  if !started {
    info!("[binaries_ensure] early return: already running");
    return Ok(());
  }
  let use_proxy = use_proxy.unwrap_or(false);
  info!("[binaries_ensure] use_proxy={}", use_proxy);
  let res = match tools.as_ref() {
    Some(v) => {
      info!("[binaries_ensure] calling ensure(Some({:?}), {})", v, use_proxy);
      binaries_manager.ensure(Some(v), use_proxy).await
    }
    None => {
      info!("[binaries_ensure] calling ensure(None, {})", use_proxy);
      binaries_manager.ensure(None, use_proxy).await
    }
  }
  .map_err(|e| e.to_string());
  state.finish();
  info!("[binaries_ensure] finish() done res.is_ok()={}", res.is_ok());
  res
}
