---
schemaVersion: 1
module: "packages/orchestrator/src/tracker/extensions"
sourceHash: "1b00d316cf3647fdeb8ccba38253572e2cad86f8c5828441652f6cd36d2f8ffb"
compiledAt: "2026-08-28T01:22:12.401Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["linear.test.ts", "linear.ts"]
---

## Summary

The `tracker/extensions` module provides an authenticated GraphQL client for Linear's API. It exports `LinearGraphQLClient`, a real implementation that POSTs GraphQL operations to Linear's endpoint with API key authentication, normalizing three failure modes (transport throws, non-2xx HTTP, GraphQL `errors` array) into a unified `Result<unknown, Error>` type. The module also exports `LinearGraphQLStub`, a deprecated Phase-4 placeholder that logs queries and returns empty objects—retained only for backward compatibility. The client is dependency-injected with a fetch function and optional custom endpoint, making it testable and adaptable to proxies.

## Invariants

- API key format is literal: the apiKey is sent verbatim in the Authorization header; OAuth tokens must be pre-prefixed by the caller with 'Bearer '
- All failures normalize to Result.Err: transport throws, non-2xx HTTP, and GraphQL errors arrays all resolve to Err, never throw
- GraphQL envelope.data extraction: on success, the data field is returned; if absent, an empty object {} is substituted
- HTTP error body is truncated to 500 chars in error messages; large responses don't bloat the error
- Variables object always present in POST body: even if undefined, the request includes variables: {} (never omitted)
- Default endpoint is hardcoded to https://api.linear.app/graphql; custom endpoint option overrides it
- Fetch is injectable: constructor accepts optional fetchFn for testing without network I/O
- LinearGraphQLStub is intentionally inert: only console.logs and returns Ok({data: {}}), retained only for Phase-4 backward compatibility

## Interface Contract

```ts
export LinearGraphQLClient
export LinearGraphQLStub
```

## Dependency Slice

```
import { LinearGraphQLClient } from './linear'
import { Err, Ok, Result } from '@harness-engineering/types'
import { describe, expect, it, vi } from 'vitest'
```
