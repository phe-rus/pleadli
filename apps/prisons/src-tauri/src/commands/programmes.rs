use tauri::State;

use crate::db::Db;
use crate::domain::programmes::{self, CertifyProgrammeParticipationInput, CreateProgrammeParticipationInput, ProgrammeParticipation};

#[tauri::command]
pub async fn create_programme_participation(
    state: State<'_, Db>,
    input: CreateProgrammeParticipationInput,
) -> Result<ProgrammeParticipation, String> {
    programmes::create_participation(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn certify_programme_participation(
    state: State<'_, Db>,
    id: String,
    input: CertifyProgrammeParticipationInput,
) -> Result<ProgrammeParticipation, String> {
    programmes::certify_participation(&state.pool, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_programme_participations_for_prisoner(
    state: State<'_, Db>,
    prisoner_id: String,
) -> Result<Vec<ProgrammeParticipation>, String> {
    programmes::list_for_prisoner(&state.pool, &prisoner_id).await.map_err(|e| e.to_string())
}
