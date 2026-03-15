# Tenant Isolation Specification

## Overview

All user data is scoped to a tenant. A tenant is identified by `X-Tenant-ID` header.

## Rules

1. Every API request must include `X-Tenant-ID` header
2. Middleware extracts and validates the tenant ID before any route handler runs
3. All service functions accept `tenantId` as their first parameter
4. The data store uses `tenantId` as a partition key — queries always filter by tenant
5. Attempting to access another tenant's data returns 404 (not 403, to avoid information leakage)

## Enforcement

- Middleware rejects requests without `X-Tenant-ID` with 401
- Service functions throw if `tenantId` is empty
- Integration tests verify cross-tenant isolation
