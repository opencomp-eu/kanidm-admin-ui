use std::net::SocketAddr;
use std::path::PathBuf;

use anyhow::Result;
use axum::Router;
use tokio::net::TcpListener;
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::EnvFilter;

use kanidm_admin_ui::auth;
use kanidm_admin_ui::config::Config;
use kanidm_admin_ui::kanidm::KanidmClient;
use kanidm_admin_ui::routes;
use kanidm_admin_ui::AppState;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let config = Config::from_env()?;
    let kanidm = KanidmClient::new(&config);
    let oidc = auth::OidcState::new(&config).await?;

    let state = AppState {
        kanidm,
        config: config.clone(),
        oidc,
    };

    let api_routes = routes::api_router(state.clone());

    let static_dir = PathBuf::from("static");
    let app = if static_dir.exists() {
        let spa_fallback = ServeDir::new(&static_dir)
            .append_index_html_on_directories(true)
            .not_found_service(ServeFile::new(static_dir.join("index.html")));
        Router::new()
            .nest("/api", api_routes)
            .fallback_service(spa_fallback)
    } else {
        Router::new().nest("/api", api_routes)
    };

    let addr: SocketAddr = config.listen_addr.parse()?;
    tracing::info!("listening on {addr}");

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service()).await?;

    Ok(())
}
