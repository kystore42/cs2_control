package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	_ "github.com/lib/pq"
)

func main() {
	db := initDB()
	defer db.Close()

	e := echo.New()

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{echo.GET, echo.POST, echo.PUT, echo.DELETE},
	}))

	registerRoutes(e, db)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("CS2 API Server starting on :%s", port)
	if err := e.Start(":" + port); err != nil {
		log.Fatal(err)
	}
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
		log.Fatalf("Failed to connect to database: %v", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	log.Println("Database connection established")
	return db
}

func registerRoutes(e *echo.Echo, db *sql.DB) {
	e.GET("/health", healthCheck)
	e.POST("/api/v1/accounts/detect", detectAccounts)
	e.GET("/api/v1/accounts", listAccounts)
	e.POST("/api/v1/accounts/sync", syncAccount)
}

func healthCheck(c echo.Context) error {
	return c.JSON(200, map[string]string{
		"status": "ok",
		"version": "0.1.0",
	})
}

func detectAccounts(c echo.Context) error {
	return c.JSON(200, map[string]interface{}{
		"message": "Account detection endpoint",
	})
}

func listAccounts(c echo.Context) error {
	return c.JSON(200, map[string]interface{}{
		"accounts": []interface{}{},
		"total": 0,
	})
}

func syncAccount(c echo.Context) error {
	return c.JSON(202, map[string]string{
		"status": "pending",
		"message": "Sync job queued",
	})
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
