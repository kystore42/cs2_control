# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CS2 SaaS** is a production-grade platform transitioning from a simple Electron app to a **Hybrid Cloud Model** (Local Tauri Client + Remote Go Backend + PostgreSQL).

**Current Phase**: Phase 3 (Config Sync Bridge)

- **Desktop Client**: Tauri (Rust) + React (TypeScript)
- **Backend**: Go microservices (Auth, Account Management, Market Analytics)
- **Database**: PostgreSQL with cloud sync
- **Target**: $20/month SaaS supporting 100+ Steam accounts per user

**Legacy System** (still active): Node.js Electron app with localStorage (being gradually deprecated through Phase 8).

## Commands

### Legacy Electron (still active, deprecating in Phase 8)

```bash
npm start                # Launch Electron app
npm run dev              # Launch with hot-reload
npm test                 # Jest tests (requires NODE_OPTIONS=--experimental-vm-modules, set in package.json)
npm run test:watch
npm run test:coverage
```

### Rust Core (`frontend/src-tauri/`)

```bash
cargo build --lib        # Compile library
cargo build --release    # Compile binary
cargo run --bin cs2-core # Run CLI binary
cargo test               # All tests
cargo test <name>        # Single test
cargo clippy             # Lint
cargo fmt                # Format
```

### Go Backend (`backend/api/`)

```bash
go run main.go           # Start API server (default port 8080)
go build -o cs2-api      # Compile binary
go test ./...            # All tests
go test -v -run <name> ./handlers  # Single test
go fmt ./...             # Format
go vet ./...             # Lint
```

### Docker / Database

```bash
docker-compose up -d                               # Start PostgreSQL + Redis + Adminer
psql -h localhost -U postgres -d cs2_saas          # Connect to DB
psql cs2_saas < database/migrations/XXX.sql        # Apply migration
docker-compose down                                # Stop all services
```

### Environment Variables (Go API)

```env
DB_HOST=localhost  DB_PORT=5432  DB_USER=postgres  DB_PASSWORD=postgres  DB_NAME=cs2_saas
JWT_SECRET=<min-32-char-secret>
PORT=8080
BCRYPT_COST=12
```

## Architecture Overview

### Module Structure

The app is built around three core modules with clear separation of concerns:

#### 1. **Logger** (`modules/Logger.js`)
- Centralized logging with dual output: console + localStorage
- Methods: `info()`, `warn()`, `error()`
- Stores up to 100 logs by default (configurable)
- Provides `getLogs()` and `getReport()` for retrieving persisted logs
- **Use when**: Adding observability to new features or debugging production issues

#### 2. **StorageManager** (`modules/StorageManager.js`)
- Abstraction over localStorage with error handling
- Methods: `load()`, `save()`, `remove()`, `clear()`, `getAllKeys()`, `getSize()`
- Supports custom serializers/deserializers
- Returns safe defaults on errors (no exceptions thrown)
- **Use when**: Reading/writing any persisted data

#### 3. **DataManager** (`modules/DataManager.js`)
- **Central state container** replacing 33 previously-global variables
- Organizes state into logical sections: inventory, UI state, scan state, alerts, price tracking, AI settings
- Provides getter/setter methods for all state (e.g., `setInventory()`, `getCurrentTab()`)
- Handles persistence: `loadFromStorage()` and `saveToStorage()` sync with localStorage using predefined keys
- Supports state reset via `reset()` and `getAllState()` for debugging
- **Pattern**: Dependency-injected Logger and StorageManager in constructor
- **Use when**: Accessing or modifying any app state

### UI Architecture

**index.html** is a single Material You dashboard with multiple tabs/panels:
- **Inventory** (`#inventory-view`): Grid of items with sorting/filtering
- **Signals** (`#signals-view`): Profitable items
- **Analytics** (`#analytics-view`): Price history, distributions, top items
- **AI** (`#ai-view`): AI recommendations and market scanning
- **Settings** (`#settings-view`): Filters, alerts, AI tuning
- **History** (`#history-view`): New items, disappeared items, price alerts

Panels use `display: none` for tab switching (managed by script).

### State Flow

1. **App Load** → `index.js` creates Electron window, loads `index.html`
2. **Initialization** → Frontend instantiates Logger, StorageManager, DataManager
3. **Persistence** → `DataManager.loadFromStorage()` restores previous session
4. **Runtime** → All state changes go through DataManager setters
5. **Shutdown** → `DataManager.saveToStorage()` persists to localStorage

### Key State Sections in DataManager

| Section | Purpose |
|---------|---------|
| `inventoryData` | User's CS2 items (by hash name) |
| `historyItems` | New items detected, alerts (max 200) |
| `profitHistory` | Price trend snapshots (max 50 entries) |
| `priceHistory` | Per-item price history (max 200 entries each) |
| `watchlist` | Favorited item hash names |
| `currentTab`, `currentSort`, `searchQuery` | UI state |
| `priceQueue`, `priceQueueSet` | Queue for batch price lookups (dedup'd) |
| `alerts`, `priceAlerts` | User-configured thresholds and triggers |
| `actionSellList`, `actionBuyList` | Items marked for trading |
| `aiMinScore`, `aiPositiveTrendOnly`, `aiSort` | AI filter settings |

### Testing Pattern

Tests use Jest with Node experimental VM modules. Mock StorageManager and Logger for isolation:

```javascript
// Example from DataManager.test.js
const mockStorage = {
  load: jest.fn(),
  save: jest.fn(),
  clear: jest.fn()
};
const manager = new DataManager(mockStorage, mockLogger);
```

## Development Tips

- **State mutations**: Always use DataManager setters; never mutate `inventoryData` directly
- **Storage keys**: Defined in `DataManager.loadFromStorage()` and `saveToStorage()` (about 15 keys for full persistence)
- **Rate limiting**: Steam API rate limits are tracked in `steamRateLimitedUntil`; check `getIsSteamRateLimited()` before requests
- **Tab switching**: Update `currentTab` via DataManager; UI reads this to show/hide panels
- **Price queuing**: Use `enqueuePrice()` and `dequeuePrices(count)` for batch Steam API calls
- **Logging**: Inject Logger into any module that needs observability; don't use `console` directly in modules

## Security & Permissions

**index.js disables key security features for Electron development** (`nodeIntegration: true`, `contextIsolation: false`, `webSecurity: false`). This is intentional for a local tool but should not be used in production-facing apps. No remote code execution vectors exist since the app is offline-first.

## SaaS Architecture (New)

### Directory Structure (Phase 1+)

```text
frontend/                    # Tauri + React client
├── src-tauri/              # Rust core
│   └── src/core/steam/     # Steam detection (path.rs, registry.rs, accounts.rs)
├── src/                    # React TypeScript UI
└── package.json

backend/                     # Go microservices
├── api/                    # Main API gateway
├── market-analytics/       # Price aggregator
└── account-sync/           # Sync orchestration

database/                    # PostgreSQL migrations
└── migrations/             # 001-006 schema files
```

### Key Modules (Rust)

- **`core/steam/path.rs`**: Safe Steam registry discovery (read-only)
- **`core/steam/registry.rs`**: Windows registry account enumeration
- **`core/steam/accounts.rs`**: CS2 app detection + inventory discovery
- **`commands/accounts.rs`**: Tauri command handlers (RPC to React)

### Key Services (Go)

- **`api/handlers/auth.go`**: OAuth2, JWT, subscription enforcement
- **`api/handlers/accounts.go`**: List, create, sync steam accounts
- **`market-analytics/collectors/`**: Steam, Buff, Skinport price feeds
- **`account-sync/sync/manager.go`**: Bidirectional cloud sync orchestration

### Database

- **Schema**: PostgreSQL with users, steam_accounts, inventories, market_prices, sync_jobs
- **Migrations**: SQL files in `database/migrations/`
- **Persistence**: All data synced via Go backend (no localStorage)

## Phase 2: Auth & Cloud Connection

### Auth Flow (Go)

```text
POST /api/v1/auth/register  → hash password (bcrypt) → insert user → return JWT pair
POST /api/v1/auth/login     → verify password → return JWT pair
POST /api/v1/auth/refresh   → verify refresh token → return new access token
POST /api/v1/auth/logout    → blacklist refresh token (Redis)
```

JWT: **access token** (15 min, HS256) + **refresh token** (7 days, stored in DB).  
`user_id` claim in JWT is extracted by middleware and placed in `c.Get("user_id")`.

**Refresh token rotation**: `/auth/refresh` returns a *new pair* — `rotateRefreshToken` deletes
the old hash and inserts the new one in one transaction. A reused refresh token fails
(its hash no longer exists). The Rust `RefreshTokenResponse` carries both tokens; the
sync engine writes both back into `TokenState`.

### Auth Middleware (`backend/api/middleware/auth.go`)

All `/api/v1/*` routes except `/auth/*` pass through `JWTMiddleware`.  
Middleware validates token signature, expiry, and sets `c.Set("user_id", claims.UserID)`.

### Subscription Enforcement (`middleware/subscription.go`)

`RequireTier(db, tier)` middleware checks `users.subscription_tier`, blocks under-tier
users, and sets `c.Get("account_limit")` (free=1, pro=10, enterprise=999). It is wired
on `/accounts/bulk` with `TierFree` minimum — every tier passes the gate but inherits
its limit. `CreateAccounts` counts existing rows and aborts the transaction with 403
once `existing + inserted` exceeds the limit.

### Rust HTTP Client (`core/api/`)

Rust calls the Go backend via `reqwest` (already in Cargo.toml):

- `core/api/client.rs` — base URL, auth header injection, error mapping
- `core/api/types.rs` — mirrors Go models as Rust structs
- `commands/sync.rs` — Tauri command: detect local accounts → POST to backend

### Key Invariants

- **Never store JWT in Rust** — frontend (React/Tauri webview) holds tokens in memory
- **go.sum must be committed** — it's the dependency lockfile
- **Cargo.lock must be committed** — binary crate, not a library
- **bcrypt cost = 12** in production (configurable via `BCRYPT_COST` env var)
- **Subscription tier** checked server-side only, never trust the client

## Phase 3: Config Sync Bridge

### Sync Engine (`core/sync/`)

Background watcher that detects CS2 config file changes and pushes to the Go backend:

- **`sync/watcher.rs`**: Wraps `notify` v6 watcher; bridges OS file events to `tokio::sync::mpsc::UnboundedReceiver<PathBuf>`. Only `.cfg` files pass through.
- **`sync/engine.rs`**: `SyncEngine` holds `Arc<Mutex<TokenState>>`. Call `engine.start(watch_dirs)` where `watch_dirs: Vec<(String, PathBuf)>` maps `(steam_account_id, config_dir)`. Returns a `JoinHandle`. Debounce is 500 ms — events within that window are coalesced per path.
- **Token refresh**: On 401, engine calls `ApiClient::refresh_access_token(refresh_token)`, updates `token_state.access_token`, and retries once. If refresh fails, the push is silently skipped (next file change will retry).

### HTTP Client (`core/api/client.rs`)

- `ApiClient::new(access_token: Option<String>)` — reads `CS2_API_URL` from env (default `http://localhost:8080`)
- `post<B, R>()` / `get<R>()` are private generics; public methods are `bulk_create_accounts`, `sync_config`, `refresh_access_token`
- 401 → `CoreError::Unauthorized`; other non-2xx → `CoreError::SyncError`

### Configs API (Go)

```text
GET  /api/v1/configs              → List configs (optional ?account_id=)
POST /api/v1/configs/sync         → Upsert config from Rust (JSONB content, SHA256 checksum)
GET  /api/v1/configs/:id          → Fetch single config
```

- Upsert uses `ON CONFLICT ... DO UPDATE WHERE checksum != EXCLUDED.checksum` — no write if unchanged
- `content` column is `JSONB`; Go model uses `json.RawMessage` to pass-through without double-encoding
- `config_type` is a PostgreSQL ENUM: `crosshair | viewmodel | binds | autoexec | raw`

### CI/CD (`.github/workflows/ci.yml`)

Five jobs on every push/PR to `main`:

1. `test-js` — Jest on ubuntu-latest
2. `lint-go` — golangci-lint + `go vet` (ubuntu-latest)
3. `test-go` — `go test ./...` with a Postgres 15 service container
4. `lint-sql` — sqlfluff on `database/migrations/`
5. `check-rust` — `cargo check --lib` + `cargo clippy` on **windows-latest** (required for `winreg`)

### Key Invariants (updated)

- **JWT in memory only** — `SyncEngine.token_state` is in-process `Arc<Mutex<_>>`, never persisted to disk or registry
- `config_type` detect: `autoexec.cfg` → autoexec, `config.cfg` → viewmodel, `*crosshair*` → crosshair, `*bind*` → binds, else → raw

## Token Economy for Claude

- **Auth flow**: Read `handlers/auth.go` → `middleware/auth.go` → `models/user.go` (in that order)
- **Rust HTTP**: Read `core/api/client.rs` + `core/api/types.rs` before touching `commands/sync.rs`
- **Legacy System**: `modules/DataManager.js` still useful for understanding state shape through Phase 3
- **Fast decisions**: Auth feature → `handlers/auth.go`; new protected endpoint → add to route group in `main.go`; new Rust→cloud call → `commands/sync.rs`
