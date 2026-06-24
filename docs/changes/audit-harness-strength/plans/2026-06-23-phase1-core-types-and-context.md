# Plan: audit-harness-strength — Phase 1 (Core types, context, scoring)

**Date:** 2026-06-23 | **Spec:** docs/changes/audit-harness-strength/proposal.md | **Tasks:** 9 | **Time:** ~36 min | **Integration Tier:** medium

## Goal

Establish the deterministic foundation of the harness-strength module in `packages/core` — zod-typed contracts (`StrengthFinding`, `StrengthRule`, `ProjectContext`, `AuditResult`, `Mode`/`Severity`/`Tier`), a `buildProjectContext(root, mode)` that reads every input once and never crashes on absent inputs, `resolveMode`, file-based hook resolution, and a pure `rollupScore(findings)` — with unit tests for scoring, mode detection, and absent-input handling.

## Scope boundary

**In scope (Phase 1 only):** `types.ts`, `context.ts`, `scoring.ts`, their unit tests, and the `harness-strength/index.ts` barrel wired into the core package index. The `StrengthRule` **interface** and the `ALL_RULES` registry **shape** (an empty, typed registry) are defined here.

**Explicitly out of scope (Phase 2+):** the 7 rule implementations (`rules/strength-00N-*.ts`), `auditor.ts` (`HarnessStrengthAuditor`), the CLI command, the skill, and dogfood verification. Do not implement any rule `detect()` logic.

## Observable Truths (Acceptance Criteria)

1. The system shall expose, from `@harness-engineering/core`, the types `StrengthFinding`, `StrengthRule`, `ProjectContext`, `AuditResult`, `Mode`, `Severity`, `Tier` and their zod schemas (`StrengthFindingSchema`, etc.).
2. When given `findings`, `rollupScore(findings)` shall return `{ score, tier }` where `score = clamp(100 − (errors×14 + warnings×6 + info×2), 0, 100)` and `tier = score ≥ 85 ? 'solid' : score ≥ 50 ? 'at-risk' : 'theatre'`.
3. The system shall be deterministic: the same `findings` array yields the same `{ score, tier }` across runs (no Date/random/IO in `scoring.ts`).
4. When no mode flag is given and **both** `templates/` and `agents/skills/` exist at `root`, `resolveMode` shall return `'toolkit'`; otherwise `'adopter'`. An explicit `'toolkit'`/`'adopter'` option shall win over auto-detection.
5. If a required input file is absent (`harness.config.json`, `.husky/pre-commit`, `.harness/health-snapshot.json`, `.claude/settings.json`, workflow dir), then `buildProjectContext` shall populate the corresponding field with `null`/`[]` and shall not throw.
6. When `mode === 'adopter'`, `buildProjectContext` shall leave `templates`/`initSkill` undefined; when `mode === 'toolkit'`, it shall populate `templates` (`.hbs` under `templates/`) and `initSkill` (path/text or `null`).
7. `buildProjectContext` shall resolve `hookFiles` from `.claude/settings.json` hook registrations plus scripts present in `.husky/` and `.claude/hooks/`, deduplicated by absolute path; when none resolve, `hookFiles` shall be `[]` (callers report "not evaluable", not a false pass).
8. `npx vitest run` for the three new test files passes; `harness validate` passes; barrel exports regenerated so `harness-strength` is reachable from the core index.

## Uncertainties

- [ASSUMPTION → RESOLVED] **`ProjectContext.config` cannot be the cli `HarnessConfig`.** `HarnessConfig` is defined in `packages/cli/src/config/schema.ts:809`, and `packages/core` does not depend on `@harness-engineering/cli` (verified: core deps are `graph`, `types`, zod, yaml, glob, etc.). Importing it would invert the dependency. **Decision:** `context.ts` defines a core-local `HarnessConfigSubsetSchema` covering only the keys Phase 2 rules read (`layers`, `architecture.thresholds`, `template.level`, `audit.harnessStrength.severities`), parsed leniently (`.passthrough()`), and `ProjectContext.config` is typed as that subset `| null`. This is a deliberate deviation from the spec's literal `config: HarnessConfig | null`.
- [ASSUMPTION → RESOLVED] **`packages/cli/src/hooks/profiles.ts` is in cli, not core.** Phase 1 hook resolution is therefore **file-based only** (read `.claude/settings.json` + enumerate `.husky/` and `.claude/hooks/` scripts). Profile→hookset mapping is deferred; the spec's profile path is a Phase 2 concern in the cli command layer and does not block STRENGTH-001's context. Documented as a concern in the handoff.
- [DEFERRABLE] Exact severity weights are spec-fixed for now (14/6/2). `scoring.ts` exposes them as a named, exported `SEVERITY_WEIGHTS` constant so tuning is a one-line change with no test rewrite.
- [DEFERRABLE] `healthSnapshot` and `workflows[].text` are stored raw/parsed-as-`unknown` — Phase 1 does not interpret them; STRENGTH-006/007 (Phase 2) own that.

## Conventions to mirror (evidence)

- Zod schema + `z.infer` type pairing: `packages/core/src/architecture/types.ts:19-27` (`ViolationSchema` → `Violation`).
- Severity union `'error' | 'warning' | 'info'`: `packages/core/src/security/types.ts:16`.
- Rule-as-interface registry: `packages/core/src/security/types.ts:19-31` (`SecurityRule`) and `packages/core/src/security/index.ts` barrel.
- Result type: `packages/types/src/result.ts:4` — `Result<T,E> = {ok:true;value:T} | {ok:false;error:E}`; re-exported via `packages/core/src/shared/result.ts`. (Used by Phase 2 `auditor.ts`; Phase 1 types reference it only in the `StrengthRule`/`AuditResult` contract, not in runtime code.)
- Test style: `import { describe, it, expect } from 'vitest';` — `packages/core/src/pulse/sanitize.test.ts:1`.
- YAML parse (for Phase 2 workflows; Phase 1 reads workflow files as raw text only): `import { parse as parseYaml } from 'yaml'` — `packages/core/src/roadmap/tracker/body-metadata.ts:1`.

## File Map

- CREATE `packages/core/src/harness-strength/types.ts`
- CREATE `packages/core/src/harness-strength/types.test.ts`
- CREATE `packages/core/src/harness-strength/scoring.ts`
- CREATE `packages/core/src/harness-strength/scoring.test.ts`
- CREATE `packages/core/src/harness-strength/context.ts`
- CREATE `packages/core/src/harness-strength/context.test.ts`
- CREATE `packages/core/src/harness-strength/rules/index.ts` (empty typed `ALL_RULES` registry)
- CREATE `packages/core/src/harness-strength/index.ts` (module barrel)
- MODIFY `packages/core/src/index.ts` (add `export * from './harness-strength';` — regenerated, not hand-edited if a generator owns it)

## Skeleton

1. Types: zod schemas + `StrengthRule` interface + empty registry (~3 tasks, ~12 min)
2. Scoring: pure rollup + deterministic tests (~2 tasks, ~8 min)
3. Context: mode resolution, hook resolution, absent-input reads + tests (~3 tasks, ~14 min)
4. Wiring: module barrel + core index regen + validate (~1 task, ~2 min)

**Estimated total:** 9 tasks, ~36 minutes. _Skeleton approved: pending (standard rigor, 9 tasks ≥ 8 → approval gate before expansion)._

---

## Tasks

> **Every task** runs in Node 22. Prefix each terminal session once with:
> `source ~/.nvm/nvm.sh && nvm use 22`

### Task 1: Define enums and `StrengthFinding` zod schema + types

**Depends on:** none | **Files:** `packages/core/src/harness-strength/types.ts`

1. Create `packages/core/src/harness-strength/types.ts` with the literal-union schemas and the finding schema:

   ```ts
   import { z } from 'zod';

   // --- Enums ---

   export const ModeSchema = z.enum(['adopter', 'toolkit']);
   export type Mode = z.infer<typeof ModeSchema>;

   export const SeveritySchema = z.enum(['error', 'warning', 'info']);
   export type Severity = z.infer<typeof SeveritySchema>;

   export const TierSchema = z.enum(['solid', 'at-risk', 'theatre']);
   export type Tier = z.infer<typeof TierSchema>;

   // --- Finding ---

   export const StrengthFindingSchema = z.object({
     id: z.string(), // e.g. "STRENGTH-001"
     gearPiece: z.string(), // label only (v1) — gear piece this defends
     severity: SeveritySchema,
     file: z.string(), // relative to root
     line: z.number().int().positive().optional(), // when locatable
     message: z.string(), // what's wrong
     remediation: z.string(), // concrete fix
   });
   export type StrengthFinding = z.infer<typeof StrengthFindingSchema>;
   ```

2. Run: `npx tsc -p packages/core/tsconfig.json --noEmit` (observe no errors for this file).
3. Run: `npx harness validate`
4. Commit: `feat(harness-strength): add Mode/Severity/Tier enums and StrengthFinding schema`

### Task 2: Define `ProjectContext` and `AuditResult` zod schemas + the `StrengthRule` interface

**Depends on:** Task 1 | **Files:** `packages/core/src/harness-strength/types.ts`

1. Append to `packages/core/src/harness-strength/types.ts`:

   ```ts
   // --- HarnessConfig subset (core-local; cli's HarnessConfig is not importable here) ---
   // Only the keys Phase 2 rules read. Lenient parse: unknown keys pass through.

   export const HarnessConfigSubsetSchema = z
     .object({
       layers: z.array(z.unknown()).optional(),
       architecture: z
         .object({ thresholds: z.record(z.unknown()).optional() })
         .passthrough()
         .optional(),
       template: z.object({ level: z.string().optional() }).passthrough().optional(),
       audit: z
         .object({
           harnessStrength: z
             .object({ severities: z.record(SeveritySchema).optional() })
             .passthrough()
             .optional(),
         })
         .passthrough()
         .optional(),
     })
     .passthrough();
   export type HarnessConfigSubset = z.infer<typeof HarnessConfigSubsetSchema>;

   // --- ProjectContext ---

   export const HookFileSchema = z.object({
     name: z.string(),
     path: z.string(),
     text: z.string(),
   });
   export type HookFile = z.infer<typeof HookFileSchema>;

   export const ProjectContextSchema = z.object({
     root: z.string(),
     mode: ModeSchema,
     config: HarnessConfigSubsetSchema.nullable(),
     preCommit: z.string().nullable(),
     hookFiles: z.array(HookFileSchema),
     workflows: z.array(z.object({ path: z.string(), text: z.string() })),
     healthSnapshot: z.unknown().nullable(),
     templates: z.array(z.object({ path: z.string(), text: z.string() })).optional(),
     initSkill: z.string().nullable().optional(),
   });
   export type ProjectContext = z.infer<typeof ProjectContextSchema>;

   // --- AuditResult ---

   export const AuditSummarySchema = z.object({
     errors: z.number().int().nonnegative(),
     warnings: z.number().int().nonnegative(),
     info: z.number().int().nonnegative(),
     rulesRun: z.number().int().nonnegative(),
     rulesPassing: z.number().int().nonnegative(),
   });

   export const AuditResultSchema = z.object({
     mode: ModeSchema,
     score: z.number().min(0).max(100),
     tier: TierSchema,
     findings: z.array(StrengthFindingSchema),
     summary: AuditSummarySchema,
   });
   export type AuditResult = z.infer<typeof AuditResultSchema>;

   // --- StrengthRule interface (registry contract; implementations land in Phase 2) ---

   export interface StrengthRule {
     id: string;
     gearPiece: string;
     defaultSeverity: Severity;
     appliesIn(mode: Mode): boolean;
     // severity is applied by the auditor (config-overridable); detect returns the rest:
     detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[];
   }
   ```

2. Run: `npx tsc -p packages/core/tsconfig.json --noEmit` (observe no errors).
3. Run: `npx harness validate`
4. Commit: `feat(harness-strength): add ProjectContext, AuditResult, StrengthRule contracts`

### Task 3 (TDD): Type-contract tests for schemas

**Depends on:** Task 2 | **Files:** `packages/core/src/harness-strength/types.test.ts`

1. Create `packages/core/src/harness-strength/types.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     StrengthFindingSchema,
     ProjectContextSchema,
     AuditResultSchema,
     HarnessConfigSubsetSchema,
   } from './types';

   describe('StrengthFindingSchema', () => {
     it('accepts a valid finding without optional line', () => {
       const r = StrengthFindingSchema.safeParse({
         id: 'STRENGTH-001',
         gearPiece: 'hooks',
         severity: 'error',
         file: '.husky/pre-commit',
         message: 'hook never blocks',
         remediation: 'remove the unconditional exit 0',
       });
       expect(r.success).toBe(true);
     });

     it('rejects an unknown severity', () => {
       const r = StrengthFindingSchema.safeParse({
         id: 'X',
         gearPiece: 'g',
         severity: 'fatal',
         file: 'f',
         message: 'm',
         remediation: 'r',
       });
       expect(r.success).toBe(false);
     });
   });

   describe('HarnessConfigSubsetSchema', () => {
     it('passes through unknown top-level keys', () => {
       const r = HarnessConfigSubsetSchema.safeParse({
         unknownKey: 1,
         template: { level: 'basic' },
       });
       expect(r.success).toBe(true);
       if (r.success) expect(r.data.template?.level).toBe('basic');
     });
   });

   describe('ProjectContextSchema', () => {
     it('accepts a minimal adopter context with absent inputs', () => {
       const r = ProjectContextSchema.safeParse({
         root: '/x',
         mode: 'adopter',
         config: null,
         preCommit: null,
         hookFiles: [],
         workflows: [],
         healthSnapshot: null,
       });
       expect(r.success).toBe(true);
     });
   });

   describe('AuditResultSchema', () => {
     it('rejects a score above 100', () => {
       const r = AuditResultSchema.safeParse({
         mode: 'adopter',
         score: 101,
         tier: 'solid',
         findings: [],
         summary: { errors: 0, warnings: 0, info: 0, rulesRun: 0, rulesPassing: 0 },
       });
       expect(r.success).toBe(false);
     });
   });
   ```

2. Run: `npx vitest run packages/core/src/harness-strength/types.test.ts` — observe pass.
3. Run: `npx harness validate`
4. Commit: `test(harness-strength): contract tests for core schemas`

### Task 4 (TDD): Write `scoring.test.ts` (deterministic), observe failure

**Depends on:** Task 1 | **Files:** `packages/core/src/harness-strength/scoring.test.ts`

1. Create `packages/core/src/harness-strength/scoring.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { rollupScore, SEVERITY_WEIGHTS } from './scoring';
   import type { StrengthFinding } from './types';

   const f = (severity: StrengthFinding['severity']): StrengthFinding => ({
     id: 'STRENGTH-001',
     gearPiece: 'g',
     severity,
     file: 'f',
     message: 'm',
     remediation: 'r',
   });

   describe('rollupScore', () => {
     it('scores 100 / solid with no findings', () => {
       expect(rollupScore([])).toEqual({ score: 100, tier: 'solid' });
     });

     it('applies per-severity weights (error=14, warning=6, info=2)', () => {
       expect(SEVERITY_WEIGHTS).toEqual({ error: 14, warning: 6, info: 2 });
       // 1 error + 1 warning + 1 info = 100 - 22 = 78 -> at-risk
       expect(rollupScore([f('error'), f('warning'), f('info')])).toEqual({
         score: 78,
         tier: 'at-risk',
       });
     });

     it('floors near 0 and clamps non-negative for 7 errors', () => {
       const seven = Array.from({ length: 7 }, () => f('error')); // 100 - 98 = 2
       expect(rollupScore(seven)).toEqual({ score: 2, tier: 'theatre' });
       const eight = Array.from({ length: 8 }, () => f('error')); // would be -12 -> clamp 0
       expect(rollupScore(eight)).toEqual({ score: 0, tier: 'theatre' });
     });

     it('tier boundaries: 85 solid, 84 at-risk, 50 at-risk, 49 theatre', () => {
       // 1 info+... pick counts to hit exact scores via warnings(6)/info(2)
       // score 85: nothing subtracts to 85 cleanly with weights; assert via direct boundary findings.
       // 100 - 6*2 - 2*2 = 100-16 = 84 (2 warn + 2 info) -> at-risk
       expect(rollupScore([f('warning'), f('warning'), f('info'), f('info')]).tier).toBe('at-risk');
       // 100 - 6*8 - 2 = 100-50 = 50 (8 warn + 1 info) -> at-risk (>=50)
       const fifty = [...Array.from({ length: 8 }, () => f('warning')), f('info')];
       expect(rollupScore(fifty)).toEqual({ score: 50, tier: 'at-risk' });
       // 100 - 6*8 - 2*2 = 100-52 = 48 -> theatre
       const fortyEight = [...Array.from({ length: 8 }, () => f('warning')), f('info'), f('info')];
       expect(rollupScore(fortyEight)).toEqual({ score: 48, tier: 'theatre' });
     });

     it('is deterministic across repeated calls', () => {
       const input = [f('error'), f('warning')];
       expect(rollupScore(input)).toEqual(rollupScore([...input]));
     });
   });
   ```

2. Run: `npx vitest run packages/core/src/harness-strength/scoring.test.ts` — observe failure (module not found).
3. Do NOT commit yet (red state).

### Task 5: Implement `scoring.ts`, observe pass

**Depends on:** Task 4 | **Files:** `packages/core/src/harness-strength/scoring.ts`

1. Create `packages/core/src/harness-strength/scoring.ts`:

   ```ts
   import type { StrengthFinding, Tier } from './types';

   /** Per-severity point deduction. Tunable: 7 errors floors the score near 0. */
   export const SEVERITY_WEIGHTS: Record<StrengthFinding['severity'], number> = {
     error: 14,
     warning: 6,
     info: 2,
   };

   const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

   function tierFor(score: number): Tier {
     if (score >= 85) return 'solid';
     if (score >= 50) return 'at-risk';
     return 'theatre';
   }

   /**
    * Pure, deterministic rollup. Starts at 100 and subtracts SEVERITY_WEIGHTS
    * per finding, clamped to [0, 100]. No IO, no Date, no randomness.
    */
   export function rollupScore(findings: StrengthFinding[]): { score: number; tier: Tier } {
     const deduction = findings.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0);
     const score = clamp(100 - deduction, 0, 100);
     return { score, tier: tierFor(score) };
   }
   ```

2. Run: `npx vitest run packages/core/src/harness-strength/scoring.test.ts` — observe pass.
3. Run: `npx harness validate`
4. Commit: `feat(harness-strength): pure deterministic rollupScore with severity weights`

### Task 6 (TDD): Write `context.test.ts` for `resolveMode`, observe failure

**Depends on:** Task 2 | **Files:** `packages/core/src/harness-strength/context.test.ts`

> Uses Node's `fs` to build temp dirs under `os.tmpdir()`. Mirror existing core test temp-dir patterns (mkdtemp + rm in afterEach).

1. Create `packages/core/src/harness-strength/context.test.ts` with the mode-resolution suite (context-read suite added in Task 8):

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { resolveMode, buildProjectContext } from './context';

   let root: string;
   beforeEach(() => {
     root = mkdtempSync(join(tmpdir(), 'hstrength-'));
   });
   afterEach(() => {
     rmSync(root, { recursive: true, force: true });
   });

   describe('resolveMode', () => {
     it('honors explicit toolkit override regardless of layout', () => {
       expect(resolveMode({ mode: 'toolkit' }, root)).toBe('toolkit');
     });

     it('honors explicit adopter override even when toolkit layout exists', () => {
       mkdirSync(join(root, 'templates'));
       mkdirSync(join(root, 'agents', 'skills'), { recursive: true });
       expect(resolveMode({ mode: 'adopter' }, root)).toBe('adopter');
     });

     it('auto-detects toolkit when both templates/ and agents/skills/ exist', () => {
       mkdirSync(join(root, 'templates'));
       mkdirSync(join(root, 'agents', 'skills'), { recursive: true });
       expect(resolveMode({}, root)).toBe('toolkit');
     });

     it('auto-detects adopter when only one of the two dirs exists', () => {
       mkdirSync(join(root, 'templates'));
       expect(resolveMode({}, root)).toBe('adopter');
     });

     it('auto-detects adopter on a bare repo', () => {
       expect(resolveMode({}, root)).toBe('adopter');
     });
   });

   describe('buildProjectContext (absent inputs)', () => {
     it('never throws and returns null/[] for a bare repo', () => {
       const ctx = buildProjectContext(root, 'adopter');
       expect(ctx.config).toBeNull();
       expect(ctx.preCommit).toBeNull();
       expect(ctx.hookFiles).toEqual([]);
       expect(ctx.workflows).toEqual([]);
       expect(ctx.healthSnapshot).toBeNull();
       expect(ctx.mode).toBe('adopter');
       expect(ctx.root).toBe(root);
     });
   });
   ```

2. Run: `npx vitest run packages/core/src/harness-strength/context.test.ts` — observe failure (module not found).
3. Do NOT commit (red state).

### Task 7: Implement `context.ts` — `resolveMode` + `buildProjectContext` (file-based reads)

**Depends on:** Task 6 | **Files:** `packages/core/src/harness-strength/context.ts`

> Hook resolution is **file-based only** in Phase 1 (read `.claude/settings.json` + enumerate `.husky/` and `.claude/hooks/` scripts). Profile→hookset mapping (cli's `profiles.ts`) is a Phase 2 concern — core cannot import cli. Document any inability to resolve as `hookFiles: []`.

1. Create `packages/core/src/harness-strength/context.ts`:

   ```ts
   import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
   import { join, basename, resolve } from 'node:path';
   import { HarnessConfigSubsetSchema } from './types';
   import type { HarnessConfigSubset, HookFile, Mode, ProjectContext } from './types';

   export interface ModeOptions {
     mode?: Mode; // explicit override wins
   }

   /** Explicit override wins; else toolkit iff BOTH templates/ and agents/skills/ exist; else adopter. */
   export function resolveMode(opts: ModeOptions, root: string): Mode {
     if (opts.mode) return opts.mode;
     const hasTemplates = existsSync(join(root, 'templates'));
     const hasSkills = existsSync(join(root, 'agents', 'skills'));
     return hasTemplates && hasSkills ? 'toolkit' : 'adopter';
   }

   function readTextOrNull(path: string): string | null {
     try {
       return existsSync(path) ? readFileSync(path, 'utf8') : null;
     } catch {
       return null;
     }
   }

   function readJsonOrNull(path: string): unknown {
     const text = readTextOrNull(path);
     if (text === null) return null;
     try {
       return JSON.parse(text);
     } catch {
       return null;
     }
   }

   function readConfig(root: string): HarnessConfigSubset | null {
     const raw = readJsonOrNull(join(root, 'harness.config.json'));
     if (raw === null) return null;
     const parsed = HarnessConfigSubsetSchema.safeParse(raw);
     return parsed.success ? parsed.data : null;
   }

   /** Collect script files directly under a directory (non-recursive), as HookFiles. */
   function readHookDir(dir: string): HookFile[] {
     if (!existsSync(dir)) return [];
     try {
       return readdirSync(dir)
         .map((name) => ({ name, full: join(dir, name) }))
         .filter(({ full }) => {
           try {
             return statSync(full).isFile();
           } catch {
             return false;
           }
         })
         .map(({ name, full }) => ({
           name,
           path: full,
           text: readTextOrNull(full) ?? '',
         }));
     } catch {
       return [];
     }
   }

   /**
    * Phase 1 file-based hook resolution: union of scripts under .husky/ and
    * .claude/hooks/, plus any scripts referenced by .claude/settings.json hook
    * registrations. Deduplicated by absolute path. Profile mapping is Phase 2.
    */
   function resolveHookFiles(root: string): HookFile[] {
     const collected = new Map<string, HookFile>();
     for (const h of [
       ...readHookDir(join(root, '.husky')),
       ...readHookDir(join(root, '.claude', 'hooks')),
     ]) {
       collected.set(resolve(h.path), h);
     }

     // Scripts referenced from .claude/settings.json hook registrations.
     const settings = readJsonOrNull(join(root, '.claude', 'settings.json'));
     for (const ref of extractSettingsHookScripts(settings)) {
       const abs = resolve(root, ref);
       if (collected.has(abs)) continue;
       const text = readTextOrNull(abs);
       if (text !== null) {
         collected.set(abs, { name: basename(abs), path: abs, text });
       }
     }
     return [...collected.values()];
   }

   /** Best-effort: pull any string that looks like a script path out of settings.hooks. */
   function extractSettingsHookScripts(settings: unknown): string[] {
     const out: string[] = [];
     if (settings === null || typeof settings !== 'object') return out;
     const hooks = (settings as Record<string, unknown>).hooks;
     const walk = (v: unknown): void => {
       if (typeof v === 'string') {
         if (/\.(sh|mjs|cjs|js|ts)\b/.test(v) || v.includes('hooks/')) out.push(v);
       } else if (Array.isArray(v)) {
         v.forEach(walk);
       } else if (v && typeof v === 'object') {
         Object.values(v).forEach(walk);
       }
     };
     walk(hooks);
     return out;
   }

   function readWorkflows(root: string): { path: string; text: string }[] {
     const dir = join(root, '.github', 'workflows');
     if (!existsSync(dir)) return [];
     try {
       return readdirSync(dir)
         .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
         .map((n) => join(dir, n))
         .filter((p) => {
           try {
             return statSync(p).isFile();
           } catch {
             return false;
           }
         })
         .map((p) => ({ path: p, text: readTextOrNull(p) ?? '' }));
     } catch {
       return [];
     }
   }

   /** Toolkit-only: collect .hbs templates recursively under templates/. */
   function readTemplates(root: string): { path: string; text: string }[] {
     const dir = join(root, 'templates');
     if (!existsSync(dir)) return [];
     const out: { path: string; text: string }[] = [];
     const walk = (d: string): void => {
       let entries: string[];
       try {
         entries = readdirSync(d);
       } catch {
         return;
       }
       for (const name of entries) {
         const full = join(d, name);
         let st;
         try {
           st = statSync(full);
         } catch {
           continue;
         }
         if (st.isDirectory()) walk(full);
         else if (name.endsWith('.hbs')) out.push({ path: full, text: readTextOrNull(full) ?? '' });
       }
     };
     walk(dir);
     return out;
   }

   /** Toolkit-only: the init skill's SKILL.md text, or null. */
   function readInitSkill(root: string): string | null {
     return readTextOrNull(
       join(root, 'agents', 'skills', 'claude-code', 'initialize-harness-project', 'SKILL.md')
     );
   }

   /** Reads every input once. Missing files -> null/[]; never throws. */
   export function buildProjectContext(root: string, mode: Mode): ProjectContext {
     const ctx: ProjectContext = {
       root,
       mode,
       config: readConfig(root),
       preCommit: readTextOrNull(join(root, '.husky', 'pre-commit')),
       hookFiles: resolveHookFiles(root),
       workflows: readWorkflows(root),
       healthSnapshot: readJsonOrNull(join(root, '.harness', 'health-snapshot.json')),
     };
     if (mode === 'toolkit') {
       ctx.templates = readTemplates(root);
       ctx.initSkill = readInitSkill(root);
     }
     return ctx;
   }
   ```

2. Run: `npx vitest run packages/core/src/harness-strength/context.test.ts` — observe pass (mode + bare-repo absent-input suites).
3. Run: `npx harness validate`
4. Commit: `feat(harness-strength): buildProjectContext + resolveMode with file-based hook resolution`

### Task 8 (TDD): Add context-read tests for present inputs and toolkit fork

**Depends on:** Task 7 | **Files:** `packages/core/src/harness-strength/context.test.ts`

1. Append to `packages/core/src/harness-strength/context.test.ts`:

   ```ts
   describe('buildProjectContext (present inputs)', () => {
     it('parses harness.config.json subset and reads pre-commit + hooks', () => {
       writeFileSync(
         join(root, 'harness.config.json'),
         JSON.stringify({ template: { level: 'basic' }, extra: 1 })
       );
       mkdirSync(join(root, '.husky'));
       writeFileSync(join(root, '.husky', 'pre-commit'), '#!/bin/sh\nexit 0\n');
       const ctx = buildProjectContext(root, 'adopter');
       expect(ctx.config?.template?.level).toBe('basic');
       expect(ctx.preCommit).toContain('exit 0');
       expect(ctx.hookFiles.some((h) => h.name === 'pre-commit')).toBe(true);
     });

     it('returns null config when harness.config.json is malformed JSON', () => {
       writeFileSync(join(root, 'harness.config.json'), '{ not json');
       expect(buildProjectContext(root, 'adopter').config).toBeNull();
     });

     it('reads .github/workflows yml files as raw text', () => {
       mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
       writeFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
       const ctx = buildProjectContext(root, 'adopter');
       expect(ctx.workflows).toHaveLength(1);
       expect(ctx.workflows[0].text).toContain('name: ci');
     });

     it('parses health-snapshot.json into healthSnapshot', () => {
       mkdirSync(join(root, '.harness'));
       writeFileSync(
         join(root, '.harness', 'health-snapshot.json'),
         JSON.stringify({ passed: true, signals: ['arch'] })
       );
       const ctx = buildProjectContext(root, 'adopter');
       expect((ctx.healthSnapshot as { passed: boolean }).passed).toBe(true);
     });

     it('leaves templates/initSkill undefined in adopter mode', () => {
       const ctx = buildProjectContext(root, 'adopter');
       expect(ctx.templates).toBeUndefined();
       expect(ctx.initSkill).toBeUndefined();
     });

     it('populates templates (.hbs) and initSkill in toolkit mode', () => {
       mkdirSync(join(root, 'templates', 'basic'), { recursive: true });
       writeFileSync(join(root, 'templates', 'basic', 'harness.config.json.hbs'), '{}');
       mkdirSync(join(root, 'agents', 'skills', 'claude-code', 'initialize-harness-project'), {
         recursive: true,
       });
       writeFileSync(
         join(root, 'agents', 'skills', 'claude-code', 'initialize-harness-project', 'SKILL.md'),
         '# init\nrecommends basic\n'
       );
       const ctx = buildProjectContext(root, 'toolkit');
       expect(ctx.templates?.some((t) => t.path.endsWith('.hbs'))).toBe(true);
       expect(ctx.initSkill).toContain('init');
     });
   });
   ```

2. Run: `npx vitest run packages/core/src/harness-strength/context.test.ts` — observe all pass.
3. Run: `npx harness validate`
4. Commit: `test(harness-strength): context reads for present inputs and toolkit fork`

### Task 9: Module barrel, empty rule registry, and core index wiring

**Depends on:** Task 5, Task 8 | **Files:** `packages/core/src/harness-strength/rules/index.ts`, `packages/core/src/harness-strength/index.ts`, `packages/core/src/index.ts` | **Category:** integration

1. Create `packages/core/src/harness-strength/rules/index.ts` (typed empty registry — implementations land in Phase 2):

   ```ts
   import type { StrengthRule } from '../types';

   /**
    * Registry of all StrengthRule modules. Empty in Phase 1 — STRENGTH-001..007
    * are implemented in Phase 2 and pushed here.
    */
   export const ALL_RULES: StrengthRule[] = [];
   ```

2. Create `packages/core/src/harness-strength/index.ts`:

   ```ts
   /**
    * harness-strength: mechanical self-audit of a project's harness configuration.
    * Phase 1 exposes contracts (types), context building, and scoring. The auditor
    * and rule implementations land in later phases.
    */
   export * from './types';
   export { rollupScore, SEVERITY_WEIGHTS } from './scoring';
   export { buildProjectContext, resolveMode } from './context';
   export type { ModeOptions } from './context';
   export { ALL_RULES } from './rules/index';
   ```

3. Regenerate the core package barrel so `harness-strength` is exported:
   `npx harness generate-barrel-exports` (or the repo's documented barrel generator).
   If the generator does not own `packages/core/src/index.ts`, manually add `export * from './harness-strength';` in alphabetical position (near the other top-level module re-exports, e.g. after `./feedback` / before `./insights`).

4. Run: `npx vitest run packages/core/src/harness-strength/` — observe all three suites pass.
5. Run: `npx tsc -p packages/core/tsconfig.json --noEmit` — observe no errors.
6. Run: `npx harness check-deps` — confirm no new circular/forbidden imports introduced.
7. Run: `npx harness validate`
8. Commit: `feat(harness-strength): module barrel + empty rule registry + core index export`

---

## Sequencing

- Tasks 1 → 2 → 3 are the types track (3 depends on 2 which depends on 1).
- Tasks 4 → 5 are the scoring track (independent of types beyond Task 1; can run in parallel with the types track after Task 1).
- Tasks 6 → 7 → 8 are the context track (6/7 depend on Task 2's types).
- Task 9 (integration) depends on the tails of the scoring track (5) and context track (8). It is last.

## Traceability (truth → task)

- Truth 1 (exported types/schemas) → Tasks 1, 2, 9.
- Truths 2, 3 (scoring math + determinism) → Tasks 4, 5.
- Truth 4 (mode resolution) → Tasks 6, 7.
- Truths 5, 7 (absent inputs, hook resolution) → Tasks 6, 7, 8.
- Truth 6 (toolkit fork) → Tasks 7, 8.
- Truth 8 (vitest + validate + barrel) → Task 9 (and validate steps throughout).

## Known failures check

`.harness/failures.md` reviewed — no recorded failure matches "core importing cli" or "barrel hand-edit" for this module. The two structural risks (cli→core import inversion; hand-editing a generated barrel) are pre-empted by the [ASSUMPTION → RESOLVED] notes and Task 9 step 3.
