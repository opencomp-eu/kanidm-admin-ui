use anyhow::{Context, Result};
use reqwest::Client as HttpClient;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::config::Config;
use crate::error::AppError;

/// Shared reqwest client for all Kanidm traffic (API and OIDC token exchange).
/// Trusts the CA at KANIDM_TLS_CA_FILE on top of the built-in public roots, so
/// Kanidm deployments with a private/self-signed certificate work without
/// disabling certificate verification.
pub fn build_kanidm_http_client(config: &Config) -> Result<HttpClient> {
    let mut builder = HttpClient::builder();
    if let Some(path) = &config.kanidm_tls_ca_file {
        let pem = std::fs::read_to_string(path)
            .with_context(|| format!("failed to read KANIDM_TLS_CA_FILE {path}"))?;
        let certs = load_ca_certificates(&pem)
            .with_context(|| format!("invalid PEM in KANIDM_TLS_CA_FILE {path}"))?;
        tracing::info!(
            count = certs.len(),
            path,
            "trusting CA certificates for Kanidm TLS"
        );
        for cert in certs {
            builder = builder.add_root_certificate(cert);
        }
    }
    builder
        .build()
        .context("failed to build Kanidm HTTP client")
}

/// Parses every certificate in a PEM file, matching curl/openssl `--cacert`
/// semantics. A first-block-only parser would silently drop the actual trust
/// anchor in a leaf-first chain file.
fn load_ca_certificates(pem: &str) -> Result<Vec<reqwest::Certificate>> {
    let certs = reqwest::Certificate::from_pem_bundle(pem.as_bytes())?;
    if certs.is_empty() {
        anyhow::bail!("no certificates found in PEM");
    }
    Ok(certs)
}

/// Transport-level failures (DNS, connect, TLS) never reach Kanidm, so
/// reqwest's error is the only diagnostic — and its Display hides the root
/// cause. Log and surface the full source chain, plus a remediation hint for
/// known deployment mistakes.
fn send_error(path: &str, e: reqwest::Error) -> AppError {
    let chain = crate::error::error_chain(&e);
    match tls_hint(&chain) {
        Some(hint) => tracing::warn!(path, error = %chain, hint, "Kanidm request failed"),
        None => tracing::warn!(path, error = %chain, "Kanidm request failed"),
    }
    AppError::Upstream(match tls_hint(&chain) {
        Some(hint) => format!("{chain} (hint: {hint})"),
        None => chain,
    })
}

/// Maps rustls certificate-verification failures caused by malformed Kanidm
/// TLS certificates to actionable hints.
fn tls_hint(chain: &str) -> Option<&'static str> {
    if chain.contains("CaUsedAsEndEntity") {
        Some(
            "the Kanidm server certificate has basicConstraints CA:TRUE and rustls \
             rejects CA certificates used as server certificates; regenerate it as \
             an end-entity certificate (openssl req -x509 -addext \
             basicConstraints=critical,CA:FALSE) and update KANIDM_TLS_CA_FILE",
        )
    } else {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub attrs: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhoamiResponse {
    pub youare: Entry,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchRequest {
    pub filter: Filter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Filter {
    Eq { eq: [String; 2] },
    Cnt { cnt: [String; 2] },
    Pres { pres: String },
    Or { or: Vec<Filter> },
    And { and: Vec<Filter> },
    AndNot { andnot: Box<Filter> },
    Self_,
}

impl Filter {
    pub fn eq(attr: &str, value: &str) -> Self {
        Filter::Eq {
            eq: [attr.into(), value.into()],
        }
    }

    pub fn cnt(attr: &str, value: &str) -> Self {
        Filter::Cnt {
            cnt: [attr.into(), value.into()],
        }
    }

    pub fn or(filters: Vec<Filter>) -> Self {
        Filter::Or { or: filters }
    }

    pub fn and(filters: Vec<Filter>) -> Self {
        Filter::And { and: filters }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Modify {
    pub present: [String; 2],
}

impl Modify {
    pub fn present(attr: &str, value: &str) -> Self {
        Self {
            present: [attr.into(), value.into()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModifyList {
    pub mods: Vec<Modify>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModifyRequest {
    pub filter: Filter,
    pub modlist: ModifyList,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRequest {
    pub entries: Vec<Entry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub entries: Vec<Entry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteRequest {
    pub filter: Filter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleStringRequest {
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiTokenGenerate {
    pub label: String,
    pub expiry: Option<String>,
    pub read_write: bool,
    pub compact: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiToken {
    pub account_id: String,
    pub token_id: String,
    pub label: String,
    pub expiry: Option<String>,
    pub issued_at: String,
    pub purpose: String,
}

#[derive(Clone)]
pub struct KanidmClient {
    http: HttpClient,
    base_url: String,
    /// Browser-facing Kanidm origin for user-facing links (password reset),
    /// which may differ from the internal `base_url`.
    public_url: String,
    token: String,
}

impl KanidmClient {
    pub fn new(config: &Config) -> Result<Self> {
        Ok(Self {
            http: build_kanidm_http_client(config)?,
            base_url: config.kanidm_url.trim_end_matches('/').into(),
            public_url: config.kanidm_public_url.trim_end_matches('/').into(),
            token: config.kanidm_api_token.clone(),
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    async fn get(&self, path: &str) -> Result<reqwest::Response, AppError> {
        self.http
            .get(self.url(path))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| send_error(path, e))
    }

    async fn post<T: Serialize>(
        &self,
        path: &str,
        body: &T,
    ) -> Result<reqwest::Response, AppError> {
        self.http
            .post(self.url(path))
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await
            .map_err(|e| send_error(path, e))
    }

    async fn patch<T: Serialize>(
        &self,
        path: &str,
        body: &T,
    ) -> Result<reqwest::Response, AppError> {
        self.http
            .patch(self.url(path))
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await
            .map_err(|e| send_error(path, e))
    }

    async fn delete(&self, path: &str) -> Result<reqwest::Response, AppError> {
        self.http
            .delete(self.url(path))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| send_error(path, e))
    }

    async fn delete_with_body<T: Serialize>(
        &self,
        path: &str,
        body: &T,
    ) -> Result<reqwest::Response, AppError> {
        self.http
            .delete(self.url(path))
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await
            .map_err(|e| send_error(path, e))
    }

    async fn check_response(resp: reqwest::Response) -> Result<reqwest::Response, AppError> {
        if resp.status().is_success() {
            Ok(resp)
        } else if resp.status().as_u16() == 404 {
            Err(AppError::NotFound)
        } else {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            Err(AppError::Upstream(format!("{status}: {text}")))
        }
    }

    // -- Status --
    pub async fn status(&self) -> Result<serde_json::Value> {
        let resp = self
            .http
            .get(self.url("/status"))
            .send()
            .await
            .context("failed to check status")?;
        Ok(resp.json().await?)
    }

    // -- Whoami --
    pub async fn whoami(&self) -> Result<WhoamiResponse, AppError> {
        let resp = Self::check_response(self.get("/v1/self").await?).await?;
        resp.json()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))
    }

    // -- Persons --
    pub async fn list_persons(&self) -> Result<Vec<Entry>, AppError> {
        let resp = Self::check_response(self.get("/v1/person").await?).await?;
        resp.json()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))
    }

    pub async fn search_persons(&self, query: &str) -> Result<Vec<Entry>, AppError> {
        let filter = Filter::or(vec![
            Filter::cnt("name", query),
            Filter::cnt("displayname", query),
            Filter::cnt("mail", query),
        ]);
        let body = SearchRequest { filter };
        let resp = Self::check_response(self.post("/v1/person/_search", &body).await?).await?;
        let sr: SearchResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))?;
        Ok(sr.entries)
    }

    pub async fn get_person(&self, id: &str) -> Result<Entry, AppError> {
        let resp = Self::check_response(self.get(&format!("/v1/person/{id}")).await?).await?;
        resp.json()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))
    }

    pub async fn create_person(
        &self,
        name: &str,
        displayname: &str,
        mail: Option<&str>,
    ) -> Result<Entry, AppError> {
        let mut attrs = HashMap::new();
        attrs.insert("name".to_string(), vec![name.to_string()]);
        attrs.insert("displayname".to_string(), vec![displayname.to_string()]);
        if let Some(m) = mail {
            attrs.insert("mail".to_string(), vec![m.to_string()]);
        }

        let body = Entry { attrs };

        let resp = Self::check_response(self.post("/v1/person", &body).await?).await?;
        // Kanidm may not return the full entry, so we just consume the response
        // and return what we sent (the entry was created successfully if no error)
        let _ = resp.text().await;
        Ok(Entry { attrs: body.attrs })
    }

    pub async fn delete_person(&self, id: &str) -> Result<(), AppError> {
        let resp = Self::check_response(self.delete(&format!("/v1/person/{id}")).await?).await?;
        let _ = resp.text().await;
        Ok(())
    }

    async fn set_person_status(&self, id: &str, status: &str) -> Result<(), AppError> {
        let body = ModifyRequest {
            filter: Filter::eq("name", id),
            modlist: ModifyList {
                mods: vec![Modify::present("status", status)],
            },
        };

        let resp =
            Self::check_response(self.patch(&format!("/v1/person/{id}"), &body).await?).await?;
        let _ = resp.text().await;
        Ok(())
    }

    pub async fn disable_person(&self, id: &str) -> Result<(), AppError> {
        self.set_person_status(id, "disabled").await
    }

    pub async fn enable_person(&self, id: &str) -> Result<(), AppError> {
        self.set_person_status(id, "active").await
    }

    // -- Person groups --
    pub async fn get_person_groups(&self, id: &str) -> Result<Vec<Entry>, AppError> {
        let person = self.get_person(id).await?;
        let group_spns: Vec<String> = person.attrs.get("memberof").cloned().unwrap_or_default();

        let mut groups = Vec::new();
        for spn in &group_spns {
            let name = spn.split('@').next().unwrap_or(spn);
            match self.get_group(name).await {
                Ok(g) => groups.push(g),
                Err(_) => {
                    let mut attrs = HashMap::new();
                    attrs.insert("name".into(), vec![name.to_string()]);
                    groups.push(Entry { attrs });
                }
            }
        }
        Ok(groups)
    }

    /// Returns true when the person's `memberof` contains the given group
    /// (matched on the SPN local part, e.g. `idm_admins@domain`).
    pub async fn person_is_member_of(&self, id: &str, group: &str) -> Result<bool, AppError> {
        let person = self.get_person(id).await?;
        let memberof = person.attrs.get("memberof").cloned().unwrap_or_default();
        Ok(memberof
            .iter()
            .any(|spn| spn.split('@').next() == Some(group)))
    }

    pub async fn add_person_to_group(
        &self,
        person_id: &str,
        group_id: &str,
    ) -> Result<(), AppError> {
        let body = vec![person_id.to_string()];
        let resp = Self::check_response(
            self.post(&format!("/v1/group/{group_id}/_attr/member"), &body)
                .await?,
        )
        .await?;
        let _ = resp.text().await;
        Ok(())
    }

    pub async fn remove_person_from_group(
        &self,
        person_id: &str,
        group_id: &str,
    ) -> Result<(), AppError> {
        let body = vec![person_id.to_string()];
        let resp = Self::check_response(
            self.delete_with_body(&format!("/v1/group/{group_id}/_attr/member"), &body)
                .await?,
        )
        .await?;
        let _ = resp.text().await;
        Ok(())
    }

    // -- Credentials --
    pub async fn generate_reset_token(&self, person_id: &str) -> Result<String, AppError> {
        // Generate a reset token that the user can use to set their own password.
        let resp = Self::check_response(
            self.get(&format!(
                "/v1/person/{person_id}/_credential/_update_intent"
            ))
            .await?,
        )
        .await?;
        let intent: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::Upstream(format!("failed to get reset token: {e}")))?;

        let token = intent["token"]
            .as_str()
            .ok_or_else(|| AppError::Upstream("missing token in response".into()))?;

        // Link must open in the user's browser, so use the public origin even
        // when KANIDM_URL points at an internal address.
        Ok(format!("{}/ui/reset?token={token}", self.public_url))
    }

    // -- Groups --
    pub async fn list_groups(&self) -> Result<Vec<Entry>, AppError> {
        let resp = Self::check_response(self.get("/v1/group").await?).await?;
        resp.json()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))
    }

    pub async fn search_groups(&self, query: &str) -> Result<Vec<Entry>, AppError> {
        let filter = Filter::or(vec![
            Filter::cnt("name", query),
            Filter::cnt("description", query),
        ]);
        let body = SearchRequest { filter };
        let resp = Self::check_response(self.post("/v1/group/_search", &body).await?).await?;
        let sr: SearchResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))?;
        Ok(sr.entries)
    }

    pub async fn get_group(&self, id: &str) -> Result<Entry, AppError> {
        let resp = Self::check_response(self.get(&format!("/v1/group/{id}")).await?).await?;
        resp.json()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))
    }

    pub async fn create_group(
        &self,
        name: &str,
        description: Option<&str>,
    ) -> Result<Entry, AppError> {
        let mut attrs = HashMap::new();
        attrs.insert("name".to_string(), vec![name.to_string()]);
        if let Some(d) = description {
            if !d.is_empty() {
                attrs.insert("description".to_string(), vec![d.to_string()]);
            }
        }

        let body = Entry { attrs };

        let resp = Self::check_response(self.post("/v1/group", &body).await?).await?;
        let _ = resp.text().await;
        Ok(Entry { attrs: body.attrs })
    }

    pub async fn delete_group(&self, id: &str) -> Result<(), AppError> {
        let resp = Self::check_response(self.delete(&format!("/v1/group/{id}")).await?).await?;
        let _ = resp.text().await;
        Ok(())
    }

    // -- Group members --
    pub async fn get_group_members(&self, id: &str) -> Result<Vec<Entry>, AppError> {
        let group = self.get_group(id).await?;
        let member_names: Vec<String> = group.attrs.get("member").cloned().unwrap_or_default();

        let mut members = Vec::new();
        for name in &member_names {
            match self.get_person(name).await {
                Ok(p) => members.push(p),
                Err(_) => {
                    let mut attrs = HashMap::new();
                    attrs.insert("name".into(), vec![name.clone()]);
                    members.push(Entry { attrs });
                }
            }
        }
        Ok(members)
    }

    pub async fn add_group_member(&self, group_id: &str, person_id: &str) -> Result<(), AppError> {
        let body = vec![person_id.to_string()];
        let resp = Self::check_response(
            self.post(&format!("/v1/group/{group_id}/_attr/member"), &body)
                .await?,
        )
        .await?;
        let _ = resp.text().await;
        Ok(())
    }

    pub async fn remove_group_member(
        &self,
        group_id: &str,
        person_id: &str,
    ) -> Result<(), AppError> {
        let body = vec![person_id.to_string()];
        let resp = Self::check_response(
            self.delete_with_body(&format!("/v1/group/{group_id}/_attr/member"), &body)
                .await?,
        )
        .await?;
        let _ = resp.text().await;
        Ok(())
    }

    // -- OAuth2 --
    pub async fn list_oauth2(&self) -> Result<Vec<Entry>, AppError> {
        let resp = Self::check_response(self.get("/v1/oauth2").await?).await?;
        resp.json()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))
    }

    pub async fn create_oauth2_basic(
        &self,
        name: &str,
        displayname: &str,
        origin: &str,
    ) -> Result<Entry, AppError> {
        let body = oauth2_basic_entry(name, displayname, origin);
        let resp = Self::check_response(self.post("/v1/oauth2/_basic", &body).await?).await?;
        let _ = resp.text().await;
        Ok(body)
    }

    pub async fn delete_oauth2(&self, rs_name: &str) -> Result<(), AppError> {
        let resp =
            Self::check_response(self.delete(&format!("/v1/oauth2/{rs_name}")).await?).await?;
        let _ = resp.text().await;
        Ok(())
    }
}

/// Kanidm OAuth2 resource servers have no `redirect_uri` attribute — redirect
/// URLs are validated against the `origin` attribute — and Kanidm rejects
/// entries containing unknown attributes.
fn oauth2_basic_entry(name: &str, displayname: &str, origin: &str) -> Entry {
    let mut attrs = HashMap::new();
    attrs.insert("name".to_string(), vec![name.to_string()]);
    attrs.insert("displayname".to_string(), vec![displayname.to_string()]);
    attrs.insert("origin".to_string(), vec![origin.to_string()]);
    Entry { attrs }
}

#[cfg(test)]
mod tests {
    use super::*;
    /// Locally generated throwaway test certificates (no private keys).
    const TEST_LEAF_CERT: &str = "-----BEGIN CERTIFICATE-----
MIIDKjCCAhKgAwIBAgIUDwow/yF5Ataeo5WsVeXdQyKIPhcwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDkwNDA4NDQyN1oXDTI2MTAw
NDA4NDQyN1owFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAyJ7uz+UR3ax40fXgEPD3zJa1VUpMrbqwZiVt42Uzyrq/
Zq4WwTC8VpgWYIiXOZQkCAVZ4KCltk9x0cPFf10Sn5wSU1qip4xBxWUbECz0zLmg
MsbJ0xbeliCXAVkThTGaAvqGUFv3bxwKOYi9ol8j1jOYnzOwZkny5pgwfedcNmau
e9J342YsMhF9YMYWVmF44usBFHUCOe2TDS5jMoYOVqLotskTKV3wjVIUyaC6pge7
DJ1cMBsOAns9PtR3WF8hGPgySA5lu0dH7a91kZxjxSdtOzLI4gPp4ofFBPViXWwn
cppP27OhIexeDOMM/eS2E1f+u088qgpSa5Kpa3o7jQIDAQABo3QwcjAdBgNVHQ4E
FgQUidYm+Egqk4U9YrSGVD1kHebm/8gwHwYDVR0jBBgwFoAUidYm+Egqk4U9YrSG
VD1kHebm/8gwIgYDVR0RBBswGYIJbG9jYWxob3N0ggZrYW5pZG2HBH8AAAEwDAYD
VR0TAQH/BAIwADANBgkqhkiG9w0BAQsFAAOCAQEAWiSCso4R6zu6fEP9xAL0HDMk
filAg8VcDvomzbAtB0GNVlSFdc79aPLHgiZHtsq/SIilGlyOQVI6DybPvq0YMqpu
RRcaZMtMqSNdx/2Bi2+Vqv5uVjKzOJ7p6+N+b/xVd9vizcjjTMjk+z7Ov8p7PqLS
uESWOYUpsNYcfkPFxK1PdTJW7xQ8AaKQ40I3OufhWeDw5PzgyimVFVhgCRIRbF7/
83EGY6t2Wy2Q6fFrr/+yxVrTJ47CGXUsXScAE9MnuQivmAleHPlodorcEQqOkczL
pLzsH4a+tRFLZ99w6K/+PbpEwBzAzgIXjuvsb+SHgdgf9eY8KZQJU0RpJo04gA==
-----END CERTIFICATE-----
";
    const TEST_CA_CERT: &str = "-----BEGIN CERTIFICATE-----
MIIDBzCCAe+gAwIBAgIUaJ6FNGJrB2C1RVPIOCdHRnbp1FIwDQYJKoZIhvcNAQEL
BQAwEzERMA8GA1UEAwwIUmVwcm8gQ0EwHhcNMjYwOTA0MDg0NDI3WhcNMjYxMDA0
MDg0NDI3WjATMREwDwYDVQQDDAhSZXBybyBDQTCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBALDf5clBoamrXMN+WywlheNCibIqSRc9/ogI5ZjrZkI508PN
MSGL+Of1TVxLFIU8HmdqhoVe6o59RXfvt0h+2wlGT8qBC9rGtsthNhswIraTkeKI
tipJrAa0MKKQB4tCnwzUpKKYFY5DHN9ayAEgXe/qhoJs3p9aFvrfvCMlTEINuvf5
vxkH7+1igMs0xGkC75WwuSS8vYOiJVsle0/PohHz2HN4KdRsYrjYZdwXASW1iHic
PFHQg6w5T0Y819pitnZ+GqfOsW64OroMb2L9mHjIjgc9sC+I35ePYnHNYBw7RZIv
jJ8ZaR27fbhkGtAqRcXjhC1/LYzNzH6FQTSUc3UCAwEAAaNTMFEwHQYDVR0OBBYE
FOtWeJsGj62l1Q56RtjMVnlWDdGGMB8GA1UdIwQYMBaAFOtWeJsGj62l1Q56RtjM
VnlWDdGGMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAJ4deDQc
cnEYmJQGASqAyEDpiUlhBMXXzZFyScDw+YUILa67Y2pi9wq+1ue1gQXjgR/iGRmK
2sA9MZ4ITYMdXS2HSLzaEhtMBWC5gT4+foaAQzTTbOp7ERFjF0xHr54vvvqTdJ1M
N5JqxXEuWjDexUE7WNDJ8mhkxa+OjkaJ/hDOgxhHFStfP72yN2rbuA3/ZIPIqAQs
o/9vzHRbRToh0NUQOs1vXMBqjWRoRxnvuGN63azH9oG3NG7HyN9gXt7D2vdNtzoI
Yx/GHLtxKo7gumfHts2qU/zHPyqppq4GpUkVPlLOfYZNZjHv1107HDjwW1aRvGmi
e66KmRDhIM57o+U=
-----END CERTIFICATE-----
";

    #[test]
    fn ca_pem_bundle_parses_every_certificate() {
        // Chain files hold leaf + issuer; trusting only the first block would
        // silently drop the actual trust anchor from a leaf-first file.
        let bundle = format!("{TEST_LEAF_CERT}{TEST_CA_CERT}");
        assert_eq!(load_ca_certificates(&bundle).unwrap().len(), 2);
        assert_eq!(load_ca_certificates(TEST_CA_CERT).unwrap().len(), 1);
    }

    #[test]
    fn ca_pem_bundle_rejects_empty_and_garbage() {
        assert!(load_ca_certificates("").is_err());
        assert!(load_ca_certificates("not a pem").is_err());
    }

    #[tokio::test]
    async fn send_error_surfaces_root_cause() {
        // Connection-level failures must name their cause instead of
        // reqwest's opaque "error sending request".
        let client = HttpClient::builder().build().unwrap();
        let err = client
            .get("http://127.0.0.1:9/status")
            .send()
            .await
            .unwrap_err();
        let chain = crate::error::error_chain(&err);
        assert!(
            chain.contains("connect") || chain.contains("refused") || chain.contains("tcp"),
            "chain should name the connection failure: {chain}"
        );
    }

    #[test]
    fn oauth2_basic_entry_has_only_valid_attributes() {
        let entry = oauth2_basic_entry("app", "My App", "https://app.example.com");
        let mut keys: Vec<_> = entry.attrs.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["displayname", "name", "origin"]);
        assert_eq!(entry.attrs["origin"], ["https://app.example.com"]);
    }
    #[test]
    fn tls_hint_names_ca_used_as_end_entity() {
        let chain = "error sending request for url (https://kanidm:8443/v1/person/x): \
                     client error (Connect): invalid peer certificate: \
                     Other(OtherError(CaUsedAsEndEntity))";
        assert!(tls_hint(chain).unwrap().contains("CA:FALSE"));
        assert!(tls_hint("dns error: failed to lookup address information").is_none());
    }
}
