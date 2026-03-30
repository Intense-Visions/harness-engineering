from typing import Optional, List

class UserService:
    """Service for managing users."""

    def __init__(self, db_url: str):
        self.db_url = db_url
        self._cache: dict = {}

    def get_user(self, user_id: int) -> Optional[dict]:
        if user_id in self._cache:
            return self._cache[user_id]
        return None

    def list_users(self, limit: int = 10) -> List[dict]:
        return []

    def _validate(self, data: dict) -> bool:
        return 'name' in data

def create_service(db_url: str) -> UserService:
    return UserService(db_url)

DEFAULT_URL = "postgresql://localhost/users"
