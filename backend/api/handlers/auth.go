package handlers

import (
	"database/sql"
	"net/http"
	"os"
	"strconv"

	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
	"cs2-saas/api/models"
)

type AuthHandler struct {
	db *sql.DB
}

func NewAuthHandler(db *sql.DB) *AuthHandler {
	return &AuthHandler{db: db}
}

func (h *AuthHandler) Register(c echo.Context) error {
	var req models.CreateUserRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body")
	}
	if req.Email == "" || req.Password == "" || req.FullName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email, password, and full_name are required")
	}
	if len(req.Password) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "password must be at least 8 characters")
	}

	cost := bcryptCost()
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), cost)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Password hashing failed")
	}

	var userID string
	err = h.db.QueryRow(
		`INSERT INTO users (email, password_hash, full_name)
		 VALUES ($1, $2, $3)
		 RETURNING id`,
		req.Email, string(hash), req.FullName,
	).Scan(&userID)
	if err != nil {
		if isDuplicateKey(err, "email") {
			return echo.NewHTTPError(http.StatusConflict, "Email already registered")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "User creation failed")
	}

	accessToken, err := generateAccessToken(userID, req.Email, string(models.TierFree))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Token generation failed")
	}
	refreshToken, err := generateRefreshToken(userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Token generation failed")
	}

	if err := h.storeRefreshToken(userID, refreshToken); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Session creation failed")
	}

	return c.JSON(http.StatusCreated, models.AuthResponse{
		User: &models.User{
			ID:               userID,
			Email:            req.Email,
			FullName:         req.FullName,
			SubscriptionTier: models.TierFree,
		},
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	})
}

func (h *AuthHandler) Login(c echo.Context) error {
	var req models.LoginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid request body")
	}
	if req.Email == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "email and password are required")
	}

	var (
		userID   string
		hash     string
		fullName string
		tier     string
	)
	err := h.db.QueryRow(
		`SELECT id, password_hash, full_name, subscription_tier
		 FROM users WHERE email = $1 AND deleted_at IS NULL`,
		req.Email,
	).Scan(&userID, &hash, &fullName, &tier)
	if err == sql.ErrNoRows {
		return echo.NewHTTPError(http.StatusUnauthorized, "Invalid credentials")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Database error")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "Invalid credentials")
	}

	accessToken, err := generateAccessToken(userID, req.Email, tier)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Token generation failed")
	}
	refreshToken, err := generateRefreshToken(userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Token generation failed")
	}

	if err := h.storeRefreshToken(userID, refreshToken); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Session creation failed")
	}

	return c.JSON(http.StatusOK, models.AuthResponse{
		User: &models.User{
			ID:               userID,
			Email:            req.Email,
			FullName:         fullName,
			SubscriptionTier: models.SubscriptionTier(tier),
		},
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	})
}

func (h *AuthHandler) Refresh(c echo.Context) error {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.Bind(&body); err != nil || body.RefreshToken == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "refresh_token is required")
	}

	claims, err := parseToken(body.RefreshToken)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "Invalid or expired refresh token")
	}

	var email, tier string
	err = h.db.QueryRow(
		`SELECT email, subscription_tier FROM users WHERE id = $1 AND deleted_at IS NULL`,
		claims.Subject,
	).Scan(&email, &tier)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "User not found")
	}

	if !h.refreshTokenExists(claims.Subject, body.RefreshToken) {
		return echo.NewHTTPError(http.StatusUnauthorized, "Refresh token revoked")
	}

	accessToken, err := generateAccessToken(claims.Subject, email, tier)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Token generation failed")
	}
	newRefreshToken, err := generateRefreshToken(claims.Subject)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Token generation failed")
	}

	if err := h.rotateRefreshToken(claims.Subject, body.RefreshToken, newRefreshToken); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "Session rotation failed")
	}

	return c.JSON(http.StatusOK, map[string]string{
		"access_token":  accessToken,
		"refresh_token": newRefreshToken,
	})
}

func (h *AuthHandler) Logout(c echo.Context) error {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.Bind(&body); err != nil || body.RefreshToken == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "refresh_token is required")
	}

	userID := c.Get("user_id").(string)
	h.db.Exec(
		`DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2`,
		userID, hashToken(body.RefreshToken),
	)

	return c.JSON(http.StatusOK, map[string]string{"message": "Logged out"})
}

func (h *AuthHandler) storeRefreshToken(userID, token string) error {
	_, err := h.db.Exec(
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
		userID, hashToken(token),
	)
	return err
}

func (h *AuthHandler) rotateRefreshToken(userID, oldToken, newToken string) error {
	tx, err := h.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec(
		`DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2`,
		userID, hashToken(oldToken),
	)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}

	if _, err := tx.Exec(
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
		userID, hashToken(newToken),
	); err != nil {
		return err
	}

	return tx.Commit()
}

func (h *AuthHandler) refreshTokenExists(userID, token string) bool {
	var exists bool
	h.db.QueryRow(
		`SELECT EXISTS(
			SELECT 1 FROM refresh_tokens
			WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()
		)`,
		userID, hashToken(token),
	).Scan(&exists)
	return exists
}

func bcryptCost() int {
	if v := os.Getenv("BCRYPT_COST"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= bcrypt.MinCost && n <= bcrypt.MaxCost {
			return n
		}
	}
	return 12
}

