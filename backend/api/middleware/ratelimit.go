package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

type bucket struct {
	tokens   float64
	lastFill time.Time
	mu       sync.Mutex
}

type rateLimiter struct {
	buckets  map[string]*bucket
	mu       sync.RWMutex
	rate     float64
	capacity float64
}

func newRateLimiter(rps float64) *rateLimiter {
	return &rateLimiter{
		buckets:  make(map[string]*bucket),
		rate:     rps,
		capacity: rps * 2,
	}
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.RLock()
	b, ok := rl.buckets[key]
	rl.mu.RUnlock()

	if !ok {
		rl.mu.Lock()
		b = &bucket{tokens: rl.capacity, lastFill: time.Now()}
		rl.buckets[key] = b
		rl.mu.Unlock()
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(b.lastFill).Seconds()
	b.tokens = min(rl.capacity, b.tokens+elapsed*rl.rate)
	b.lastFill = now

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

var (
	authLimiter = newRateLimiter(5)
	apiLimiter  = newRateLimiter(60)
)

func RateLimitAuth(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		ip := c.RealIP()
		if !authLimiter.allow(ip) {
			return echo.NewHTTPError(http.StatusTooManyRequests, "Too many auth attempts, slow down")
		}
		return next(c)
	}
}

func RateLimitAPI(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		key := c.RealIP()
		if uid, ok := c.Get("user_id").(string); ok && uid != "" {
			key = uid
		}
		if !apiLimiter.allow(key) {
			return echo.NewHTTPError(http.StatusTooManyRequests, "Rate limit exceeded")
		}
		return next(c)
	}
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
