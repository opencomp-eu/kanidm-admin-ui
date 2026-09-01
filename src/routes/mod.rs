use axum::Router;

use crate::AppState;

pub mod auth;
pub mod groups;
pub mod oauth2;
pub mod users;

pub fn api_router(state: AppState) -> Router {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/users", users::router())
        .nest("/groups", groups::router())
        .nest("/oauth2", oauth2::router())
        .with_state(state)
}
