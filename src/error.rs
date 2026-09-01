use axum::http::StatusCode;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("unauthorized")]
    Unauthorized,

    #[error("forbidden")]
    Forbidden,

    #[error("not found")]
    NotFound,

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("upstream error: {0}")]
    Upstream(String),

    #[error("internal error: {0}")]
    Internal(#[from] anyhow::Error),
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match &self {
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::Forbidden => (StatusCode::FORBIDDEN, self.to_string()),
            AppError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Upstream(msg) => (StatusCode::BAD_GATEWAY, msg.clone()),
            AppError::Internal(_) => {
                tracing::error!(error = ?self, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".into(),
                )
            }
        };

        let body = axum::Json(serde_json::json!({ "error": message }));
        (status, body).into_response()
    }
}

pub trait ResultExt<T> {
    fn or_404(self) -> Result<T, AppError>;
}

impl<T> ResultExt<T> for Option<T> {
    fn or_404(self) -> Result<T, AppError> {
        self.ok_or(AppError::NotFound)
    }
}
