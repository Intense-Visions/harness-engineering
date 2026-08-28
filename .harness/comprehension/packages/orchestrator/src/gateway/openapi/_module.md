---
schemaVersion: 1
module: "packages/orchestrator/src/gateway/openapi"
sourceHash: "87914cf088185353f4c6295bc0bde676a6694e41eee163d20d1ea04d953d88f8"
compiledAt: "2026-08-28T01:22:12.189Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["generate.test.ts", "generate.ts", "registry.ts", "v1-registry.ts"]
---

## Summary

The `packages/orchestrator/src/gateway/openapi` module generates deterministic OpenAPI 3.1.0 documentation for the gateway API surface. It builds a unified registry spanning: Phase 1 auth routes (POST/GET/DELETE on `/api/v1/auth/*`), 10 legacy alias GET paths, Phase 2 bridge primitives (jobs/maintenance, interactions/{id}/resolve, events), Phase 3 webhooks, and Phase 4/5 stats endpoints. The main entry point `generateOpenApiYaml()` serializes to YAML with sorted keys and stable indentation, producing byte-identical output across runs. Auth and v1 registries are intentionally separated to avoid circular dependencies flagged by `harness check-deps`.

## Invariants

- Output is deterministic: JSON round-trip + sorted YAML generation ensures byte-identical, idempotent output across multiple runs
- Path count locked at 20 (3 auth + 10 legacy + 3 Phase 2 + 2 Phase 3 + 2 Phase 4/5 stats) as a silent-drift detector; route changes require explicit test update
- No circular imports: registry.ts has zero imports from v1-registry.ts; both compose independently via buildAuthRegistry()
- BearerAuth security scheme enforced with hardcoded format tok_<id>.<base64url> across all secure routes
- OpenAPI version 3.1.0 with info version pinned to 0.3.0 (Phase 3 artifact)
- Legacy endpoint schemas intentionally lightweight (z.unknown()) until Phase 4 unification; meaningful type narrowing deferred
- All paths document scope semantics in descriptions (read-status, trigger-job, resolve-interaction, etc.)
- YAML serialization uses sortMapEntries:true, indent:2, lineWidth:0 for bit-identical consistency

## Interface Contract

```ts
export buildAuthDocument
export buildAuthRegistry
export buildV1Document
export buildV1Registry
export generateOpenApiYaml
```

## Dependency Slice

```
import { generateOpenApiYaml } from './generate'
import { buildAuthRegistry } from './registry'
import { buildV1Document } from './v1-registry'
import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { AuthTokenPublicSchema, BridgeKindSchema, PromptCacheStatsSchema, TokenScopeSchema } from '@harness-engineering/types'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseYaml, stringify } from 'yaml'
import { z } from 'zod'
```
