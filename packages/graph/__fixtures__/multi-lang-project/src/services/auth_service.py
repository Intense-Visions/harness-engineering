from ..utils.hash import hash_password, verify_hash
from ..types import User, AuthToken

class AuthService:
    def __init__(self, secret: str):
        self._secret = secret

    def authenticate(self, username: str, password: str) -> AuthToken:
        hashed = hash_password(password)
        return {"token": hashed, "user": username}

    def validate_token(self, token: str) -> bool:
        return len(token) > 0

def create_auth_service(secret: str) -> AuthService:
    return AuthService(secret)

MAX_SESSIONS = 100
