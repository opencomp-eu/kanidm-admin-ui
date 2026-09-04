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

/// Formats an error with its full `source()` chain, e.g.
/// `error sending request for url (...): invalid peer certificate: UnknownIssuer`.
/// reqwest's Display alone flattens connection-level causes (DNS, proxy, TLS)
/// into an opaque message, which makes operator diagnosis impossible.
pub fn error_chain(err: &dyn std::error::Error) -> String {
    let mut msg = err.to_string();
    let mut source = err.source();
    while let Some(e) = source {
        msg.push_str(": ");
        msg.push_str(&e.to_string());
        source = e.source();
    }
    msg
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
