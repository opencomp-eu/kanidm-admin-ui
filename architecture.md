# Architecture Overview

Lightweight Kanidm admin UI: React frontend + Rust (Axum) backend, packaged as a single Docker container.

## Directory Structure

```
kanidm-admin-ui/
├── src/                    # Rust backend (Axum)
│   ├── main.rs            # Entry point, server startup
│   ├── lib.rs             # AppState definition
│   ├── config.rs          # Environment variable config (KANIDM_URL, KANIDM_API_TOKEN, etc.)
│   ├── auth.rs            # OIDC + dev mode auth, session cookie encode/decode
│   ├── error.rs           # AppError type
│   ├── kanidm.rs          # Kanidm API client (Entry, Filter, HTTP methods)
│   └── routes/
│       ├── mod.rs         # Route registration (nest /auth, /users, /groups, /oauth2)
│       ├── auth.rs        # Login/logout/whoami handlers
│       ├── users.rs       # User CRUD, group membership, password reset token
│       ├── groups.rs      # Group CRUD, member management
│       └── oauth2.rs      # OAuth2 app CRUD
├── frontend/              # React frontend (Vite)
│   ├── src/
│   │   ├── main.tsx       # React entry point
│   │   ├── App.tsx        # Router setup
│   │   ├── api.ts         # API client functions (fetch wrapper)
│   │   ├── types.ts       # KanidmEntry, helpers (attrVal, attrVals, userStatus, userDisplayName)
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Users.tsx        # User list + create modal
│   │   │   ├── UserDetail.tsx   # User detail, groups, copy groups, reset token
│   │   │   ├── Groups.tsx       # Group list + create modal
│   │   │   ├── GroupDetail.tsx  # Group detail, members
│   │   │   └── OAuthApps.tsx    # OAuth2 apps
│   │   └── components/
│   │       ├── Layout.tsx       # App shell with nav
│   │       └── ConfirmDialog.tsx
│   └── vite.config.ts     # outDir: "../static"
├── tests/
│   └── api_tests.rs       # Unit tests
├── static/                # Built frontend (served by Axum)
├── docs/
│   └── kanidm-1.11.1-openapi.json
├── Dockerfile             # Multi-stage: frontend build → Rust build
├── .env.example           # Required env vars
└── Cargo.toml
```

## Data Flow

```
Browser → Axum (port 8080) → Kanidm Server (KANIDM_URL)
                ↑
           API token auth (KANIDM_API_TOKEN)
```

- **No application database** — Kanidm is sole source of truth
- **Session cookies** encrypted with AES-256-GCM (`ring` crate)
- **Dev mode**: When OIDC not configured, auto-login as `idm_admin`
- **Frontend** served from `/static` as static files

## Key Types

### Backend (`src/kanidm.rs`)

```rust
struct Entry { attrs: HashMap<String, Vec<String>> }  // Kanidm entry
struct Filter { ... }  // Search filter (Eq, Cnt, Pres, Or, And, AndNot)
struct Modify { present: [String; 2] }  // Attribute modification
struct KanidmClient { http, base_url, token }  // HTTP client for Kanidm API
```

### Frontend (`frontend/src/types.ts`)

```typescript
interface KanidmEntry { attrs: Record<string, string[]> }
function attrVal(entry, key): string      // Get first value
function attrVals(entry, key): string[]   // Get all values
function userStatus(entry): string        // "active" | "disabled" | "unknown"
```

## Kanidm API Attributes

| Attribute | Description | Used In |
|-----------|-------------|---------|
| `name` | Username (primary key) | Users, Groups |
| `displayname` | Human-readable name | Users, Groups |
| `mail` | Email addresses | Users |
| `memberof` | Group memberships (SPN format: `name@domain`) | Users |
| `directmemberof` | Direct group memberships | Users |
| `uuid` | Unique identifier | All entries |
| `primary_credential` | Has password set | Users |
| `spn` | Service principal name | Users |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `KANIDM_URL` | Yes | Kanidm server URL |
| `KANIDM_API_TOKEN` | Yes | Service account API token |
| `LISTEN_ADDR` | No | Backend listen address (default: `0.0.0.0:8080`) |
| `EXTERNAL_URL` | No | Public URL (default: `http://localhost:8080`) |
| `COOKIE_SECRET` | No | AES-256 key (base64) |
| `OIDC_ISSUER_URL` | No | Enable OIDC auth |
| `OIDC_CLIENT_ID` | No | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | No | OAuth2 client secret |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/whoami` | Current user info |
| GET/POST | `/api/users` | List/Create users |
| GET/DELETE | `/api/users/{id}` | Get/Delete user |
| POST | `/api/users/{id}/disable` | Disable user |
| POST | `/api/users/{id}/enable` | Enable user |
| GET | `/api/users/{id}/groups` | User's groups |
| POST/DELETE | `/api/users/{id}/groups/{group}` | Add/Remove from group |
| POST | `/api/users/{id}/copy-groups-from` | Copy groups from another user |
| POST | `/api/users/{id}/set-password` | Generate reset token |
| GET/POST | `/api/groups` | List/Create groups |
| GET/DELETE | `/api/groups/{id}` | Get/Delete group |
| GET | `/api/groups/{id}/members` | Group members |
| POST/DELETE | `/api/groups/{id}/members/{member}` | Add/Remove member |
| GET/POST | `/api/oauth2` | List/Create OAuth2 apps |
| GET/DELETE | `/api/oauth2/{id}` | Get/Delete OAuth2 app |

## Adding New Features

### Backend (Rust)
1. Add API method in `src/kanidm.rs` (KanidmClient impl)
2. Add route handler in `src/routes/{resource}.rs`
3. Register route in `src/routes/{resource}.rs` router() function

### Frontend (TypeScript)
1. Add API function in `frontend/src/api.ts`
2. Add page component in `frontend/src/pages/`
3. Add route in `frontend/src/App.tsx`
4. Add types/helpers in `frontend/src/types.ts` if needed

## Kanidm API Quirks

- **Create endpoints** return empty/different format — don't deserialize response, return the entry we sent
- **Group memberships** use `memberof` attribute (SPN format: `name@domain`) — strip `@domain` for API calls
- **Passwords** can't be set directly — use `_credential/_update_intent` to generate reset token
- **Status** attribute only present when disabled — active accounts have no `status` field
