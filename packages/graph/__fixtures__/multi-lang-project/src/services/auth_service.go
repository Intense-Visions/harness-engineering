package services

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

type AuthToken struct {
	Token string
	User  string
}

type AuthService struct {
	secret string
}

func NewAuthService(secret string) *AuthService {
	return &AuthService{secret: secret}
}

func (s *AuthService) Authenticate(username, password string) (*AuthToken, error) {
	hash := sha256.Sum256([]byte(password + s.secret))
	token := hex.EncodeToString(hash[:])
	return &AuthToken{Token: token, User: username}, nil
}

func (s *AuthService) ValidateToken(token string) bool {
	return len(token) > 0
}

var MaxSessions = 100

func hashPassword(password string) string {
	hash := sha256.Sum256([]byte(password))
	return fmt.Sprintf("%x", hash)
}
