-- Partial indices for common queries
CREATE INDEX idx_inventories_account_active ON inventories(steam_account_id)
WHERE NOT is_deleted;

CREATE INDEX idx_sync_jobs_pending ON sync_jobs(steam_account_id)
WHERE status = 'pending' OR status = 'syncing';

CREATE INDEX idx_steam_accounts_active ON steam_accounts(user_id)
WHERE deleted_at IS NULL;

-- Vacuum analyze to gather statistics for the query planner
ANALYZE users;
ANALYZE steam_accounts;
ANALYZE inventories;
ANALYZE market_prices;
ANALYZE price_history;
ANALYZE sync_jobs;
ANALYZE audit_logs;
