# Task API Principles

1. **Layered Architecture** — Types at the bottom, services in the middle, API on top. Dependencies flow downward only.
2. **TDD** — Tests first, implementation second. No code without a failing test.
3. **In-Memory First** — Use in-memory storage. Swap to a database later without changing the API layer.
4. **Type Safety** — All data structures defined as TypeScript interfaces. No `any`.
