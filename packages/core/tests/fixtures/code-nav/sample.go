package auth

import (
	"fmt"
	"net/http"
)

// AuthConfig holds authentication settings.
type AuthConfig struct {
	Secret    string
	ExpiresIn int
}

// AuthMiddleware provides authentication handling.
type AuthMiddleware struct {
	config AuthConfig
}

// NewAuthMiddleware creates a new AuthMiddleware instance.
func NewAuthMiddleware(config AuthConfig) *AuthMiddleware {
	return &AuthMiddleware{config: config}
}

// Authenticate validates the request token.
func (m *AuthMiddleware) Authenticate(r *http.Request) (string, error) {
	token := r.Header.Get("Authorization")
	if token == "" {
		return "", fmt.Errorf("no token")
	}
	return "user-1", nil
}

func (m *AuthMiddleware) refreshToken(token string) string {
	return token + "-refreshed"
}

var DefaultConfig = AuthConfig{Secret: "dev", ExpiresIn: 3600}
