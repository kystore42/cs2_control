-- CS2 SaaS PostgreSQL Schema
-- Target: PostgreSQL 15+ ONLY. Not compatible with T-SQL/SQL Server or MySQL.
-- IDE SQL linters configured for T-SQL will flag false positives on:
--   CREATE TYPE AS ENUM, partial indices (WHERE clause), OR in index predicates.
-- Use migrations/ directory for incremental deployment.

CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE sync_status AS ENUM ('pending', 'syncing', 'completed', 'failed');
CREATE TYPE sync_direction AS ENUM ('local_to_cloud', 'cloud_to_local', 'bidirectional');
CREATE TYPE conflict_resolution AS ENUM ('local_wins', 'cloud_wins', 'manual');

-- ========== Users ==========
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    email_verified BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    subscription_tier subscription_tier DEFAULT 'free',
    subscription_expires_at TIMESTAMPTZ,
    api_key_hash VARCHAR(255) UNIQUE,
    timezone VARCHAR(50) DEFAULT 'UTC',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ========== OAuth & Authentication ==========
CREATE TABLE oauth_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- ========== Steam Accounts ==========
CREATE TABLE steam_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    steam_id BIGINT NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    persona_name VARCHAR(255),
    is_primary BOOLEAN DEFAULT FALSE,
    last_synced_at TIMESTAMPTZ,
    sync_status sync_status DEFAULT 'pending',
    error_message TEXT,
    local_path VARCHAR(2048),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(user_id, steam_id)
);

-- ========== Inventory ==========
CREATE TABLE inventories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    steam_account_id UUID NOT NULL REFERENCES steam_accounts(id) ON DELETE CASCADE,
    item_hash_name VARCHAR(512) NOT NULL,
    item_name VARCHAR(512) NOT NULL,
    item_rarity VARCHAR(100),
    float_value NUMERIC(10, 10),
    paint_index INTEGER,
    quantity INTEGER DEFAULT 1,
    market_hash_price NUMERIC(12, 2),
    buff_price NUMERIC(12, 2),
    skinport_price NUMERIC(12, 2),
    profit_estimate NUMERIC(12, 2),
    last_price_update TIMESTAMPTZ,
    local_last_modified TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== Market Data ==========
CREATE TABLE market_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_hash_name VARCHAR(512) NOT NULL UNIQUE,
    steam_price NUMERIC(12, 2),
    buff_price NUMERIC(12, 2),
    skinport_price NUMERIC(12, 2),
    mean_price NUMERIC(12, 2),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE price_history (
    id BIGSERIAL PRIMARY KEY,
    item_hash_name VARCHAR(512) NOT NULL,
    source VARCHAR(50) NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== Sync State & Conflicts ==========
CREATE TABLE sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    steam_account_id UUID NOT NULL REFERENCES steam_accounts(id) ON DELETE CASCADE,
    direction sync_direction NOT NULL,
    status sync_status DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sync_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    steam_account_id UUID NOT NULL REFERENCES steam_accounts(id) ON DELETE CASCADE,
    item_hash_name VARCHAR(512) NOT NULL,
    local_version JSONB,
    cloud_version JSONB,
    resolution conflict_resolution,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== Audit Logs ==========
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== Indices ==========
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_steam_accounts_user_id ON steam_accounts(user_id);
CREATE INDEX idx_steam_accounts_steam_id ON steam_accounts(steam_id);
CREATE INDEX idx_steam_accounts_sync_status ON steam_accounts(sync_status);
CREATE INDEX idx_oauth_providers_user_id ON oauth_providers(user_id);

CREATE INDEX idx_inventories_account_id ON inventories(steam_account_id);
CREATE INDEX idx_inventories_item_hash ON inventories(item_hash_name);
CREATE INDEX idx_inventories_profit ON inventories(profit_estimate DESC) WHERE NOT is_deleted;
CREATE INDEX idx_inventories_updated ON inventories(steam_account_id, updated_at DESC) WHERE NOT is_deleted;
CREATE INDEX idx_inventories_account_active ON inventories(steam_account_id) WHERE NOT is_deleted;

CREATE INDEX idx_price_history_item ON price_history(item_hash_name);
CREATE INDEX idx_price_history_recorded_at ON price_history(recorded_at DESC);
CREATE INDEX idx_price_history_source ON price_history(source);
CREATE INDEX idx_market_prices_item ON market_prices(item_hash_name);
CREATE UNIQUE INDEX idx_price_history_unique ON price_history(item_hash_name, source, recorded_at);

CREATE INDEX idx_sync_jobs_account_id ON sync_jobs(steam_account_id);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX idx_sync_jobs_account_status ON sync_jobs(steam_account_id, status);
CREATE INDEX idx_sync_jobs_pending ON sync_jobs(steam_account_id) WHERE status = 'pending' OR status = 'syncing';

CREATE INDEX idx_sync_conflicts_account ON sync_conflicts(steam_account_id);
CREATE INDEX idx_sync_conflicts_unresolved ON sync_conflicts(steam_account_id) WHERE resolution IS NULL;

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action);

CREATE INDEX idx_steam_accounts_active ON steam_accounts(user_id) WHERE deleted_at IS NULL;
