use crate::binaries::binaries_manager::BinariesManager;
use crate::binaries::binaries_state::HelperToolStatus;
use tauri::State;

#[tauri::command]
pub async fn binaries_list_for_helpers(
  binaries_manager: State<'_, BinariesManager>,
) -> Result<Vec<HelperToolStatus>, String> {
  binaries_manager
    .list_tools_with_status()
    .await
    .map_err(|e| e.to_string())
}
