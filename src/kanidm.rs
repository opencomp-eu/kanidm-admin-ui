use anyhow::{Context, Result};
use reqwest::Client as HttpClient;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::config::Config;
use crate::error::AppError;

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
    token: String,
}

impl KanidmClient {
    pub fn new(config: &Config) -> Self {
        let http = HttpClient::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .expect("failed to build HTTP client");

        Self {
            http,
            base_url: config.kanidm_url.trim_end_matches('/').into(),
            token: config.kanidm_api_token.clone(),
        }
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
            .map_err(|e| AppError::Upstream(e.to_string()))
    }

    async fn post<T: Serialize>(&self, path: &str, body: &T) -> Result<reqwest::Response, AppError> {
        self.http
            .post(self.url(path))
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))
    }

    async fn patch<T: Serialize>(&self, path: &str, body: &T) -> Result<reqwest::Response, AppError> {
        self.http
            .patch(self.url(path))
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))
    }

    async fn delete(&self, path: &str) -> Result<reqwest::Response, AppError> {
        self.http
            .delete(self.url(path))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))
    }

    async fn delete_with_body<T: Serialize>(&self, path: &str, body: &T) -> Result<reqwest::Response, AppError> {
        self.http
            .delete(self.url(path))
            .bearer_auth(&self.token)
            .json(body)
            .send()
            .await
            .map_err(|e| AppError::Upstream(e.to_string()))
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
        resp.json().await.map_err(|e| AppError::Upstream(e.to_string()))
    }

    // -- Persons --
    pub async fn list_persons(&self) -> Result<Vec<Entry>, AppError> {
        let resp = Self::check_response(self.get("/v1/person").await?).await?;
        resp.json().await.map_err(|e| AppError::Upstream(e.to_string()))
    }

    pub async fn search_persons(&self, query: &str) -> Result<Vec<Entry>, AppError> {
        let filter = Filter::or(vec![
            Filter::cnt("name", query),
            Filter::cnt("displayname", query),
            Filter::cnt("mail_primary", query),
        ]);
        let body = SearchRequest { filter };
        let resp = Self::check_response(self.post("/v1/person/_search", &body).await?).await?;
        let sr: SearchResponse = resp.json().await.map_err(|e| AppError::Upstream(e.to_string()))?;
        Ok(sr.entries)
    }

    pub async fn get_person(&self, id: &str) -> Result<Entry, AppError> {
        let resp = Self::check_response(self.get(&format!("/v1/person/{id}")).await?).await?;
        resp.json().await.map_err(|e| AppError::Upstream(e.to_string()))
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
        resp.json().await.map_err(|e| AppError::Upstream(e.to_string()))
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

        let resp = Self::check_response(self.patch(&format!("/v1/person/{id}"), &body).await?).await?;
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
        let group_names: Vec<String> = person
            .attrs
            .get("group")
            .cloned()
            .unwrap_or_default();

        let mut groups = Vec::new();
        for name in &group_names {
            match self.get_group(name).await {
                Ok(g) => groups.push(g),
                Err(_) => {
                    let mut attrs = HashMap::new();
                    attrs.insert("name".into(), vec![name.clone()]);
                    groups.push(Entry { attrs });
                }
            }
        }
        Ok(groups)
    }

    pub async fn add_person_to_group(
        &self,
        person_id: &str,
        group_id: &str,
    ) -> Result<(), AppError> {
        let body = vec![person_id.to_string()];
        let resp = Self::check_response(
            self.post(&format!("/v1/group/{group_id}/_attr/member"), &body).await?
        ).await?;
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
            self.delete_with_body(&format!("/v1/group/{group_id}/_attr/member"), &body).await?
        ).await?;
        let _ = resp.text().await;
        Ok(())
    }

    // -- Groups --
    pub async fn list_groups(&self) -> Result<Vec<Entry>, AppError> {
        let resp = Self::check_response(self.get("/v1/group").await?).await?;
        resp.json().await.map_err(|e| AppError::Upstream(e.to_string()))
    }

    pub async fn search_groups(&self, query: &str) -> Result<Vec<Entry>, AppError> {
        let filter = Filter::or(vec![
            Filter::cnt("name", query),
            Filter::cnt("description", query),
        ]);
        let body = SearchRequest { filter };
        let resp = Self::check_response(self.post("/v1/group/_search", &body).await?).await?;
        let sr: SearchResponse = resp.json().await.map_err(|e| AppError::Upstream(e.to_string()))?;
        Ok(sr.entries)
    }

    pub async fn get_group(&self, id: &str) -> Result<Entry, AppError> {
        let resp = Self::check_response(self.get(&format!("/v1/group/{id}")).await?).await?;
        resp.json().await.map_err(|e| AppError::Upstream(e.to_string()))
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
        resp.json().await.map_err(|e| AppError::Upstream(e.to_string()))
    }

    pub async fn delete_group(&self, id: &str) -> Result<(), AppError> {
        let resp = Self::check_response(self.delete(&format!("/v1/group/{id}")).await?).await?;
        let _ = resp.text().await;
        Ok(())
    }

    // -- Group members --
    pub async fn get_group_members(&self, id: &str) -> Result<Vec<Entry>, AppError> {
        let group = self.get_group(id).await?;
        let member_names: Vec<String> = group
            .attrs
            .get("member")
            .cloned()
            .unwrap_or_default();

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

    pub async fn add_group_member(
        &self,
        group_id: &str,
        person_id: &str,
    ) -> Result<(), AppError> {
        let body = vec![person_id.to_string()];
        let resp = Self::check_response(
            self.post(&format!("/v1/group/{group_id}/_attr/member"), &body).await?
        ).await?;
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
            self.delete_with_body(&format!("/v1/group/{group_id}/_attr/member"), &body).await?
        ).await?;
        let _ = resp.text().await;
        Ok(())
    }

    // -- OAuth2 --
    pub async fn list_oauth2(&self) -> Result<Vec<Entry>, AppError> {
        let resp = Self::check_response(self.get("/v1/oauth2").await?).await?;
        resp.json().await.map_err(|e| AppError::Upstream(e.to_string()))
    }

    pub async fn create_oauth2_basic(
        &self,
        name: &str,
        displayname: &str,
        origin: &str,
        redirect_uri: &str,
    ) -> Result<Entry, AppError> {
        let mut attrs = HashMap::new();
        attrs.insert("name".to_string(), vec![name.to_string()]);
        attrs.insert("displayname".to_string(), vec![displayname.to_string()]);
        attrs.insert("origin".to_string(), vec![origin.to_string()]);
        attrs.insert("redirect_uri".to_string(), vec![redirect_uri.to_string()]);

        let body = Entry { attrs };

        let resp = Self::check_response(self.post("/v1/oauth2/_basic", &body).await?).await?;
        resp.json().await.map_err(|e| AppError::Upstream(e.to_string()))
    }

    pub async fn delete_oauth2(&self, rs_name: &str) -> Result<(), AppError> {
        let resp = Self::check_response(
            self.delete(&format!("/v1/oauth2/{rs_name}")).await?
        ).await?;
        let _ = resp.text().await;
        Ok(())
    }
}
