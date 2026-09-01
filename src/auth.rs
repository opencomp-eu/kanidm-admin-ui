use anyhow::{Context, Result};
use axum::extract::FromRef;
use axum::extract::FromRequestParts;
use axum::http::header::COOKIE;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Redirect, Response};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::future::Future;

use crate::config::Config;
use crate::error::AppError;
use crate::AppState;

#[derive(Clone)]
pub struct OidcState {
    pub issuer_url: String,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_url: String,
}

impl OidcState {
    pub async fn new(config: &Config) -> Result<Option<Self>> {
        if !config.oidc_enabled() {
            tracing::info!("OIDC not configured; using dev auth mode");
            return Ok(None);
        }

        Ok(Some(Self {
            issuer_url: config.oidc_issuer_url.clone().context("OIDC_ISSUER_URL")?,
            client_id: config.oidc_client_id.clone().context("OIDC_CLIENT_ID")?,
            client_secret: config
                .oidc_client_secret
                .clone()
                .context("OIDC_CLIENT_SECRET")?,
            redirect_url: format!("{}/api/auth/callback", config.external_url),
        }))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub user_id: String,
    pub display_name: String,
    pub email: String,
}

const SESSION_COOKIE: &str = "kanidm_admin_session";

fn make_aead_key(secret: &[u8]) -> ring::aead::LessSafeKey {
    use ring::aead::*;
    let mut key_bytes = [0u8; 32];
    let len = secret.len().min(32);
    key_bytes[..len].copy_from_slice(&secret[..len]);
    let unbound = UnboundKey::new(&AES_256_GCM, &key_bytes).unwrap();
    LessSafeKey::new(unbound)
}

fn ring_err(_: ring::error::Unspecified) -> anyhow::Error {
    anyhow::anyhow!("ring crypto error")
}

fn encode_session(session: &Session, secret: &[u8]) -> Result<String> {
    use ring::aead::*;

    let json = serde_json::to_vec(session)?;
    let key = make_aead_key(secret);

    let mut in_out = json;
    let nonce = Nonce::assume_unique_for_key([0u8; 12]);
    key.seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
        .map_err(ring_err)?;

    let mut result = Vec::new();
    result.extend_from_slice(&[0u8; 12]);
    result.extend_from_slice(&in_out);

    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&result))
}

fn decode_session(data: &str, secret: &[u8]) -> Result<Session> {
    use ring::aead::*;

    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(data)?;
    let key = make_aead_key(secret);

    if bytes.len() < 12 + 16 {
        anyhow::bail!("session token too short");
    }
    let nonce_bytes: [u8; 12] = bytes[..12].try_into()?;
    let mut in_out = bytes[12..].to_vec();
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);

    let plaintext = key
        .open_in_place(nonce, Aad::empty(), &mut in_out)
        .map_err(ring_err)?;
    Ok(serde_json::from_slice(plaintext)?)
}

pub fn create_session_cookie(session: &Session, secret: &[u8]) -> Result<String> {
    let token = encode_session(session, secret)?;
    Ok(format!(
        "{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400"
    ))
}

pub fn delete_session_cookie() -> String {
    format!("{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
}

fn parse_cookie_header(header_value: &str) -> Option<String> {
    for part in header_value.split(';') {
        let part = part.trim();
        if let Some((key, value)) = part.split_once('=') {
            if key.trim() == SESSION_COOKIE {
                return Some(value.trim().to_string());
            }
        }
    }
    None
}

pub struct AuthSession(pub Session);

impl<S> FromRequestParts<S> for AuthSession
where
    S: Send + Sync,
    AppState: FromRef<S>,
{
    type Rejection = AppError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &S,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        let state = AppState::from_ref(state);
        async move {
            // Extract cookie header directly instead of using TypedHeader
            let cookie_header = parts
                .headers
                .get(COOKIE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");

            tracing::debug!(cookie_header = %cookie_header, "AuthSession: checking cookies");

            let token = parse_cookie_header(cookie_header).ok_or_else(|| {
                tracing::warn!("AuthSession: no session cookie found");
                AppError::Unauthorized
            })?;

            tracing::debug!(token_len = token.len(), "AuthSession: found session token");

            let session =
                decode_session(&token, state.config.cookie_secret.as_bytes()).map_err(|e| {
                    tracing::warn!(error = %e, "AuthSession: failed to decode session");
                    AppError::Unauthorized
                })?;

            tracing::info!(user = %session.user_id, "AuthSession: authenticated");
            Ok(AuthSession(session))
        }
    }
}

pub async fn login_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Response {
    if !state.config.oidc_enabled() {
        let session = Session {
            user_id: "admin".into(),
            display_name: "Admin".into(),
            email: "admin@localhost".into(),
        };
        let cookie = create_session_cookie(&session, state.config.cookie_secret.as_bytes())
            .unwrap_or_default();

        tracing::info!("Dev login: setting session cookie");
        return (
            [(axum::http::header::SET_COOKIE, cookie)],
            Redirect::to("/"),
        )
            .into_response();
    }

    let oidc = state.oidc.as_ref().unwrap();
    let redirect = format!(
        "{}/oauth2/openid/{}/authorize?response_type=code&scope=openid+email+profile&redirect_uri={}&state=kanidm_admin",
        oidc.issuer_url,
        oidc.client_id,
        urlencoding::encode(&oidc.redirect_url)
    );

    Redirect::to(&redirect).into_response()
}

pub async fn callback_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Response, AppError> {
    if !state.config.oidc_enabled() {
        return Ok(Redirect::to("/").into_response());
    }

    let code = params
        .get("code")
        .ok_or_else(|| AppError::BadRequest("missing authorization code".into()))?;

    let oidc = state.oidc.as_ref().unwrap();

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| AppError::Internal(e.into()))?;

    let token_resp = client
        .post(format!(
            "{}/oauth2/openid/{}/token",
            oidc.issuer_url, oidc.client_id
        ))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", &oidc.redirect_url),
            ("client_id", &oidc.client_id),
            ("client_secret", &oidc.client_secret),
        ])
        .send()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    if !token_resp.status().is_success() {
        let text = token_resp.text().await.unwrap_or_default();
        return Err(AppError::Upstream(format!("token exchange failed: {text}")));
    }

    let token_body: serde_json::Value = token_resp
        .json()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    let id_token = token_body["id_token"]
        .as_str()
        .ok_or_else(|| AppError::Upstream("no id_token in response".into()))?;

    let claims = decode_id_token_claims(id_token)?;

    let session = Session {
        user_id: claims
            .get("sub")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .into(),
        display_name: claims
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .into(),
        email: claims
            .get("email")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .into(),
    };

    let cookie = create_session_cookie(&session, state.config.cookie_secret.as_bytes())
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(
        ([(axum::http::header::SET_COOKIE, cookie)], Redirect::to("/"))
            .into_response(),
    )
}

fn decode_id_token_claims(token: &str) -> Result<serde_json::Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        anyhow::bail!("invalid JWT format");
    }
    let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(parts[1])?;
    Ok(serde_json::from_slice(&payload)?)
}

pub async fn logout_handler(
    _state: axum::extract::State<AppState>,
) -> impl IntoResponse {
    let cookie = delete_session_cookie();
    (
        [(axum::http::header::SET_COOKIE, cookie)],
        Redirect::to("/"),
    )
}

pub async fn whoami_handler(
    session: AuthSession,
) -> Result<axum::Json<serde_json::Value>, AppError> {
    Ok(axum::Json(serde_json::json!({
        "youare": {
            "attrs": {
                "name": [session.0.user_id],
                "displayname": [session.0.display_name],
                "mail": [session.0.email],
            }
        }
    })))
}
