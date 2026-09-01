use axum::extract::Path;
use axum::routing::{get, delete};
use axum::{Json, Router};
use serde::Deserialize;

use crate::auth::AuthSession;
use crate::error::AppError;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_apps).post(create_app))
        .route("/{rs_name}", delete(delete_app))
}

async fn list_apps(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let entries = state.kanidm.list_oauth2().await?;
    Ok(Json(entries.into_iter().map(entry_to_json).collect()))
}

#[derive(Deserialize)]
pub struct CreateOAuth2Request {
    name: String,
    displayname: String,
    origin: String,
    redirect_uri: String,
}

async fn create_app(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(input): Json<CreateOAuth2Request>,
) -> Result<Json<serde_json::Value>, AppError> {
    let entry = state
        .kanidm
        .create_oauth2_basic(
            &input.name,
            &input.displayname,
            &input.origin,
            &input.redirect_uri,
        )
        .await?;
    Ok(Json(entry_to_json(entry)))
}

async fn delete_app(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(rs_name): Path<String>,
) -> Result<(), AppError> {
    state.kanidm.delete_oauth2(&rs_name).await
}

fn entry_to_json(entry: crate::kanidm::Entry) -> serde_json::Value {
    serde_json::json!({ "attrs": entry.attrs })
}
