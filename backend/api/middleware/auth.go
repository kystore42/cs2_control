package middleware

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"cs2-saas/api/handlers"
)

func JWTMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		header := c.Request().Header.Get("Authorization")
		if header == "" {
			return echo.NewHTTPError(http.StatusUnauthorized, "Authorization header required")
		}

		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			return echo.NewHTTPError(http.StatusUnauthorized, "Invalid Authorization format, expected: Bearer <token>")
		}

		claims, err := handlers.ParseToken(parts[1])
		if err != nil {
			return echo.NewHTTPError(http.StatusUnauthorized, "Invalid or expired token")
		}

		c.Set("user_id", claims.UserID)
		c.Set("user_email", claims.Email)
		c.Set("user_tier", claims.Tier)
		return next(c)
	}
}
