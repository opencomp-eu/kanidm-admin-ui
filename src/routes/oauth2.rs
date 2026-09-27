use axum::extract::Path;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::auth::AuthSession;
use crate::error::AppError;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_apps).post(create_app))
        .route("/{rs_name}", get(get_app).delete(delete_app))
        .route(
            "/{rs_name}/access/{group}",
            post(grant_access).delete(revoke_access),
        )
}

async fn list_apps(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let entries = state.kanidm.list_oauth2().await?;
    Ok(Json(entries.into_iter().map(entry_to_json).collect()))
}

async fn get_app(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(rs_name): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    super::validate_identifier(&rs_name)?;
    let entry = state.kanidm.get_oauth2(&rs_name).await?;
    Ok(Json(entry_to_json(entry)))
}

#[derive(Deserialize)]
pub struct CreateOAuth2Request {
    name: String,
    displayname: String,
    origin: String,
}

async fn create_app(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(input): Json<CreateOAuth2Request>,
) -> Result<Json<serde_json::Value>, AppError> {
    let name = input.name.trim();
    super::validate_identifier(name)?;
    let displayname = super::clean_text(Some(&input.displayname), "display name", 256)?
        .ok_or_else(|| AppError::BadRequest("display name is required".into()))?;
    let origin = input.origin.trim();
    if !(origin.starts_with("https://") || origin.starts_with("http://")) {
        return Err(AppError::BadRequest(
            "the app address must start with https:// or http://".into(),
        ));
    }
    let entry = state
        .kanidm
        .create_oauth2_basic(name, &displayname, origin)
        .await?;
    Ok(Json(entry_to_json(entry)))
}

async fn delete_app(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(rs_name): Path<String>,
) -> Result<(), AppError> {
    super::validate_identifier(&rs_name)?;
    state.kanidm.delete_oauth2(&rs_name).await
}

async fn grant_access(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path((rs_name, group)): Path<(String, String)>,
) -> Result<(), AppError> {
    super::validate_identifier(&rs_name)?;
    super::validate_identifier(&group)?;
    state.kanidm.grant_oauth2_access(&rs_name, &group).await
}

async fn revoke_access(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path((rs_name, group)): Path<(String, String)>,
) -> Result<(), AppError> {
    super::validate_identifier(&rs_name)?;
    super::validate_identifier(&group)?;
    state.kanidm.revoke_oauth2_access(&rs_name, &group).await
}

fn entry_to_json(entry: crate::kanidm::Entry) -> serde_json::Value {
    serde_json::json!({ "attrs": entry.attrs })
}
