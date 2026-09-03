use anyhow::{Context, Result};
use axum::extract::{FromRef, FromRequestParts};
use axum::http::header::COOKIE;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Redirect, Response};
use base64::Engine;
use ring::rand::SecureRandom;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::config::Config;
use crate::error::AppError;
use crate::AppState;

const SESSION_COOKIE: &str = "kanidm_admin_session";
const OIDC_STATE_COOKIE: &str = "kanidm_admin_oidc_state";
const SESSION_TTL: Duration = Duration::from_secs(86400);
const OIDC_STATE_TTL: Duration = Duration::from_secs(600);

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
            tracing::warn!(
                "OIDC not configured; DEV AUTH MODE is active: anyone who can reach \
                 this server gets an admin session. Never expose this instance publicly."
            );
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
    pub exp: u64,
}

/// One-time CSRF/nonce binding for the OIDC redirect round-trip. Encrypted in
/// a short-lived cookie so no server-side session store is needed.
#[derive(Debug, Serialize, Deserialize)]
struct OidcFlow {
    state: String,
    nonce: String,
    code_verifier: String,
    exp: u64,
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before Unix epoch")
        .as_secs()
}

fn random_token() -> String {
    use ring::rand::SecureRandom;
    let mut bytes = [0u8; 32];
    ring::rand::SystemRandom::new()
        .fill(&mut bytes)
        .expect("system RNG failed");
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// S256 PKCE challenge for an OAuth2 authorization-code flow.
fn pkce_challenge(verifier: &str) -> String {
    let digest = ring::digest::digest(&ring::digest::SHA256, verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest.as_ref())
}

fn make_aead_key(secret: &[u8]) -> ring::aead::LessSafeKey {
    use ring::aead::*;
    // Hash the secret to a full-entropy 32-byte key so short or uneven
    // secrets cannot be zero-padded into a weak key.
    let key_digest = ring::digest::digest(&ring::digest::SHA256, secret);
    let unbound = UnboundKey::new(&AES_256_GCM, key_digest.as_ref()).unwrap();
    LessSafeKey::new(unbound)
}

fn ring_err(_: ring::error::Unspecified) -> anyhow::Error {
    anyhow::anyhow!("ring crypto error")
}

fn encode_token<T: Serialize>(value: &T, secret: &[u8]) -> Result<String> {
    use ring::aead::*;

    let json = serde_json::to_vec(value)?;
    let key = make_aead_key(secret);

    let mut in_out = json;
    // A fresh random nonce per token: AES-GCM must never reuse a key/nonce
    // pair, and a fixed nonce would let observers recover the key.
    let mut nonce_bytes = [0u8; 12];
    ring::rand::SystemRandom::new()
        .fill(&mut nonce_bytes)
        .map_err(ring_err)?;
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);
    key.seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
        .map_err(ring_err)?;

    let mut result = Vec::with_capacity(12 + in_out.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&in_out);

    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&result))
}

fn decode_token<T: DeserializeOwned>(data: &str, secret: &[u8]) -> Result<T> {
    use ring::aead::*;

    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(data)?;
    let key = make_aead_key(secret);

    if bytes.len() < 12 + 16 {
        anyhow::bail!("token too short");
    }
    let nonce_bytes: [u8; 12] = bytes[..12].try_into()?;
    let mut in_out = bytes[12..].to_vec();
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);

    let plaintext = key
        .open_in_place(nonce, Aad::empty(), &mut in_out)
        .map_err(ring_err)?;
    Ok(serde_json::from_slice(plaintext)?)
}

fn cookie_attributes(secure: bool) -> &'static str {
    if secure {
        "; HttpOnly; Secure; SameSite=Lax"
    } else {
        "; HttpOnly; SameSite=Lax"
    }
}

pub fn create_session_cookie(session: &Session, secret: &[u8], secure: bool) -> Result<String> {
    let mut session = session.clone();
    session.exp = now_unix() + SESSION_TTL.as_secs();
    let token = encode_token(&session, secret)?;
    Ok(format!(
        "{SESSION_COOKIE}={token}; Path=/; Max-Age={}{attrs}",
        SESSION_TTL.as_secs(),
        attrs = cookie_attributes(secure)
    ))
}

pub fn delete_session_cookie() -> String {
    format!(
        "{SESSION_COOKIE}=; Path=/; Max-Age=0{attrs}",
        attrs = cookie_attributes(true)
    )
}

fn set_oidc_state_cookie(flow: &OidcFlow, secret: &[u8], secure: bool) -> Result<String> {
    let token = encode_token(flow, secret)?;
    Ok(format!(
        "{OIDC_STATE_COOKIE}={token}; Path=/api/auth; Max-Age={}{attrs}",
        OIDC_STATE_TTL.as_secs(),
        attrs = cookie_attributes(secure)
    ))
}

fn delete_oidc_state_cookie() -> String {
    format!(
        "{OIDC_STATE_COOKIE}=; Path=/api/auth; Max-Age=0{attrs}",
        attrs = cookie_attributes(true)
    )
}

fn parse_cookie_header(header_value: &str, name: &str) -> Option<String> {
    for part in header_value.split(';') {
        let part = part.trim();
        if let Some((key, value)) = part.split_once('=') {
            if key.trim() == name {
                return Some(value.trim().to_string());
            }
        }
    }
    None
}

pub struct AuthSession(pub Session);

/// Shared session verification for the per-handler extractor and the
/// router-level middleware. Returns None when the cookie is absent, invalid,
/// or expired.
pub fn session_from_headers(
    headers: &axum::http::HeaderMap,
    cookie_secret: &str,
) -> Option<Session> {
    let header = headers
        .get(COOKIE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let token = parse_cookie_header(header, SESSION_COOKIE)?;
    let session: Session = decode_token(&token, cookie_secret.as_bytes()).ok()?;
    // The cookie's Max-Age is only advisory; enforce expiry here so a leaked
    // token cannot be replayed after its lifetime.
    if session.exp <= now_unix() {
        return None;
    }
    Some(session)
}

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
            session_from_headers(&parts.headers, &state.config.cookie_secret)
                .map(AuthSession)
                .ok_or(AppError::Unauthorized)
        }
    }
}

pub async fn login_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Response {
    let secure = state.config.external_url.starts_with("https");

    if !state.config.oidc_enabled() {
        let session = Session {
            user_id: "admin".into(),
            display_name: "Admin".into(),
            email: "admin@localhost".into(),
            exp: 0,
        };
        let cookie = create_session_cookie(&session, state.config.cookie_secret.as_bytes(), secure)
            .unwrap_or_default();

        tracing::info!("Dev login: setting session cookie");
        return (
            [(axum::http::header::SET_COOKIE, cookie)],
            Redirect::to("/"),
        )
            .into_response();
    }

    let oidc = state.oidc.as_ref().unwrap();

    let flow = OidcFlow {
        state: random_token(),
        nonce: random_token(),
        code_verifier: random_token(),
        exp: now_unix() + OIDC_STATE_TTL.as_secs(),
    };
    let state_cookie =
        match set_oidc_state_cookie(&flow, state.config.cookie_secret.as_bytes(), secure) {
            Ok(c) => c,
            Err(e) => {
                tracing::error!(error = %e, "failed to encode OIDC state cookie");
                return AppError::Internal(e).into_response();
            }
        };

    let redirect = format!(
        "{}/oauth2/openid/{}/authorize?response_type=code&scope=openid+email+profile&redirect_uri={}&state={}&nonce={}&code_challenge={}&code_challenge_method=S256",
        oidc.issuer_url,
        oidc.client_id,
        urlencoding::encode(&oidc.redirect_url),
        urlencoding::encode(&flow.state),
        urlencoding::encode(&flow.nonce),
        urlencoding::encode(&pkce_challenge(&flow.code_verifier)),
    );

    (
        [(axum::http::header::SET_COOKIE, state_cookie)],
        Redirect::to(&redirect),
    )
        .into_response()
}

pub async fn callback_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Response, AppError> {
    if !state.config.oidc_enabled() {
        return Ok(Redirect::to("/").into_response());
    }

    let oidc = state.oidc.as_ref().unwrap();

    // Bind the browser round-trip: the state we issued (in an encrypted,
    // short-lived cookie) must match the one the provider echoes back.
    let flow: OidcFlow = {
        let clear_state = delete_oidc_state_cookie();
        let header = headers
            .get(COOKIE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let result = (|| -> Result<OidcFlow, AppError> {
            let cookie = parse_cookie_header(header, OIDC_STATE_COOKIE)
                .ok_or_else(|| AppError::BadRequest("missing OIDC state cookie".into()))?;
            let flow: OidcFlow = decode_token(&cookie, state.config.cookie_secret.as_bytes())
                .map_err(|_| AppError::BadRequest("invalid OIDC state cookie".into()))?;
            if flow.exp <= now_unix() {
                return Err(AppError::BadRequest("expired OIDC state".into()));
            }
            Ok(flow)
        })();
        let _ = clear_state;
        result?
    };

    let query_state = params
        .get("state")
        .ok_or_else(|| AppError::BadRequest("missing state parameter".into()))?;
    if query_state != &flow.state {
        return Err(AppError::BadRequest("state mismatch".into()));
    }

    let code = params
        .get("code")
        .ok_or_else(|| AppError::BadRequest("missing authorization code".into()))?;

    let client = reqwest::Client::builder()
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
            ("code_verifier", &flow.code_verifier),
        ])
        .send()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    if !token_resp.status().is_success() {
        let status = token_resp.status();
        let text = token_resp.text().await.unwrap_or_default();
        tracing::warn!(status = %status, body = %text, "OIDC token exchange failed");
        return Err(AppError::Upstream("token exchange failed".into()));
    }

    let token_body: serde_json::Value = token_resp
        .json()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    let id_token = token_body["id_token"]
        .as_str()
        .ok_or_else(|| AppError::Upstream("no id_token in response".into()))?;

    let claims = decode_id_token_claims(id_token)?;

    // The token comes straight from the token endpoint over TLS, which OIDC
    // allows in place of signature verification — but issuer, audience and
    // nonce must still match what we sent.
    let iss = claims.get("iss").and_then(|v| v.as_str()).unwrap_or("");
    if iss != oidc.issuer_url {
        return Err(AppError::BadRequest("id_token issuer mismatch".into()));
    }
    let aud_ok = match claims.get("aud") {
        Some(serde_json::Value::String(aud)) => aud == &oidc.client_id,
        Some(serde_json::Value::Array(auds)) => auds
            .iter()
            .any(|a| a.as_str() == Some(oidc.client_id.as_str())),
        _ => false,
    };
    if !aud_ok {
        return Err(AppError::BadRequest("id_token audience mismatch".into()));
    }
    let nonce = claims.get("nonce").and_then(|v| v.as_str()).unwrap_or("");
    if nonce != flow.nonce {
        return Err(AppError::BadRequest("id_token nonce mismatch".into()));
    }

    // Authorization: Kanidm's ACLs evaluate our service token, not the human
    // caller, so the app must itself restrict who may hold an admin session.
    let account = claims
        .get("preferred_username")
        .and_then(|v| v.as_str())
        .or_else(|| claims.get("sub").and_then(|v| v.as_str()))
        .unwrap_or("unknown")
        .to_string();
    if crate::routes::validate_identifier(&account).is_err() {
        return Err(AppError::BadRequest("invalid subject claim".into()));
    }
    let is_admin = state
        .kanidm
        .person_is_member_of(&account, &state.config.admin_group)
        .await
        .map_err(|e| AppError::Upstream(format!("failed to verify group membership: {e}")))?;
    if !is_admin {
        tracing::warn!(
            user = %account,
            group = %state.config.admin_group,
            "OIDC login rejected: caller is not an admin"
        );
        return Err(AppError::Forbidden);
    }

    let session = Session {
        user_id: account,
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
        exp: 0,
    };

    let secure = state.config.external_url.starts_with("https");
    let cookie = create_session_cookie(&session, state.config.cookie_secret.as_bytes(), secure)
        .map_err(AppError::Internal)?;

    Ok((
        [
            (axum::http::header::SET_COOKIE, cookie),
            (axum::http::header::SET_COOKIE, delete_oidc_state_cookie()),
        ],
        Redirect::to("/"),
    )
        .into_response())
}

fn decode_id_token_claims(token: &str) -> Result<serde_json::Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        anyhow::bail!("invalid JWT format");
    }
    let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(parts[1])?;
    Ok(serde_json::from_slice(&payload)?)
}

pub async fn logout_handler(_state: axum::extract::State<AppState>) -> impl IntoResponse {
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

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "unit-test-secret";

    fn session(exp: u64) -> Session {
        Session {
            user_id: "alice".into(),
            display_name: "Alice".into(),
            email: "alice@example.com".into(),
            exp,
        }
    }

    #[test]
    fn session_cookie_round_trip() {
        let cookie = create_session_cookie(&session(0), SECRET.as_bytes(), true).unwrap();
        assert!(cookie.starts_with(SESSION_COOKIE));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Lax"));
        assert!(cookie.contains("Secure"));

        let token = cookie.split(';').next().unwrap().split_once('=').unwrap().1;
        let decoded: Session = decode_token(token, SECRET.as_bytes()).unwrap();
        assert_eq!(decoded.user_id, "alice");
        assert!(decoded.exp > now_unix());
    }

    #[test]
    fn secure_flag_gated_on_https() {
        let cookie = create_session_cookie(&session(0), SECRET.as_bytes(), false).unwrap();
        assert!(!cookie.contains("Secure"));
    }

    #[test]
    fn fresh_nonce_per_token() {
        // The same plaintext sealed twice must produce different ciphertexts:
        // a fixed AES-GCM nonce under one key would be a catastrophic reuse.
        let a = encode_token(&session(1), SECRET.as_bytes()).unwrap();
        let b = encode_token(&session(1), SECRET.as_bytes()).unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn tampered_or_foreign_key_token_rejected() {
        let token = encode_token(&session(1), SECRET.as_bytes()).unwrap();
        let mut bytes = token.into_bytes();
        let last = bytes.last_mut().unwrap();
        *last = if *last == b'A' { b'B' } else { b'A' };
        let tampered = String::from_utf8(bytes).unwrap();
        assert!(decode_token::<Session>(&tampered, SECRET.as_bytes()).is_err());
        assert!(decode_token::<Session>(&tampered, "other-secret".as_bytes()).is_err());
    }

    #[test]
    fn expired_session_rejected() {
        let token = encode_token(&session(now_unix() - 1), SECRET.as_bytes()).unwrap();
        let mut headers = axum::http::HeaderMap::new();
        headers.insert(
            axum::http::header::COOKIE,
            format!("{SESSION_COOKIE}={token}").parse().unwrap(),
        );
        assert!(session_from_headers(&headers, SECRET).is_none());
    }

    #[test]
    fn valid_session_accepted() {
        let token = encode_token(&session(now_unix() + 60), SECRET.as_bytes()).unwrap();
        let mut headers = axum::http::HeaderMap::new();
        headers.insert(
            axum::http::header::COOKIE,
            format!("{SESSION_COOKIE}={token}").parse().unwrap(),
        );
        assert_eq!(
            session_from_headers(&headers, SECRET).unwrap().user_id,
            "alice"
        );
    }
}
