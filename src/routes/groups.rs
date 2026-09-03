use axum::extract::{Path, Query};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::auth::AuthSession;
use crate::error::AppError;
use crate::AppState;

#[derive(Deserialize)]
pub struct SearchQuery {
    q: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_groups).post(create_group))
        .route("/{id}", get(get_group).delete(delete_group))
        .route("/{id}/members", get(get_group_members))
        .route(
            "/{id}/members/{member}",
            post(add_member).delete(remove_member),
        )
}

async fn list_groups(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let entries = if let Some(q) = &query.q {
        state.kanidm.search_groups(q).await?
    } else {
        state.kanidm.list_groups().await?
    };
    Ok(Json(entries.into_iter().map(entry_to_json).collect()))
}

async fn get_group(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    super::validate_identifier(&id)?;
    let entry = state.kanidm.get_group(&id).await?;
    Ok(Json(entry_to_json(entry)))
}

#[derive(Deserialize)]
pub struct CreateGroupRequest {
    name: String,
    description: Option<String>,
}

async fn create_group(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(input): Json<CreateGroupRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let entry = state
        .kanidm
        .create_group(&input.name, input.description.as_deref())
        .await?;
    Ok(Json(entry_to_json(entry)))
}

async fn delete_group(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<(), AppError> {
    super::validate_identifier(&id)?;
    state.kanidm.delete_group(&id).await
}

async fn get_group_members(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    super::validate_identifier(&id)?;
    let members = state.kanidm.get_group_members(&id).await?;
    Ok(Json(members.into_iter().map(entry_to_json).collect()))
}

async fn add_member(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path((id, member)): Path<(String, String)>,
) -> Result<(), AppError> {
    super::validate_identifier(&id)?;
    super::validate_identifier(&member)?;
    state.kanidm.add_group_member(&id, &member).await
}

async fn remove_member(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path((id, member)): Path<(String, String)>,
) -> Result<(), AppError> {
    super::validate_identifier(&id)?;
    super::validate_identifier(&member)?;
    state.kanidm.remove_group_member(&id, &member).await
}

fn entry_to_json(entry: crate::kanidm::Entry) -> serde_json::Value {
    serde_json::json!({ "attrs": entry.attrs })
}
