---
'@harness-engineering/cli': patch
---

fix(cli): `manage_roadmap` (handleManageRoadmap) now returns its graceful `{ isError: true }` McpResponse when `path` is missing/non-string, instead of letting `sanitizePath` throw synchronously and reject the returned promise with an unhandled rejection.
