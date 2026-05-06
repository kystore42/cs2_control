# Development Setup Guide

## Prerequisites

### Required
- **Rust 1.70+**: `rustc --version`
- **Go 1.21+**: `go version`
- **Node.js 18+**: `node --version`
- **Docker & Docker Compose**: `docker --version`
- **PostgreSQL 15** (optional if using Docker)

### Windows-Specific
- Visual Studio Build Tools or C++ build tools for Rust compilation
- Git (configured with autocrlf=false for Unix line endings in repos)

## Initial Setup

### 1. Clone & Initialize

```bash
git clone <repo>
cd cs2-saas

# Install Rust dependencies (one-time)
rustup update stable
rustup component add rustfmt clippy

# Install Go dependencies (one-time)
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

### 2. Database Setup

#### Option A: Docker (Recommended)
```bash
docker-compose up -d

# Verify connection
psql -h localhost -U postgres -d cs2_saas -c "SELECT version();"
```

#### Option B: Local PostgreSQL
```bash
# Create database
createdb cs2_saas

# Apply schema
psql cs2_saas < database/schema.sql

# Set environment
export DB_HOST=localhost DB_PORT=5432 DB_USER=<your_user> DB_PASSWORD=<your_pass> DB_NAME=cs2_saas
```

### 3. Environment Configuration

Create `.env` in project root (git-ignored):

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=cs2_saas

# API
API_PORT=8080
API_ENV=development

# Rust/Tauri
RUST_LOG=debug
RUST_BACKTRACE=1
```

## Development Workflows

### Rust Development (Frontend Core)

```bash
cd frontend/src-tauri

# Build library
cargo build --lib

# Build binary
cargo build --bin cs2-core

# Run binary
cargo run --bin cs2-core

# Run tests
cargo test

# Run specific test
cargo test test_detect_all_accounts

# Check code (no compilation)
cargo check

# Format code
cargo fmt

# Lint
cargo clippy
```

### Go Development (Backend API)

```bash
cd backend/api

# Download dependencies
go mod download
go mod tidy

# Run server
go run main.go

# Build binary
go build -o cs2-api

# Run tests
go test ./...

# Run with coverage
go test -cover ./...

# Format code
go fmt ./...

# Lint
golangci-lint run

# Database migrations (manual)
psql cs2_saas < ../../database/migrations/001_users_accounts.sql
```

### Database Development

```bash
# Connect to database
psql -h localhost -U postgres -d cs2_saas

# List tables
\dt

# Describe table
\d steam_accounts

# Run migration
psql cs2_saas < database/migrations/002_inventory.sql

# Backup schema
pg_dump -h localhost -U postgres cs2_saas > backup.sql

# Restore schema
psql cs2_saas < backup.sql
```

## Testing

### Rust Tests
```bash
# All tests
cargo test

# With output
cargo test -- --nocapture

# Single test
cargo test test_steam_path_discovery
```

### Go Tests
```bash
cd backend/api

# All tests
go test ./...

# Verbose
go test -v ./...

# Coverage
go test -cover ./...

# Specific test
go test -run TestListAccounts ./handlers
```

### Integration Testing
```bash
# 1. Start all services
docker-compose up -d

# 2. Build Rust core
cd frontend/src-tauri && cargo build --release

# 3. Test account detection
./target/release/cs2-core.exe

# 4. Start Go API
cd backend/api && go run main.go

# 5. Test endpoints
curl http://localhost:8080/health
curl -X GET http://localhost:8080/api/v1/accounts \
  -H "Authorization: Bearer <token>"
```

## Common Commands Cheat Sheet

| Task | Command |
|------|---------|
| Check code compiles | `cargo check && go build ./...` |
| Run all tests | `cargo test && go test ./...` |
| Format all code | `cargo fmt && go fmt ./...` |
| Lint code | `cargo clippy && golangci-lint run` |
| Start dev environment | `docker-compose up -d && cd backend/api && go run main.go` |
| Create DB backup | `pg_dump cs2_saas > backup.sql` |
| Apply migration | `psql cs2_saas < database/migrations/XXX.sql` |
| View API health | `curl http://localhost:8080/health` |

## Troubleshooting

### Rust Compilation Issues
```bash
# Clear build cache
cargo clean

# Update dependencies
cargo update

# Check for issues
cargo check --all-targets

# Rebuild from scratch
cargo build --release
```

### Database Connection Issues
```bash
# Test connection
psql -h localhost -U postgres -d cs2_saas -c "SELECT 1;"

# View logs
docker logs cs2_postgres

# Restart Docker services
docker-compose down
docker-compose up -d
```

### Go Build Issues
```bash
# Update dependencies
go mod tidy
go mod download

# Clear cache
go clean -cache

# Verbose build
go build -v ./...
```

## Code Style Guidelines

### Rust
- Follow `rustfmt` formatting: `cargo fmt`
- Use `clippy` for linting: `cargo clippy`
- Error types: Define custom `CoreError` enum
- Comments: Only for "why", not "what" (code should be self-documenting)

### Go
- Follow standard Go formatting: `go fmt`
- Capitalized exported functions
- Error handling: Explicit error returns, no panics in handlers
- Comments: Start with function name for exported items
- Dependency injection pattern for handlers

### SQL
- UPPERCASE for keywords
- Lowercase for table/column names
- `snake_case` for identifiers
- Comments starting with `--`

## VSCode Configuration

Recommended extensions:
- Rust Analyzer
- Go
- PostgreSQL
- Git Graph

`.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  },
  "[go]": {
    "editor.defaultFormatter": "golang.go"
  },
  "go.lintTool": "golangci-lint",
  "go.lintOnSave": "package"
}
```

## CI/CD Integration (GitHub Actions Ready)

Workflows to implement:
1. **test.yml** - Run all tests on PR
2. **build.yml** - Build Rust/Go binaries
3. **lint.yml** - Code quality checks
4. **deploy.yml** - Release to production

See `.github/workflows/` for templates.

## Performance Profiling

### Rust
```bash
# Flamegraph
cargo install flamegraph
cargo flamegraph --bin cs2-core

# Benchmark
cargo bench
```

### Go
```bash
# CPU profiling
go test -cpuprofile=cpu.prof ./...
go tool pprof cpu.prof

# Memory profiling
go test -memprofile=mem.prof ./...
```

## Debugging

### Rust
```bash
# Run with backtrace
RUST_BACKTRACE=full cargo run

# Debug in VSCode: .vscode/launch.json configured
```

### Go
```bash
# Delve debugger
go install github.com/go-delve/delve/cmd/dlv@latest
dlv debug ./cmd/api

# Verbose logging
API_LOG_LEVEL=debug go run main.go
```

---

**For architecture details, see CLAUDE.md. For phase-specific information, see PHASE_1_COMPLETE.md.**
