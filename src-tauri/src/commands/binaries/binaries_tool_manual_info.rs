use crate::binaries::binaries_manager::BinariesManager;
use crate::binaries::binaries_state::ManualToolInfo;
use tauri::State;

#[tauri::command]
pub fn binaries_tool_manual_info(
  binaries_manager: State<'_, BinariesManager>,
  name: String,
) -> Result<ManualToolInfo, String> {
  binaries_manager
    .tool_manual_info(&name)
    .map_err(|e| e.to_string())
}
