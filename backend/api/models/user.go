package models

import (
	"time"
)

type SubscriptionTier string

const (
	TierFree       SubscriptionTier = "free"
	TierPro        SubscriptionTier = "pro"
	TierEnterprise SubscriptionTier = "enterprise"
)

type User struct {
	ID                   string            `json:"id"`
	Email                string            `json:"email"`
	EmailVerified        bool              `json:"email_verified"`
	FullName             string            `json:"full_name"`
	SubscriptionTier     SubscriptionTier  `json:"subscription_tier"`
	SubscriptionExpiresAt *time.Time       `json:"subscription_expires_at"`
	Timezone             string            `json:"timezone"`
	CreatedAt            time.Time         `json:"created_at"`
	UpdatedAt            time.Time         `json:"updated_at"`
}

type CreateUserRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
	FullName string `json:"full_name" validate:"required"`
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type AuthResponse struct {
	User         *User  `json:"user"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}
