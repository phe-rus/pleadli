use tauri::State;

use crate::db::Db;
use crate::domain::reports::{self, ReportsSummary};

#[tauri::command]
pub async fn get_reports_summary(state: State<'_, Db>) -> Result<ReportsSummary, String> {
    reports::get_reports_summary(&state.pool).await.map_err(|e| e.to_string())
}
