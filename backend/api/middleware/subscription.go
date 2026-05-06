package middleware

import (
	"database/sql"
	"net/http"

	"github.com/labstack/echo/v4"
	"cs2-saas/api/models"
)

var tierRank = map[models.SubscriptionTier]int{
	models.TierFree:       0,
	models.TierPro:        1,
	models.TierEnterprise: 2,
}

var tierAccountLimit = map[models.SubscriptionTier]int{
	models.TierFree:       1,
	models.TierPro:        10,
	models.TierEnterprise: 999,
}

func RequireTier(db *sql.DB, minimum models.SubscriptionTier) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			userID := c.Get("user_id").(string)

			var tier string
			err := db.QueryRow(
				`SELECT subscription_tier FROM users WHERE id = $1 AND deleted_at IS NULL`,
				userID,
			).Scan(&tier)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "User not found")
			}

			current := models.SubscriptionTier(tier)
			if tierRank[current] < tierRank[minimum] {
				return echo.NewHTTPError(http.StatusForbidden,
					"Subscription upgrade required: need "+string(minimum))
			}

			c.Set("account_limit", tierAccountLimit[current])
			return next(c)
		}
	}
}
