use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::IntoResponse;
use axum::response::Response;
use axum::Router;

use crate::error::AppError;
use crate::AppState;

pub mod auth;
pub mod groups;
pub mod oauth2;
pub mod users;

/// Validates user-controlled path segments before they are interpolated into
/// Kanidm API URLs. Kanidm names, SPNs and UUIDs only ever contain these
/// characters, so anything else would be a URL-path injection attempt.
pub fn validate_identifier(value: &str) -> Result<(), AppError> {
    let ok = !value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '@' | '.' | '_' | '-'))
        && !value.starts_with('.')
        && value != "..";
    if ok {
        Ok(())
    } else {
        Err(AppError::BadRequest(format!(
            "invalid identifier: {value:?}"
        )))
    }
}

/// Router-level authentication gate: unlike the per-handler AuthSession
/// extractor, this runs even if a future handler forgets the extractor.
async fn require_session(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if crate::auth::session_from_headers(request.headers(), &state.config.cookie_secret).is_some() {
        next.run(request).await
    } else {
        AppError::Unauthorized.into_response()
    }
}

pub fn api_router(state: AppState) -> Router {
    let protected = Router::new()
        .nest("/users", users::router())
        .nest("/groups", groups::router())
        .nest("/oauth2", oauth2::router())
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            require_session,
        ))
        .with_state(state.clone());

    Router::new()
        .nest("/auth", auth::router())
        .merge(protected)
        .with_state(state)
}
