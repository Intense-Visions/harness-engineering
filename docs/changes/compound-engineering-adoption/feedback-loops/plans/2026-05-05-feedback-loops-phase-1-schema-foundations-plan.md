# Plan: Feedback Loops — Phase 1: Schema Foundations

**Date:** 2026-05-05
**Spec:** [docs/changes/compound-engineering-adoption/feedback-loops/proposal.md](../proposal.md)
**Phase:** 1 of 8 (Schema Foundations, complexity: low)
**Tasks:** 11
**Time:** ~38 min
**Integration Tier:** medium
**Rigor:** fast

## Goal

Define the `pulse:` config Zod schema, the solution-doc YAML frontmatter Zod schema, and the `SanitizedResult` / `sanitize()` PII contract types — all in `packages/core/src/pulse/` and `packages/core/src/solutions/` — re-exporting their public types via `@harness-engineering/types` so `packages/graph/src/ingest/BusinessKnowledgeIngestor` can consume the solution-doc shape without violating the `core → graph` layer rule. Wire both schemas into `harness validate`. Create the `docs/solutions/<track>/<category>/` directory skeleton and the three reference documents (`schema.yaml`, `category-mapping.md`, `resolution-template.md`).

## Observable Truths (Acceptance Criteria)

1. `import { PulseConfigSchema } from '@harness-engineering/core'` parses a valid `pulse:` block (per spec § Technical Design) and rejects an invalid one with a typed `ConfigError`.
2. `import { SolutionDocFrontmatterSchema } from '@harness-engineering/core'` parses a valid frontmatter (`module`, `tags`, `problem_type`, `last_updated`, plus track/category) and rejects unknown categories.
3. `import type { PulseConfig, SolutionDocFrontmatter, SanitizedResult } from '@harness-engineering/types'` resolves at the type level (verified by `pnpm -C packages/types typecheck`).
4. `harness validate` invoked on a project with a `pulse:` block in `harness.config.json` and a valid `docs/solutions/bug-track/test-failures/foo.md` reports `valid: true`.
5. `harness validate` flags a `pulse:` block with `pulse.enabled` of the wrong type AND a solution doc with an unknown category, both surfaced as issues with non-zero exit code.
6. The directories `docs/solutions/bug-track/{build-errors,test-failures,runtime-errors,performance-issues,database-issues,security-issues,ui-bugs,integration-issues,logic-errors}/` and `docs/solutions/knowledge-track/{architecture-patterns,design-patterns,tooling-decisions,conventions,dx,best-practices}/` all exist as empty directories with `.gitkeep` markers.
7. `docs/solutions/references/schema.yaml`, `docs/solutions/references/category-mapping.md`, and `docs/solutions/assets/resolution-template.md` exist with content matching the spec's category list (Decision 8) and frontmatter contract.
8. `harness check-deps` reports no architectural violation: no import from `packages/core/src/pulse/**` or `packages/core/src/solutions/**` reaches into a higher layer; the type re-exports in `@harness-engineering/types` are pure type-shapes, not runtime imports of `core`.
9. `pnpm test` runs the new schema tests and they pass.

## File Map

### Create

- `packages/types/src/pulse.ts` — Type-only declarations: `PulseConfig`, `PulseSources`, `PulseDbSource`, `SanitizedResult`, `SanitizeFn`. No runtime exports.
- `packages/types/src/solutions.ts` — Type-only declarations: `SolutionDocFrontmatter`, `SolutionTrack`, `BugTrackCategory`, `KnowledgeTrackCategory`, `SolutionCategory`.
- `packages/core/src/pulse/index.ts` — Barrel; exports `PulseConfigSchema`, types via re-export of `@harness-engineering/types`.
- `packages/core/src/pulse/schema.ts` — Zod schema definition for `PulseConfigSchema`.
- `packages/core/src/pulse/schema.test.ts` — Vitest tests for `PulseConfigSchema`.
- `packages/core/src/pulse/sanitize.ts` — `SanitizedResult` runtime type guards and the `PII_FIELD_DENYLIST` regex constant. (Adapter implementations defer to Phase 4; this file defines only the contract surface.)
- `packages/core/src/pulse/sanitize.test.ts` — Tests for the denylist constant and the type-guard.
- `packages/core/src/solutions/index.ts` — Barrel; exports `SolutionDocFrontmatterSchema`, `BUG_TRACK_CATEGORIES`, `KNOWLEDGE_TRACK_CATEGORIES`, `ALL_SOLUTION_CATEGORIES`.
- `packages/core/src/solutions/schema.ts` — Zod schema definition for `SolutionDocFrontmatterSchema` plus the closed category enums.
- `packages/core/src/solutions/schema.test.ts` — Vitest tests.
- `packages/core/src/validation/pulse.ts` — `validatePulseConfig(cwd)`: read `harness.config.json`, if `pulse:` block present, validate via `PulseConfigSchema`. Returns `Result<PulseConfigValidation, ConfigError>`.
- `packages/core/src/validation/pulse.test.ts`
- `packages/core/src/validation/solutions.ts` — `validateSolutionsDir(cwd)`: walk `docs/solutions/<track>/<category>/*.md`, parse frontmatter, validate via `SolutionDocFrontmatterSchema`. Returns aggregated `Result`.
- `packages/core/src/validation/solutions.test.ts`
- `docs/solutions/.gitkeep`
- `docs/solutions/bug-track/build-errors/.gitkeep`
- `docs/solutions/bug-track/test-failures/.gitkeep`
- `docs/solutions/bug-track/runtime-errors/.gitkeep`
- `docs/solutions/bug-track/performance-issues/.gitkeep`
- `docs/solutions/bug-track/database-issues/.gitkeep`
- `docs/solutions/bug-track/security-issues/.gitkeep`
- `docs/solutions/bug-track/ui-bugs/.gitkeep`
- `docs/solutions/bug-track/integration-issues/.gitkeep`
- `docs/solutions/bug-track/logic-errors/.gitkeep`
- `docs/solutions/knowledge-track/architecture-patterns/.gitkeep`
- `docs/solutions/knowledge-track/design-patterns/.gitkeep`
- `docs/solutions/knowledge-track/tooling-decisions/.gitkeep`
- `docs/solutions/knowledge-track/conventions/.gitkeep`
- `docs/solutions/knowledge-track/dx/.gitkeep`
- `docs/solutions/knowledge-track/best-practices/.gitkeep`
- `docs/solutions/references/schema.yaml`
- `docs/solutions/references/category-mapping.md`
- `docs/solutions/assets/resolution-template.md`

### Modify

- `packages/types/src/index.ts` — add public re-exports for `pulse.ts` and `solutions.ts`.
- `packages/core/src/index.ts` — add barrel re-exports for the new `pulse/` and `solutions/` modules.
- `packages/core/src/validation/index.ts` — re-export `validatePulseConfig` and `validateSolutionsDir`.
- `packages/cli/src/commands/validate.ts` — call `validatePulseConfig` and `validateSolutionsDir` and append issues into the result.

## Uncertainties

- [ASSUMPTION] `harness.config.json` already supports unknown top-level keys (no closed root schema). Verified during scoping by reading `packages/core/src/validation/config.ts` — that file is a generic Zod `validateConfig<T>` helper and is not a closed root schema, so adding `pulse:` does not conflict. If a closed root schema exists elsewhere, Task 9 must extend it.
- [ASSUMPTION] `gray-matter` (or equivalent frontmatter parser) is already a dependency of `packages/core`. If not, Task 6 adds it via `pnpm -F @harness-engineering/core add gray-matter`.
- [DEFERRABLE] Exact wording of `category-mapping.md` examples can be refined in later phases as the categories are exercised; Task 10 ships a minimal-but-complete mapping.
- [DEFERRABLE] Adapter implementations (`PostHogAdapter`, `SentryAdapter`) defer to Phase 4. This phase only defines the `sanitize` contract.

## Skeleton

_Skipped per `--fast` rigor (Rigor Levels table)._

## Tasks

---

### Task 1: Add type-only declarations for `PulseConfig` in `@harness-engineering/types`

**Depends on:** none | **Files:** `packages/types/src/pulse.ts`, `packages/types/src/index.ts`

1. Create `packages/types/src/pulse.ts` with these exports (type-only — no runtime values):

   ```ts
   /**
    * Pulse config — read-side observability config block under `pulse:` in `harness.config.json`.
    * Schema lives in @harness-engineering/core (packages/core/src/pulse/schema.ts).
    * This file is the cross-layer contract; runtime validation happens in core.
    */

   export interface PulseDbSource {
     enabled: boolean;
     /** Read-only connection string env var name. Pulse refuses read-write credentials. */
     connectionEnv?: string;
   }

   export interface PulseSources {
     analytics: string | null;
     tracing: string | null;
     payments: string | null;
     db: PulseDbSource;
   }

   export interface PulseConfig {
     enabled: boolean;
     lookbackDefault: string;
     primaryEvent: string;
     valueEvent: string;
     completionEvents: string[];
     qualityScoring: boolean;
     qualityDimension: string | null;
     sources: PulseSources;
     metricSourceOverrides: Record<string, string>;
     pendingMetrics: string[];
     excludedMetrics: string[];
   }

   /**
    * Sanitized adapter result — every provider adapter must return this shape.
    * The adapter's sanitize(rawResult) implementation is the only PII boundary.
    */
   export interface SanitizedResult {
     /** Allowlisted scalar fields only. */
     readonly fields: Readonly<
       Partial<{
         event_name: string;
         count: number;
         timestamp_bucket: string;
         error_signature: string;
         latency_ms: number;
         category: string;
       }>
     >;
     /** Per-row data must be aggregated to count distributions before this point. */
     readonly distributions: Readonly<Record<string, Readonly<Record<string, number>>>>;
   }

   /** Adapter contract: every provider adapter exports a sanitize() with this signature. */
   export type SanitizeFn<TRaw = unknown> = (rawResult: TRaw) => SanitizedResult;
   ```

2. Add to `packages/types/src/index.ts` immediately before the trailing `// --- Maintenance ---` block:

   ```ts
   // --- Pulse (read-side observability) ---
   export type {
     PulseConfig,
     PulseSources,
     PulseDbSource,
     SanitizedResult,
     SanitizeFn,
   } from './pulse';
   ```

3. Run: `pnpm -F @harness-engineering/types typecheck`
4. Run: `harness validate`
5. Commit: `feat(types): add PulseConfig and SanitizedResult type contracts`

---

### Task 2: Add type-only declarations for `SolutionDocFrontmatter` in `@harness-engineering/types`

**Depends on:** Task 1 | **Files:** `packages/types/src/solutions.ts`, `packages/types/src/index.ts`

1. Create `packages/types/src/solutions.ts`:

   ```ts
   /**
    * Solution-doc frontmatter contract.
    * Schema lives in @harness-engineering/core (packages/core/src/solutions/schema.ts).
    * BusinessKnowledgeIngestor in packages/graph imports these types ONLY (no runtime).
    */

   export type SolutionTrack = 'bug-track' | 'knowledge-track';

   export type BugTrackCategory =
     | 'build-errors'
     | 'test-failures'
     | 'runtime-errors'
     | 'performance-issues'
     | 'database-issues'
     | 'security-issues'
     | 'ui-bugs'
     | 'integration-issues'
     | 'logic-errors';

   export type KnowledgeTrackCategory =
     | 'architecture-patterns'
     | 'design-patterns'
     | 'tooling-decisions'
     | 'conventions'
     | 'dx'
     | 'best-practices';

   export type SolutionCategory = BugTrackCategory | KnowledgeTrackCategory;

   export interface SolutionDocFrontmatter {
     module: string;
     tags: string[];
     problem_type: string;
     last_updated: string; // ISO date YYYY-MM-DD
     track: SolutionTrack;
     category: SolutionCategory;
   }
   ```

2. Add to `packages/types/src/index.ts`:

   ```ts
   // --- Solutions (compound learning docs) ---
   export type {
     SolutionTrack,
     BugTrackCategory,
     KnowledgeTrackCategory,
     SolutionCategory,
     SolutionDocFrontmatter,
   } from './solutions';
   ```

3. Run: `pnpm -F @harness-engineering/types typecheck`
4. Run: `pnpm -F @harness-engineering/types test`
5. Run: `harness validate`
6. Commit: `feat(types): add SolutionDocFrontmatter and category enums`

---

### Task 3 (TDD): `PulseConfigSchema` Zod schema in core

**Depends on:** Task 1 | **Files:** `packages/core/src/pulse/schema.ts`, `packages/core/src/pulse/schema.test.ts`, `packages/core/src/pulse/index.ts`

1. Create `packages/core/src/pulse/schema.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { PulseConfigSchema } from './schema';

   describe('PulseConfigSchema', () => {
     const valid = {
       enabled: true,
       lookbackDefault: '24h',
       primaryEvent: 'page_view',
       valueEvent: 'value_realized',
       completionEvents: ['signup_complete'],
       qualityScoring: false,
       qualityDimension: null,
       sources: { analytics: 'posthog', tracing: 'sentry', payments: null, db: { enabled: false } },
       metricSourceOverrides: {},
       pendingMetrics: [],
       excludedMetrics: [],
     };

     it('parses a fully populated config', () => {
       expect(PulseConfigSchema.parse(valid)).toEqual(valid);
     });

     it('rejects wrong type for enabled', () => {
       expect(() => PulseConfigSchema.parse({ ...valid, enabled: 'yes' })).toThrow();
     });

     it('rejects unknown lookbackDefault format', () => {
       expect(() => PulseConfigSchema.parse({ ...valid, lookbackDefault: 'forever' })).toThrow();
     });

     it('accepts a config with all sources disabled', () => {
       const disabled = {
         ...valid,
         sources: { analytics: null, tracing: null, payments: null, db: { enabled: false } },
       };
       expect(PulseConfigSchema.parse(disabled)).toEqual(disabled);
     });
   });
   ```

2. Run: `pnpm -F @harness-engineering/core test -- src/pulse/schema.test.ts` — observe failure (module not found).
3. Create `packages/core/src/pulse/schema.ts`:

   ```ts
   import { z } from 'zod';
   import type { PulseConfig } from '@harness-engineering/types';

   const LOOKBACK_PATTERN = /^\d+(h|d|w)$/;

   export const PulseDbSourceSchema = z.object({
     enabled: z.boolean(),
     connectionEnv: z.string().optional(),
   });

   export const PulseSourcesSchema = z.object({
     analytics: z.string().nullable(),
     tracing: z.string().nullable(),
     payments: z.string().nullable(),
     db: PulseDbSourceSchema,
   });

   export const PulseConfigSchema = z.object({
     enabled: z.boolean(),
     lookbackDefault: z
       .string()
       .regex(LOOKBACK_PATTERN, 'lookback must be like "24h", "7d", or "1w"'),
     primaryEvent: z.string(),
     valueEvent: z.string(),
     completionEvents: z.array(z.string()),
     qualityScoring: z.boolean(),
     qualityDimension: z.string().nullable(),
     sources: PulseSourcesSchema,
     metricSourceOverrides: z.record(z.string(), z.string()),
     pendingMetrics: z.array(z.string()),
     excludedMetrics: z.array(z.string()),
   }) satisfies z.ZodType<PulseConfig>;
   ```

4. Create `packages/core/src/pulse/index.ts`:

   ```ts
   export { PulseConfigSchema, PulseSourcesSchema, PulseDbSourceSchema } from './schema';
   export type {
     PulseConfig,
     PulseSources,
     PulseDbSource,
     SanitizedResult,
     SanitizeFn,
   } from '@harness-engineering/types';
   ```

5. Run: `pnpm -F @harness-engineering/core test -- src/pulse/schema.test.ts` — observe pass (4 tests).
6. Run: `harness validate`
7. Run: `harness check-deps`
8. Commit: `feat(core): add PulseConfigSchema with Zod validation`

---

### Task 4 (TDD): `SolutionDocFrontmatterSchema` Zod schema in core

**Depends on:** Task 2 | **Files:** `packages/core/src/solutions/schema.ts`, `packages/core/src/solutions/schema.test.ts`, `packages/core/src/solutions/index.ts`

1. Create `packages/core/src/solutions/schema.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     SolutionDocFrontmatterSchema,
     BUG_TRACK_CATEGORIES,
     KNOWLEDGE_TRACK_CATEGORIES,
   } from './schema';

   const validBug = {
     module: 'orchestrator',
     tags: ['concurrency'],
     problem_type: 'race-condition',
     last_updated: '2026-05-05',
     track: 'bug-track' as const,
     category: 'integration-issues' as const,
   };

   describe('SolutionDocFrontmatterSchema', () => {
     it('accepts a valid bug-track frontmatter', () => {
       expect(SolutionDocFrontmatterSchema.parse(validBug)).toEqual(validBug);
     });

     it('accepts a valid knowledge-track frontmatter', () => {
       const valid = { ...validBug, track: 'knowledge-track', category: 'design-patterns' };
       expect(SolutionDocFrontmatterSchema.parse(valid)).toEqual(valid);
     });

     it('rejects unknown category', () => {
       expect(() =>
         SolutionDocFrontmatterSchema.parse({ ...validBug, category: 'unicorn-bugs' })
       ).toThrow();
     });

     it('rejects malformed last_updated', () => {
       expect(() =>
         SolutionDocFrontmatterSchema.parse({ ...validBug, last_updated: '05/05/2026' })
       ).toThrow();
     });

     it('rejects mismatched track/category combinations', () => {
       const mismatch = { ...validBug, track: 'knowledge-track', category: 'integration-issues' };
       expect(() => SolutionDocFrontmatterSchema.parse(mismatch)).toThrow();
     });

     it('exports complete category lists', () => {
       expect(BUG_TRACK_CATEGORIES).toHaveLength(9);
       expect(KNOWLEDGE_TRACK_CATEGORIES).toHaveLength(6);
     });
   });
   ```

2. Run the test — observe failure.
3. Create `packages/core/src/solutions/schema.ts`:

   ```ts
   import { z } from 'zod';
   import type { SolutionDocFrontmatter } from '@harness-engineering/types';

   export const BUG_TRACK_CATEGORIES = [
     'build-errors',
     'test-failures',
     'runtime-errors',
     'performance-issues',
     'database-issues',
     'security-issues',
     'ui-bugs',
     'integration-issues',
     'logic-errors',
   ] as const;

   export const KNOWLEDGE_TRACK_CATEGORIES = [
     'architecture-patterns',
     'design-patterns',
     'tooling-decisions',
     'conventions',
     'dx',
     'best-practices',
   ] as const;

   export const ALL_SOLUTION_CATEGORIES = [
     ...BUG_TRACK_CATEGORIES,
     ...KNOWLEDGE_TRACK_CATEGORIES,
   ] as const;

   const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

   const BugTrackSchema = z.object({
     track: z.literal('bug-track'),
     category: z.enum(BUG_TRACK_CATEGORIES),
   });

   const KnowledgeTrackSchema = z.object({
     track: z.literal('knowledge-track'),
     category: z.enum(KNOWLEDGE_TRACK_CATEGORIES),
   });

   const BaseFrontmatter = z.object({
     module: z.string().min(1),
     tags: z.array(z.string()),
     problem_type: z.string().min(1),
     last_updated: z.string().regex(ISO_DATE, 'last_updated must be ISO date YYYY-MM-DD'),
   });

   export const SolutionDocFrontmatterSchema = z.discriminatedUnion('track', [
     BaseFrontmatter.merge(BugTrackSchema),
     BaseFrontmatter.merge(KnowledgeTrackSchema),
   ]) satisfies z.ZodType<SolutionDocFrontmatter>;
   ```

4. Create `packages/core/src/solutions/index.ts`:

   ```ts
   export {
     SolutionDocFrontmatterSchema,
     BUG_TRACK_CATEGORIES,
     KNOWLEDGE_TRACK_CATEGORIES,
     ALL_SOLUTION_CATEGORIES,
   } from './schema';
   export type {
     SolutionTrack,
     BugTrackCategory,
     KnowledgeTrackCategory,
     SolutionCategory,
     SolutionDocFrontmatter,
   } from '@harness-engineering/types';
   ```

5. Run the test — observe pass (6 tests).
6. Run: `harness validate`
7. Run: `harness check-deps`
8. Commit: `feat(core): add SolutionDocFrontmatterSchema with closed category enums`

---

### Task 5 (TDD): `SanitizedResult` runtime type guard and PII denylist

**Depends on:** Task 1 | **Files:** `packages/core/src/pulse/sanitize.ts`, `packages/core/src/pulse/sanitize.test.ts`

1. Create `packages/core/src/pulse/sanitize.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     PII_FIELD_DENYLIST,
     ALLOWED_FIELD_KEYS,
     isSanitizedResult,
     assertSanitized,
   } from './sanitize';

   describe('PII boundary', () => {
     it('denylist matches all forbidden field names', () => {
       for (const f of [
         'email',
         'user_id',
         'session_id',
         'ip',
         'name',
         'phone',
         'address',
         'message',
         'content',
         'payload',
       ]) {
         expect(PII_FIELD_DENYLIST.test(f)).toBe(true);
       }
       PII_FIELD_DENYLIST.lastIndex = 0;
     });

     it('denylist does not match allowlist fields', () => {
       for (const f of ALLOWED_FIELD_KEYS) {
         expect(PII_FIELD_DENYLIST.test(f)).toBe(false);
       }
     });

     it('isSanitizedResult accepts a clean result', () => {
       expect(isSanitizedResult({ fields: { count: 5 }, distributions: {} })).toBe(true);
     });

     it('isSanitizedResult rejects non-allowlisted fields', () => {
       expect(isSanitizedResult({ fields: { email: 'a@b.com' } as never, distributions: {} })).toBe(
         false
       );
     });

     it('assertSanitized throws on PII fields', () => {
       expect(() =>
         assertSanitized({ fields: { user_id: 'x' } as never, distributions: {} })
       ).toThrow();
     });
   });
   ```

2. Run — observe failure.
3. Create `packages/core/src/pulse/sanitize.ts`:

   ```ts
   import type { SanitizedResult } from '@harness-engineering/types';

   /** The only field keys allowed in a SanitizedResult.fields. */
   export const ALLOWED_FIELD_KEYS = [
     'event_name',
     'count',
     'timestamp_bucket',
     'error_signature',
     'latency_ms',
     'category',
   ] as const;

   /** Regex that rejects any field name considered PII per Decision 7. */
   export const PII_FIELD_DENYLIST =
     /^(email|user_id|session_id|ip|name|phone|address|message|content|payload)$/i;

   const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_FIELD_KEYS);

   export function isSanitizedResult(value: unknown): value is SanitizedResult {
     if (!value || typeof value !== 'object') return false;
     const v = value as { fields?: unknown; distributions?: unknown };
     if (!v.fields || typeof v.fields !== 'object') return false;
     for (const k of Object.keys(v.fields)) {
       if (!ALLOWED_SET.has(k)) return false;
       if (PII_FIELD_DENYLIST.test(k)) return false;
     }
     if (!v.distributions || typeof v.distributions !== 'object') return false;
     return true;
   }

   export function assertSanitized(value: unknown): asserts value is SanitizedResult {
     if (!isSanitizedResult(value)) {
       throw new Error('PII boundary violated: result is not a SanitizedResult');
     }
   }
   ```

4. Run the test — observe pass (5 tests).
5. Run: `harness validate`
6. Commit: `feat(core): add SanitizedResult type guard and PII denylist`

---

### Task 6 (TDD): `validatePulseConfig` for `harness validate`

**Depends on:** Task 3 | **Files:** `packages/core/src/validation/pulse.ts`, `packages/core/src/validation/pulse.test.ts`, `packages/core/src/validation/index.ts`

1. Create `packages/core/src/validation/pulse.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'node:fs/promises';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { validatePulseConfig } from './pulse';

   async function tmpProject(config: unknown): Promise<string> {
     const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-validate-'));
     await fs.writeFile(path.join(dir, 'harness.config.json'), JSON.stringify(config));
     return dir;
   }

   describe('validatePulseConfig', () => {
     it('returns ok=true when no pulse: block exists', async () => {
       const dir = await tmpProject({ name: 'x' });
       const r = await validatePulseConfig(dir);
       expect(r.ok).toBe(true);
     });

     it('returns ok=true for a valid pulse: block', async () => {
       const dir = await tmpProject({
         name: 'x',
         pulse: {
           enabled: true,
           lookbackDefault: '24h',
           primaryEvent: 'pv',
           valueEvent: 'val',
           completionEvents: [],
           qualityScoring: false,
           qualityDimension: null,
           sources: { analytics: null, tracing: null, payments: null, db: { enabled: false } },
           metricSourceOverrides: {},
           pendingMetrics: [],
           excludedMetrics: [],
         },
       });
       const r = await validatePulseConfig(dir);
       expect(r.ok).toBe(true);
     });

     it('returns ok=false for invalid pulse: block', async () => {
       const dir = await tmpProject({ name: 'x', pulse: { enabled: 'nope' } });
       const r = await validatePulseConfig(dir);
       expect(r.ok).toBe(false);
     });
   });
   ```

2. Run — observe failure.
3. Create `packages/core/src/validation/pulse.ts`:

   ```ts
   import * as fs from 'node:fs/promises';
   import * as path from 'node:path';
   import { Result, Ok, Err } from '@harness-engineering/types';
   import { PulseConfigSchema } from '../pulse/schema';
   import { validateConfig } from './config';
   import type { ConfigError } from './types';
   import { createError } from '../shared/errors';

   export interface PulseConfigValidation {
     present: boolean;
     valid: boolean;
   }

   export async function validatePulseConfig(
     cwd: string
   ): Promise<Result<PulseConfigValidation, ConfigError>> {
     const configPath = path.join(cwd, 'harness.config.json');
     let raw: string;
     try {
       raw = await fs.readFile(configPath, 'utf-8');
     } catch {
       return Ok({ present: false, valid: true });
     }
     let parsed: Record<string, unknown>;
     try {
       parsed = JSON.parse(raw);
     } catch (e) {
       return Err(
         createError<ConfigError>(
           'VALIDATION_FAILED',
           `harness.config.json is not valid JSON: ${(e as Error).message}`,
           {},
           []
         )
       );
     }
     if (!('pulse' in parsed)) return Ok({ present: false, valid: true });
     const result = validateConfig(parsed.pulse, PulseConfigSchema);
     if (!result.ok) return Err(result.error);
     return Ok({ present: true, valid: true });
   }
   ```

4. Add to `packages/core/src/validation/index.ts`:

   ```ts
   export { validatePulseConfig } from './pulse';
   export type { PulseConfigValidation } from './pulse';
   ```

5. Run the test — observe pass (3 tests).
6. Run: `harness validate`
7. Commit: `feat(core): add validatePulseConfig for harness validate integration`

---

### Task 7 (TDD): `validateSolutionsDir` for `harness validate`

**Depends on:** Task 4 | **Files:** `packages/core/src/validation/solutions.ts`, `packages/core/src/validation/solutions.test.ts`, `packages/core/src/validation/index.ts`

1. Create `packages/core/src/validation/solutions.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'node:fs/promises';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { validateSolutionsDir } from './solutions';

   const validFm = `---
   module: orchestrator
   tags: [concurrency]
   problem_type: race-condition
   last_updated: '2026-05-05'
   track: bug-track
   category: integration-issues
   ```

---

# Body

`;

const badCategory = validFm.replace('integration-issues', 'unicorn-bugs');

async function makeProject(files: Record<string, string>): Promise<string> {
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'solutions-validate-'));
for (const [rel, content] of Object.entries(files)) {
const full = path.join(dir, rel);
await fs.mkdir(path.dirname(full), { recursive: true });
await fs.writeFile(full, content);
}
return dir;
}

describe('validateSolutionsDir', () => {
it('returns ok=true when docs/solutions does not exist', async () => {
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'solutions-empty-'));
const r = await validateSolutionsDir(dir);
expect(r.ok).toBe(true);
});

     it('accepts valid solution doc', async () => {
       const dir = await makeProject({ 'docs/solutions/bug-track/integration-issues/foo.md': validFm });
       const r = await validateSolutionsDir(dir);
       expect(r.ok).toBe(true);
     });

     it('rejects unknown category', async () => {
       const dir = await makeProject({ 'docs/solutions/bug-track/unicorn-bugs/foo.md': badCategory });
       const r = await validateSolutionsDir(dir);
       expect(r.ok).toBe(false);
     });

});

````

2. Run — observe failure.
3. Create `packages/core/src/validation/solutions.ts`:

```ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import matter from 'gray-matter';
import { Result, Ok, Err } from '@harness-engineering/types';
import { SolutionDocFrontmatterSchema } from '../solutions/schema';
import { validateConfig } from './config';
import type { ConfigError } from './types';
import { createError } from '../shared/errors';

export interface SolutionsDirValidation {
  filesChecked: number;
  issues: Array<{ file: string; message: string }>;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.md')) yield p;
  }
}

export async function validateSolutionsDir(cwd: string): Promise<Result<SolutionsDirValidation, ConfigError>> {
  const root = path.join(cwd, 'docs', 'solutions');
  try { await fs.stat(root); } catch { return Ok({ filesChecked: 0, issues: [] }); }
  const issues: Array<{ file: string; message: string }> = [];
  let count = 0;
  for await (const file of walk(root)) {
    if (file.includes(`${path.sep}.candidates${path.sep}`)) continue;
    if (file.includes(`${path.sep}references${path.sep}`)) continue;
    if (file.includes(`${path.sep}assets${path.sep}`)) continue;
    count++;
    const raw = await fs.readFile(file, 'utf-8');
    const parsed = matter(raw);
    const result = validateConfig(parsed.data, SolutionDocFrontmatterSchema);
    if (!result.ok) issues.push({ file: path.relative(cwd, file), message: result.error.message });
  }
  if (issues.length > 0) {
    return Err(createError<ConfigError>(
      'VALIDATION_FAILED',
      `${issues.length} solution doc(s) failed frontmatter validation`,
      { issues }, []
    ));
  }
  return Ok({ filesChecked: count, issues: [] });
}
````

4. Append to `packages/core/src/validation/index.ts`:

   ```ts
   export { validateSolutionsDir } from './solutions';
   export type { SolutionsDirValidation } from './solutions';
   ```

5. If `gray-matter` is not yet a dep: `pnpm -F @harness-engineering/core add gray-matter`. Verify by running the test.
6. Run the test — observe pass (3 tests).
7. Run: `harness validate`
8. Run: `harness check-deps`
9. Commit: `feat(core): add validateSolutionsDir for harness validate integration`

---

### Task 8: Wire pulse + solutions validators into `harness validate` CLI

**Depends on:** Task 6, Task 7 | **Files:** `packages/cli/src/commands/validate.ts`

1. Modify `packages/cli/src/commands/validate.ts`:
   - Add to the import block at top: `validatePulseConfig, validateSolutionsDir,` alongside existing `@harness-engineering/core` imports.
   - Extend `ValidateResult.checks` to include `pulseConfig: boolean` and `solutionsDir: boolean`.
   - After the existing knowledgeMap check (around line 108), append:

     ```ts
     // Pulse config (optional — passes if absent)
     const pulseResult = await validatePulseConfig(cwd);
     if (pulseResult.ok) {
       result.checks.pulseConfig = true;
     } else {
       result.valid = false;
       result.issues.push({
         check: 'pulseConfig',
         file: 'harness.config.json',
         message: pulseResult.error.message,
         ...(pulseResult.error.suggestions?.[0] !== undefined && {
           suggestion: pulseResult.error.suggestions[0],
         }),
       });
     }

     // Solutions directory (optional — passes if absent)
     const solutionsResult = await validateSolutionsDir(cwd);
     if (solutionsResult.ok) {
       result.checks.solutionsDir = true;
     } else {
       result.valid = false;
       const detail = solutionsResult.error.context as
         | { issues?: Array<{ file: string; message: string }> }
         | undefined;
       for (const issue of detail?.issues ?? [
         { file: 'docs/solutions', message: solutionsResult.error.message },
       ]) {
         result.issues.push({ check: 'solutionsDir', file: issue.file, message: issue.message });
       }
     }
     ```

   - Initialize the new check fields to `false` in the `result` literal (around line 64).

2. Run: `pnpm -F @harness-engineering/cli typecheck`
3. Run: `pnpm -F @harness-engineering/cli test`
4. Run: `harness validate` from repo root — confirm new checks pass (no `pulse:` block in repo config; no solution docs yet so directory check passes by absence).
5. Run: `harness check-deps`
6. Commit: `feat(cli): wire pulse + solutions validators into harness validate`

---

### Task 9 [checkpoint:human-verify]: Create `docs/solutions/` directory skeleton

**Depends on:** none (parallel-safe with Tasks 1-8) | **Files:** 17 `.gitkeep` files under `docs/solutions/`

1. Create the directory skeleton with one shell command (single `mkdir -p` per category to keep it auditable):

   ```sh
   mkdir -p docs/solutions/bug-track/{build-errors,test-failures,runtime-errors,performance-issues,database-issues,security-issues,ui-bugs,integration-issues,logic-errors}
   mkdir -p docs/solutions/knowledge-track/{architecture-patterns,design-patterns,tooling-decisions,conventions,dx,best-practices}
   mkdir -p docs/solutions/{references,assets,.candidates}
   ```

2. Add `.gitkeep` to every leaf directory (15 category dirs + `.candidates`):

   ```sh
   for d in docs/solutions/bug-track/* docs/solutions/knowledge-track/* docs/solutions/.candidates; do
     touch "$d/.gitkeep"
   done
   ```

3. Verify: `ls docs/solutions/bug-track | wc -l` reports 9; `ls docs/solutions/knowledge-track | wc -l` reports 6.
4. **[checkpoint:human-verify]** Show the directory tree (`find docs/solutions -type d | sort`) to a human and confirm structure matches Decision 8 before committing.
5. Run: `harness validate`
6. Commit: `feat(solutions): create category directory skeleton (Decision 8)`

---

### Task 10: Write `references/schema.yaml` and `references/category-mapping.md`

**Depends on:** Task 9 | **Files:** `docs/solutions/references/schema.yaml`, `docs/solutions/references/category-mapping.md`

1. Create `docs/solutions/references/schema.yaml`:

   ```yaml
   # Solution-doc frontmatter schema.
   # Authoritative Zod definition: packages/core/src/solutions/schema.ts.
   # This YAML is for human reference and consumed by harness-compound's classify phase.
   version: 1
   required:
     - module
     - tags
     - problem_type
     - last_updated
     - track
     - category
   fields:
     module: { type: string, description: "Affected package or area, e.g. 'orchestrator'" }
     tags: { type: 'array<string>', description: 'Free-form keywords' }
     problem_type: { type: string, description: "Short noun phrase, e.g. 'race-condition'" }
     last_updated: { type: string, format: 'YYYY-MM-DD' }
     track:
       type: enum
       values: [bug-track, knowledge-track]
     category:
       type: enum
       depends_on: track
       bug-track:
         - build-errors
         - test-failures
         - runtime-errors
         - performance-issues
         - database-issues
         - security-issues
         - ui-bugs
         - integration-issues
         - logic-errors
       knowledge-track:
         - architecture-patterns
         - design-patterns
         - tooling-decisions
         - conventions
         - dx
         - best-practices
   ```

2. Create `docs/solutions/references/category-mapping.md`:

   ```markdown
   # Category mapping

   This document is the operator-facing classification guide used by `harness-compound`'s classify phase. The authoritative type list lives in `packages/core/src/solutions/schema.ts`; this file is documentation.

   ## bug-track (the fix-shape: a problem was solved)

   | Category           | Use when                                 | Example                                |
   | ------------------ | ---------------------------------------- | -------------------------------------- |
   | build-errors       | Build/typecheck/lint failures            | TS error after dep upgrade             |
   | test-failures      | Tests fail in a specific predictable way | Flaky test root-caused to retry budget |
   | runtime-errors     | Process crashes or unhandled exceptions  | Null deref in adapter init             |
   | performance-issues | Latency/throughput regressions           | N+1 query, wrong index                 |
   | database-issues    | Schema, migration, or query failures     | Missing FK, deadlock                   |
   | security-issues    | Vulnerabilities, leaks, missing authz    | PII in logs, unsigned cookie           |
   | ui-bugs            | Visual / interaction defects             | Z-index regression, focus trap         |
   | integration-issues | Cross-system contract bugs               | Webhook signature mismatch             |
   | logic-errors       | Wrong-output-but-no-crash bugs           | Off-by-one in scheduler                |

   ## knowledge-track (the pattern-shape: a reusable insight)

   | Category              | Use when                                     | Example                                     |
   | --------------------- | -------------------------------------------- | ------------------------------------------- |
   | architecture-patterns | A high-level structural choice is documented | "Layered packages with strict layer rules"  |
   | design-patterns       | A within-package pattern is documented       | "Result<T,E> for fallible APIs"             |
   | tooling-decisions     | A tool was chosen over alternatives          | "pnpm over npm for workspaces"              |
   | conventions           | A team/project convention is recorded        | "Frontmatter shape for solution docs"       |
   | dx                    | A developer-experience improvement           | "Slash command auto-generation"             |
   | best-practices        | A general "do this" guideline                | "Type-only imports across layer boundaries" |
   ```

3. Run: `harness validate`
4. Commit: `docs(solutions): add schema.yaml and category-mapping.md references`

---

### Task 11: Write `assets/resolution-template.md`

**Depends on:** Task 9 | **Files:** `docs/solutions/assets/resolution-template.md`

1. Create `docs/solutions/assets/resolution-template.md`:

   ```markdown
   ---
   module: <package-or-area>
   tags: [<tag1>, <tag2>]
   problem_type: <short-noun-phrase>
   last_updated: 'YYYY-MM-DD'
   track: <bug-track | knowledge-track>
   category: <category-from-schema.yaml>
   ---

   # <Title — concise problem statement>

   <!-- Bug-track sections: Problem, Root cause, Solution, Prevention. -->
   <!-- Knowledge-track sections: Context, Guidance, Applicability. -->

   ## Problem

   <!-- bug-track: What was failing and how it manifested. -->
   <!-- knowledge-track: omit this section. -->

   ## Root cause

   <!-- bug-track: The underlying cause. Cite file:line where helpful. -->
   <!-- knowledge-track: omit this section. -->

   ## Solution

   <!-- bug-track: The fix; reference the commit(s). -->
   <!-- knowledge-track: omit this section. -->

   ## Prevention

   <!-- bug-track: What stops this class of problem from recurring (test, lint rule, ADR). -->
   <!-- knowledge-track: omit this section. -->

   ## Context

   <!-- knowledge-track: Where and when this pattern applies. -->
   <!-- bug-track: omit this section. -->

   ## Guidance

   <!-- knowledge-track: The pattern itself, with concrete examples. -->
   <!-- bug-track: omit this section. -->

   ## Applicability

   <!-- knowledge-track: When NOT to use it; trade-offs. -->
   <!-- bug-track: omit this section. -->

   ## References

   - <link to commit, PR, or external resource>
   ```

2. Run: `harness validate`
3. Run: `harness check-deps`
4. Commit: `docs(solutions): add resolution-template.md asset`

---

### Integration Tasks

(Per spec § Integration Points — applicable subsections for this phase. Entry Points: solution-doc schema is the entry point for `harness validate`. Registrations: schemas registered with `harness validate`. Documentation Updates: defer to phase 8. ADRs: defer to phase 8.)

The solution-doc schema entry point and `harness validate` registrations are delivered by Tasks 1-8 (schema modules) and Task 8 specifically (CLI wiring). No additional standalone integration tasks are needed for this phase — wiring is part of the implementation tasks. Skill-barrel exports, slash command regen, `BUILT_IN_TASKS` entries, dashboard surfacing, and `BusinessKnowledgeIngestor` consumption are all out of scope for Phase 1 and tracked by phases 2-8.

## Plan Summary

- 11 implementation tasks; total ~38 minutes.
- Skeleton skipped (rigor: fast).
- Integration tier: medium (new public types in `@harness-engineering/types`, new validators registered with `harness validate`, new directory layout under `docs/`).
- Checkpoints: 1 (Task 9 — human-verify directory structure before committing).
- Final checks: every task ends with `harness validate`; Tasks 3, 4, 7, 8, 11 also run `harness check-deps`.
- TDD: Tasks 3, 4, 5, 6, 7 are test-first.
- Parallelism opportunity: Task 9 (directory skeleton) can run in parallel with the type/schema tasks; Tasks 10 and 11 depend only on Task 9.
