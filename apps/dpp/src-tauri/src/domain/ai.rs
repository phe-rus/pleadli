//! Assist's provider client lives in `pleadli_node_core::ai` (shared with the
//! other apps); this keeps DPP's calls as they were, with its own error.

use serde_json::Value;

pub use pleadli_node_core::ai::{Engine, ModelInfo, Part, PROVIDERS};
use pleadli_node_core::ai::{self as shared, AiError};

use super::error::DomainError;

fn invalid(e: AiError) -> DomainError {
    DomainError::Invalid(e.0)
}

pub async fn list_models(e: &Engine) -> Result<Vec<ModelInfo>, DomainError> {
    shared::list_models(e).await.map_err(invalid)
}

pub async fn generate_json(e: &Engine, system: &str, parts: &[Part], schema: &Value) -> Result<(Value, String), DomainError> {
    shared::generate_json(e, system, parts, schema).await.map_err(invalid)
}

pub async fn reply(e: &Engine, system: &str, conversation: &[(String, String)]) -> Result<(String, String), DomainError> {
    shared::reply(e, system, conversation).await.map_err(invalid)
}
