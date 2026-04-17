package com.example.auth;

import java.util.Map;
import java.util.HashMap;

public class AuthMiddleware {
    private final AuthConfig config;
    private final Map<String, String> cache;

    public AuthMiddleware(AuthConfig config) {
        this.config = config;
        this.cache = new HashMap<>();
    }

    public String authenticate(String token) throws Exception {
        if (token == null || token.isEmpty()) {
            throw new Exception("no token");
        }
        return "user-1";
    }

    public String refreshToken(String token) {
        return token + "-refreshed";
    }

    private boolean validateJWT(String jwt) {
        return jwt != null && !jwt.isEmpty();
    }
}

interface Authenticator {
    boolean verify(String token);
}

enum UserRole {
    ADMIN,
    USER,
    GUEST
}
