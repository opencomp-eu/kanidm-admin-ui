pub mod auth;
pub mod config;
pub mod error;
pub mod kanidm;
pub mod routes;

use config::Config;
use kanidm::KanidmClient;

#[derive(Clone)]
pub struct AppState {
    pub kanidm: KanidmClient,
    pub config: Config,
    pub oidc: Option<auth::OidcState>,
}
