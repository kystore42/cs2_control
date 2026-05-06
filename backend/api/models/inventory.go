package models

import (
	"time"
)

type InventoryItem struct {
	ID                string    `json:"id"`
	SteamAccountID    string    `json:"steam_account_id"`
	ItemHashName      string    `json:"item_hash_name"`
	ItemName          string    `json:"item_name"`
	ItemRarity        string    `json:"item_rarity"`
	FloatValue        *float64  `json:"float_value"`
	PaintIndex        *int      `json:"paint_index"`
	Quantity          int       `json:"quantity"`
	MarketHashPrice   *float64  `json:"market_hash_price"`
	BuffPrice         *float64  `json:"buff_price"`
	SkinportPrice     *float64  `json:"skinport_price"`
	ProfitEstimate    *float64  `json:"profit_estimate"`
	LastPriceUpdate   *time.Time `json:"last_price_update"`
	LocalLastModified *time.Time `json:"local_last_modified"`
	IsDeleted         bool      `json:"is_deleted"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type BulkUpsertInventoryRequest struct {
	SteamAccountID string           `json:"steam_account_id" validate:"required"`
	Items          []InventoryItem  `json:"items" validate:"required,min=1"`
}

type InventoryStatsResponse struct {
	TotalItems      int     `json:"total_items"`
	TotalValue      float64 `json:"total_value"`
	ProfitableItems int     `json:"profitable_items"`
	AverageProfit   float64 `json:"average_profit"`
}
