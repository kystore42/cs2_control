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

CREATE INDEX idx_price_history_item ON price_history(item_hash_name);
CREATE INDEX idx_price_history_recorded_at ON price_history(recorded_at DESC);
CREATE INDEX idx_price_history_source ON price_history(source);
CREATE INDEX idx_market_prices_item ON market_prices(item_hash_name);
CREATE UNIQUE INDEX idx_price_history_unique ON price_history(item_hash_name, source, recorded_at);
