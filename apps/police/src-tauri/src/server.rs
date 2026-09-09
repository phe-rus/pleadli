//! A local-only HTTP server, dev builds only. Lets the plain browser dev
//! server (which has no Tauri IPC bridge) exercise the same domain logic
//! the desktop app's Tauri commands use — same functions, same database,
//! different transport. Not a real network-facing service: bound to
//! 127.0.0.1, compiled out of release builds entirely.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use serde::Deserialize;
use sqlx::SqlitePool;
use tower_http::cors::{Any, CorsLayer};

use crate::domain::people::{self, CreatePersonInput, Person};
use crate::domain::station_diary::{self, CreateStationDiaryEntryInput, StationDiaryEntry};

pub const PORT: u16 = 47821;

#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
}

type ApiError = (StatusCode, String);

fn internal_error(err: sqlx::Error) -> ApiError {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

async fn create_person_handler(
    State(state): State<AppState>,
    Json(input): Json<CreatePersonInput>,
) -> Result<Json<Person>, ApiError> {
    people::create_person(&state.pool, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

#[derive(Deserialize)]
struct SearchParams {
    #[serde(default)]
    query: String,
}

async fn search_people_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<Person>>, ApiError> {
    people::search_people(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn get_person_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Option<Person>>, ApiError> {
    people::get_person(&state.pool, &id)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_person_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreatePersonInput>,
) -> Result<Json<Person>, ApiError> {
    people::update_person(&state.pool, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_station_diary_entry_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateStationDiaryEntryInput>,
) -> Result<Json<StationDiaryEntry>, ApiError> {
    station_diary::update_entry(&state.pool, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_station_diary_entry_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateStationDiaryEntryInput>,
) -> Result<Json<StationDiaryEntry>, ApiError> {
    station_diary::create_entry(&state.pool, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_station_diary_entries_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<StationDiaryEntry>>, ApiError> {
    station_diary::list_entries(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

pub async fn serve(pool: SqlitePool) {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/people", post(create_person_handler).get(search_people_handler))
        .route("/people/{id}", get(get_person_handler).put(update_person_handler))
        .route(
            "/station-diary",
            post(create_station_diary_entry_handler).get(list_station_diary_entries_handler),
        )
        .route("/station-diary/{id}", put(update_station_diary_entry_handler))
        .layer(cors)
        .with_state(AppState { pool });

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", PORT))
        .await
        .expect("bind local dev server port");

    axum::serve(listener, app)
        .await
        .expect("run local dev server");
}
