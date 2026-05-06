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

CREATE INDEX idx_inventories_account_id ON inventories(steam_account_id);
CREATE INDEX idx_inventories_item_hash ON inventories(item_hash_name);
CREATE INDEX idx_inventories_profit ON inventories(profit_estimate DESC) WHERE NOT is_deleted;
CREATE INDEX idx_inventories_updated ON inventories(steam_account_id, updated_at DESC) WHERE NOT is_deleted;
