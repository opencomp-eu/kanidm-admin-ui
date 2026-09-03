use anyhow::{Context, Result};

#[derive(Clone, Debug)]
pub struct Config {
    pub listen_addr: String,
    pub kanidm_url: String,
    /// Browser-facing Kanidm URL used for user-facing links (password reset);
    /// defaults to `kanidm_url` so deployments behind an internal hostname
    /// only need to set KANIDM_PUBLIC_URL when the two differ.
    pub kanidm_public_url: String,
    pub kanidm_api_token: String,
    /// Optional PEM file with a CA certificate to trust in addition to the
    /// public roots, for Kanidm deployments with a private/self-signed cert.
    pub kanidm_tls_ca_file: Option<String>,
    pub admin_group: String,
    pub oidc_issuer_url: Option<String>,
    pub oidc_client_id: Option<String>,
    pub oidc_client_secret: Option<String>,
    pub cookie_secret: String,
    pub external_url: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let kanidm_url = std::env::var("KANIDM_URL").context("KANIDM_URL is required")?;
        let config = Self {
            listen_addr: std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".into()),
            kanidm_public_url: std::env::var("KANIDM_PUBLIC_URL")
                .unwrap_or_else(|_| kanidm_url.clone()),
            kanidm_url,
            kanidm_tls_ca_file: std::env::var("KANIDM_TLS_CA_FILE").ok(),
            kanidm_api_token: std::env::var("KANIDM_API_TOKEN")
                .context("KANIDM_API_TOKEN is required")?,
            admin_group: std::env::var("KANIDM_ADMIN_GROUP")
                .unwrap_or_else(|_| "idm_admins".into()),
            oidc_issuer_url: std::env::var("OIDC_ISSUER_URL").ok(),
            oidc_client_id: std::env::var("OIDC_CLIENT_ID").ok(),
            oidc_client_secret: std::env::var("OIDC_CLIENT_SECRET").ok(),
            cookie_secret: match std::env::var("COOKIE_SECRET") {
                Ok(s) => s,
                Err(_) => {
                    tracing::warn!(
                        "COOKIE_SECRET not set; using an ephemeral random secret \
                         (sessions will not survive restarts). Set COOKIE_SECRET to a \
                         persistent random base64 value in production."
                    );
                    generate_cookie_secret()
                }
            },
            external_url: std::env::var("EXTERNAL_URL")
                .unwrap_or_else(|_| "http://localhost:8080".into()),
        };
        config.validate_oidc()?;
        Ok(config)
    }

    /// Rejects a partial OIDC configuration: some-but-not-all OIDC variables
    /// would otherwise silently fall back to passwordless dev mode on a
    /// deployment that was meant to have OIDC.
    fn validate_oidc(&self) -> Result<()> {
        let any_set = self.oidc_issuer_url.is_some()
            || self.oidc_client_id.is_some()
            || self.oidc_client_secret.is_some();
        let all_set = self.oidc_issuer_url.is_some()
            && self.oidc_client_id.is_some()
            && self.oidc_client_secret.is_some();
        if any_set && !all_set {
            anyhow::bail!(
                "OIDC is partially configured; set OIDC_ISSUER_URL, OIDC_CLIENT_ID \
                 and OIDC_CLIENT_SECRET together (or none of them for dev mode)"
            );
        }
        Ok(())
    }

    pub fn oidc_enabled(&self) -> bool {
        self.oidc_issuer_url.is_some()
            && self.oidc_client_id.is_some()
            && self.oidc_client_secret.is_some()
    }
}

fn generate_cookie_secret() -> String {
    use base64::Engine;
    use ring::rand::SecureRandom;
    let mut key = [0u8; 32];
    ring::rand::SystemRandom::new()
        .fill(&mut key)
        .expect("system RNG failed");
    base64::engine::general_purpose::STANDARD.encode(key)
}
