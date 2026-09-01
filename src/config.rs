use anyhow::{Context, Result};

#[derive(Clone, Debug)]
pub struct Config {
    pub listen_addr: String,
    pub kanidm_url: String,
    pub kanidm_api_token: String,
    pub oidc_issuer_url: Option<String>,
    pub oidc_client_id: Option<String>,
    pub oidc_client_secret: Option<String>,
    pub cookie_secret: String,
    pub external_url: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            listen_addr: std::env::var("LISTEN_ADDR")
                .unwrap_or_else(|_| "0.0.0.0:8080".into()),
            kanidm_url: std::env::var("KANIDM_URL")
                .context("KANIDM_URL is required")?,
            kanidm_api_token: std::env::var("KANIDM_API_TOKEN")
                .context("KANIDM_API_TOKEN is required")?,
            oidc_issuer_url: std::env::var("OIDC_ISSUER_URL").ok(),
            oidc_client_id: std::env::var("OIDC_CLIENT_ID").ok(),
            oidc_client_secret: std::env::var("OIDC_CLIENT_SECRET").ok(),
            cookie_secret: std::env::var("COOKIE_SECRET")
                .unwrap_or_else(|_| {
                    use base64::Engine;
                    base64::engine::general_purpose::STANDARD.encode(&[0u8; 32])
                }),
            external_url: std::env::var("EXTERNAL_URL")
                .unwrap_or_else(|_| "http://localhost:8080".into()),
        })
    }

    pub fn oidc_enabled(&self) -> bool {
        self.oidc_issuer_url.is_some()
            && self.oidc_client_id.is_some()
            && self.oidc_client_secret.is_some()
    }
}
