use crate::binaries::binaries_manager::BinariesManager;
use tauri::State;
use tracing::info;

#[tauri::command]
pub async fn binaries_list(
  binaries_manager: State<'_, BinariesManager>,
) -> Result<Vec<String>, String> {
  info!("[binaries_list] command entry");
  let result = binaries_manager.list_tools().map_err(|e| {
    info!("[binaries_list] list_tools() error: {}", e);
    e.to_string()
  });
  match &result {
    Ok(list) => info!("[binaries_list] ok len={} list={:?}", list.len(), list),
    Err(_) => {}
  }
  result
}

