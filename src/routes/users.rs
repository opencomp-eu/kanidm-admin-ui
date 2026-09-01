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
        .route("/", get(list_users).post(create_user))
        .route("/{id}", get(get_user).delete(delete_user))
        .route("/{id}/disable", post(disable_user))
        .route("/{id}/enable", post(enable_user))
        .route("/{id}/groups", get(get_user_groups))
        .route(
            "/{id}/groups/{group}",
            post(add_user_to_group).delete(remove_user_from_group),
        )
}

async fn list_users(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let entries = if let Some(q) = &query.q {
        state.kanidm.search_persons(q).await?
    } else {
        state.kanidm.list_persons().await?
    };
    Ok(Json(entries.into_iter().map(entry_to_json).collect()))
}

async fn get_user(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let entry = state.kanidm.get_person(&id).await?;
    Ok(Json(entry_to_json(entry)))
}

#[derive(Deserialize)]
pub struct CreateUserRequest {
    name: String,
    displayname: String,
    mail: Option<String>,
    #[allow(dead_code)]
    password: Option<String>,
}

async fn create_user(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(input): Json<CreateUserRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let entry = state
        .kanidm
        .create_person(&input.name, &input.displayname, input.mail.as_deref())
        .await?;
    Ok(Json(entry_to_json(entry)))
}

async fn delete_user(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<(), AppError> {
    state.kanidm.delete_person(&id).await
}

async fn disable_user(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<(), AppError> {
    state.kanidm.disable_person(&id).await
}

async fn enable_user(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<(), AppError> {
    state.kanidm.enable_person(&id).await
}

async fn get_user_groups(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let groups = state.kanidm.get_person_groups(&id).await?;
    Ok(Json(groups.into_iter().map(entry_to_json).collect()))
}

async fn add_user_to_group(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path((id, group)): Path<(String, String)>,
) -> Result<(), AppError> {
    state.kanidm.add_person_to_group(&id, &group).await
}

async fn remove_user_from_group(
    _session: AuthSession,
    axum::extract::State(state): axum::extract::State<AppState>,
    Path((id, group)): Path<(String, String)>,
) -> Result<(), AppError> {
    state.kanidm.remove_person_from_group(&id, &group).await
}

fn entry_to_json(entry: crate::kanidm::Entry) -> serde_json::Value {
    serde_json::json!({ "attrs": entry.attrs })
}
