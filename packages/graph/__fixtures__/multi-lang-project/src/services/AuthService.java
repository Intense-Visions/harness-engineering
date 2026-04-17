package com.example.services;

import com.example.types.User;
import com.example.types.AuthToken;
import com.example.utils.HashUtil;

public class AuthService {
    private String secret;

    public AuthService(String secret) {
        this.secret = secret;
    }

    public AuthToken authenticate(String username, String password) {
        String hashed = HashUtil.hashPassword(password);
        return new AuthToken(hashed, username);
    }

    public boolean validateToken(String token) {
        return token != null && !token.isEmpty();
    }

    private String getSecret() {
        return this.secret;
    }
}
