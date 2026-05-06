package handlers

import (
	"database/sql"
	"net/http"

	"github.com/labstack/echo/v4"
	"cs2-saas/api/models"
)

type ConfigHandler struct {
	db *sql.DB
}

func NewConfigHandler(db *sql.DB) *ConfigHandler {
	return &ConfigHandler{db: db}
}

func (h *ConfigHandler) ListConfigs(c echo.Context) error {
	userID := c.Get("user_id").(string)
	accountID := c.QueryParam("account_id")

	var rows *sql.Rows
	var err error

	if accountID != "" {
		rows, err = h.db.Query(
			`SELECT id, user_id, steam_account_id, config_type, config_name,
			        content, checksum, created_at, updated_at
			 FROM configs
			 WHERE user_id = $1 AND steam_account_id = $2
			 ORDER BY config_type, config_name`,
			userID, accountID,
		)
	} else {
		rows, err = h.db.Query(
			`SELECT id, user_id, steam_account_id, config_type, config_name,
			        content, checksum, created_at, updated_at
			 FROM configs
			 WHERE user_id = $1
			 ORDER BY config_type, config_name`,
			userID,
		)
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Database query failed")
	}
	defer rows.Close()

	var configs []*models.Config
	for rows.Next() {
		var cfg models.Config
		if err := rows.Scan(
			&cfg.ID, &cfg.UserID, &cfg.SteamAccountID, &cfg.ConfigType, &cfg.ConfigName,
			&cfg.Content, &cfg.Checksum, &cfg.CreatedAt, &cfg.UpdatedAt,
		); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "Row scan failed")
		}
		configs = append(configs, &cfg)
	}

	if configs == nil {
		configs = make([]*models.Config, 0)
	}

	return c.JSON(http.StatusOK, models.ConfigListResponse{
		Total:   len(configs),
		Configs: configs,
	})
}

func (h *ConfigHandler) SyncConfig(c echo.Context) error {
	userID := c.Get("user_id").(string)
	var req models.ConfigSyncRequest

	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request format")
	}

	if req.SteamAccountID == "" || req.ConfigName == "" || len(req.Content) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "steam_account_id, config_name, and content are required")
	}

	var resp models.ConfigSyncResponse
	var wasInserted bool

	err := h.db.QueryRow(
		`INSERT INTO configs (user_id, steam_account_id, config_type, config_name, content, checksum)
		 VALUES ($1, $2, $3::config_type, $4, $5, $6)
		 ON CONFLICT (user_id, steam_account_id, config_type, config_name)
		 DO UPDATE SET
		     content  = EXCLUDED.content,
		     checksum = EXCLUDED.checksum,
		     updated_at = NOW()
		 WHERE configs.checksum != EXCLUDED.checksum
		 RETURNING id, (xmax = 0) AS was_inserted, updated_at`,
		userID, req.SteamAccountID, req.ConfigType, req.ConfigName, req.Content, req.Checksum,
	).Scan(&resp.ID, &wasInserted, &resp.UpdatedAt)

	if err == sql.ErrNoRows {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"updated": false,
			"message": "config unchanged (checksum match)",
		})
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Upsert failed")
	}

	resp.Updated = !wasInserted
	status := http.StatusCreated
	if resp.Updated {
		status = http.StatusOK
	}

	return c.JSON(status, resp)
}

func (h *ConfigHandler) GetConfig(c echo.Context) error {
	userID := c.Get("user_id").(string)
	configID := c.Param("id")

	var cfg models.Config
	err := h.db.QueryRow(
		`SELECT id, user_id, steam_account_id, config_type, config_name,
		        content, checksum, created_at, updated_at
		 FROM configs
		 WHERE id = $1 AND user_id = $2`,
		configID, userID,
	).Scan(
		&cfg.ID, &cfg.UserID, &cfg.SteamAccountID, &cfg.ConfigType, &cfg.ConfigName,
		&cfg.Content, &cfg.Checksum, &cfg.CreatedAt, &cfg.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return echo.NewHTTPError(http.StatusNotFound, "Config not found")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Database query failed")
	}

	return c.JSON(http.StatusOK, cfg)
}
