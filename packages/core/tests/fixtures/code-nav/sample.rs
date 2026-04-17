use std::collections::HashMap;
use crate::config::Settings;

pub struct AuthConfig {
    pub secret: String,
    pub expires_in: u64,
}

pub struct AuthMiddleware {
    config: AuthConfig,
    cache: HashMap<String, String>,
}

impl AuthMiddleware {
    pub fn new(config: AuthConfig) -> Self {
        AuthMiddleware {
            config,
            cache: HashMap::new(),
        }
    }

    pub fn authenticate(&self, token: &str) -> Result<String, String> {
        if token.is_empty() {
            return Err("no token".to_string());
        }
        Ok("user-1".to_string())
    }

    fn validate_jwt(&self, jwt: &str) -> bool {
        !jwt.is_empty()
    }
}

pub trait Authenticator {
    fn verify(&self, token: &str) -> bool;
}

pub fn create_middleware(config: AuthConfig) -> AuthMiddleware {
    AuthMiddleware::new(config)
}

pub const DEFAULT_SECRET: &str = "dev";
