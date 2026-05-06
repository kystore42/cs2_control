package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"
	_ "github.com/lib/pq"

	"cs2-saas/api/handlers"
	"cs2-saas/api/middleware"
)

func main() {
	db := initDB()
	defer db.Close()

	e := echo.New()
	e.HideBanner = true

	e.Use(echomw.Logger())
	e.Use(echomw.Recover())
	e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete},
		AllowHeaders: []string{echo.HeaderContentType, echo.HeaderAuthorization},
	}))

	authH := handlers.NewAuthHandler(db)
	accountH := handlers.NewAccountHandler(db)

	e.GET("/health", healthCheck)

	auth := e.Group("/api/v1/auth")
	auth.Use(middleware.RateLimitAuth)
	auth.POST("/register", authH.Register)
	auth.POST("/login", authH.Login)
	auth.POST("/refresh", authH.Refresh)

	api := e.Group("/api/v1")
	api.Use(middleware.JWTMiddleware)
	api.Use(middleware.RateLimitAPI)

	api.POST("/auth/logout", authH.Logout)

	api.GET("/accounts", accountH.ListAccounts)
	api.POST("/accounts/bulk", accountH.CreateAccounts)
	api.POST("/accounts/:id/sync", accountH.SyncAccount)

	port := getEnv("PORT", "8080")
	log.Printf("CS2 API starting on :%s", port)
	if err := e.Start(":" + port); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func healthCheck(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status":  "ok",
		"version": "0.2.0",
	})
}

func initDB() *sql.DB {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		getEnv("DB_HOST", "localhost"),
		getEnv("DB_PORT", "5432"),
		getEnv("DB_USER", "postgres"),
		getEnv("DB_PASSWORD", "postgres"),
		getEnv("DB_NAME", "cs2_saas"),
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	log.Println("Database connected")
	return db
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
