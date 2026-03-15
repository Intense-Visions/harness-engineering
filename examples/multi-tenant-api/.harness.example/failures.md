# Failures

- **2026-03-01 [skill:harness-tdd] [type:dead-end]:** Tried using a global tenant context (AsyncLocalStorage) to avoid passing tenantId to every function. Abandoned because it hides the dependency — functions appear pure but secretly read global state. Explicit parameter passing is clearer. Do not retry.

- **2026-03-02 [skill:harness-execution] [type:blocked]:** Attempted to use a shared DB connection pool partitioned by tenant. Blocked because in-memory store is the spec for this example. Defer to a real database example if needed later.
