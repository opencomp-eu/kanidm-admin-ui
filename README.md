# Kanidm Admin UI

A lightweight web admin console for managing a [Kanidm](https://kanidm.com/) identity provider. Built for small VPS/homelab deployments.

## Features

- **Users**: List, search, create, disable, delete users
- **Groups**: List, search, create, delete groups; manage membership
- **OAuth2 Applications**: List, create, delete OAuth2 clients
- **Authentication**: OIDC login via Kanidm (or dev-mode bypass)
- **Single container**: React frontend compiled into the Rust backend

## Architecture

```
Browser → Kanidm Admin UI (Rust + React) → Kanidm REST API
                ↕
          OIDC (Kanidm)
```

- **Backend**: Axum (Rust) serving API routes and static files
- **Frontend**: React SPA compiled to `/static`
- **Auth**: OIDC via Kanidm; admin session via encrypted cookie
- **Data**: Kanidm is the sole source of truth (no database)
- **Credentials**: Service account API token stays server-side only

## Kanidm Configuration

### 1. Create a service account

```bash
kanidm service account create admin_ui_svc "Admin UI Service Account"
```

### 2. Grant admin permissions

The service account needs explicit permission to manage persons, groups, and OAuth2.
Kanidm uses a delegated administration model — permissions are granted via group membership.

**Recommended (broad admin access):**

```bash
kanidm group add_member idm_admins admin_panel
```

**Scoped (principle of least privilege):**

```bash
kanidm group add_member idm_person_manage admin_panel
kanidm group add_member idm_group_manage admin_panel
kanidm group add_member idm_oauth2_manage admin_panel
```

> **Important:** Without these group memberships, the service account can authenticate
> but Kanidm will deny all search/read/create/modify operations. You'll see
> "denied - no entries were released" in the Kanidm logs.

### 3. Generate an API token

```bash
kanidm service account api_token generate admin_ui_svc "admin-ui-token" --readwrite
```

Save the generated token — it won't be shown again.

### 4. Register the admin UI as an OAuth2 client

```bash
kanidm oauth2 create_basic kanidm_admin_ui "Kanidm Admin UI" \
  http://localhost:8080 \
  http://localhost:8080/api/auth/callback

kanidm oauth2 update_scope_map kanidm_admin_ui idm_admin openid profile email
```

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `KANIDM_URL` | Yes | Kanidm server URL (e.g. `https://kanidm.example.com:8443`) |
| `KANIDM_API_TOKEN` | Yes | Service account API token |
| `EXTERNAL_URL` | Yes | Public URL of this admin UI (for OIDC callback) |
| `LISTEN_ADDR` | No | Listen address (default: `0.0.0.0:8080`) |
| `COOKIE_SECRET` | No | Base64-encoded 32-byte secret for session encryption |
| `OIDC_ISSUER_URL` | No | Kanidm OAuth2 issuer URL |
| `OIDC_CLIENT_ID` | No | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | No | OAuth2 client secret |

When OIDC variables are unset, the app runs in **dev mode** with automatic admin login.

## Running Locally

### Prerequisites

- Rust 1.85+
- Node.js 22+
- A running Kanidm instance

### Steps

```bash
# 1. Install frontend dependencies and build
cd frontend
npm install
npm run build
cd ..

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your Kanidm details

# 3. Build and run the backend
source .env
cargo run
```

The app will be available at `http://localhost:8080`.

### Custom port

The server listens on `0.0.0.0:8080` by default. To run on a different port:

```bash
cargo run -- --port 8081
```

The `--` separator is required — it tells `cargo run` to pass the remaining flags to the
binary. Without it (`cargo run --port 8081`), cargo rejects the flag itself.

Available flags (they override the `LISTEN_ADDR` environment variable):

| Flag | Description |
|---|---|
| `--port <PORT>` | Port to listen on (host kept from `LISTEN_ADDR`, default `0.0.0.0`) |
| `--listen-addr <ADDR>` | Full listen address, e.g. `127.0.0.1:9000` |
| `-h`, `--help` | Print usage |

Alternatively, set `LISTEN_ADDR=0.0.0.0:8081` (in the shell or `.env`).

> **Note:** If OIDC is configured, the callback URL registered in Kanidm contains the port
> (`http://localhost:8080/api/auth/callback`). After changing the port, update the OAuth2
> client's redirect URL in Kanidm and `EXTERNAL_URL` to match.

### Development mode

For frontend development with hot reload:

```bash
# Terminal 1: backend
cargo run

# Terminal 2: frontend dev server (proxies /api to backend)
cd frontend
npm run dev
```

## Running with Docker

```bash
# Build the image
docker build -t kanidm-admin-ui .

# Run
docker run -d \
  --name kanidm-admin \
  -p 8080:8080 \
  -e KANIDM_URL=https://kanidm.example.com:8443 \
  -e KANIDM_API_TOKEN=your_token_here \
  -e EXTERNAL_URL=https://admin.example.com \
  -e OIDC_ISSUER_URL=https://kanidm.example.com:8443/oauth2/openid/ \
  -e OIDC_CLIENT_ID=kanidm_admin_ui \
  -e OIDC_CLIENT_SECRET=your_secret_here \
  kanidm-admin-ui
```

Or use a `.env` file:

```bash
docker run -d --name kanidm-admin -p 8080:8080 --env-file .env kanidm-admin-ui
```

## Authentication Flow

1. Browser requests a page → backend checks for session cookie
2. If no session, redirects to Kanidm OIDC login
3. User authenticates with Kanidm → redirected back with auth code
4. Backend exchanges code for tokens → creates encrypted session cookie
5. All subsequent API calls include the session cookie
6. Backend uses its service account API token for Kanidm API calls (server-side only)

## Security Model

- **No credentials in browser**: The Kanidm service account token never leaves the server
- **Session encryption**: Cookie values are encrypted with AES-GCM using `ring`
- **OIDC authentication**: Admins authenticate via Kanidm's OIDC flow
- **Delegated admin**: The backend uses a service account with appropriate Kanidm admin permissions
- **Fail closed**: 401/403 errors from Kanidm are propagated to the client
- **No database**: All data lives in Kanidm; this app is stateless

## API Routes

All routes are prefixed with `/api`:

| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/login` | Initiate OIDC login (or dev login) |
| GET | `/api/auth/callback` | OIDC callback |
| GET | `/api/auth/logout` | Clear session |
| GET | `/api/auth/whoami` | Current user info |
| GET | `/api/users` | List users (optional `?q=search`) |
| POST | `/api/users` | Create user |
| GET | `/api/users/:id` | Get user details |
| DELETE | `/api/users/:id` | Delete user |
| POST | `/api/users/:id/disable` | Disable user |
| POST | `/api/users/:id/enable` | Enable user |
| GET | `/api/users/:id/groups` | Get user's groups |
| POST | `/api/users/:id/groups/:group` | Add user to group |
| DELETE | `/api/users/:id/groups/:group` | Remove user from group |
| GET | `/api/groups` | List groups |
| POST | `/api/groups` | Create group |
| GET | `/api/groups/:id` | Get group details |
| DELETE | `/api/groups/:id` | Delete group |
| GET | `/api/groups/:id/members` | Get group members |
| POST | `/api/groups/:id/members/:member` | Add member to group |
| DELETE | `/api/groups/:id/members/:member` | Remove member from group |
| GET | `/api/oauth2` | List OAuth2 apps |
| POST | `/api/oauth2` | Create OAuth2 app |
| DELETE | `/api/oauth2/:name` | Delete OAuth2 app |

## License

MPL-2.0
