use tauri::State;

use crate::db::Db;
use crate::domain::search::{self, SearchResult};

// `actor` is not a parameter here on purpose, not by oversight: there is no
// officer-identity/auth model yet (see docs/police/PRODUCT.md's own open
// question on this), so "search everything the current user is authorized
// to discover" has nothing to scope against today. When that model exists,
// this is the one place a caller-scoped filter needs to be threaded through
// — every domain's own `list_for_person`/`list_*` functions already take
// plain query strings, so adding a scope here won't require touching them.
#[tauri::command]
pub async fn search(state: State<'_, Db>, query: String) -> Result<Vec<SearchResult>, String> {
    search::search(&state.pool, &query)
        .await
        .map_err(|e| e.to_string())
}
