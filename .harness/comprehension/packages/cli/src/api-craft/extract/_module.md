---
schemaVersion: 1
module: 'packages/cli/src/api-craft/extract'
sourceHash: 'a94554a0d302bf410a5d3c69909270e29ccbb4bd541884b9368ddeeee8c76746'
compiledAt: '2026-08-28T01:22:08.710Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['discover.ts']
---

## Summary

This module discovers API surfaces in a project—both OpenAPI/Swagger documents and route/handler code across common frameworks (Express, Fastify, Nest, Next.js, etc.). The key design: route code is included only when it carries a ROUTE_SIGNAL (cheap regex markers like `.get(`, `@Get()`, or exported `GET` handlers), filtering out helper modules under `src/api` that define no endpoints. The discovery visits API_ROOTS and OPENAPI_ROOTS in parallel, respects an exclude set, and deduplicates via a seen Set. Both paths use cheap filename heuristics to reject non-route files before I/O.

## Invariants

- ROUTE_SIGNAL is a gate, not validation — files under API_ROOTS that don't match the regex are discarded before full examination; the LLM never sees helper modules as API surfaces.
- isNonRouteFile() pre-filters before I/O — test/spec/type-declaration files are rejected by filename alone (.test.ts, \_\*.ts, index.ts) to avoid reading large files.
- Non-existent roots are silent no-ops — if src/api doesn't exist, it's skipped; a monorepo can have multiple API_ROOTS and only existing ones are walked.
- Deduplication spans both walks — the seen Set prevents a single file from being reported as both an OpenAPI spec and a route.
- classifyApiSurface() assumes pre-validation — it doesn't re-check the route signal; the caller must ensure the file already passed hasRouteSignal or is an OpenAPI spec.
- Path normalization is load-bearing — replaceAll('\\', '/') ensures relative paths are POSIX; downstream logic assumes forward slashes.
- OpenAPI content check is bounded — only the first 4000 chars are scanned for markers; markers always appear early in practice.
- opts overrides are an escape hatch — explicit specFile or routesDir bypass conventional discovery entirely, enabling non-standard layouts without code changes.

## Interface Contract

```ts
export API_ROOTS
export DEFAULT_EXCLUDED_DIRS
export OPENAPI_ROOTS
export classifyApiSurface
export discoverApiSurfaces
export hasRouteSignal
export isNonRouteFile
export isOpenApiSpec
```

## Dependency Slice

```
import { ApiSurfaceKind } from '../catalog/rubrics/types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
