use std::net::SocketAddr;
use std::path::PathBuf;

use anyhow::{Context, Result};
use axum::Router;
use tokio::net::TcpListener;
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::EnvFilter;

use kanidm_admin_ui::auth;
use kanidm_admin_ui::config::Config;
use kanidm_admin_ui::kanidm::KanidmClient;
use kanidm_admin_ui::routes;
use kanidm_admin_ui::AppState;

struct Cli {
    port: Option<u16>,
    listen_addr: Option<String>,
    help: bool,
}

fn parse_cli() -> Result<Cli> {
    let mut cli = Cli {
        port: None,
        listen_addr: None,
        help: false,
    };

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--port" => {
                let value = args.next().context("--port requires a value")?;
                cli.port = Some(
                    value
                        .parse()
                        .with_context(|| format!("invalid --port value: {value}"))?,
                );
            }
            "--listen-addr" => {
                let value = args.next().context("--listen-addr requires a value")?;
                cli.listen_addr = Some(value);
            }
            "--help" | "-h" => cli.help = true,
            other => anyhow::bail!("unexpected argument: {other} (try --help)"),
        }
    }

    Ok(cli)
}

fn print_usage() {
    println!(
        "Usage: kanidm-admin-ui [OPTIONS]

Options:
      --port <PORT>          Port to listen on (default: 8080)
      --listen-addr <ADDR>   Full listen address, e.g. 127.0.0.1:9000 (default: 0.0.0.0:8080)
  -h, --help                 Print help

CLI flags override the LISTEN_ADDR environment variable."
    );
}

fn with_port(listen_addr: &str, port: u16) -> Result<String> {
    let host = listen_addr
        .rsplit_once(':')
        .with_context(|| format!("listen address must include a port, got: {listen_addr}"))?
        .0;
    Ok(format!("{host}:{port}"))
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    let cli = parse_cli()?;
    if cli.help {
        print_usage();
        return Ok(());
    }

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let mut config = Config::from_env()?;
    if let Some(addr) = cli.listen_addr {
        config.listen_addr = addr;
    }
    if let Some(port) = cli.port {
        config.listen_addr = with_port(&config.listen_addr, port)?;
    }
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
