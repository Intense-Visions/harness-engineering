# Multi-Tenant API Principles

1. **Tenant Isolation** — Every data operation must be scoped to a tenant. No query may access another tenant's data.
2. **Layered Architecture** — Four layers: types → middleware → services → api. Dependencies flow downward only.
3. **Boundary Validation** — All service functions validate their inputs with Zod schemas at the boundary.
4. **Explicit Context** — Tenant context is extracted in middleware and passed explicitly, never stored in globals.
5. **Defense in Depth** — Even if middleware fails, services reject requests without a valid tenantId.
