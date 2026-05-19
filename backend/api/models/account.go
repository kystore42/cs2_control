package models

import (
	"time"
)

type SyncStatus string

const (
	SyncPending   SyncStatus = "pending"
	SyncSyncing   SyncStatus = "syncing"
	SyncCompleted SyncStatus = "completed"
	SyncFailed    SyncStatus = "failed"
)

type SteamAccount struct {
	ID            string     `json:"id"`
	UserID        string     `json:"user_id"`
	SteamID       int64      `json:"steam_id"`
	AccountName   string     `json:"account_name"`
	PersonaName   string     `json:"persona_name"`
	IsPrimary     bool       `json:"is_primary"`
	LastSyncedAt  *time.Time `json:"last_synced_at"`
	SyncStatus    SyncStatus `json:"sync_status"`
	ErrorMessage  *string    `json:"error_message"`
	LocalPath     string     `json:"local_path"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type CreateAccountRequest struct {
	SteamID     int64  `json:"steam_id" validate:"required,min=1"`
	AccountName string `json:"account_name" validate:"required"`
	PersonaName string `json:"persona_name"`
	IsPrimary   bool   `json:"is_primary"`
	LocalPath   string `json:"local_path"`
}

type BulkCreateAccountRequest struct {
	Accounts []CreateAccountRequest `json:"accounts" validate:"required,min=1"`
}

type SyncAccountRequest struct {
	Direction string `json:"direction" validate:"required,oneof=local_to_cloud cloud_to_local bidirectional"`
}

type AccountListResponse struct {
	Total    int             `json:"total"`
	Accounts []*SteamAccount `json:"accounts"`
}
