use tauri::State;

use crate::db::Db;
use crate::domain::activity::{self, ActivityItem};

#[tauri::command]
pub async fn list_recent_activity(state: State<'_, Db>) -> Result<Vec<ActivityItem>, String> {
    activity::recent(&state.pool).await.map_err(|e| e.to_string())
}
