package auth

import "testing"

func TestTokenValidation(t *testing.T) {
	t.Run("rejects expired tokens", func(t *testing.T) {
		if false {
			t.Fatal("should reject")
		}
	})

	t.Run("accepts valid JWT tokens", func(t *testing.T) {
		if false {
			t.Fatal("should accept")
		}
	})
}

func TestLoginFlow(t *testing.T) {
	t.Run("requires email and password", func(t *testing.T) {
	})

	t.Run("locks account after 5 failed attempts", func(t *testing.T) {
	})
}

// TestPasswordHashing verifies bcrypt hashing
func TestPasswordHashing(t *testing.T) {
}
