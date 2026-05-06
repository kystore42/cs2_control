-- PostgreSQL 15+. T-SQL linters will flag CREATE TYPE AS ENUM as invalid — this is expected.
CREATE TYPE sync_direction AS ENUM ('local_to_cloud', 'cloud_to_local', 'bidirectional');
CREATE TYPE conflict_resolution AS ENUM ('local_wins', 'cloud_wins', 'manual');

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

CREATE INDEX idx_sync_jobs_account_id ON sync_jobs(steam_account_id);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX idx_sync_jobs_account_status ON sync_jobs(steam_account_id, status);
CREATE INDEX idx_sync_conflicts_account ON sync_conflicts(steam_account_id);
CREATE INDEX idx_sync_conflicts_unresolved ON sync_conflicts(steam_account_id) WHERE resolution IS NULL;
