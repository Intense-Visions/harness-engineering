# Plan: Hermes Phase 0 — Phase 1: Auth Foundation + OpenAPI Scaffolding

**Date:** 2026-05-14
**Spec:** `docs/changes/hermes-phase-0-gateway-api/proposal.md` (Phase 1 section, complexity: medium)
**Parent meta-spec:** `docs/changes/hermes-adoption/proposal.md`
**Roadmap item:** `github:Intense-Visions/harness-engineering#310`
**Starting commit:** `807805cebb1837dd4b362fb3ef91d85419de82e1`
**Session:** `changes--hermes-phase-0-gateway-api--proposal`
**Tasks:** 17
**Checkpoints:** 3
**Estimated time:** ~70 minutes
**Integration Tier:** large

## Goal

Land a multi-token, scope-aware auth substrate (token store + scope vocabulary + audit log + CLI + admin-create dashboard page) wired into the orchestrator's existing API surface, plus a zod-to-openapi scaffold that emits `docs/api/openapi.yaml` for the auth routes — without breaking the legacy `HARNESS_API_TOKEN` admin escape hatch.

## Observable Truths (Acceptance Criteria)

1. **The system shall persist tokens hashed at `.harness/tokens.json`.** Round-trip `write → read → verify` preserves all fields (`id`, `name`, `scopes[]`, optional `bridgeKind`, optional `tenantId`, `hashedSecret`, `createdAt`, optional `lastUsedAt`, optional `expiresAt`); raw secrets never written to disk. Verified by unit test `packages/orchestrator/src/auth/tokens.test.ts`.
2. **When the operator runs `harness gateway token create --name slack-bot --scopes trigger-job`,** the system shall print a JSON payload containing a one-time `token` field; subsequent `harness gateway token list` returns the same record with `hashedSecret` field absent. Verified by CLI integration test.
3. **When a bearer token with `read-status` scope is presented to `GET /api/state`,** the system shall return HTTP 200 and the orchestrator snapshot. When the same token is presented to a route requiring a different scope, the system shall return HTTP 403 with `{ error: "Insufficient scope" }`. Verified by `packages/orchestrator/src/server/http.test.ts`.
4. **Where `HARNESS_API_TOKEN` env var is set,** the system shall accept that exact bearer string and treat it as admin scope. Verified by regression test against existing legacy auth fixture.
5. **For every authenticated API request,** the system shall append one JSONL entry to `.harness/audit.log` with `{ timestamp, tokenId, tenantId, route, status }` — and never the request payload. If the audit write fails (disk full, permission error), the system shall log a `warn` and continue serving (best-effort). Verified by integration test that mocks `fs.appendFile` to throw.
6. **When `harness gateway openapi generate` runs,** the system shall write `docs/api/openapi.yaml` describing the three auth routes (`POST /api/v1/auth/token`, `GET /api/v1/auth/tokens`, `DELETE /api/v1/auth/tokens/{id}`). Re-running the command produces a byte-identical output (idempotent). Verified by CI `openapi-drift-check` job.
7. **The dashboard `/s/tokens` route shall list non-redacted tokens (excluding `hashedSecret`)** and provide a "Revoke" affordance per row. Verified by dashboard route test + visual checkpoint.
8. **The system shall NOT** allow a non-admin token to call `POST /api/v1/auth/token`, `GET /api/v1/auth/tokens`, or `DELETE /api/v1/auth/tokens/{id}`. Verified by scope-rejection test.

## Uncertainties

- **[ASSUMPTION]** Password hash algorithm: **bcrypt via `bcryptjs`** (pure-JS, no native build, ~30ms hash time at 12 rounds — acceptable for token create + once-per-request verify). If perf testing during Task 4 shows verify > 5ms p99, switch to argon2 via `@node-rs/argon2`. Spec leaves this open ("bcrypt or argon2 — TBD during S1").
- **[ASSUMPTION]** `zod-to-openapi` package: **`@asteasolutions/zod-to-openapi` ^7.x** (most mature, supports zod ^3.25, used widely). Added as a **devDependency** of `packages/orchestrator` (generate.ts is a build-time tool, not runtime). Spec only says "zod-to-openapi or equivalent".
- **[ASSUMPTION]** Token id format: `tok_<16 hex>` matches spec; generated via `crypto.randomBytes(8).toString('hex')`.
- **[DEFERRABLE]** Audit log rotation — handled by Phase 2 cleanup-sessions extension; Phase 1 only writes.
- **[DEFERRABLE]** Per-token rate limiting — existing per-IP limiter untouched; future work if abuse seen.
- **[DEFERRABLE]** OpenAPI artifact rendering (Redocly/Swagger UI) — Phase 1 only produces the YAML file; rendering is a docs concern handled by README updates in Phase 0 finalization.
- **[BLOCKING — None.]** All blocking questions were resolved in the spec's "Decisions Made" section before this plan.

## Skill Annotations Active

From `docs/changes/hermes-phase-0-gateway-api/SKILLS.md`:

- **Apply tier:** `ts-zod-integration` (Tasks 1, 8, 9)
- **Reference tier:** `node-crypto-patterns` (Tasks 3, 5), `gof-chain-of-responsibility` (Tasks 5, 6, 7), `owasp-security-headers` (Task 7), `ts-testing-types` (Tasks 2, 4, 6)

## File Map

**CREATE (12):**

- `packages/types/src/auth.ts` — Zod schemas: `AuthToken`, `TokenScope`, `AuthAuditEntry`
- `packages/orchestrator/src/auth/index.ts` — barrel
- `packages/orchestrator/src/auth/tokens.ts` — CRUD + hash/verify
- `packages/orchestrator/src/auth/tokens.test.ts`
- `packages/orchestrator/src/auth/scopes.ts` — `SCOPE_VOCABULARY` + middleware
- `packages/orchestrator/src/auth/scopes.test.ts`
- `packages/orchestrator/src/auth/audit.ts` — append-only JSONL writer
- `packages/orchestrator/src/auth/audit.test.ts`
- `packages/orchestrator/src/gateway/openapi/registry.ts` — zod-to-openapi wrapper
- `packages/orchestrator/src/gateway/openapi/generate.ts` — emit `docs/api/openapi.yaml`
- `packages/cli/src/commands/gateway/index.ts` — `gateway` subcommand group
- `packages/cli/src/commands/gateway/token.ts` — `gateway token create/list/revoke`
- `packages/cli/src/commands/gateway/openapi.ts` — `gateway openapi generate` (build helper, registered for parity)
- `packages/cli/src/commands/gateway/token.test.ts`
- `packages/dashboard/src/server/routes/tokens.ts` — backend for `/s/tokens` page
- `packages/dashboard/src/client/pages/Tokens.tsx`
- `docs/api/openapi.yaml` — generated artifact (initial commit covers auth routes only)
- `.github/workflows/openapi-drift-check.yml` — CI job

**MODIFY (6):**

- `packages/types/src/index.ts` — export from `./auth`
- `packages/orchestrator/src/server/http.ts` — replace `checkAuth()` (lines 269-281) with token-store + scope middleware; thread scope-check into `handleApiRoutes()` (lines 313-320)
- `packages/orchestrator/package.json` — add `bcryptjs` dep + `@asteasolutions/zod-to-openapi` devDep + `@types/bcryptjs` devDep
- `packages/cli/src/commands/_registry.ts` — register `createGatewayCommand`
- `packages/dashboard/src/server/index.ts` — mount `buildTokensRouter(ctx)`
- `packages/dashboard/src/client/components/layout/ThreadView.tsx` — register `tokens: Tokens` in `SYSTEM_PAGE_COMPONENTS`

**Evidence:** `packages/orchestrator/src/server/http.ts:269-281` (existing `checkAuth()`); `packages/orchestrator/src/server/http.ts:313-320` (existing `handleApiRoutes()`); `packages/types/src/index.ts:99-139` (barrel pattern); `packages/cli/src/commands/agent/index.ts:1-12` (subcommand group pattern); `packages/dashboard/src/client/components/layout/ThreadView.tsx:99-119` (SystemRoute registration).

## Skeleton

1. Types foundation (1 task, ~5 min)
2. Auth core: hash/store, scopes, audit (6 tasks, ~25 min) `[checkpoint:human-verify after Task 5]`
3. HTTP middleware wire-up (2 tasks, ~10 min) `[checkpoint:human-verify after Task 7]`
4. CLI: gateway subcommand group (3 tasks, ~12 min)
5. OpenAPI scaffolding + initial artifact (2 tasks, ~10 min) `[checkpoint:human-verify after Task 12]`
6. Dashboard `/s/tokens` page (2 tasks, ~10 min)
7. CI drift-check + final validation (1 task, ~5 min)

**Total:** 17 tasks, ~70 min.

_Skeleton approved:_ pending — see Phase 4 sign-off step.

---

## Tasks

### Task 1: Define AuthToken, TokenScope, AuthAuditEntry Zod schemas in @harness-engineering/types

**Depends on:** none
**Files:** `packages/types/src/auth.ts`, `packages/types/src/index.ts`
**Skills:** `ts-zod-integration` (apply)

1. Create `packages/types/src/auth.ts` with exact contents:

   ```ts
   import { z } from 'zod';

   /**
    * Scope vocabulary for Gateway API tokens. Version-pinned in
    * packages/orchestrator/src/auth/scopes.ts; changes require an ADR.
    */
   export const TokenScopeSchema = z.enum([
     'admin',
     'trigger-job',
     'read-status',
     'resolve-interaction',
     'subscribe-webhook',
     'modify-roadmap',
     'read-telemetry',
   ]);
   export type TokenScope = z.infer<typeof TokenScopeSchema>;

   export const BridgeKindSchema = z.enum(['slack', 'discord', 'github-app', 'custom']);
   export type BridgeKind = z.infer<typeof BridgeKindSchema>;

   /**
    * Persisted auth token. The raw secret is shown once at creation and
    * never stored — only `hashedSecret` lives in `.harness/tokens.json`.
    */
   export const AuthTokenSchema = z.object({
     id: z.string().regex(/^tok_[a-f0-9]{16}$/),
     name: z.string().min(1).max(100),
     scopes: z.array(TokenScopeSchema).min(1),
     bridgeKind: BridgeKindSchema.optional(),
     tenantId: z.string().optional(),
     hashedSecret: z.string().min(1),
     createdAt: z.string().datetime(),
     lastUsedAt: z.string().datetime().optional(),
     expiresAt: z.string().datetime().optional(),
   });
   export type AuthToken = z.infer<typeof AuthTokenSchema>;

   /** Public-facing view: hashedSecret stripped. */
   export const AuthTokenPublicSchema = AuthTokenSchema.omit({ hashedSecret: true });
   export type AuthTokenPublic = z.infer<typeof AuthTokenPublicSchema>;

   /** Append-only JSONL audit entry. NO payload contents — only route + status. */
   export const AuthAuditEntrySchema = z.object({
     timestamp: z.string().datetime(),
     tokenId: z.string(),
     tenantId: z.string().optional(),
     route: z.string(),
     method: z.string(),
     status: z.number().int(),
   });
   export type AuthAuditEntry = z.infer<typeof AuthAuditEntrySchema>;
   ```

2. Add the export block to `packages/types/src/index.ts` immediately after the `// --- Maintenance ---` block:

   ```ts
   // --- Auth (Hermes Phase 0) ---
   export {
     TokenScopeSchema,
     BridgeKindSchema,
     AuthTokenSchema,
     AuthTokenPublicSchema,
     AuthAuditEntrySchema,
   } from './auth';
   export type { TokenScope, BridgeKind, AuthToken, AuthTokenPublic, AuthAuditEntry } from './auth';
   ```

3. Run: `pnpm --filter @harness-engineering/types typecheck`
4. Run: `pnpm --filter @harness-engineering/types build`
5. Run: `harness validate`
6. Commit: `feat(types): add AuthToken, TokenScope, AuthAuditEntry schemas for Hermes Phase 0`

---

### Task 2 (TDD): Token store skeleton — write failing test for create/list/get/revoke

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/auth/tokens.test.ts`
**Skills:** `ts-testing-types` (reference)

1. Add dev dependencies. Edit `packages/orchestrator/package.json` — `dependencies` add `"bcryptjs": "^2.4.3"`; `devDependencies` add `"@types/bcryptjs": "^2.4.6"`.
2. Run: `pnpm install`
3. Create `packages/orchestrator/src/auth/tokens.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { mkdtempSync, rmSync, existsSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { TokenStore } from './tokens';

   let dir: string;
   beforeEach(() => {
     dir = mkdtempSync(join(tmpdir(), 'harness-tokens-'));
   });
   afterEach(() => {
     rmSync(dir, { recursive: true, force: true });
   });

   describe('TokenStore', () => {
     it('create() returns id + one-time secret + persisted record', async () => {
       const store = new TokenStore(join(dir, 'tokens.json'));
       const { id, token, record } = await store.create({
         name: 'slack-bot',
         scopes: ['trigger-job'],
       });
       expect(id).toMatch(/^tok_[a-f0-9]{16}$/);
       expect(token).toMatch(/^tok_[a-f0-9]{16}\.[A-Za-z0-9_-]+$/);
       expect(record.hashedSecret).not.toContain(token.split('.')[1]);
       expect(existsSync(join(dir, 'tokens.json'))).toBe(true);
     });

     it('verify() resolves to the matching record for a valid token', async () => {
       const store = new TokenStore(join(dir, 'tokens.json'));
       const { token } = await store.create({ name: 'x', scopes: ['read-status'] });
       const result = await store.verify(token);
       expect(result?.name).toBe('x');
     });

     it('verify() returns null for an invalid secret', async () => {
       const store = new TokenStore(join(dir, 'tokens.json'));
       const { id } = await store.create({ name: 'x', scopes: ['read-status'] });
       const result = await store.verify(`${id}.bogus`);
       expect(result).toBeNull();
     });

     it('verify() returns null for an expired token', async () => {
       const store = new TokenStore(join(dir, 'tokens.json'));
       const { token } = await store.create({
         name: 'x',
         scopes: ['read-status'],
         expiresAt: new Date(Date.now() - 1000).toISOString(),
       });
       expect(await store.verify(token)).toBeNull();
     });

     it('list() redacts hashedSecret', async () => {
       const store = new TokenStore(join(dir, 'tokens.json'));
       await store.create({ name: 'a', scopes: ['admin'] });
       const list = await store.list();
       expect(list[0]).toBeDefined();
       expect(list[0] as object).not.toHaveProperty('hashedSecret');
     });

     it('revoke(id) removes the token; verify() then returns null', async () => {
       const store = new TokenStore(join(dir, 'tokens.json'));
       const { id, token } = await store.create({ name: 'x', scopes: ['admin'] });
       expect(await store.revoke(id)).toBe(true);
       expect(await store.verify(token)).toBeNull();
       expect(await store.revoke(id)).toBe(false);
     });

     it('legacyEnvToken() returns admin record when HARNESS_API_TOKEN matches', async () => {
       const store = new TokenStore(join(dir, 'tokens.json'));
       const rec = store.legacyEnvToken('supersecret', 'supersecret');
       expect(rec?.scopes).toContain('admin');
       expect(rec?.id).toBe('tok_legacy_env');
       expect(store.legacyEnvToken('wrong', 'supersecret')).toBeNull();
       expect(store.legacyEnvToken('any', undefined)).toBeNull();
     });
   });
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/auth/tokens.test.ts` — **observe failure** (`TokenStore` not implemented).
5. **Do not commit yet** — Task 3 implements `tokens.ts` and commits together.

---

### Task 3: Implement TokenStore to make Task 2 tests pass

**Depends on:** Task 2
**Files:** `packages/orchestrator/src/auth/tokens.ts`, `packages/orchestrator/src/auth/index.ts`
**Skills:** `ts-zod-integration` (apply), `node-crypto-patterns` (reference)

1. Create `packages/orchestrator/src/auth/tokens.ts`:

   ```ts
   import { randomBytes, timingSafeEqual } from 'node:crypto';
   import { readFile, writeFile, mkdir } from 'node:fs/promises';
   import { dirname } from 'node:path';
   import bcrypt from 'bcryptjs';
   import {
     AuthTokenSchema,
     AuthTokenPublicSchema,
     type AuthToken,
     type AuthTokenPublic,
     type TokenScope,
   } from '@harness-engineering/types';

   const BCRYPT_ROUNDS = 12;
   const LEGACY_ENV_ID = 'tok_legacy_env';

   export interface CreateTokenInput {
     name: string;
     scopes: TokenScope[];
     bridgeKind?: AuthToken['bridgeKind'];
     tenantId?: string;
     expiresAt?: string;
   }

   export interface CreateTokenResult {
     id: string;
     token: string; // shown once
     record: AuthToken;
   }

   function genId(): string {
     return `tok_${randomBytes(8).toString('hex')}`;
   }

   function genSecret(): string {
     return randomBytes(24).toString('base64url');
   }

   function parseToken(raw: string): { id: string; secret: string } | null {
     const dot = raw.indexOf('.');
     if (dot < 0) return null;
     return { id: raw.slice(0, dot), secret: raw.slice(dot + 1) };
   }

   export class TokenStore {
     private cache: AuthToken[] | null = null;
     constructor(private readonly path: string) {}

     private async load(): Promise<AuthToken[]> {
       if (this.cache) return this.cache;
       try {
         const raw = await readFile(this.path, 'utf8');
         const parsed = JSON.parse(raw) as unknown;
         const list = Array.isArray(parsed) ? parsed : [];
         this.cache = list
           .map((entry) => {
             const r = AuthTokenSchema.safeParse(entry);
             return r.success ? r.data : null;
           })
           .filter((x): x is AuthToken => x !== null);
       } catch (err) {
         if ((err as NodeJS.ErrnoException).code === 'ENOENT') this.cache = [];
         else throw err;
       }
       return this.cache;
     }

     private async persist(records: AuthToken[]): Promise<void> {
       await mkdir(dirname(this.path), { recursive: true });
       await writeFile(this.path, JSON.stringify(records, null, 2), 'utf8');
       this.cache = records;
     }

     async create(input: CreateTokenInput): Promise<CreateTokenResult> {
       const id = genId();
       const secret = genSecret();
       const hashedSecret = await bcrypt.hash(secret, BCRYPT_ROUNDS);
       const record: AuthToken = {
         id,
         name: input.name,
         scopes: input.scopes,
         ...(input.bridgeKind ? { bridgeKind: input.bridgeKind } : {}),
         ...(input.tenantId ? { tenantId: input.tenantId } : {}),
         hashedSecret,
         createdAt: new Date().toISOString(),
         ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
       };
       const records = await this.load();
       if (records.some((r) => r.name === input.name)) {
         throw new Error(`Token with name "${input.name}" already exists`);
       }
       await this.persist([...records, record]);
       return { id, token: `${id}.${secret}`, record };
     }

     async verify(raw: string): Promise<AuthToken | null> {
       const parsed = parseToken(raw);
       if (!parsed) return null;
       const records = await this.load();
       const rec = records.find((r) => r.id === parsed.id);
       if (!rec) return null;
       if (rec.expiresAt && Date.parse(rec.expiresAt) <= Date.now()) return null;
       const ok = await bcrypt.compare(parsed.secret, rec.hashedSecret);
       if (!ok) return null;
       await this.touchLastUsed(rec.id);
       return rec;
     }

     private async touchLastUsed(id: string): Promise<void> {
       const records = await this.load();
       const idx = records.findIndex((r) => r.id === id);
       if (idx < 0) return;
       const current = records[idx];
       if (!current) return;
       const next: AuthToken = { ...current, lastUsedAt: new Date().toISOString() };
       const out = records.slice();
       out[idx] = next;
       await this.persist(out);
     }

     async list(): Promise<AuthTokenPublic[]> {
       const records = await this.load();
       return records.map((r) => AuthTokenPublicSchema.parse(r));
     }

     async revoke(id: string): Promise<boolean> {
       const records = await this.load();
       const next = records.filter((r) => r.id !== id);
       if (next.length === records.length) return false;
       await this.persist(next);
       return true;
     }

     /**
      * Synthetic admin record for the legacy HARNESS_API_TOKEN escape hatch.
      * Returned only when `presented` matches `envValue` byte-for-byte (constant-time).
      */
     legacyEnvToken(presented: string, envValue: string | undefined): AuthToken | null {
       if (!envValue) return null;
       const a = Buffer.from(presented);
       const b = Buffer.from(envValue);
       if (a.length !== b.length) return null;
       if (!timingSafeEqual(a, b)) return null;
       return {
         id: LEGACY_ENV_ID,
         name: 'legacy-env',
         scopes: ['admin'],
         hashedSecret: '<env>',
         createdAt: new Date(0).toISOString(),
       };
     }
   }
   ```

2. Create `packages/orchestrator/src/auth/index.ts`:

   ```ts
   export { TokenStore } from './tokens';
   export type { CreateTokenInput, CreateTokenResult } from './tokens';
   ```

3. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/auth/tokens.test.ts` — **observe pass.**
4. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
5. Run: `harness validate && harness check-deps`
6. Commit: `feat(orchestrator): add TokenStore with bcrypt-hashed secrets and legacy env compat`

---

### Task 4 (TDD): Scope-check middleware — failing test then implementation

**Depends on:** Task 3
**Files:** `packages/orchestrator/src/auth/scopes.test.ts`, `packages/orchestrator/src/auth/scopes.ts`
**Skills:** `gof-chain-of-responsibility` (reference), `ts-testing-types` (reference)

1. Create `packages/orchestrator/src/auth/scopes.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { SCOPE_VOCABULARY, requiredScopeForRoute, hasScope } from './scopes';

   describe('SCOPE_VOCABULARY', () => {
     it('contains exactly the seven scopes pinned in the spec', () => {
       expect([...SCOPE_VOCABULARY].sort()).toEqual([
         'admin',
         'modify-roadmap',
         'read-status',
         'read-telemetry',
         'resolve-interaction',
         'subscribe-webhook',
         'trigger-job',
       ]);
     });
   });

   describe('requiredScopeForRoute', () => {
     it('maps auth-admin routes', () => {
       expect(requiredScopeForRoute('POST', '/api/v1/auth/token')).toBe('admin');
       expect(requiredScopeForRoute('GET', '/api/v1/auth/tokens')).toBe('admin');
       expect(requiredScopeForRoute('DELETE', '/api/v1/auth/tokens/tok_abc')).toBe('admin');
     });
     it('maps read-status to /api/state and /api/v1/state', () => {
       expect(requiredScopeForRoute('GET', '/api/state')).toBe('read-status');
       expect(requiredScopeForRoute('GET', '/api/v1/state')).toBe('read-status');
     });
     it('returns null for unknown routes (default-deny upstream)', () => {
       expect(requiredScopeForRoute('GET', '/api/unknown')).toBeNull();
     });
   });

   describe('hasScope', () => {
     it('admin satisfies any scope', () => {
       expect(hasScope(['admin'], 'trigger-job')).toBe(true);
     });
     it('non-admin must hold the exact scope', () => {
       expect(hasScope(['read-status'], 'trigger-job')).toBe(false);
       expect(hasScope(['trigger-job'], 'trigger-job')).toBe(true);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/auth/scopes.test.ts` — **observe failure.**
3. Create `packages/orchestrator/src/auth/scopes.ts`:

   ```ts
   import type { TokenScope } from '@harness-engineering/types';

   /**
    * Pinned scope vocabulary. Changes require an ADR per spec D2.
    * Mirror in @harness-engineering/types/src/auth.ts → TokenScopeSchema.
    */
   export const SCOPE_VOCABULARY: readonly TokenScope[] = [
     'admin',
     'trigger-job',
     'read-status',
     'resolve-interaction',
     'subscribe-webhook',
     'modify-roadmap',
     'read-telemetry',
   ] as const;

   /** Returns true if `held` contains `required`, or includes 'admin'. */
   export function hasScope(held: TokenScope[], required: TokenScope): boolean {
     if (held.includes('admin')) return true;
     return held.includes(required);
   }

   /**
    * Resolve the scope required for a given method + path. Returns null for
    * unknown routes — callers MUST default-deny (return 403) on null.
    *
    * Phase 1 covers only the routes mounted today + the three new
    * auth-admin routes. Phase 2 extends with /api/v1/* primitives.
    */
   export function requiredScopeForRoute(method: string, path: string): TokenScope | null {
     // Auth admin routes
     if (path === '/api/v1/auth/token' && method === 'POST') return 'admin';
     if (path === '/api/v1/auth/tokens' && method === 'GET') return 'admin';
     if (/^\/api\/v1\/auth\/tokens\/[^/]+$/.test(path) && method === 'DELETE') return 'admin';

     // State endpoint (legacy + v1)
     if ((path === '/api/state' || path === '/api/v1/state') && method === 'GET')
       return 'read-status';

     // Existing routes — Phase 1 default mapping
     if (path.startsWith('/api/interactions')) return 'resolve-interaction';
     if (path.startsWith('/api/plans')) return 'read-status';
     if (path.startsWith('/api/analyze') || path.startsWith('/api/analyses')) return 'read-status';
     if (path.startsWith('/api/roadmap-actions')) return 'modify-roadmap';
     if (path.startsWith('/api/dispatch-actions')) return 'trigger-job';
     if (path.startsWith('/api/local-model') || path.startsWith('/api/local-models'))
       return 'read-status';
     if (path.startsWith('/api/maintenance')) return 'trigger-job';
     if (path.startsWith('/api/streams')) return 'read-status';
     if (path.startsWith('/api/sessions')) return 'read-status';
     if (path.startsWith('/api/chat-proxy')) return 'trigger-job';

     return null;
   }
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/auth/scopes.test.ts` — **observe pass.**
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add SCOPE_VOCABULARY and route→scope mapping`

---

### Task 5 (TDD): Audit log writer — failing test then implementation

**Depends on:** Task 4
**Files:** `packages/orchestrator/src/auth/audit.test.ts`, `packages/orchestrator/src/auth/audit.ts`
**Skills:** `node-crypto-patterns` (reference), `gof-chain-of-responsibility` (reference)

1. Create `packages/orchestrator/src/auth/audit.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { AuditLogger } from './audit';

   let dir: string;
   beforeEach(() => {
     dir = mkdtempSync(join(tmpdir(), 'harness-audit-'));
   });
   afterEach(() => {
     rmSync(dir, { recursive: true, force: true });
   });

   describe('AuditLogger', () => {
     it('appends one JSONL line per call', async () => {
       const path = join(dir, 'audit.log');
       const logger = new AuditLogger(path);
       await logger.append({ tokenId: 'tok_abc', route: '/api/state', method: 'GET', status: 200 });
       await logger.append({
         tokenId: 'tok_def',
         route: '/api/state',
         method: 'GET',
         status: 401,
         tenantId: 't1',
       });
       await logger.flush();
       const lines = readFileSync(path, 'utf8').trim().split('\n');
       expect(lines).toHaveLength(2);
       const first = JSON.parse(lines[0] as string);
       expect(first.tokenId).toBe('tok_abc');
       expect(first.status).toBe(200);
       expect(first.timestamp).toMatch(/T.*Z$/);
       expect(first).not.toHaveProperty('payload');
       expect(first).not.toHaveProperty('body');
     });

     it('continues silently when the write fails (best-effort)', async () => {
       const path = join(dir, 'subdir-does-not-exist', 'audit.log');
       const logger = new AuditLogger(path, { createDir: false });
       const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
       await logger.append({ tokenId: 't', route: '/api/x', method: 'GET', status: 200 });
       await logger.flush();
       expect(warnSpy).toHaveBeenCalled();
       warnSpy.mockRestore();
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/auth/audit.test.ts` — **observe failure.**
3. Create `packages/orchestrator/src/auth/audit.ts`:

   ```ts
   import { appendFile, mkdir } from 'node:fs/promises';
   import { dirname } from 'node:path';
   import { AuthAuditEntrySchema, type AuthAuditEntry } from '@harness-engineering/types';

   export interface AuditAppendInput {
     tokenId: string;
     tenantId?: string;
     route: string;
     method: string;
     status: number;
   }

   export interface AuditLoggerOptions {
     /** Create the parent directory on first write (default true). */
     createDir?: boolean;
   }

   /**
    * Append-only JSONL writer for `.harness/audit.log`.
    *
    * Audit is best-effort: write failures (ENOSPC, EACCES, etc.) emit a
    * console.warn and DO NOT throw. The handler must keep serving.
    *
    * Forbidden by spec: NO request payload or body in the entry.
    */
   export class AuditLogger {
     private queue: Promise<void> = Promise.resolve();
     private dirEnsured = false;

     constructor(
       private readonly path: string,
       private readonly opts: AuditLoggerOptions = {}
     ) {}

     async append(input: AuditAppendInput): Promise<void> {
       const entry: AuthAuditEntry = AuthAuditEntrySchema.parse({
         timestamp: new Date().toISOString(),
         tokenId: input.tokenId,
         ...(input.tenantId ? { tenantId: input.tenantId } : {}),
         route: input.route,
         method: input.method,
         status: input.status,
       });
       const line = `${JSON.stringify(entry)}\n`;
       // Serialize writes to prevent interleaving; never block caller on a fault.
       this.queue = this.queue.then(() => this.writeLine(line)).catch(() => undefined);
     }

     /** Wait for queued writes to drain. Test-only; not called on the hot path. */
     async flush(): Promise<void> {
       await this.queue;
     }

     private async writeLine(line: string): Promise<void> {
       try {
         if (this.opts.createDir !== false && !this.dirEnsured) {
           await mkdir(dirname(this.path), { recursive: true });
           this.dirEnsured = true;
         }
         await appendFile(this.path, line, 'utf8');
       } catch (err) {
         console.warn(`[audit] write failed: ${(err as Error).message}`);
       }
     }
   }
   ```

4. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/auth/audit.test.ts` — **observe pass.**
5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
6. Run: `harness validate`
7. Commit: `feat(orchestrator): add append-only AuditLogger with best-effort write semantics`

---

### Task 6 (TDD): Server auth middleware integration test — replace checkAuth() failing scope path

`[checkpoint:human-verify]` After this task lands, pause and confirm: (a) bcryptjs choice acceptable; (b) token-and-secret format `tok_<id>.<base64url>` acceptable; (c) ready to wire into http.ts in Task 7.

**Depends on:** Task 5
**Files:** `packages/orchestrator/src/server/http.test.ts` (new or extended)
**Skills:** `ts-testing-types` (reference)

1. Check whether `packages/orchestrator/src/server/http.test.ts` already exists. If yes, append a new `describe('Phase 1 auth middleware', …)` block; otherwise create the file.
2. Add the following test block (adjust the import path/style to match existing test conventions if file exists):

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { mkdtempSync, rmSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import http from 'node:http';
   import { OrchestratorServer } from './http';
   import { TokenStore } from '../auth/tokens';

   class FakeOrchestrator {
     getSnapshot() {
       return { ok: true };
     }
     on() {}
     removeListener() {}
   }

   let dir: string;
   let server: OrchestratorServer;
   let port: number;
   let store: TokenStore;

   async function request(
     p: string,
     headers: Record<string, string> = {}
   ): Promise<{ status: number; body: string }> {
     return new Promise((resolve, reject) => {
       const req = http.request(
         { host: '127.0.0.1', port, path: p, method: 'GET', headers },
         (res) => {
           let body = '';
           res.on('data', (c) => (body += c));
           res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
         }
       );
       req.on('error', reject);
       req.end();
     });
   }

   describe('Phase 1 auth middleware', () => {
     beforeEach(async () => {
       dir = mkdtempSync(join(tmpdir(), 'harness-http-'));
       process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
       process.env['HARNESS_AUDIT_PATH'] = join(dir, 'audit.log');
       delete process.env['HARNESS_API_TOKEN'];
       store = new TokenStore(process.env['HARNESS_TOKENS_PATH'] as string);
       server = new OrchestratorServer(new FakeOrchestrator() as never, 0);
       port = await new Promise<number>((resolve) => {
         (server as unknown as { httpServer: http.Server }).httpServer.listen(
           0,
           '127.0.0.1',
           function (this: http.Server) {
             const addr = this.address();
             resolve(typeof addr === 'object' && addr ? addr.port : 0);
           }
         );
       });
     });
     afterEach(() => {
       (server as unknown as { httpServer: http.Server }).httpServer.close();
       rmSync(dir, { recursive: true, force: true });
     });

     it('GET /api/state returns 401 without a token (when tokens.json non-empty)', async () => {
       await store.create({ name: 'x', scopes: ['read-status'] });
       const res = await request('/api/state');
       expect(res.status).toBe(401);
     });

     it('GET /api/state returns 200 with a read-status bearer token', async () => {
       const { token } = await store.create({ name: 'x', scopes: ['read-status'] });
       const res = await request('/api/state', { authorization: `Bearer ${token}` });
       expect(res.status).toBe(200);
     });

     it('GET /api/state returns 403 with a non-matching scope', async () => {
       const { token } = await store.create({ name: 'x', scopes: ['trigger-job'] });
       const res = await request('/api/state', { authorization: `Bearer ${token}` });
       expect(res.status).toBe(403);
     });

     it('HARNESS_API_TOKEN env var still authenticates as admin', async () => {
       process.env['HARNESS_API_TOKEN'] = 'legacy-secret-xyz';
       const res = await request('/api/state', { authorization: 'Bearer legacy-secret-xyz' });
       expect(res.status).toBe(200);
       delete process.env['HARNESS_API_TOKEN'];
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/http.test.ts` — **observe failure** (middleware not yet replaced).
4. **Do not commit yet** — Task 7 wires the middleware and they commit together.

---

### Task 7: Replace checkAuth() in http.ts with TokenStore + scope middleware + audit

**Depends on:** Task 6
**Files:** `packages/orchestrator/src/server/http.ts`
**Skills:** `gof-chain-of-responsibility` (reference), `owasp-security-headers` (reference)

`[checkpoint:human-verify]` After diff is staged: walk the user through the http.ts diff (one localized edit, lines 269-320 region) and confirm legacy `HARNESS_API_TOKEN` path still resolves to admin scope.

1. Open `packages/orchestrator/src/server/http.ts`. Add imports at the top alongside existing imports:

   ```ts
   import { TokenStore } from '../auth/tokens';
   import { AuditLogger } from '../auth/audit';
   import { hasScope, requiredScopeForRoute } from '../auth/scopes';
   import type { AuthToken } from '@harness-engineering/types';
   ```

2. Inside the `OrchestratorServer` class, add two private fields next to existing private fields (e.g., near `private recorder`):

   ```ts
   private tokenStore: TokenStore;
   private auditLogger: AuditLogger;
   ```

3. In the constructor (`constructor(orchestrator, port, deps?)`) immediately before `this.httpServer = http.createServer(...)`, initialize them:

   ```ts
   const tokensPath = process.env['HARNESS_TOKENS_PATH'] ?? path.resolve('.harness', 'tokens.json');
   const auditPath = process.env['HARNESS_AUDIT_PATH'] ?? path.resolve('.harness', 'audit.log');
   this.tokenStore = new TokenStore(tokensPath);
   this.auditLogger = new AuditLogger(auditPath);
   ```

4. Replace the existing `checkAuth(req, res)` method (lines 269-281) with the following:

   ```ts
   /**
    * Phase 1 auth: bearer token lookup against TokenStore + scope check.
    * Legacy HARNESS_API_TOKEN env var still authenticates as a synthetic
    * admin record (see TokenStore.legacyEnvToken).
    *
    * Returns the resolved AuthToken on success; sends 401/403 + returns null on failure.
    */
   private async resolveAuth(
     req: http.IncomingMessage,
     res: http.ServerResponse
   ): Promise<AuthToken | null> {
     const authHeader = req.headers['authorization'];
     const legacyEnv = process.env['HARNESS_API_TOKEN'];

     // Tokens file empty AND no env var → unauthenticated mode (localhost dev).
     const listed = await this.tokenStore.list().catch(() => []);
     if (listed.length === 0 && !legacyEnv) {
       return { id: 'tok_unauth_dev', name: 'unauth-dev', scopes: ['admin'], hashedSecret: '<none>', createdAt: new Date(0).toISOString() };
     }

     if (!authHeader || !authHeader.startsWith('Bearer ')) {
       res.writeHead(401, { 'Content-Type': 'application/json' });
       res.end(JSON.stringify({ error: 'Unauthorized — set Authorization: Bearer <token>' }));
       return null;
     }
     const raw = authHeader.slice('Bearer '.length).trim();

     const legacyMatch = this.tokenStore.legacyEnvToken(raw, legacyEnv);
     if (legacyMatch) return legacyMatch;

     const verified = await this.tokenStore.verify(raw);
     if (!verified) {
       res.writeHead(401, { 'Content-Type': 'application/json' });
       res.end(JSON.stringify({ error: 'Unauthorized — invalid or expired token' }));
       return null;
     }
     return verified;
   }
   ```

5. Replace `handleApiRoutes(req, res)` (lines 313-320) with the async-aware version that resolves auth, checks scope, dispatches, and audits:

   ```ts
   private handleApiRoutes(req: http.IncomingMessage, res: http.ServerResponse): boolean {
     // Async dispatch — return true immediately and resolve the request in the background.
     void this.dispatchAuthedRequest(req, res);
     return true;
   }

   private async dispatchAuthedRequest(
     req: http.IncomingMessage,
     res: http.ServerResponse
   ): Promise<void> {
     const token = await this.resolveAuth(req, res);
     if (!token) {
       this.audit(req, res, null);
       return;
     }
     const required = requiredScopeForRoute(req.method ?? 'GET', req.url ?? '');
     if (required && !hasScope(token.scopes, required)) {
       res.writeHead(403, { 'Content-Type': 'application/json' });
       res.end(JSON.stringify({ error: 'Insufficient scope', required }));
       this.audit(req, res, token);
       return;
     }
     for (const route of this.apiRoutes) {
       if (route(req, res)) {
         this.audit(req, res, token);
         return;
       }
     }
     // No route matched — fall through to 404 (handleRequest emits it).
     this.audit(req, res, token);
   }

   private audit(req: http.IncomingMessage, res: http.ServerResponse, token: AuthToken | null): void {
     void this.auditLogger.append({
       tokenId: token?.id ?? 'anonymous',
       ...(token?.tenantId ? { tenantId: token.tenantId } : {}),
       route: (req.url ?? '').split('?')[0] ?? '',
       method: req.method ?? 'GET',
       status: res.statusCode || 0,
     });
   }
   ```

6. **Also: handle the state endpoint correctly.** `handleStateEndpoint(req, res)` runs BEFORE auth check today. Move the call inside `dispatchAuthedRequest` after auth resolution: remove the early-return in `handleRequest()` (line 231-233) and instead let `dispatchAuthedRequest` recognize `/api/state` & `/api/v1/state` paths and respond. **Caveat:** because the state endpoint was exempt from rate-limit on purpose (line 235 comment), keep the rate-limit exemption check but require auth.

   Concretely, modify `handleRequest`:

   ```ts
   private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
     const isState = req.method === 'GET' && (req.url === '/api/state' || req.url === '/api/v1/state');
     if (!isState && !checkRateLimit(req, res)) return;

     if (this.handleApiRoutes(req, res)) return;

     if (handleStaticFile(req, res, this.dashboardDir)) return;

     res.writeHead(404, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify({ error: 'Not Found' }));
   }
   ```

   And add a handler in `dispatchAuthedRequest` after scope check, before the route loop:

   ```ts
   if (req.method === 'GET' && (req.url === '/api/state' || req.url === '/api/v1/state')) {
     res.writeHead(200, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify(this.orchestrator.getSnapshot()));
     this.audit(req, res, token);
     return;
   }
   ```

   Then **remove** the old `handleStateEndpoint` method (it's now inlined inside dispatchAuthedRequest).

7. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/server/http.test.ts` — **observe pass.**
8. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
9. Run: `harness validate && harness check-deps`
10. Commit: `feat(orchestrator): replace single-token auth with TokenStore + scope middleware + audit`

---

### Task 8: Add @asteasolutions/zod-to-openapi devDep + extend zod schemas with `.openapi()` registration

**Depends on:** Task 7
**Files:** `packages/orchestrator/package.json`, `packages/types/src/auth.ts`
**Skills:** `ts-zod-integration` (apply)

1. Edit `packages/orchestrator/package.json` — `devDependencies` add `"@asteasolutions/zod-to-openapi": "^7.3.0"`.
2. Run: `pnpm install`
3. Verify the package resolves: `pnpm --filter @harness-engineering/orchestrator exec node -e "console.log(require.resolve('@asteasolutions/zod-to-openapi'))"`
4. **No schema modifications yet** — Task 9 will use the lib's `extendZodWithOpenApi(z)` pattern at the registry callsite, leaving `packages/types/src/auth.ts` schema-tagger-free.
5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
6. Run: `harness validate`
7. Commit: `chore(orchestrator): add @asteasolutions/zod-to-openapi devDep for Phase 1 scaffolding`

---

### Task 9 (TDD): OpenAPI registry + generator — write failing test then implement

**Depends on:** Task 8
**Files:**

- `packages/orchestrator/src/gateway/openapi/registry.ts`
- `packages/orchestrator/src/gateway/openapi/generate.ts`
- `packages/orchestrator/src/gateway/openapi/generate.test.ts`

**Skills:** `ts-zod-integration` (apply)

`[checkpoint:human-verify]` After this lands: pause and verify the generated `docs/api/openapi.yaml` looks reasonable (open in Redocly / SwaggerUI). Confirm the route paths, request/response shapes, and security scheme make sense before approving Task 14's CI drift-check.

1. Create `packages/orchestrator/src/gateway/openapi/generate.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { generateOpenApiYaml } from './generate';

   describe('generateOpenApiYaml', () => {
     it('emits a valid YAML file with the three auth routes', () => {
       const dir = mkdtempSync(join(tmpdir(), 'harness-openapi-'));
       const out = join(dir, 'openapi.yaml');
       generateOpenApiYaml(out);
       const yaml = readFileSync(out, 'utf8');
       expect(yaml).toContain('openapi: 3.1.0');
       expect(yaml).toContain('/api/v1/auth/token');
       expect(yaml).toContain('/api/v1/auth/tokens');
       expect(yaml).toContain('/api/v1/auth/tokens/{id}');
       expect(yaml).toContain('BearerAuth');
       rmSync(dir, { recursive: true, force: true });
     });

     it('is idempotent — running twice produces byte-identical output', () => {
       const dir = mkdtempSync(join(tmpdir(), 'harness-openapi-'));
       const out = join(dir, 'openapi.yaml');
       generateOpenApiYaml(out);
       const a = readFileSync(out, 'utf8');
       generateOpenApiYaml(out);
       const b = readFileSync(out, 'utf8');
       expect(a).toBe(b);
       rmSync(dir, { recursive: true, force: true });
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/gateway/openapi/generate.test.ts` — **observe failure.**
3. Create `packages/orchestrator/src/gateway/openapi/registry.ts`:

   ```ts
   import { z } from 'zod';
   import {
     OpenAPIRegistry,
     OpenApiGeneratorV31,
     extendZodWithOpenApi,
   } from '@asteasolutions/zod-to-openapi';
   import {
     AuthTokenPublicSchema,
     TokenScopeSchema,
     BridgeKindSchema,
   } from '@harness-engineering/types';

   extendZodWithOpenApi(z);

   export function buildAuthRegistry(): OpenAPIRegistry {
     const registry = new OpenAPIRegistry();

     // Reusable components
     const TokenScope = registry.register('TokenScope', TokenScopeSchema.openapi('TokenScope'));
     const BridgeKind = registry.register('BridgeKind', BridgeKindSchema.openapi('BridgeKind'));
     const AuthTokenPublic = registry.register(
       'AuthTokenPublic',
       AuthTokenPublicSchema.openapi('AuthTokenPublic')
     );

     const CreateRequest = z
       .object({
         name: z.string().min(1).max(100),
         scopes: z.array(TokenScope).min(1),
         bridgeKind: BridgeKind.optional(),
         tenantId: z.string().optional(),
         expiresAt: z.string().datetime().optional(),
       })
       .openapi('CreateTokenRequest');

     const CreateResponse = z
       .object({
         token: z.string(),
         id: z.string(),
         record: AuthTokenPublic,
       })
       .openapi('CreateTokenResponse');

     registry.registerComponent('securitySchemes', 'BearerAuth', {
       type: 'http',
       scheme: 'bearer',
       bearerFormat: 'tok_<id>.<base64url>',
     });

     registry.registerPath({
       method: 'post',
       path: '/api/v1/auth/token',
       description: 'Create a new auth token. Secret returned once.',
       security: [{ BearerAuth: [] }],
       request: { body: { content: { 'application/json': { schema: CreateRequest } } } },
       responses: {
         200: {
           description: 'Token created',
           content: { 'application/json': { schema: CreateResponse } },
         },
         409: { description: 'Duplicate name' },
       },
     });

     registry.registerPath({
       method: 'get',
       path: '/api/v1/auth/tokens',
       description: 'List tokens (hashedSecret redacted).',
       security: [{ BearerAuth: [] }],
       responses: {
         200: {
           description: 'OK',
           content: { 'application/json': { schema: z.array(AuthTokenPublic) } },
         },
       },
     });

     registry.registerPath({
       method: 'delete',
       path: '/api/v1/auth/tokens/{id}',
       description: 'Revoke a token by id.',
       security: [{ BearerAuth: [] }],
       request: { params: z.object({ id: z.string() }) },
       responses: {
         200: { description: 'Deleted' },
         404: { description: 'Token not found' },
       },
     });

     return registry;
   }

   export function buildAuthDocument(): ReturnType<OpenApiGeneratorV31['generateDocument']> {
     const generator = new OpenApiGeneratorV31(buildAuthRegistry().definitions);
     return generator.generateDocument({
       openapi: '3.1.0',
       info: {
         title: 'Harness Gateway API',
         version: '0.1.0',
         description: 'Hermes Phase 0 — auth routes (Phase 1 scope).',
       },
       servers: [{ url: 'http://127.0.0.1:8080' }],
     });
   }
   ```

4. Create `packages/orchestrator/src/gateway/openapi/generate.ts`:

   ```ts
   import { writeFileSync, mkdirSync } from 'node:fs';
   import { dirname } from 'node:path';
   import { stringify } from 'yaml';
   import { buildAuthDocument } from './registry';

   /**
    * Emit the OpenAPI artifact for the auth routes to `out`.
    * Idempotent: identical inputs produce byte-identical output (sorted keys,
    * stable indent).
    */
   export function generateOpenApiYaml(out: string): void {
     const doc = buildAuthDocument();
     mkdirSync(dirname(out), { recursive: true });
     const yaml = stringify(doc, { sortMapEntries: true, indent: 2, lineWidth: 0 });
     writeFileSync(out, yaml, 'utf8');
   }

   // Build-time entry: `node dist/gateway/openapi/generate.js docs/api/openapi.yaml`
   if (require.main === module) {
     const target = process.argv[2] ?? 'docs/api/openapi.yaml';
     generateOpenApiYaml(target);
     console.log(`Wrote ${target}`);
   }
   ```

5. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/gateway/openapi/generate.test.ts` — **observe pass.**
6. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
7. Run: `harness validate`
8. Commit: `feat(orchestrator): add zod-to-openapi registry + generator for auth routes`

---

### Task 10: Generate initial `docs/api/openapi.yaml` artifact and commit

**Depends on:** Task 9
**Files:** `docs/api/openapi.yaml` (new), `packages/orchestrator/package.json` (script entry)

1. Edit `packages/orchestrator/package.json` `scripts` block — add:

   ```json
   "openapi:generate": "tsx src/gateway/openapi/generate.ts ../../docs/api/openapi.yaml"
   ```

   (If `tsx` is not already a devDependency at the workspace root, add it: check with `pnpm why tsx`; install at root with `pnpm add -Dw tsx` if missing.)

2. Run: `pnpm --filter @harness-engineering/orchestrator openapi:generate`
3. Verify `docs/api/openapi.yaml` exists and contains `/api/v1/auth/token`, `/api/v1/auth/tokens`, and `/api/v1/auth/tokens/{id}`.
4. Re-run the same command — diff should be empty: `git diff --exit-code docs/api/openapi.yaml` (should exit 0 with no changes).
5. Run: `harness validate`
6. Commit: `feat(api): vendor initial OpenAPI artifact for Phase 1 auth routes`

---

### Task 11 (TDD): CLI gateway subcommand group skeleton — failing test

**Depends on:** Task 10
**Files:** `packages/cli/src/commands/gateway/token.test.ts`

1. Create the directory: `mkdir -p packages/cli/src/commands/gateway`
2. Create `packages/cli/src/commands/gateway/token.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { mkdtempSync, rmSync, existsSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { runTokenCreate, runTokenList, runTokenRevoke } from './token';

   let dir: string;
   beforeEach(() => {
     dir = mkdtempSync(join(tmpdir(), 'harness-cli-token-'));
     process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
   });
   afterEach(() => {
     rmSync(dir, { recursive: true, force: true });
     delete process.env['HARNESS_TOKENS_PATH'];
   });

   describe('gateway token create', () => {
     it('prints the secret exactly once', async () => {
       const out = await runTokenCreate({ name: 'slack-bot', scopes: ['trigger-job'] });
       expect(out.token).toMatch(/^tok_[a-f0-9]{16}\..+/);
       expect(out.id).toMatch(/^tok_[a-f0-9]{16}$/);
       expect(existsSync(join(dir, 'tokens.json'))).toBe(true);
     });
   });

   describe('gateway token list', () => {
     it('redacts hashedSecret', async () => {
       await runTokenCreate({ name: 'a', scopes: ['admin'] });
       const list = await runTokenList();
       expect(list[0]).toBeDefined();
       expect(list[0] as object).not.toHaveProperty('hashedSecret');
     });
   });

   describe('gateway token revoke', () => {
     it('returns true for known id, false for unknown', async () => {
       const { id } = await runTokenCreate({ name: 'a', scopes: ['admin'] });
       expect(await runTokenRevoke(id)).toBe(true);
       expect(await runTokenRevoke('tok_doesnotexist00')).toBe(false);
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/cli vitest run src/commands/gateway/token.test.ts` — **observe failure.**
4. **Do not commit yet** — Task 12 implements and commits together.

---

### Task 12: Implement gateway token CLI commands

**Depends on:** Task 11
**Files:**

- `packages/cli/src/commands/gateway/token.ts`
- `packages/cli/src/commands/gateway/index.ts`
- `packages/cli/src/commands/_registry.ts` (modify)
- `packages/cli/package.json` (modify — add orchestrator workspace dep)

1. Edit `packages/cli/package.json` `dependencies` — add `"@harness-engineering/orchestrator": "workspace:*"` if not already present. (Check with `grep orchestrator packages/cli/package.json` first; skip if present.) Run `pnpm install`.

2. Create `packages/cli/src/commands/gateway/token.ts`:

   ```ts
   import { Command } from 'commander';
   import { resolve } from 'node:path';
   import { TokenStore } from '@harness-engineering/orchestrator/auth';
   import type { TokenScope } from '@harness-engineering/types';

   function getStore(): TokenStore {
     const p = process.env['HARNESS_TOKENS_PATH'] ?? resolve('.harness', 'tokens.json');
     return new TokenStore(p);
   }

   export async function runTokenCreate(opts: {
     name: string;
     scopes: TokenScope[];
     bridgeKind?: 'slack' | 'discord' | 'github-app' | 'custom';
     tenantId?: string;
     expiresAt?: string;
   }): Promise<{ id: string; token: string }> {
     const store = getStore();
     const result = await store.create(opts);
     return { id: result.id, token: result.token };
   }

   export async function runTokenList(): Promise<unknown[]> {
     const store = getStore();
     return store.list();
   }

   export async function runTokenRevoke(id: string): Promise<boolean> {
     const store = getStore();
     return store.revoke(id);
   }

   export function createTokenCommand(): Command {
     const cmd = new Command('token').description('Manage Gateway API tokens');

     cmd
       .command('create')
       .description('Create a new auth token. Secret is shown ONCE.')
       .requiredOption('--name <name>', 'Human label')
       .requiredOption('--scopes <scopes>', 'Comma-separated scopes')
       .option('--bridge <kind>', 'slack | discord | github-app | custom')
       .option('--tenant <id>', 'Tenant identifier')
       .option('--expires <iso>', 'Expiry ISO-8601')
       .action(
         async (opts: {
           name: string;
           scopes: string;
           bridge?: string;
           tenant?: string;
           expires?: string;
         }) => {
           const scopes = opts.scopes.split(',').map((s) => s.trim()) as TokenScope[];
           const input: Parameters<typeof runTokenCreate>[0] = { name: opts.name, scopes };
           if (opts.bridge) input.bridgeKind = opts.bridge as typeof input.bridgeKind;
           if (opts.tenant) input.tenantId = opts.tenant;
           if (opts.expires) input.expiresAt = opts.expires;
           const out = await runTokenCreate(input);
           console.log(JSON.stringify(out, null, 2));
           console.log('\n⚠️  Save this token now — it will NEVER be shown again.');
         }
       );

     cmd
       .command('list')
       .description('List all tokens (secrets redacted)')
       .action(async () => {
         const tokens = await runTokenList();
         console.log(JSON.stringify(tokens, null, 2));
       });

     cmd
       .command('revoke <id>')
       .description('Delete a token by id')
       .action(async (id: string) => {
         const ok = await runTokenRevoke(id);
         if (ok) console.log(`Revoked ${id}`);
         else {
           console.error(`No such token: ${id}`);
           process.exitCode = 1;
         }
       });

     return cmd;
   }
   ```

3. Create `packages/cli/src/commands/gateway/index.ts`:

   ```ts
   import { Command } from 'commander';
   import { createTokenCommand } from './token';

   export function createGatewayCommand(): Command {
     const cmd = new Command('gateway').description('Gateway API administration');
     cmd.addCommand(createTokenCommand());
     return cmd;
   }
   ```

4. Modify `packages/cli/src/commands/_registry.ts` — add the import alphabetically:

   ```ts
   import { createGatewayCommand } from './gateway';
   ```

   And append `createGatewayCommand,` in the `commandCreators` array alphabetically (between `createGenerateCommand` and `createGraphCommand`).

5. **Verify the orchestrator package exports `TokenStore` from the `auth` subpath.** Check `packages/orchestrator/package.json` `exports` field — if no `./auth` subpath exists yet, either:
   - Add `"./auth": { "types": "./dist/auth/index.d.ts", "import": "./dist/auth/index.mjs", "require": "./dist/auth/index.js" }` to `exports`, OR
   - Re-export from the package root: edit `packages/orchestrator/src/index.ts` to add `export * from './auth';` and import via `@harness-engineering/orchestrator`.

   **Pick the latter** (simpler, fewer surface changes): add `export { TokenStore } from './auth';` to `packages/orchestrator/src/index.ts`. Update `packages/cli/src/commands/gateway/token.ts` import to `import { TokenStore } from '@harness-engineering/orchestrator';`.

6. Run: `pnpm --filter @harness-engineering/orchestrator build`
7. Run: `pnpm --filter @harness-engineering/cli vitest run src/commands/gateway/token.test.ts` — **observe pass.**
8. Run: `pnpm --filter @harness-engineering/cli typecheck`
9. Run: `harness validate && harness check-deps`
10. Commit: `feat(cli): add harness gateway token create/list/revoke`

---

### Task 13 (TDD): Dashboard tokens backend route — failing test then implementation

**Depends on:** Task 12
**Files:**

- `packages/dashboard/src/server/routes/tokens.ts`
- `packages/dashboard/src/server/routes/tokens.test.ts`
- `packages/dashboard/src/server/index.ts` (modify)

1. Create `packages/dashboard/src/server/routes/tokens.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { mkdtempSync, rmSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { Hono } from 'hono';
   import { buildTokensRouter } from './tokens';
   import { TokenStore } from '@harness-engineering/orchestrator';

   let dir: string;
   beforeEach(() => {
     dir = mkdtempSync(join(tmpdir(), 'harness-dash-tokens-'));
     process.env['HARNESS_TOKENS_PATH'] = join(dir, 'tokens.json');
   });
   afterEach(() => {
     rmSync(dir, { recursive: true, force: true });
     delete process.env['HARNESS_TOKENS_PATH'];
   });

   describe('GET /api/tokens', () => {
     it('returns the list with hashedSecret redacted', async () => {
       const store = new TokenStore(process.env['HARNESS_TOKENS_PATH'] as string);
       await store.create({ name: 'a', scopes: ['admin'] });
       const app = new Hono().route('/api', buildTokensRouter());
       const res = await app.request('/api/tokens');
       expect(res.status).toBe(200);
       const body = (await res.json()) as unknown[];
       expect(body).toHaveLength(1);
       expect(body[0] as object).not.toHaveProperty('hashedSecret');
     });
   });

   describe('POST /api/tokens', () => {
     it('creates a token and returns the secret once', async () => {
       const app = new Hono().route('/api', buildTokensRouter());
       const res = await app.request('/api/tokens', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ name: 'a', scopes: ['admin'] }),
       });
       expect(res.status).toBe(200);
       const body = (await res.json()) as { token: string; id: string };
       expect(body.token).toMatch(/^tok_/);
     });
   });

   describe('DELETE /api/tokens/:id', () => {
     it('revokes the token', async () => {
       const store = new TokenStore(process.env['HARNESS_TOKENS_PATH'] as string);
       const { id } = await store.create({ name: 'a', scopes: ['admin'] });
       const app = new Hono().route('/api', buildTokensRouter());
       const res = await app.request(`/api/tokens/${id}`, { method: 'DELETE' });
       expect(res.status).toBe(200);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard vitest run src/server/routes/tokens.test.ts` — **observe failure.**
3. Create `packages/dashboard/src/server/routes/tokens.ts`:

   ```ts
   import { Hono } from 'hono';
   import { z } from 'zod';
   import { resolve } from 'node:path';
   import { TokenStore } from '@harness-engineering/orchestrator';
   import { TokenScopeSchema, BridgeKindSchema } from '@harness-engineering/types';

   const CreateBodySchema = z.object({
     name: z.string().min(1).max(100),
     scopes: z.array(TokenScopeSchema).min(1),
     bridgeKind: BridgeKindSchema.optional(),
     tenantId: z.string().optional(),
     expiresAt: z.string().datetime().optional(),
   });

   function getStore(): TokenStore {
     const p = process.env['HARNESS_TOKENS_PATH'] ?? resolve('.harness', 'tokens.json');
     return new TokenStore(p);
   }

   export function buildTokensRouter(): Hono {
     const r = new Hono();

     r.get('/tokens', async (c) => {
       const list = await getStore().list();
       return c.json(list);
     });

     r.post('/tokens', async (c) => {
       const raw = (await c.req.json()) as unknown;
       const parsed = CreateBodySchema.safeParse(raw);
       if (!parsed.success)
         return c.json({ error: 'Invalid body', issues: parsed.error.issues }, 400);
       try {
         const result = await getStore().create(parsed.data);
         return c.json({
           id: result.id,
           token: result.token,
           record: { ...result.record, hashedSecret: undefined },
         });
       } catch (err) {
         const msg = (err as Error).message;
         if (msg.includes('already exists')) return c.json({ error: msg }, 409);
         throw err;
       }
     });

     r.delete('/tokens/:id', async (c) => {
       const id = c.req.param('id');
       const ok = await getStore().revoke(id);
       if (!ok) return c.json({ error: 'Token not found' }, 404);
       return c.json({ deleted: true });
     });

     return r;
   }
   ```

4. Modify `packages/dashboard/src/server/index.ts` — add the import near other route imports:

   ```ts
   import { buildTokensRouter } from './routes/tokens';
   ```

   And register inside `buildApp()` after the existing `app.route('/api', buildTraceabilityRouter(ctx));` line:

   ```ts
   app.route('/api', buildTokensRouter());
   ```

5. Run: `pnpm --filter @harness-engineering/dashboard vitest run src/server/routes/tokens.test.ts` — **observe pass.**
6. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
7. Run: `harness validate`
8. Commit: `feat(dashboard): add /api/tokens backend with list/create/revoke`

---

### Task 14: Dashboard Tokens page + register at /s/tokens

**Depends on:** Task 13
**Files:**

- `packages/dashboard/src/client/pages/Tokens.tsx` (new)
- `packages/dashboard/src/client/components/layout/ThreadView.tsx` (modify)

1. Create `packages/dashboard/src/client/pages/Tokens.tsx`:

   ```tsx
   import { useEffect, useState, useCallback } from 'react';
   import type { AuthTokenPublic } from '@harness-engineering/types';

   interface CreatedToken {
     id: string;
     token: string;
   }

   export function Tokens() {
     const [tokens, setTokens] = useState<AuthTokenPublic[]>([]);
     const [name, setName] = useState('');
     const [scopes, setScopes] = useState('read-status');
     const [created, setCreated] = useState<CreatedToken | null>(null);
     const [error, setError] = useState<string | null>(null);

     const refresh = useCallback(async () => {
       const res = await fetch('/api/tokens');
       if (res.ok) setTokens(((await res.json()) as AuthTokenPublic[]) ?? []);
     }, []);

     useEffect(() => {
       void refresh();
     }, [refresh]);

     async function createToken(e: React.FormEvent) {
       e.preventDefault();
       setError(null);
       const res = await fetch('/api/tokens', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ name, scopes: scopes.split(',').map((s) => s.trim()) }),
       });
       if (!res.ok) {
         const err = (await res.json()) as { error?: string };
         setError(err.error ?? 'Failed');
         return;
       }
       const body = (await res.json()) as CreatedToken;
       setCreated(body);
       setName('');
       await refresh();
     }

     async function revoke(id: string) {
       if (!window.confirm(`Revoke ${id}?`)) return;
       await fetch(`/api/tokens/${id}`, { method: 'DELETE' });
       await refresh();
     }

     return (
       <div className="space-y-6">
         <h1 className="text-xl font-bold">Gateway API Tokens</h1>

         <form onSubmit={createToken} className="space-y-2 rounded-lg border border-white/10 p-4">
           <h2 className="text-sm font-semibold">Create token</h2>
           <input
             className="block w-full rounded bg-white/5 px-3 py-2 text-sm"
             placeholder="Name (e.g. slack-bot)"
             value={name}
             onChange={(e) => setName(e.target.value)}
             required
           />
           <input
             className="block w-full rounded bg-white/5 px-3 py-2 text-sm"
             placeholder="Scopes (comma-separated)"
             value={scopes}
             onChange={(e) => setScopes(e.target.value)}
             required
           />
           <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm">
             Create
           </button>
           {error && <p className="text-sm text-red-400">{error}</p>}
         </form>

         {created && (
           <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4">
             <p className="text-xs font-semibold uppercase tracking-wider">
               Save this token — shown once.
             </p>
             <code className="mt-2 block break-all text-xs">{created.token}</code>
             <button onClick={() => setCreated(null)} className="mt-2 text-xs underline">
               Dismiss
             </button>
           </div>
         )}

         <table className="w-full text-sm">
           <thead>
             <tr className="text-left text-xs uppercase tracking-wider text-neutral-muted">
               <th className="py-2">Name</th>
               <th>Scopes</th>
               <th>Created</th>
               <th>Last used</th>
               <th></th>
             </tr>
           </thead>
           <tbody>
             {tokens.map((t) => (
               <tr key={t.id} className="border-t border-white/5">
                 <td className="py-2">{t.name}</td>
                 <td>{t.scopes.join(', ')}</td>
                 <td>{new Date(t.createdAt).toLocaleString()}</td>
                 <td>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : '—'}</td>
                 <td>
                   <button
                     onClick={() => void revoke(t.id)}
                     className="text-xs text-red-400 underline"
                   >
                     Revoke
                   </button>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
     );
   }
   ```

2. Modify `packages/dashboard/src/client/components/layout/ThreadView.tsx`:
   - Add import alongside other pages: `import { Tokens } from '../../pages/Tokens';`
   - Add entry to `SYSTEM_PAGE_COMPONENTS` between `adoption: Adoption,` and `attention: Attention,`: `tokens: Tokens,`

3. Run: `pnpm --filter @harness-engineering/dashboard build` (validates Vite + TSX compile)
4. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
5. Run: `harness validate`
6. Commit: `feat(dashboard): add /s/tokens page with list/create/revoke UI`

---

### Task 15: Wire dashboard route + visual checkpoint

`[checkpoint:human-verify]` Run the dashboard locally and navigate to `/s/tokens`. Confirm:

1. Empty state renders (no tokens yet) without error.
2. Creating a token via the form shows the one-time secret banner.
3. Refreshing shows the token in the list with redacted secret.
4. "Revoke" removes the row.
5. The orchestrator (running separately) accepts the new token as `Authorization: Bearer <token>` for `GET /api/state`.

**Depends on:** Task 14
**Files:** (none modified — verification only; results documented in handoff)

1. Start the orchestrator: `pnpm --filter @harness-engineering/orchestrator dev` (or `harness orchestrator start` if installed).
2. Start the dashboard: `pnpm --filter @harness-engineering/dashboard dev`.
3. Navigate to `http://127.0.0.1:<dashboard-port>/s/tokens`.
4. Run the five checks above manually.
5. **If any check fails:** open an issue or push a fix as a follow-up commit; do not advance to Task 16.
6. **If all pass:** record outcome in the session evidence (no commit needed).
7. Commit (markdown-only checkpoint marker): `docs(plans): record Phase 1 /s/tokens visual verification`
   (This commit can be empty if no markdown changes; use `git commit --allow-empty -m "..."` only if the session requires a marker. Otherwise skip and let Task 17 be the closer.)

---

### Task 16: Add CI `openapi-drift-check` workflow

**Depends on:** Task 15
**Files:** `.github/workflows/openapi-drift-check.yml` (new)
**Category:** integration

1. Create `.github/workflows/openapi-drift-check.yml`:

   ```yaml
   name: OpenAPI Drift Check

   on:
     pull_request:
       branches: [main]
       paths:
         - 'packages/orchestrator/src/gateway/openapi/**'
         - 'packages/types/src/auth.ts'
         - 'docs/api/openapi.yaml'
         - '.github/workflows/openapi-drift-check.yml'

   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true

   jobs:
     drift-check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v6
         - uses: pnpm/action-setup@v5
         - uses: actions/setup-node@v6
           with:
             node-version: 22
             cache: 'pnpm'
         - run: pnpm install --frozen-lockfile
         - run: pnpm --filter @harness-engineering/types build
         - run: pnpm --filter @harness-engineering/orchestrator build
         - name: Regenerate OpenAPI artifact
           run: pnpm --filter @harness-engineering/orchestrator openapi:generate
         - name: Verify no drift
           run: |
             if ! git diff --exit-code docs/api/openapi.yaml; then
               echo "::error::OpenAPI artifact is out of sync with code. Run 'pnpm --filter @harness-engineering/orchestrator openapi:generate' and commit the result."
               exit 1
             fi
   ```

2. Run a local dry-run: `pnpm --filter @harness-engineering/orchestrator openapi:generate && git diff --exit-code docs/api/openapi.yaml` — exit code should be 0.
3. Run: `harness validate`
4. Commit: `ci: add openapi-drift-check workflow for Phase 1 artifact`

---

### Task 17: Final phase-gate verification

**Depends on:** Task 16
**Files:** (none — verification + session summary)
**Category:** integration

1. Run the full check suite:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test` (or `pnpm --filter @harness-engineering/{types,orchestrator,cli,dashboard} test`)
   - `harness validate`
   - `harness check-deps`
   - `harness check-arch` (must be clean per spec Level-2 gate)
2. Manually verify the Phase 1 exit-gate observable truths (`tokens created via CLI authenticate against /api/state`, `audit log captures every call`, `OpenAPI artifact regenerates idempotently`, `dashboard /tokens page lists tokens`):
   - `harness gateway token create --name verify-bot --scopes read-status` → capture token
   - `curl -H "Authorization: Bearer <token>" http://127.0.0.1:8080/api/state` → 200 with snapshot
   - `curl -H "Authorization: Bearer <token>" http://127.0.0.1:8080/api/maintenance` → 403 (wrong scope)
   - `tail -1 .harness/audit.log` → JSON line with the route + status + tokenId
   - `pnpm --filter @harness-engineering/orchestrator openapi:generate && git status` → clean
3. Re-run `harness:soundness-review --mode plan` against this plan — confirm no new findings.
4. Write session summary to `.harness/sessions/changes--hermes-phase-0-gateway-api--proposal/handoff.json` for next phase pickup (handled by autopilot).
5. Commit (only if any verification-driven fix changes touched code): `chore(phase-1): close auth-foundation phase — all exit gates met`. Otherwise skip the commit; the previous commits are the deliverable.

---

## Verification Trace (observable truth → tasks)

| Observable Truth                                              | Delivered by     |
| ------------------------------------------------------------- | ---------------- |
| 1. Hashed-at-rest token round-trip                            | Tasks 1, 2, 3    |
| 2. CLI one-time-secret reveal + redacted list                 | Tasks 11, 12     |
| 3. Bearer-token scope-passing + scope-rejection               | Tasks 4, 6, 7    |
| 4. Legacy `HARNESS_API_TOKEN` env still admin                 | Tasks 3, 6, 7    |
| 5. Audit log line per request, no payload, write-failure-safe | Task 5, 7        |
| 6. Idempotent OpenAPI artifact for auth routes                | Tasks 8, 9, 10   |
| 7. Dashboard `/s/tokens` list + revoke                        | Tasks 13, 14, 15 |
| 8. Non-admin scope rejection on token-admin routes            | Tasks 4, 7       |
| CI drift-check enforces #6 ongoing                            | Task 16          |
| Full project still green                                      | Task 17          |

## Concerns / Risks

1. **Task count is 17 (> 15 threshold).** Autopilot may emit `APPROVE_PLAN` signal — human approval gate triggered. This is expected for a Phase 1 with crypto, route refactor, CLI + dashboard surfaces, and CI together.
2. **Re-ordering of state-endpoint behavior in Task 7.** Today `/api/state` is publicly readable (no auth check). Phase 1 makes it require `read-status`. Operators with running scripts hitting `/api/state` without `HARNESS_API_TOKEN` set will continue to work (unauth-dev mode) — but a deployment with tokens.json populated and no env var will start rejecting unauthenticated state reads. **Mitigation:** Task 7 implements the "tokens.json empty + no env" → admin-synth fallback to preserve current local-dev UX; document in the eventual Phase 0 CHANGELOG.
3. **bcryptjs is pure-JS, slower than native bcrypt.** ~30 ms per `verify()` at 12 rounds. On every authed request the verify call runs. Real-world traffic on `/api/state` will see latency added; per-IP rate limit (100 req/min default) protects against thundering CPU. If perf testing fails, swap to `@node-rs/argon2` in a follow-up.
4. **Test for Task 6 mounts a real `http.Server`.** Network-bound tests can be flakier than pure unit tests. Tests bind to port 0 (kernel-assigned) and close in `afterEach`, but watch for port leak warnings on Windows in CI.
5. **OpenAPI artifact byte-identical idempotence depends on `yaml` lib + `sortMapEntries: true`.** If `@asteasolutions/zod-to-openapi` produces non-deterministic component ordering across runs, the CI drift-check will flap. Test in Task 9 enforces idempotency at unit-test time; if it passes there, CI will pass.
6. **No `harness check-arch` baseline update is planned in this phase.** New `auth/` and `gateway/` directories under `packages/orchestrator/src/` may need layer-config entries; if `harness check-arch` complains in Task 17, add the layer config as a 17a fixup task before commit.
7. **Phase 2 will extend `requiredScopeForRoute()` to cover `/api/v1/*` primitives.** Phase 1 deliberately leaves the new versioned routes' scope mapping for Phase 2. The TODO comment in `scopes.ts` makes this explicit.

## Integration Notes

- **Integration tier: large.** This phase introduces a new auth substrate, a new CLI subcommand group, a new dashboard page, and a new CI job — all of which require explicit wiring entries in registries (`_registry.ts`, `ThreadView.tsx`, dashboard server `index.ts`, `.github/workflows/`). No new package is created in Phase 1 (Phase 2/3 may), so it stops short of "introduces a new package" but exceeds "medium" scope.
- **No knowledge-pipeline updates in this phase.** The `docs/knowledge/orchestrator/gateway-api.md` and `webhook-fanout.md` files are deferred to Phase 0 finalization (Step N). Phase 1 only produces the code substrate they describe.
- **No ADR in this phase.** The "Orchestrator Gateway API contract" and "Telemetry export to OTel" ADRs are written at Phase 0 finalization, not per slice.
- **Slash-command generator re-run is Phase 2's concern** — Phase 1 only adds `harness gateway token …`, which is internal-only and not yet exposed to per-host plugins.

## Session State Updates

- **decisions** (new): bcryptjs at 12 rounds; `@asteasolutions/zod-to-openapi` v7; token wire format `tok_<id>.<base64url>`; subpath re-export via `packages/orchestrator/src/index.ts`.
- **constraints** (carried forward): localhost-only binding (D5); `.harness/tokens.json` UTF-8; audit log best-effort writes.
- **risks** (new): bcryptjs latency on hot path; state-endpoint behavior change; OpenAPI determinism dependency.
- **openQuestions** (new): if bcryptjs latency proves problematic in Task 17 verification, follow-up to migrate to argon2.
- **evidence** (new): `packages/orchestrator/src/server/http.ts:269-281`, `:294-311`, `:313-320`; `packages/types/src/index.ts:99-139`; `packages/cli/src/commands/agent/index.ts:1-12`.

## Gates

- All 17 tasks include exact file paths, exact code, exact verification commands. No vague placeholders.
- Tasks 2-5, 6-7, 9, 11-12, 13 follow TDD: write test → observe failure → implement → observe pass → commit.
- Each task is single-context-window scoped (one file or one cluster of tightly-coupled files).
- Phase exit-gate observable truths all trace to specific tasks (see Verification Trace).
- `harness validate` runs in every task; `harness check-deps` runs where new imports cross package boundaries (Tasks 3, 7, 12, 13).
- 3 checkpoints requested: after Task 5 (auth core complete, before HTTP surgery), after Task 7 (HTTP wired, biggest single risk), after Task 9 (OpenAPI generator before vendoring artifact).
