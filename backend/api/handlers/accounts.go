package handlers

import (
	"database/sql"
	"net/http"

	"github.com/labstack/echo/v4"
	"cs2-saas/api/models"
)

type AccountHandler struct {
	db *sql.DB
}

func NewAccountHandler(db *sql.DB) *AccountHandler {
	return &AccountHandler{db: db}
}

func (h *AccountHandler) ListAccounts(c echo.Context) error {
	userID := c.Get("user_id").(string)

	rows, err := h.db.Query(
		`SELECT id, user_id, steam_id, account_name, persona_name,
		        is_primary, last_synced_at, sync_status, error_message, local_path,
		        created_at, updated_at
		 FROM steam_accounts
		 WHERE user_id = $1
		 ORDER BY is_primary DESC, created_at ASC`,
		userID,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Database query failed")
	}
	defer rows.Close()

	var accounts []*models.SteamAccount
	for rows.Next() {
		var acc models.SteamAccount
		if err := rows.Scan(
			&acc.ID, &acc.UserID, &acc.SteamID, &acc.AccountName, &acc.PersonaName,
			&acc.IsPrimary, &acc.LastSyncedAt, &acc.SyncStatus, &acc.ErrorMessage, &acc.LocalPath,
			&acc.CreatedAt, &acc.UpdatedAt,
		); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "Row scan failed")
		}
		accounts = append(accounts, &acc)
	}

	if accounts == nil {
		accounts = make([]*models.SteamAccount, 0)
	}

	return c.JSON(http.StatusOK, models.AccountListResponse{
		Total:    len(accounts),
		Accounts: accounts,
	})
}

func (h *AccountHandler) CreateAccounts(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req models.BulkCreateAccountRequest

	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request format")
	}

	if len(req.Accounts) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "No accounts provided")
	}

	accountLimit, ok := c.Get("account_limit").(int)
	if !ok {
		return echo.NewHTTPError(http.StatusInternalServerError, "Subscription limit unavailable")
	}

	var existing int
	if err := h.db.QueryRow(
		`SELECT COUNT(*) FROM steam_accounts WHERE user_id = $1 AND deleted_at IS NULL`,
		userID,
	).Scan(&existing); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Account count failed")
	}

	tx, err := h.db.Begin()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Transaction failed")
	}
	defer tx.Rollback()

	created := 0
	total := existing
	for _, localAcc := range req.Accounts {
		var id string
		err := tx.QueryRow(
			`INSERT INTO steam_accounts (user_id, steam_id, account_name, persona_name, is_primary, local_path)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (user_id, steam_id) DO NOTHING
			 RETURNING id`,
			userID, localAcc.SteamID, localAcc.AccountName, localAcc.PersonaName, total == 0, localAcc.LocalPath,
		).Scan(&id)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "Insert failed")
		}
		created++
		total++
		if total > accountLimit {
			return echo.NewHTTPError(http.StatusForbidden,
				"Account limit reached for your subscription tier")
		}
	}

	if err := tx.Commit(); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Commit failed")
	}

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"created": created,
		"total":   len(req.Accounts),
	})
}

func (h *AccountHandler) SyncAccount(c echo.Context) error {
	userID := c.Get("user_id").(string)
	accountID := c.Param("id")
	var req models.SyncAccountRequest

	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request format")
	}

	_, err := h.db.Exec(
		`INSERT INTO sync_jobs (steam_account_id, direction, status)
		 SELECT id, $1::sync_direction, 'pending'::sync_status
		 FROM steam_accounts
		 WHERE id = $2 AND user_id = $3`,
		req.Direction, accountID, userID,
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Sync job creation failed")
	}

	return c.JSON(http.StatusAccepted, map[string]string{
		"message": "Sync job queued",
		"status": "pending",
	})
}
