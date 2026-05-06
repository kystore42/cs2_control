# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CS2 SaaS** is a production-grade platform transitioning from a simple Electron app to a **Hybrid Cloud Model** (Local Tauri Client + Remote Go Backend + PostgreSQL).

**Current Phase**: Phase 1-3 (Foundation, Auth, Account Management)

- **Desktop Client**: Tauri (Rust) + React (TypeScript)
- **Backend**: Go microservices (Auth, Account Management, Market Analytics)
- **Database**: PostgreSQL with cloud sync
- **Target**: $20/month SaaS supporting 100+ Steam accounts per user

**Legacy System** (still active): Node.js Electron app with localStorage (being gradually deprecated through Phase 8).

## Commands

```bash
npm start          # Launch Electron app (production)
npm run dev        # Launch Electron with hot-reload (enables file watching)
npm test           # Run all Jest tests
npm run test:watch # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

**Important**: Tests require the `NODE_OPTIONS=--experimental-vm-modules` flag, which is automatically set in package.json.

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

## Token Economy for Claude

- **Legacy System**: Read `modules/DataManager.js` for state structure (still informative through Phase 3)
- **New Rust Code**: Async/await, self-documenting names, no comments. Read error types first.
- **New Go Code**: Middleware-heavy, dependency injection. Check handlers before models.
- **High-context**: Rust + Go bridge is critical; read `commands/accounts.rs` + `api/handlers/accounts.go` together
- **Fast decisions**: New features follow pattern: Rust core → Tauri command → Go handler → DB
