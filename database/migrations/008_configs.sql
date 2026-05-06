-- PostgreSQL 15+. config_type ENUM and JSONB content are PostgreSQL-specific.
CREATE TYPE config_type AS ENUM ('crosshair', 'viewmodel', 'binds', 'autoexec', 'raw');

CREATE TABLE configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    steam_account_id UUID NOT NULL REFERENCES steam_accounts(id) ON DELETE CASCADE,
    config_type config_type NOT NULL,
    config_name VARCHAR(255) NOT NULL,
    content JSONB NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, steam_account_id, config_type, config_name)
);

CREATE INDEX idx_configs_user ON configs(user_id);
CREATE INDEX idx_configs_account ON configs(steam_account_id);
CREATE INDEX idx_configs_user_account ON configs(user_id, steam_account_id);
CREATE INDEX idx_configs_content ON configs USING GIN (content);
