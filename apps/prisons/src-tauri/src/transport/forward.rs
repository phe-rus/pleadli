//! A workstation's side of the LAN: sends one API request to the facility
//! node it is enrolled with and returns the answer in the same shape a local
//! call gives, so nothing above it can tell the difference.

use std::time::Duration;

use serde_json::Value;

use crate::api::guard::DEVICE_HEADER;
use crate::node::Remote;

/// The status a caller sees when the node cannot be reached at all. The UI
/// treats it as "cannot reach the facility server" rather than an error in
/// what the officer did.
pub const UNREACHABLE_CODE: &str = "NODE_UNREACHABLE";

pub async fn forward(remote: &Remote, method: &str, path: &str, authorization: Option<&str>, body: Option<&Value>) -> (u16, Value) {
    let method = match reqwest::Method::from_bytes(method.to_uppercase().as_bytes()) {
        Ok(m) => m,
        Err(_) => return (400, serde_json::json!({ "code": "BAD_REQUEST", "message": "Bad method." })),
    };
    let mut request = remote
        .client
        .request(method, format!("{}{}", remote.base, path))
        .header(DEVICE_HEADER, &remote.device_token)
        .timeout(Duration::from_secs(60));
    if let Some(authorization) = authorization {
        request = request.header("authorization", authorization);
    }
    if let Some(body) = body {
        request = request.json(body);
    }

    match request.send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            let bytes = response.bytes().await.unwrap_or_default();
            let value = if bytes.is_empty() {
                Value::Null
            } else {
                serde_json::from_slice(&bytes).unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).to_string()))
            };
            (status, value)
        }
        Err(e) => {
            log::warn!("facility node unreachable: {e}");
            (
                502,
                serde_json::json!({
                    "code": UNREACHABLE_CODE,
                    "message": "Cannot reach the facility server. Records are safe on the server; continue on paper and enter them afterwards."
                }),
            )
        }
    }
}
