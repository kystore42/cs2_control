package models

import (
	"encoding/json"
	"time"
)

type ConfigType string

const (
	ConfigTypeCrosshair ConfigType = "crosshair"
	ConfigTypeViewModel ConfigType = "viewmodel"
	ConfigTypeBinds     ConfigType = "binds"
	ConfigTypeAutoexec  ConfigType = "autoexec"
	ConfigTypeRaw       ConfigType = "raw"
)

type Config struct {
	ID             string          `json:"id"`
	UserID         string          `json:"user_id"`
	SteamAccountID string          `json:"steam_account_id"`
	ConfigType     ConfigType      `json:"config_type"`
	ConfigName     string          `json:"config_name"`
	Content        json.RawMessage `json:"content"`
	Checksum       string          `json:"checksum"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type ConfigSyncRequest struct {
	SteamAccountID string          `json:"steam_account_id"`
	ConfigType     ConfigType      `json:"config_type"`
	ConfigName     string          `json:"config_name"`
	Content        json.RawMessage `json:"content"`
	Checksum       string          `json:"checksum"`
}

type ConfigSyncResponse struct {
	ID        string    `json:"id"`
	Updated   bool      `json:"updated"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ConfigListResponse struct {
	Total   int       `json:"total"`
	Configs []*Config `json:"configs"`
}
