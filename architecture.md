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
│   │   ├── api.ts         # API client functions (fetch wrapper), friendlyError, runForEach
│   │   ├── types.ts       # KanidmEntry + attribute helpers (accountStatus, isSystemEntry, ...)
│   │   ├── hooks.ts       # useLoader, useAction, usePageTitle
│   │   ├── insights.ts    # Home-page "suggested actions" rules
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx      # Home: search, quick actions, stats, suggestions
│   │   │   ├── Users.tsx          # People list with filters
│   │   │   ├── UserDetail.tsx     # Person profile: groups, apps, sign-in, suspend/delete
│   │   │   ├── Groups.tsx         # Group cards (built-in groups hidden by default)
│   │   │   ├── GroupDetail.tsx    # Group members, app access, edit/delete
│   │   │   ├── OAuthApps.tsx      # Connected apps
│   │   │   ├── OAuthAppDetail.tsx # Which groups can sign in to an app
│   │   │   └── SignedOut.tsx
│   │   └── components/
│   │       ├── Layout.tsx         # App shell with nav
│   │       ├── UserModals.tsx     # Add-person flow, edit, setup link
│   │       ├── GroupModals.tsx / AppModals.tsx
│   │       ├── PickerList.tsx / PickerModal.tsx  # Searchable people/group selection
│   │       └── ...                # Card, PageHeader, States, Avatar, StatusBadge, Icon, Toast
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
function accountStatus(entry): AccountStatus  // active | suspended | not_started (from account_expire / account_valid_from)
function isSystemEntry(entry): boolean    // Kanidm built-in group/account (reserved UUID range or idm_/system_ name)
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
| `account_expire` | Account locked once this time passes | Users |
| `account_valid_from` | Account unusable before this time | Users |
| `passkeys` | Registered passkeys | Users (sign-in status) |
| `member` | Group members (SPN format) | Groups |
| `description` | Group description | Groups |
| `oauth2_rs_scope_map` | Groups allowed to use an app (`group@domain: {scopes}`) | OAuth2 |
| `spn` | Service principal name | Users |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `KANIDM_URL` | Yes | Kanidm server URL |
| `KANIDM_PUBLIC_URL` | No | Browser-facing Kanidm URL for reset links (default: `KANIDM_URL`) |
| `KANIDM_TLS_CA_FILE` | No | PEM CA file to trust for self-signed Kanidm certs |
| `KANIDM_API_TOKEN` | Yes | Service account API token |
| `LISTEN_ADDR` | No | Backend listen address (default: `0.0.0.0:8080`) |
| `EXTERNAL_URL` | No | Public URL (default: `http://localhost:8080`) |
| `COOKIE_SECRET` | No | AES-256 key (base64) |
| `OIDC_ISSUER_URL` | No | Per-client issuer `https://<origin>/oauth2/openid/<client_id>` (validated at startup) |
| `OIDC_CLIENT_ID` | No | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | No | OAuth2 client secret |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/whoami` | Current user info |
| GET/POST | `/api/users` | List/Create users |
| GET/PATCH/DELETE | `/api/users/{id}` | Get/Update (display name, email)/Delete user |
| GET | `/api/users/{id}/sign-in-status` | Sign-in methods the person has set up |
| POST | `/api/users/{id}/disable` | Suspend user (sets `account_expire` to now) |
| POST | `/api/users/{id}/enable` | Restore user (clears `account_expire`) |
| GET | `/api/users/{id}/groups` | User's groups |
| POST/DELETE | `/api/users/{id}/groups/{group}` | Add/Remove from group |
| POST | `/api/users/{id}/copy-groups-from` | Copy groups from another user |
| POST | `/api/users/{id}/set-password` | Generate reset link (`reset_url`, `expires_at`) |
| GET/POST | `/api/groups` | List/Create groups |
| GET/PATCH/DELETE | `/api/groups/{id}` | Get/Update description/Delete group |
| GET | `/api/groups/{id}/members` | Group members |
| POST/DELETE | `/api/groups/{id}/members/{member}` | Add/Remove member |
| GET/POST | `/api/oauth2` | List/Create OAuth2 apps |
| GET/DELETE | `/api/oauth2/{id}` | Get/Delete OAuth2 app |
| POST/DELETE | `/api/oauth2/{id}/access/{group}` | Grant/revoke a group's scope map (`openid profile email`) |

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
- **There is no status attribute** — Kanidm locks an account once `account_expire` has passed
  (`kanidm person validity expire-at <id> now`); re-enabling purges it. Set/clear attributes via
  `PUT`/`DELETE /v1/person/{id}/_attr/{attr}`.
- **`memberof` includes built-in groups** such as `idm_all_persons`, so "has no groups" checks must
  ignore system groups. Only `directmemberof` entries can be removed.
- **`GET /v1/oauth2/{name}` returns 200 with `null`** for an unknown app — map it to 404.
- **OAuth2 apps reject every login** until at least one group has a scope map.
- **OIDC endpoints are read from discovery, never pinned** — `OidcState::new` fetches
  `{issuer}/.well-known/openid-configuration` at startup and uses its `authorization_endpoint`
  (Kanidm: `/ui/oauth2`, the browser SPA) and `token_endpoint`. `/oauth2/authorise` is the JSON
  API behind the SPA and answers session-less browsers with a bare 401, so it must never be used
  as a redirect target.
