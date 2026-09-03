use axum::Router;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", axum::routing::get(crate::auth::login_handler))
        .route(
            "/callback",
            axum::routing::get(crate::auth::callback_handler),
        )
        .route("/logout", axum::routing::post(crate::auth::logout_handler))
        .route("/whoami", axum::routing::get(crate::auth::whoami_handler))
}
