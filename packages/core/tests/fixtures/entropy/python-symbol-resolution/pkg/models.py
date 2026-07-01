from dataclasses import dataclass
from enum import Enum

TIMEOUT_SECONDS = 30


@dataclass
class CompanyKnowledge:
    dashboard_url: str = ""
    dashboard_token_env: str = "TOKEN"
    _private_cache: int = 0

    def refresh(self):
        return self.dashboard_url


class SuiteType(Enum):
    E2E_UI = "e2e_ui"
    PERFORMANCE = "performance"
