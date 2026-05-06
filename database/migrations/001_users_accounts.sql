CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE sync_status AS ENUM ('pending', 'syncing', 'completed', 'failed');

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
    UNIQUE(user_id, steam_id)
);

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

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_steam_accounts_user_id ON steam_accounts(user_id);
CREATE INDEX idx_steam_accounts_steam_id ON steam_accounts(steam_id);
CREATE INDEX idx_steam_accounts_sync_status ON steam_accounts(sync_status);
CREATE INDEX idx_oauth_providers_user_id ON oauth_providers(user_id);
