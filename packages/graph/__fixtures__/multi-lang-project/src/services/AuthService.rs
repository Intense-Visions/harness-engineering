use crate::types::{User, AuthToken};
use crate::utils::hash::hash_password;

pub struct AuthService {
    secret: String,
}

pub fn create_auth_service(secret: String) -> AuthService {
    AuthService { secret }
}

impl AuthService {
    pub fn authenticate(&self, username: &str, password: &str) -> AuthToken {
        let hashed = hash_password(password);
        AuthToken {
            token: hashed,
            user: username.to_string(),
        }
    }

    pub fn validate_token(&self, token: &str) -> bool {
        !token.is_empty()
    }
}

pub const MAX_SESSIONS: u32 = 100;

pub trait Authenticator {
    fn login(&self, username: &str, password: &str) -> bool;
}
