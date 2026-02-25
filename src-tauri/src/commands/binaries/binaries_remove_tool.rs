use crate::binaries::binaries_manager::BinariesManager;
use tauri::State;

#[tauri::command]
pub async fn binaries_remove_tool(
  binaries_manager: State<'_, BinariesManager>,
  name: String,
) -> Result<(), String> {
  binaries_manager
    .remove_tool(&name)
    .await
    .map_err(|e| e.to_string())
}
