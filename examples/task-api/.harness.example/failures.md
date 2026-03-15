# Failures

- **2026-03-15 [skill:harness-tdd] [type:dead-end]:** Attempted to use supertest for route testing but it requires a full Express app instance. Switched to testing service logic directly since routes are thin wrappers. Do not add supertest unless full integration tests are needed.
