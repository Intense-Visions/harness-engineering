# Plan: Trusted Autonomy Mode — Phase 1 (Resolver, user config, session override)

**Date:** 2026-11-13 | **Spec:** `docs/changes/trusted-autonomy-mode/proposal.md` (Phase 1 only) | **Tasks:** 16 | **Time:** ~65 min | **Integration Tier:** medium | **Rigor:** standard | **Session:** `changes--trusted-autonomy-mode--proposal`

## Goal

A user-level autonomy setting (`supervised` | `trusted`, plus `audit`) resolves through flag/session/env/user-config/default precedence without ever reading project config. A home-dir session override can be lowered by the agent (`manage_state set-autonomy`) and raised only by a human (`harness autonomy set` on a TTY). The resolved value is readable through `gather_context` and `harness autonomy show`.

Out of scope (later phases): `record_auto_decision`, `auto-decisions.jsonl`, `harness autonomy log` (Phase 2); pause-protocol template, skill retrofits, `--fast` decoupling, invocation-flag plumbing into skills (Phase 3); ADRs, AGENTS.md, guide, knowledge node (Phase 4).

## Observable Truths (Acceptance Criteria)

1. **SC6.** The system shall resolve `level` and `audit` independently with precedence flag > session > env > user config > default. A table-driven test sets each source and asserts both the value and `source.{level,audit}`. → Tasks 4, 5
2. **SC6 (recency, D3).** When both an invocation flag (with `at`) and a session override set the same field, the system shall use whichever is more recent. A flag without a parseable `at` wins. → Task 5
3. **SC5.** When a `harness.config.json` with `autonomy.level: "trusted"` exists, `resolveAutonomy` shall still resolve `supervised`/`default`. A spy reader shows the only file read is the user config path (this is the positive control). A source scan shows no `autonomy/*.ts` file references `harness.config`. → Tasks 6, 9, 12
4. If `~/.harness/config.json` is malformed or schema-invalid, or `HARNESS_AUTONOMY`/`HARNESS_AUTONOMY_AUDIT` holds an unrecognised value, then the system shall not fail. It shall use the next source and add exactly one entry to `warnings`. → Task 4
5. **SC13 (MCP).** If `manage_state` `set-autonomy` is called with `level: "trusted"` or `audit: false`, then the system shall return `isError` with `{ error: "AUTONOMY_RAISE_REJECTED" }` and the override file shall stay byte-identical. → Tasks 8, 11
6. **SC13 (CLI).** If `harness autonomy set trusted` (or `--audit off`) runs without stdin+stdout TTY, then it shall refuse with exit code 1 and write nothing. On a TTY it shall write only after an interactive `y`/`yes`. → Task 14
7. **SC7 (resolver level).** When an override is written for session `s`, the next `resolveAutonomyForSession({session: s})` shall return the new value with `source: "session"`. Other sessions and other repos are unaffected. → Tasks 9, 12
8. **D12.** Session overrides shall be written only under `<home>/.harness/session-overrides/<repoKey>/<slug>.json` (`repoKey` = first 16 hex of sha256 of the normalized realpath of the project root), never under the project. → Tasks 3, 7, 11
9. `gather_context` with `include: ["autonomy"]` shall return `autonomy: ResolvedAutonomy`. When `autonomy` is not included, the response shall have no `autonomy` key. → Task 12
10. `harness autonomy show [--session <slug>]` shall print each field's value and source, and print JSON under the global `--json`. → Task 13
11. `pnpm run generate:barrels:check`, `pnpm run generate-docs` (check clean after regen), `harness validate` and `harness check-deps` shall pass. → Tasks 10, 15, 16

## Uncertainties

- [ASSUMPTION — spec deviation, checkpoint at Task 7] **Per-field override timestamps.** The spec stores `{ level?, audit?, setAt, origin }` with one `setAt`. With one timestamp, an MCP lowering of `audit` would re-stamp a human-set `level: trusted` as newer. That could let a stale `trusted` outrank a later `--supervised` flag, so a lower-only call would effectively raise. The plan stores `{ level?: {value,setAt,origin}, audit?: {value,setAt,origin} }`. If rejected, Tasks 1, 2, 5, 7 change.
- [ASSUMPTION] **The lower-only rule is value-based.** The MCP path may write only `level: "supervised"` and `audit: true`. `trusted` or `audit: false` is rejected even when it equals the current value. Writing a "no-op" high value into the session tier would pin it above a later user-config lowering.
- [ASSUMPTION] `repoKey` hashes the realpath of the `path` the caller passes (project root), with `\` normalized to `/`. It does not use `git rev-parse --show-toplevel`, so each worktree gets its own key.
- [ASSUMPTION] `HARNESS_AUTONOMY_AUDIT` accepts `on|off|true|false|1|0` (case-insensitive). The spec does not list values.
- [ASSUMPTION] Warnings are returned as `ResolvedAutonomy.warnings: string[]`, an additive field on the spec's type. The resolver stays pure and testable, and the CLI and MCP surface the warnings.
- [ASSUMPTION] `AutonomyFlag.at` (ISO session start) is optional. If it is missing or unparseable, the flag wins over the session override.
- [ASSUMPTION] `autonomy` is opt-in in `gather_context`. It is not in the default include set and the key appears only when requested, so existing response shapes don't change.
- [ASSUMPTION] Raising via the CLI requires **both** `stdin.isTTY` and `stdout.isTTY`. This matches `packages/cli/src/commands/install.ts:483`.
- [DEFERRABLE → Phase 3] `gather_context` does not accept an invocation flag in Phase 1. A flag relayed by the agent through MCP is agent-asserted, so it reopens the D12 question for the raise direction. This must be decided when Phase 3 wires `--trusted` into skills.
- [DEFERRABLE] An existing but malformed override file is ignored with a warning. It cannot hide a lowering that was ever valid, because only our writers produce the file, but it would fail open if corrupted.
- [DEFERRABLE] Exact warning and refusal wording.

## Decisions (planning phase)

| #   | Decision                                                                                                                                                                                                                                                                                                | Evidence                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| P1  | Contract types are plain TS in `packages/types/src/autonomy.ts`. The Zod schemas live in core, as the spec says. Types export runtime consts (`AUTONOMY_LEVELS`, `AUTONOMY_SOURCES`, `DEFAULT_AUTONOMY_AUDIT`) so the types package has a runtime test (its vitest includes only `tests/**/*.test.ts`). | `packages/types/vitest.config.mts`                                                 |
| P2  | Every fs/home input is injectable: `homeDir`, `readFile`, `realpath`, `now`, `env`, `isInteractive`, `confirm`, `cwd`. Tests never touch the real `~/.harness`. The pattern is `ReadPnyonServeTokenDeps`.                                                                                               | `packages/core/src/comprehension/credential-store.ts:35-46`                        |
| P3  | MCP/CLI handlers take an optional trailing `deps` argument. The server calls `handler(args)` with one arg, so production is unchanged. CLI tests resolve core via **dist**, so `vi.mock('node:os')` would not reach core.                                                                               | `packages/cli/src/mcp/server.ts:753`; `packages/types/package.json:5` (dist entry) |
| P4  | No core-barrel allowlist edit. `generate-core-barrel.mjs` auto-discovers `autonomy/index.ts` (`discoverStarModules`). New names were grepped and none collide.                                                                                                                                          | `scripts/generate-core-barrel.mjs:201-211`                                         |
| P5  | The `set-autonomy` handler is dispatched ahead of `ACTION_HANDLERS` so it can receive `deps`, and errors are surfaced by `code`, not `instanceof` (dist boundary).                                                                                                                                      | `packages/cli/src/mcp/tools/state.ts:465-499`                                      |

## File Map

- CREATE `packages/types/src/autonomy.ts`
- MODIFY `packages/types/src/index.ts` (export block)
- CREATE `packages/types/tests/autonomy.test.ts`
- CREATE `packages/core/src/autonomy/schema.ts`
- CREATE `packages/core/src/autonomy/paths.ts`
- CREATE `packages/core/src/autonomy/resolve.ts`
- CREATE `packages/core/src/autonomy/override-store.ts`
- CREATE `packages/core/src/autonomy/lower-only.ts`
- CREATE `packages/core/src/autonomy/session.ts`
- CREATE `packages/core/src/autonomy/index.ts`
- CREATE `packages/core/tests/autonomy/schema.test.ts`
- CREATE `packages/core/tests/autonomy/paths.test.ts`
- CREATE `packages/core/tests/autonomy/resolve.test.ts`
- CREATE `packages/core/tests/autonomy/resolve-isolation.test.ts`
- CREATE `packages/core/tests/autonomy/override-store.test.ts`
- CREATE `packages/core/tests/autonomy/lower-only.test.ts`
- CREATE `packages/core/tests/autonomy/session.test.ts`
- MODIFY `packages/core/src/index.ts` (generated by `pnpm run generate:barrels`)
- MODIFY `packages/cli/src/mcp/tools/state.ts`
- CREATE `packages/cli/tests/mcp/tools/state-set-autonomy.test.ts`
- MODIFY `packages/cli/src/mcp/tools/gather-context.ts`
- MODIFY `packages/cli/tests/mcp/tools/gather-context.test.ts` (pinned include enum, line 31-41)
- CREATE `packages/cli/tests/mcp/tools/gather-context-autonomy.test.ts`
- CREATE `packages/cli/src/commands/autonomy/deps.ts`
- CREATE `packages/cli/src/commands/autonomy/show.ts`
- CREATE `packages/cli/src/commands/autonomy/set.ts`
- CREATE `packages/cli/src/commands/autonomy/index.ts`
- CREATE `packages/cli/tests/commands/autonomy-show.test.ts`
- CREATE `packages/cli/tests/commands/autonomy-set.test.ts`
- CREATE `packages/cli/tests/commands/autonomy-command.test.ts`
- MODIFY `packages/cli/src/commands/_registry.ts` (generated by `pnpm run generate-barrel-exports`)
- MODIFY `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md` (generated by `pnpm run generate-docs`)
- MODIFY `docs/reference/tool-catalog.md` (generated by `pnpm run generate:tool-catalog`)

## Skeleton

1. Contract types (1 task, ~4 min)
2. Core autonomy module: schema, paths, resolver precedence, recency, SC5 isolation, override store, lower-only writer, session resolve (8 tasks, ~34 min)
3. Core barrel and build (1 task, ~3 min)
4. MCP surfaces: `set-autonomy`, `gather_context` include (2 tasks, ~10 min)
5. CLI: `show`, `set`, command group and registry (3 tasks, ~11 min)
6. Generated docs and full verification (1 task, ~4 min)

**Estimated total:** 16 tasks, ~65 min. _Skeleton approval: PENDING. This plan was produced by a planning subagent that cannot hold a dialogue, so the parent or human approves the skeleton together with the plan._

## NFR Targets

Not elicited. Phase 1.6 requires a dialogue the planning subagent could not hold, so every dimension took its default. `harness check-security` is still run in Task 16 as part of verification. **Recommendation for the approver:** this phase is a trust boundary. Consider adding a Security NFR ("If `harness check-security --severity error` reports a finding under `packages/core/src/autonomy/` or `packages/cli/src/commands/autonomy/`, then the build shall not pass").

## Execution Notes (apply to every task)

- Work only in `/Users/cwarner/Projects/iv/harness-engineering/_wt/trust-mode`. Do not push.
- Tests compare paths after `p.replaceAll('\\', '/')` or build them with `path.posix`, for Windows CI. `chmod`/symlink assertions use `it.skipIf(process.platform === 'win32')`.
- `exactOptionalPropertyTypes` is on (`tsconfig.base.json:18`). Build optional fields with `...(x !== undefined && { x })`, never `{ x: maybeUndefined }`.
- CLI tests import core from **dist**, so after any core change rebuild with `npx turbo build --filter=@harness-engineering/core...` before running CLI tests.
- The pre-commit arch hook reads `packages/cli/dist`, so run `npx turbo build --filter=@harness-engineering/cli...` before each commit.
- Never place the literal string `harness.config` in any `packages/core/src/autonomy/*.ts` file, including comments. The Task 6/9 source scan enforces this.

## Tasks

### Task 1: Define autonomy contract types

**Depends on:** none | **Files:** `packages/types/src/autonomy.ts`, `packages/types/src/index.ts`, `packages/types/tests/autonomy.test.ts` | **Owns:** `packages/types/src/autonomy.ts`

1. Create `packages/types/tests/autonomy.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { AUTONOMY_LEVELS, AUTONOMY_SOURCES, DEFAULT_AUTONOMY_AUDIT } from '../src/index';
   import type { ResolvedAutonomy, AutonomySessionOverride } from '../src/index';

   describe('autonomy contract', () => {
     it('defines exactly two levels', () => {
       expect(AUTONOMY_LEVELS).toEqual(['supervised', 'trusted']);
     });
     it('lists sources in precedence order (highest first)', () => {
       expect(AUTONOMY_SOURCES).toEqual(['flag', 'session', 'env', 'user-config', 'default']);
     });
     it('defaults audit on for trusted and off for supervised (D9)', () => {
       expect(DEFAULT_AUTONOMY_AUDIT).toEqual({ trusted: true, supervised: false });
     });
     it('ResolvedAutonomy and per-field override shapes compile', () => {
       const r: ResolvedAutonomy = {
         level: 'supervised',
         audit: false,
         source: { level: 'default', audit: 'default' },
         warnings: [],
       };
       const o: AutonomySessionOverride = {
         level: { value: 'trusted', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' },
       };
       expect(r.source.level).toBe('default');
       expect(o.level?.origin).toBe('cli');
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/types exec vitest run tests/autonomy.test.ts` and observe it fail (exports missing).
3. Create `packages/types/src/autonomy.ts`:

   ```ts
   /**
    * Trusted Autonomy Mode: contract types (docs/changes/trusted-autonomy-mode/proposal.md).
    * Unrelated to the roadmap auto-triage "autonomy ratchet" (ratchetStage).
    */

   export const AUTONOMY_LEVELS = ['supervised', 'trusted'] as const;
   export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

   /** Resolution sources, highest precedence first (D3). */
   export const AUTONOMY_SOURCES = ['flag', 'session', 'env', 'user-config', 'default'] as const;
   export type AutonomySource = (typeof AUTONOMY_SOURCES)[number];

   /** Effective audit when no source sets it (D9). */
   export const DEFAULT_AUTONOMY_AUDIT: Readonly<Record<AutonomyLevel, boolean>> = {
     trusted: true,
     supervised: false,
   };

   export interface AutonomySetting {
     level?: AutonomyLevel;
     audit?: boolean;
   }

   /** Invocation flag. `at` is the session start (ISO) used for the flag-vs-override recency tie (D3). */
   export interface AutonomyFlag extends AutonomySetting {
     at?: string;
   }

   export type AutonomyOverrideOrigin = 'cli' | 'mcp';

   export interface AutonomyOverrideField<T> {
     value: T;
     setAt: string;
     origin: AutonomyOverrideOrigin;
   }

   /**
    * Session override stored at ~/.harness/session-overrides/<repoKey>/<slug>.json (D12).
    * Each field carries its own timestamp so updating one field never re-dates the other.
    */
   export interface AutonomySessionOverride {
     level?: AutonomyOverrideField<AutonomyLevel>;
     audit?: AutonomyOverrideField<boolean>;
   }

   /** The user-level ~/.harness/config.json shape (autonomy portion). */
   export interface AutonomyUserConfig {
     autonomy?: {
       level?: AutonomyLevel;
       audit?: { trusted?: boolean; supervised?: boolean };
     };
   }

   export interface ResolvedAutonomy {
     level: AutonomyLevel;
     /** Effective audit for the resolved level. */
     audit: boolean;
     source: { level: AutonomySource; audit: AutonomySource };
     /** Non-fatal problems met while resolving (malformed config, unrecognised env value). */
     warnings: string[];
   }
   ```

4. Append to `packages/types/src/index.ts`:

   ```ts
   // --- Trusted Autonomy Mode (Phase 1) ---
   export { AUTONOMY_LEVELS, AUTONOMY_SOURCES, DEFAULT_AUTONOMY_AUDIT } from './autonomy';
   export type {
     AutonomyLevel,
     AutonomySource,
     AutonomySetting,
     AutonomyFlag,
     AutonomyOverrideOrigin,
     AutonomyOverrideField,
     AutonomySessionOverride,
     AutonomyUserConfig,
     ResolvedAutonomy,
   } from './autonomy';
   ```

5. Run the test again and observe it pass. Then run `pnpm --filter @harness-engineering/types typecheck` and `npx turbo build --filter=@harness-engineering/types`. The build is required because core consumes types via dist.
6. Run `harness validate`.
7. Commit: `feat(types): add trusted-autonomy contract types`

### Task 2: Zod schemas for user config and session override

**Depends on:** Task 1 | **Files:** `packages/core/src/autonomy/schema.ts`, `packages/core/tests/autonomy/schema.test.ts`

1. Create `packages/core/tests/autonomy/schema.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     UserConfigSchema,
     parseUserConfig,
     parseSessionOverride,
   } from '../../src/autonomy/schema';

   describe('UserConfigSchema', () => {
     it('accepts the documented example', () => {
       const r = UserConfigSchema.safeParse({
         autonomy: { level: 'supervised', audit: { trusted: true, supervised: false } },
       });
       expect(r.success).toBe(true);
     });
     it('accepts an empty object and unknown top-level keys', () => {
       expect(UserConfigSchema.safeParse({}).success).toBe(true);
       expect(UserConfigSchema.safeParse({ somethingElse: 1 }).success).toBe(true);
     });
     it('rejects an unknown level and a non-boolean audit', () => {
       expect(UserConfigSchema.safeParse({ autonomy: { level: 'yolo' } }).success).toBe(false);
       expect(UserConfigSchema.safeParse({ autonomy: { audit: { trusted: 'yes' } } }).success).toBe(
         false
       );
     });
   });

   describe('parseUserConfig', () => {
     it('returns Err on invalid JSON', () => {
       const r = parseUserConfig('{not json');
       expect(r.ok).toBe(false);
       if (!r.ok) expect(r.error.message).toMatch(/JSON/);
     });
     it('returns Err on schema violation', () => {
       expect(parseUserConfig(JSON.stringify({ autonomy: { level: 'yolo' } })).ok).toBe(false);
     });
     it('returns Ok on a valid document', () => {
       const r = parseUserConfig(JSON.stringify({ autonomy: { level: 'trusted' } }));
       expect(r.ok && r.value.autonomy?.level).toBe('trusted');
     });
   });

   describe('parseSessionOverride', () => {
     const field = { setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' as const };
     it('accepts per-field entries', () => {
       const r = parseSessionOverride(
         JSON.stringify({
           level: { value: 'trusted', ...field },
           audit: { value: false, ...field },
         })
       );
       expect(r.ok).toBe(true);
     });
     it('rejects a bad origin or a non-date setAt', () => {
       expect(
         parseSessionOverride(
           JSON.stringify({ level: { value: 'trusted', setAt: field.setAt, origin: 'x' } })
         ).ok
       ).toBe(false);
       expect(
         parseSessionOverride(
           JSON.stringify({ level: { value: 'trusted', setAt: 'nope', origin: 'cli' } })
         ).ok
       ).toBe(false);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/autonomy/schema.test.ts` and observe it fail.
3. Create `packages/core/src/autonomy/schema.ts`:

   ```ts
   import { z } from 'zod';
   import type { AutonomySessionOverride, AutonomyUserConfig } from '@harness-engineering/types';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';

   export const AutonomyLevelSchema = z.enum(['supervised', 'trusted']);

   /** ~/.harness/config.json. Unknown top-level keys are tolerated (future user-level settings). */
   export const UserConfigSchema = z.object({
     autonomy: z
       .object({
         level: AutonomyLevelSchema.optional(),
         audit: z
           .object({ trusted: z.boolean().optional(), supervised: z.boolean().optional() })
           .optional(),
       })
       .optional(),
   });

   const OriginSchema = z.enum(['cli', 'mcp']);
   const IsoSchema = z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
     message: 'must be an ISO timestamp',
   });

   export const SessionOverrideFileSchema = z.object({
     level: z
       .object({ value: AutonomyLevelSchema, setAt: IsoSchema, origin: OriginSchema })
       .optional(),
     audit: z.object({ value: z.boolean(), setAt: IsoSchema, origin: OriginSchema }).optional(),
   });

   function parseJson(raw: string): Result<unknown, Error> {
     try {
       return Ok(JSON.parse(raw) as unknown);
     } catch (err) {
       return Err(new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`));
     }
   }

   function describeIssues(
     issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>
   ): string {
     return issues
       .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
       .join('; ');
   }

   export function parseUserConfig(raw: string): Result<AutonomyUserConfig, Error> {
     const json = parseJson(raw);
     if (!json.ok) return json;
     const r = UserConfigSchema.safeParse(json.value);
     if (!r.success) return Err(new Error(describeIssues(r.error.issues)));
     // JSON input never yields explicit `undefined`, so the zod optional output matches the contract.
     return Ok(r.data as AutonomyUserConfig);
   }

   export function parseSessionOverride(raw: string): Result<AutonomySessionOverride, Error> {
     const json = parseJson(raw);
     if (!json.ok) return json;
     const r = SessionOverrideFileSchema.safeParse(json.value);
     if (!r.success) return Err(new Error(describeIssues(r.error.issues)));
     return Ok(r.data as AutonomySessionOverride);
   }
   ```

4. Run the test again and observe it pass. Then run `pnpm --filter @harness-engineering/core typecheck`.
5. Run `harness validate`.
6. Commit: `feat(core): add autonomy user-config and session-override schemas`

### Task 3: Home-dir path helpers and repoKey

**Depends on:** none | **Files:** `packages/core/src/autonomy/paths.ts`, `packages/core/tests/autonomy/paths.test.ts`

1. Create `packages/core/tests/autonomy/paths.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import {
     harnessHomeDir,
     userConfigPath,
     computeRepoKey,
     sessionOverridePath,
     validateOverrideSlug,
   } from '../../src/autonomy/paths';

   const norm = (p: string) => p.replaceAll('\\', '/');
   const identity = (p: string) => p;

   describe('autonomy paths', () => {
     it('derives ~/.harness and config.json from an injected home', () => {
       expect(norm(harnessHomeDir({ homeDir: '/h' }))).toBe('/h/.harness');
       expect(norm(userConfigPath({ homeDir: '/h' }))).toBe('/h/.harness/config.json');
     });
     it('defaults to os.homedir() when no home is injected', () => {
       expect(norm(harnessHomeDir())).toBe(norm(path.join(os.homedir(), '.harness')));
     });
     it('repoKey is 16 hex chars, deterministic, path-sensitive, separator-insensitive', () => {
       const a = computeRepoKey('/repo/a', { realpath: identity });
       expect(a).toMatch(/^[0-9a-f]{16}$/);
       expect(computeRepoKey('/repo/a', { realpath: identity })).toBe(a);
       expect(computeRepoKey('/repo/b', { realpath: identity })).not.toBe(a);
       expect(computeRepoKey('C:\\r\\a', { realpath: identity })).toBe(
         computeRepoKey('C:/r/a', { realpath: identity })
       );
     });
     it.skipIf(process.platform === 'win32')('repoKey follows symlinks to the real root', () => {
       const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-key-'));
       const real = path.join(tmp, 'real');
       fs.mkdirSync(real);
       fs.symlinkSync(real, path.join(tmp, 'link'));
       expect(computeRepoKey(path.join(tmp, 'link'))).toBe(computeRepoKey(real));
       fs.rmSync(tmp, { recursive: true, force: true });
     });
     it('places overrides under <home>/.harness/session-overrides/<repoKey>/<slug>.json', () => {
       const r = sessionOverridePath('/repo/a', 's1', { homeDir: '/h', realpath: identity });
       const key = computeRepoKey('/repo/a', { realpath: identity });
       expect(r.ok && norm(r.value)).toBe(`/h/.harness/session-overrides/${key}/s1.json`);
     });
     it.each(['', '   ', '../x', 'a/b', 'a\\b', 'C:x', '..'])('rejects slug %j', (slug) => {
       expect(validateOverrideSlug(slug).ok).toBe(false);
       expect(sessionOverridePath('/repo', slug, { homeDir: '/h', realpath: identity }).ok).toBe(
         false
       );
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/autonomy/paths.test.ts` and observe it fail.
3. Create `packages/core/src/autonomy/paths.ts`:

   ```ts
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { createHash } from 'node:crypto';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';

   /** Injected path inputs; production defaults read os.homedir() and the real filesystem. */
   export interface AutonomyPathOptions {
     homeDir?: string;
     realpath?: (p: string) => string;
   }

   export function harnessHomeDir(opts: AutonomyPathOptions = {}): string {
     return path.join(opts.homeDir ?? os.homedir(), '.harness');
   }

   export function userConfigPath(opts: AutonomyPathOptions = {}): string {
     return path.join(harnessHomeDir(opts), 'config.json');
   }

   function defaultRealpath(p: string): string {
     try {
       return fs.realpathSync.native(p);
     } catch {
       return path.resolve(p);
     }
   }

   /** sha256 of the normalized repo-root realpath, first 16 hex chars (D12). */
   export function computeRepoKey(projectPath: string, opts: AutonomyPathOptions = {}): string {
     const real = (opts.realpath ?? defaultRealpath)(projectPath).replaceAll('\\', '/');
     return createHash('sha256').update(real).digest('hex').slice(0, 16);
   }

   export function validateOverrideSlug(slug: string): Result<string, Error> {
     if (!slug || slug.trim() === '') return Err(new Error('Session slug must not be empty'));
     if (/\.\.|[/\\:]/.test(slug)) {
       return Err(new Error(`Invalid session slug '${slug}': must not contain path characters`));
     }
     return Ok(slug);
   }

   export function sessionOverridePath(
     projectPath: string,
     slug: string,
     opts: AutonomyPathOptions = {}
   ): Result<string, Error> {
     const valid = validateOverrideSlug(slug);
     if (!valid.ok) return valid;
     return Ok(
       path.join(
         harnessHomeDir(opts),
         'session-overrides',
         computeRepoKey(projectPath, opts),
         `${slug}.json`
       )
     );
   }
   ```

4. Run the test again and observe it pass. Then run `pnpm --filter @harness-engineering/core typecheck`.
5. Run `harness validate`.
6. Commit: `feat(core): add autonomy home-dir paths and repoKey`

### Task 4: `resolveAutonomy` precedence table (SC6)

**Depends on:** Task 1, Task 2, Task 3 | **Files:** `packages/core/src/autonomy/resolve.ts`, `packages/core/tests/autonomy/resolve.test.ts`

In this task the flag always beats the session override. Task 5 adds the recency tie-break.

1. Create `packages/core/tests/autonomy/resolve.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import type { AutonomyLevel, AutonomySessionOverride } from '@harness-engineering/types';
   import { resolveAutonomy, type ResolveAutonomyInput } from '../../src/autonomy/resolve';

   const NO_FILE = () => undefined;
   const cfg = (obj: unknown) => () => JSON.stringify(obj);
   const T0 = '2026-01-01T00:00:00.000Z';
   const sess = (level?: AutonomyLevel, audit?: boolean, setAt = T0): AutonomySessionOverride => ({
     ...(level !== undefined && { level: { value: level, setAt, origin: 'cli' as const } }),
     ...(audit !== undefined && { audit: { value: audit, setAt, origin: 'cli' as const } }),
   });
   const run = (input: ResolveAutonomyInput) =>
     resolveAutonomy({ env: {}, readFile: NO_FILE, ...input });

   describe('resolveAutonomy precedence (SC6)', () => {
     it.each([
       { name: 'default', input: {}, exp: ['supervised', 'default', false, 'default'] },
       {
         name: 'user config level; audit defaults per level',
         input: { readFile: cfg({ autonomy: { level: 'trusted' } }) },
         exp: ['trusted', 'user-config', true, 'default'],
       },
       {
         name: 'user config per-level audit',
         input: { readFile: cfg({ autonomy: { level: 'trusted', audit: { trusted: false } } }) },
         exp: ['trusted', 'user-config', false, 'user-config'],
       },
       {
         name: 'env beats user config',
         input: {
           env: { HARNESS_AUTONOMY: 'supervised', HARNESS_AUTONOMY_AUDIT: 'on' },
           readFile: cfg({ autonomy: { level: 'trusted', audit: { supervised: false } } }),
         },
         exp: ['supervised', 'env', true, 'env'],
       },
       {
         name: 'session beats env',
         input: {
           sessionOverride: sess('trusted', false),
           env: { HARNESS_AUTONOMY: 'supervised', HARNESS_AUTONOMY_AUDIT: 'on' },
         },
         exp: ['trusted', 'session', false, 'session'],
       },
       {
         name: 'flag beats session',
         input: {
           flag: { level: 'supervised' as const, audit: true },
           sessionOverride: sess('trusted', false),
         },
         exp: ['supervised', 'flag', true, 'flag'],
       },
       {
         name: 'fields resolve independently',
         input: { flag: { audit: true }, env: { HARNESS_AUTONOMY: 'trusted' } },
         exp: ['trusted', 'env', true, 'flag'],
       },
     ])('$name', ({ input, exp }) => {
       const r = run(input as ResolveAutonomyInput);
       expect([r.level, r.source.level, r.audit, r.source.audit]).toEqual(exp);
       expect(r.warnings).toEqual([]);
     });
   });

   describe('resolveAutonomy fail-soft warnings', () => {
     it('malformed JSON user config → defaults + one warning', () => {
       const r = run({ readFile: () => '{not json' });
       expect([r.level, r.source.level]).toEqual(['supervised', 'default']);
       expect(r.warnings).toHaveLength(1);
       expect(r.warnings[0]).toMatch(/malformed/i);
     });
     it('schema-invalid user config → defaults + one warning', () => {
       const r = run({ readFile: cfg({ autonomy: { level: 'yolo' } }) });
       expect(r.source.level).toBe('default');
       expect(r.warnings).toHaveLength(1);
     });
     it('unrecognised HARNESS_AUTONOMY falls through to user config with one warning', () => {
       const r = run({
         env: { HARNESS_AUTONOMY: 'yolo' },
         readFile: cfg({ autonomy: { level: 'trusted' } }),
       });
       expect([r.level, r.source.level]).toEqual(['trusted', 'user-config']);
       expect(r.warnings).toHaveLength(1);
       expect(r.warnings[0]).toContain('HARNESS_AUTONOMY');
     });
     it('unrecognised HARNESS_AUTONOMY_AUDIT falls through to default with one warning', () => {
       const r = run({ env: { HARNESS_AUTONOMY_AUDIT: 'maybe' } });
       expect([r.audit, r.source.audit]).toEqual([false, 'default']);
       expect(r.warnings).toHaveLength(1);
       expect(r.warnings[0]).toContain('HARNESS_AUTONOMY_AUDIT');
     });
     it.each(['ON', 'true', '1'])('accepts audit env value %s as on', (v) => {
       expect(run({ env: { HARNESS_AUTONOMY_AUDIT: v } }).audit).toBe(true);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/autonomy/resolve.test.ts` and observe it fail.
3. Create `packages/core/src/autonomy/resolve.ts`. The file must not contain the literal project-config filename (see Execution Notes):

   ```ts
   import * as fs from 'node:fs';
   import {
     DEFAULT_AUTONOMY_AUDIT,
     type AutonomyFlag,
     type AutonomyLevel,
     type AutonomyOverrideField,
     type AutonomySessionOverride,
     type AutonomySource,
     type AutonomyUserConfig,
     type ResolvedAutonomy,
   } from '@harness-engineering/types';
   import { parseUserConfig } from './schema';
   import { userConfigPath } from './paths';

   export const AUTONOMY_ENV = 'HARNESS_AUTONOMY';
   export const AUTONOMY_AUDIT_ENV = 'HARNESS_AUTONOMY_AUDIT';

   /**
    * Inputs for resolveAutonomy. User-sourced only (D3): there is deliberately no project path,
    * so project configuration can never influence the result.
    */
   export interface ResolveAutonomyInput {
     flag?: AutonomyFlag;
     sessionOverride?: AutonomySessionOverride;
     env?: NodeJS.ProcessEnv;
     /** Defaults to <homeDir>/.harness/config.json. */
     userConfigPath?: string;
     homeDir?: string;
     /** Returns undefined when the file is absent/unreadable. */
     readFile?: (p: string) => string | undefined;
   }

   interface Picked<T> {
     value: T;
     source: AutonomySource;
   }

   const AUDIT_ENV_VALUES = new Map<string, boolean>([
     ['on', true],
     ['true', true],
     ['1', true],
     ['off', false],
     ['false', false],
     ['0', false],
   ]);

   function defaultReadFile(p: string): string | undefined {
     try {
       return fs.readFileSync(p, 'utf-8');
     } catch {
       return undefined;
     }
   }

   /** Flag vs session override. */
   function pickUserTier<T>(
     flagValue: T | undefined,
     field: AutonomyOverrideField<T> | undefined
   ): Picked<T> | undefined {
     if (flagValue !== undefined) return { value: flagValue, source: 'flag' };
     if (field !== undefined) return { value: field.value, source: 'session' };
     return undefined;
   }

   function readEnvLevel(env: NodeJS.ProcessEnv, warnings: string[]): AutonomyLevel | undefined {
     const raw = env[AUTONOMY_ENV];
     if (raw === undefined || raw.trim() === '') return undefined;
     const v = raw.trim().toLowerCase();
     if (v === 'supervised' || v === 'trusted') return v;
     warnings.push(`Ignoring ${AUTONOMY_ENV}="${raw}": expected supervised or trusted.`);
     return undefined;
   }

   function readEnvAudit(env: NodeJS.ProcessEnv, warnings: string[]): boolean | undefined {
     const raw = env[AUTONOMY_AUDIT_ENV];
     if (raw === undefined || raw.trim() === '') return undefined;
     const v = AUDIT_ENV_VALUES.get(raw.trim().toLowerCase());
     if (v === undefined) {
       warnings.push(`Ignoring ${AUTONOMY_AUDIT_ENV}="${raw}": expected on|off|true|false|1|0.`);
     }
     return v;
   }

   function loadUserConfig(input: ResolveAutonomyInput, warnings: string[]): AutonomyUserConfig {
     const p =
       input.userConfigPath ??
       userConfigPath(input.homeDir !== undefined ? { homeDir: input.homeDir } : {});
     const raw = (input.readFile ?? defaultReadFile)(p);
     if (raw === undefined) return {};
     const parsed = parseUserConfig(raw);
     if (!parsed.ok) {
       warnings.push(`Ignoring malformed ${p}: ${parsed.error.message}. Using defaults.`);
       return {};
     }
     return parsed.value;
   }

   function resolveLevel(
     input: ResolveAutonomyInput,
     env: NodeJS.ProcessEnv,
     user: AutonomyUserConfig,
     warnings: string[]
   ): Picked<AutonomyLevel> {
     const tier = pickUserTier(input.flag?.level, input.sessionOverride?.level);
     if (tier) return tier;
     const fromEnv = readEnvLevel(env, warnings);
     if (fromEnv !== undefined) return { value: fromEnv, source: 'env' };
     const fromUser = user.autonomy?.level;
     if (fromUser !== undefined) return { value: fromUser, source: 'user-config' };
     return { value: 'supervised', source: 'default' };
   }

   function resolveAudit(
     input: ResolveAutonomyInput,
     env: NodeJS.ProcessEnv,
     user: AutonomyUserConfig,
     level: AutonomyLevel,
     warnings: string[]
   ): Picked<boolean> {
     const tier = pickUserTier(input.flag?.audit, input.sessionOverride?.audit);
     if (tier) return tier;
     const fromEnv = readEnvAudit(env, warnings);
     if (fromEnv !== undefined) return { value: fromEnv, source: 'env' };
     const fromUser = user.autonomy?.audit?.[level];
     if (fromUser !== undefined) return { value: fromUser, source: 'user-config' };
     return { value: DEFAULT_AUTONOMY_AUDIT[level], source: 'default' };
   }

   /**
    * Resolve autonomy from user-sourced inputs only (D3): flag > session > env > user config >
    * default, per field. Pure aside from the user-config read. Never throws.
    */
   export function resolveAutonomy(input: ResolveAutonomyInput = {}): ResolvedAutonomy {
     const warnings: string[] = [];
     const env = input.env ?? process.env;
     const user = loadUserConfig(input, warnings);
     const level = resolveLevel(input, env, user, warnings);
     const audit = resolveAudit(input, env, user, level.value, warnings);
     return {
       level: level.value,
       audit: audit.value,
       source: { level: level.source, audit: audit.source },
       warnings,
     };
   }
   ```

4. Run the test again and observe it pass. Then run `pnpm --filter @harness-engineering/core typecheck`.
5. Run `harness validate`.
6. Commit: `feat(core): add resolveAutonomy with user-only precedence`

### Task 5: Flag-vs-override recency tie-break (D3)

**Depends on:** Task 4 | **Files:** `packages/core/src/autonomy/resolve.ts`, `packages/core/tests/autonomy/resolve.test.ts`

1. Append to `packages/core/tests/autonomy/resolve.test.ts`:

   ```ts
   describe('resolveAutonomy flag-vs-session recency (D3)', () => {
     const T1 = '2026-01-01T01:00:00.000Z';
     it('a session override newer than the flag wins', () => {
       const r = run({
         flag: { level: 'supervised', at: T0 },
         sessionOverride: sess('trusted', undefined, T1),
       });
       expect([r.level, r.source.level]).toEqual(['trusted', 'session']);
     });
     it('a flag newer than the override wins', () => {
       const r = run({
         flag: { level: 'supervised', at: T1 },
         sessionOverride: sess('trusted', undefined, T0),
       });
       expect([r.level, r.source.level]).toEqual(['supervised', 'flag']);
     });
     it('recency is per field', () => {
       const override: AutonomySessionOverride = {
         level: { value: 'trusted', setAt: T1, origin: 'cli' },
         audit: { value: false, setAt: '2025-12-31T00:00:00.000Z', origin: 'cli' },
       };
       const r = run({
         flag: { level: 'supervised', audit: true, at: T0 },
         sessionOverride: override,
       });
       expect([r.source.level, r.source.audit]).toEqual(['session', 'flag']);
     });
     it('an unparseable flag.at falls back to flag precedence', () => {
       const r = run({
         flag: { level: 'supervised', at: 'nope' },
         sessionOverride: sess('trusted', undefined, T1),
       });
       expect(r.source.level).toBe('flag');
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/autonomy/resolve.test.ts` and observe "a session override newer than the flag wins" and "recency is per field" fail.
3. In `packages/core/src/autonomy/resolve.ts`, replace `pickUserTier` with:

   ```ts
   function sessionIsNewer(flagAt: string | undefined, setAt: string): boolean {
     if (flagAt === undefined) return false;
     const f = Date.parse(flagAt);
     const s = Date.parse(setAt);
     if (Number.isNaN(f) || Number.isNaN(s)) return false;
     return s > f;
   }

   /** Flag vs session override: the more recent wins; a flag without a parseable `at` wins (D3). */
   function pickUserTier<T>(
     flagValue: T | undefined,
     flagAt: string | undefined,
     field: AutonomyOverrideField<T> | undefined
   ): Picked<T> | undefined {
     if (flagValue !== undefined && field !== undefined) {
       return sessionIsNewer(flagAt, field.setAt)
         ? { value: field.value, source: 'session' }
         : { value: flagValue, source: 'flag' };
     }
     if (flagValue !== undefined) return { value: flagValue, source: 'flag' };
     if (field !== undefined) return { value: field.value, source: 'session' };
     return undefined;
   }
   ```

   Then update the two call sites:
   - In `resolveLevel`: `pickUserTier(input.flag?.level, input.flag?.at, input.sessionOverride?.level)`
   - In `resolveAudit`: `pickUserTier(input.flag?.audit, input.flag?.at, input.sessionOverride?.audit)`

4. Run the test again and observe every case pass, including the Task 4 table. Then run `pnpm --filter @harness-engineering/core typecheck`.
5. Run `harness validate`.
6. Commit: `feat(core): break flag-vs-session autonomy ties by recency`

### Task 6: SC5 isolation test: resolver never reads project config

**Depends on:** Task 4 | **Files:** `packages/core/tests/autonomy/resolve-isolation.test.ts`

This is an acceptance test over code that already exists. It passes on first run, so each negative is paired with a positive control at the same scope.

1. Create `packages/core/tests/autonomy/resolve-isolation.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { resolveAutonomy } from '../../src/autonomy/resolve';

   const norm = (p: string) => p.replaceAll('\\', '/');
   const AUTONOMY_SRC = path.join(__dirname, '../../src/autonomy');
   /** Extended in Task 9 once override-store.ts / lower-only.ts / session.ts exist. */
   const SCANNED = ['resolve.ts', 'schema.ts', 'paths.ts'];

   describe('SC5: project config can never set autonomy', () => {
     it('resolves supervised even when the project config says trusted; only the user config is read', () => {
       const project = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-sc5-'));
       fs.writeFileSync(
         path.join(project, 'harness.config.json'),
         JSON.stringify({ autonomy: { level: 'trusted', audit: { trusted: false } } })
       );
       const reads: string[] = [];
       const readFile = (p: string) => {
         reads.push(norm(p));
         return undefined;
       };
       const userCfg = path.posix.join(norm(project), 'home', '.harness', 'config.json');
       const r = resolveAutonomy({ env: {}, readFile, userConfigPath: userCfg });
       expect([r.level, r.source.level, r.audit, r.source.audit]).toEqual([
         'supervised',
         'default',
         false,
         'default',
       ]);
       // Positive control: the reader WAS exercised, on the user-config path and nothing else.
       expect(reads).toEqual([userCfg]);
       expect(reads.some((p) => p.endsWith('harness.config.json'))).toBe(false);
       fs.rmSync(project, { recursive: true, force: true });
     });

     it('positive control: the same trusted document IS honoured from the user-config path', () => {
       const r = resolveAutonomy({
         env: {},
         readFile: () => JSON.stringify({ autonomy: { level: 'trusted' } }),
       });
       expect([r.level, r.source.level]).toEqual(['trusted', 'user-config']);
     });

     it.each(SCANNED)('%s never references the project config file', (file) => {
       const src = fs.readFileSync(path.join(AUTONOMY_SRC, file), 'utf-8');
       expect(src.length).toBeGreaterThan(0); // positive control: the real file was read
       expect(src).not.toMatch(/harness\.config/);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/autonomy/resolve-isolation.test.ts` and observe it pass.
3. **Mutation probe (do not commit).** Temporarily add `// harness.config.json` to `resolve.ts`, re-run, and confirm the scan test fails. Revert, re-run, and confirm it passes. Print `git diff --stat packages/core/src/autonomy/resolve.ts` in the same command as the final test run to show the revert is clean.
4. Run `harness validate`.
5. Commit: `test(core): prove resolveAutonomy ignores project config (SC5)`

### Task 7: Session-override store (home-dir, per-field, atomic)

[checkpoint:decision] Before starting, confirm the per-field timestamp shape (Uncertainties, first bullet). **Recommendation:** per-field (confidence: high). A single `setAt` lets an MCP lowering re-date a human `trusted` level and outrank a later `--supervised` flag. If the approver picks single `setAt`, stop and revise Tasks 1, 2, 5, 7.

**Depends on:** Task 2, Task 3 | **Files:** `packages/core/src/autonomy/override-store.ts`, `packages/core/tests/autonomy/override-store.test.ts`

1. Create `packages/core/tests/autonomy/override-store.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { readSessionOverride, writeSessionOverride } from '../../src/autonomy/override-store';
   import { sessionOverridePath } from '../../src/autonomy/paths';

   let tmp: string;
   let home: string;
   let project: string;
   const at = (iso: string) => () => new Date(iso);

   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-store-'));
     home = path.join(tmp, 'home');
     project = path.join(tmp, 'project');
     fs.mkdirSync(project, { recursive: true });
   });
   afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

   describe('session override store', () => {
     it('reads null when no override exists', () => {
       const r = readSessionOverride(project, 's1', { homeDir: home });
       expect(r.ok && r.value.override).toBeNull();
     });

     it('writes under the home dir, never under the project (D12)', () => {
       const w = writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', {
         homeDir: home,
         now: at('2026-01-01T00:00:00.000Z'),
       });
       expect(w.ok).toBe(true);
       const p = sessionOverridePath(project, 's1', { homeDir: home });
       expect(p.ok && fs.existsSync(p.value)).toBe(true);
       expect(p.ok && p.value.replaceAll('\\', '/')).toContain('/home/.harness/session-overrides/');
       expect(fs.existsSync(path.join(project, '.harness'))).toBe(false);
       const back = readSessionOverride(project, 's1', { homeDir: home });
       expect(back.ok && back.value.override).toEqual({
         level: { value: 'trusted', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' },
       });
     });

     it('updating one field preserves the other field and its timestamp', () => {
       writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', {
         homeDir: home,
         now: at('2026-01-01T00:00:00.000Z'),
       });
       const w = writeSessionOverride(project, 's1', { audit: true }, 'mcp', {
         homeDir: home,
         now: at('2026-01-02T00:00:00.000Z'),
       });
       expect(w.ok && w.value).toEqual({
         level: { value: 'trusted', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' },
         audit: { value: true, setAt: '2026-01-02T00:00:00.000Z', origin: 'mcp' },
       });
     });

     it('ignores a malformed file with a warning, and a write replaces it', () => {
       const p = sessionOverridePath(project, 's1', { homeDir: home });
       if (!p.ok) throw p.error;
       fs.mkdirSync(path.dirname(p.value), { recursive: true });
       fs.writeFileSync(p.value, '{nope');
       const r = readSessionOverride(project, 's1', { homeDir: home });
       expect(r.ok && r.value.override).toBeNull();
       expect(r.ok && r.value.warnings).toHaveLength(1);
       expect(
         writeSessionOverride(project, 's1', { audit: true }, 'mcp', { homeDir: home }).ok
       ).toBe(true);
     });

     it('rejects an empty change and a traversal slug without writing', () => {
       expect(writeSessionOverride(project, 's1', {}, 'cli', { homeDir: home }).ok).toBe(false);
       expect(
         writeSessionOverride(project, '../x', { level: 'supervised' }, 'cli', { homeDir: home }).ok
       ).toBe(false);
       expect(fs.existsSync(home)).toBe(false);
     });

     it.skipIf(process.platform === 'win32')('writes the file with mode 0600', () => {
       writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home });
       const p = sessionOverridePath(project, 's1', { homeDir: home });
       if (!p.ok) throw p.error;
       expect(fs.statSync(p.value).mode & 0o777).toBe(0o600);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/autonomy/override-store.test.ts` and observe it fail.
3. Create `packages/core/src/autonomy/override-store.ts`:

   ```ts
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import type {
     AutonomyOverrideOrigin,
     AutonomySessionOverride,
     AutonomySetting,
   } from '@harness-engineering/types';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';
   import { parseSessionOverride } from './schema';
   import { sessionOverridePath, type AutonomyPathOptions } from './paths';

   export interface OverrideStoreOptions extends AutonomyPathOptions {
     now?: () => Date;
     readFile?: (p: string) => string | undefined;
   }

   export interface ReadOverrideResult {
     override: AutonomySessionOverride | null;
     warnings: string[];
   }

   function defaultReadFile(p: string): string | undefined {
     try {
       return fs.readFileSync(p, 'utf-8');
     } catch {
       return undefined;
     }
   }

   export function readSessionOverride(
     projectPath: string,
     slug: string,
     opts: OverrideStoreOptions = {}
   ): Result<ReadOverrideResult, Error> {
     const p = sessionOverridePath(projectPath, slug, opts);
     if (!p.ok) return p;
     const raw = (opts.readFile ?? defaultReadFile)(p.value);
     if (raw === undefined) return Ok({ override: null, warnings: [] });
     const parsed = parseSessionOverride(raw);
     if (!parsed.ok) {
       return Ok({
         override: null,
         warnings: [`Ignoring malformed session override ${p.value}: ${parsed.error.message}`],
       });
     }
     return Ok({ override: parsed.value, warnings: [] });
   }

   function atomicWrite(file: string, content: string): void {
     fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
     const tmp = `${file}.${process.pid}.tmp`;
     fs.writeFileSync(tmp, content, { encoding: 'utf-8', mode: 0o600 });
     fs.renameSync(tmp, file);
   }

   /**
    * Merge `change` into the session override. Each written field gets its own setAt/origin;
    * untouched fields keep theirs. No raise/lower policy here: callers enforce it
    * (writeLoweringOverride for agent paths, the CLI TTY gate for raises).
    */
   export function writeSessionOverride(
     projectPath: string,
     slug: string,
     change: AutonomySetting,
     origin: AutonomyOverrideOrigin,
     opts: OverrideStoreOptions = {}
   ): Result<AutonomySessionOverride, Error> {
     if (change.level === undefined && change.audit === undefined) {
       return Err(new Error('An autonomy override requires level and/or audit'));
     }
     const p = sessionOverridePath(projectPath, slug, opts);
     if (!p.ok) return p;
     const current = readSessionOverride(projectPath, slug, opts);
     if (!current.ok) return current;
     const setAt = (opts.now ?? (() => new Date()))().toISOString();
     const next: AutonomySessionOverride = {
       ...(current.value.override ?? {}),
       ...(change.level !== undefined && { level: { value: change.level, setAt, origin } }),
       ...(change.audit !== undefined && { audit: { value: change.audit, setAt, origin } }),
     };
     try {
       atomicWrite(p.value, `${JSON.stringify(next, null, 2)}\n`);
     } catch (err) {
       return Err(err instanceof Error ? err : new Error(String(err)));
     }
     return Ok(next);
   }
   ```

4. Run the test again and observe it pass. Then run `pnpm --filter @harness-engineering/core typecheck`.
5. Run `harness validate`.
6. Commit: `feat(core): add home-dir autonomy session-override store`

### Task 8: Lower-only writer for agent-callable paths (D12, SC13 core)

**Depends on:** Task 7 | **Files:** `packages/core/src/autonomy/lower-only.ts`, `packages/core/tests/autonomy/lower-only.test.ts`

1. Create `packages/core/tests/autonomy/lower-only.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import {
     isRaisingChange,
     writeLoweringOverride,
     AUTONOMY_RAISE_REJECTED,
   } from '../../src/autonomy/lower-only';
   import { writeSessionOverride, readSessionOverride } from '../../src/autonomy/override-store';
   import { sessionOverridePath } from '../../src/autonomy/paths';

   let tmp: string;
   let home: string;
   let project: string;
   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-lower-'));
     home = path.join(tmp, 'home');
     project = path.join(tmp, 'project');
     fs.mkdirSync(project, { recursive: true });
   });
   afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

   const fileBytes = () => {
     const p = sessionOverridePath(project, 's1', { homeDir: home });
     if (!p.ok) throw p.error;
     return fs.existsSync(p.value) ? fs.readFileSync(p.value, 'utf-8') : null;
   };

   describe('isRaisingChange', () => {
     it.each([
       [{ level: 'trusted' as const }, true],
       [{ audit: false }, true],
       [{ level: 'supervised' as const, audit: false }, true],
       [{ level: 'supervised' as const }, false],
       [{ audit: true }, false],
       [{ level: 'supervised' as const, audit: true }, false],
     ])('%j → %s', (change, expected) => {
       expect(isRaisingChange(change)).toBe(expected);
     });
   });

   describe('writeLoweringOverride (SC13 core)', () => {
     it.each([
       { level: 'trusted' as const },
       { audit: false },
       { level: 'supervised' as const, audit: false },
     ])('rejects raising change %j and leaves the file byte-identical', (change) => {
       writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home });
       const before = fileBytes();
       const r = writeLoweringOverride(project, 's1', change, { homeDir: home });
       expect(r.ok).toBe(false);
       if (!r.ok) expect((r.error as { code?: string }).code).toBe(AUTONOMY_RAISE_REJECTED);
       expect(fileBytes()).toBe(before);
     });
     it('rejects a raise when no file exists, creating nothing', () => {
       expect(
         writeLoweringOverride(project, 's1', { level: 'trusted' }, { homeDir: home }).ok
       ).toBe(false);
       expect(fileBytes()).toBeNull();
     });
     it('writes a lowering with origin mcp', () => {
       const r = writeLoweringOverride(
         project,
         's1',
         { level: 'supervised', audit: true },
         { homeDir: home }
       );
       expect(r.ok).toBe(true);
       const back = readSessionOverride(project, 's1', { homeDir: home });
       expect(back.ok && back.value.override?.level?.origin).toBe('mcp');
       expect(back.ok && back.value.override?.audit?.value).toBe(true);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/autonomy/lower-only.test.ts` and observe it fail.
3. Create `packages/core/src/autonomy/lower-only.ts`:

   ```ts
   import type { AutonomySessionOverride, AutonomySetting } from '@harness-engineering/types';
   import type { Result } from '../shared/result';
   import { Err } from '../shared/result';
   import { writeSessionOverride, type OverrideStoreOptions } from './override-store';

   export const AUTONOMY_RAISE_REJECTED = 'AUTONOMY_RAISE_REJECTED';

   export class AutonomyRaiseRejectedError extends Error {
     readonly code = AUTONOMY_RAISE_REJECTED;
     readonly rejected: AutonomySetting;
     constructor(rejected: AutonomySetting) {
       super(
         `Refusing to raise autonomy through an agent-callable path (${JSON.stringify(rejected)}). ` +
           'Only supervised and audit=on may be set here; raising requires `harness autonomy set` on an interactive terminal.'
       );
       this.name = 'AutonomyRaiseRejectedError';
       this.rejected = rejected;
     }
   }

   /**
    * Value-based (D12): any write of `trusted` or audit=off counts as raising, even when it
    * equals the current value, because pinning it in the session tier would outrank a later
    * user-config lowering.
    */
   export function isRaisingChange(change: AutonomySetting): boolean {
     return change.level === 'trusted' || change.audit === false;
   }

   /** The only override writer agent-callable surfaces (MCP) may use. */
   export function writeLoweringOverride(
     projectPath: string,
     slug: string,
     change: AutonomySetting,
     opts: OverrideStoreOptions = {}
   ): Result<AutonomySessionOverride, Error> {
     if (isRaisingChange(change)) return Err(new AutonomyRaiseRejectedError(change));
     return writeSessionOverride(projectPath, slug, change, 'mcp', opts);
   }
   ```

4. Run the test again and observe it pass. Then run `pnpm --filter @harness-engineering/core typecheck`.
5. Run `harness validate`.
6. Commit: `feat(core): add lower-only autonomy override writer`

### Task 9: `resolveAutonomyForSession`, module index, SC7 resolver-level

**Depends on:** Task 5, Task 6, Task 8 | **Files:** `packages/core/src/autonomy/session.ts`, `packages/core/src/autonomy/index.ts`, `packages/core/tests/autonomy/session.test.ts`

1. Create `packages/core/tests/autonomy/session.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import {
     resolveAutonomyForSession,
     writeSessionOverride,
     writeLoweringOverride,
   } from '../../src/autonomy/index';

   let tmp: string;
   let home: string;
   let project: string;
   let other: string;
   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-session-'));
     home = path.join(tmp, 'home');
     project = path.join(tmp, 'project');
     other = path.join(tmp, 'other');
     fs.mkdirSync(project, { recursive: true });
     fs.mkdirSync(other, { recursive: true });
   });
   afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

   const resolve = (session: string | undefined, projectPath = project) =>
     resolveAutonomyForSession({
       projectPath,
       ...(session !== undefined && { session }),
       env: {},
       homeDir: home,
     });

   describe('resolveAutonomyForSession (SC7 resolver level)', () => {
     it('an override written for a session is returned by the next resolve', () => {
       expect([resolve('s1').level, resolve('s1').source.level]).toEqual(['supervised', 'default']);
       writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { homeDir: home });
       const after = resolve('s1');
       expect([after.level, after.source.level, after.audit]).toEqual(['trusted', 'session', true]);
       writeLoweringOverride(project, 's1', { level: 'supervised' }, { homeDir: home });
       expect([resolve('s1').level, resolve('s1').source.level]).toEqual(['supervised', 'session']);
     });
     it('does not leak to another session, to no session, or to another repo', () => {
       writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { homeDir: home });
       expect(resolve('s2').source.level).toBe('default');
       expect(resolve(undefined).source.level).toBe('default');
       expect(resolve('s1', other).source.level).toBe('default');
     });
     it('reads the user config from the injected home', () => {
       fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
       fs.writeFileSync(
         path.join(home, '.harness', 'config.json'),
         JSON.stringify({ autonomy: { level: 'trusted' } })
       );
       expect(resolve(undefined).source.level).toBe('user-config');
     });
     it('surfaces an invalid slug as a warning instead of throwing', () => {
       const r = resolve('../x');
       expect(r.source.level).toBe('default');
       expect(r.warnings.some((w) => /slug/i.test(w))).toBe(true);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/autonomy/session.test.ts` and observe it fail (module missing).
3. Create `packages/core/src/autonomy/session.ts`:

   ```ts
   import type { AutonomySessionOverride, ResolvedAutonomy } from '@harness-engineering/types';
   import { resolveAutonomy, type ResolveAutonomyInput } from './resolve';
   import { readSessionOverride, type OverrideStoreOptions } from './override-store';

   export interface ResolveForSessionInput
     extends Omit<ResolveAutonomyInput, 'sessionOverride'>, OverrideStoreOptions {
     /** Used only to key the home-dir override (repoKey); project files are never read. */
     projectPath: string;
     session?: string;
   }

   /** Read the session's home-dir override (if any) and resolve. Never throws. */
   export function resolveAutonomyForSession(input: ResolveForSessionInput): ResolvedAutonomy {
     const warnings: string[] = [];
     let sessionOverride: AutonomySessionOverride | undefined;
     if (input.session !== undefined) {
       const read = readSessionOverride(input.projectPath, input.session, input);
       if (!read.ok) {
         warnings.push(`Session override unavailable: ${read.error.message}`);
       } else {
         warnings.push(...read.value.warnings);
         if (read.value.override) sessionOverride = read.value.override;
       }
     }
     const resolved = resolveAutonomy({
       ...(input.flag !== undefined && { flag: input.flag }),
       ...(sessionOverride !== undefined && { sessionOverride }),
       ...(input.env !== undefined && { env: input.env }),
       ...(input.userConfigPath !== undefined && { userConfigPath: input.userConfigPath }),
       ...(input.homeDir !== undefined && { homeDir: input.homeDir }),
       ...(input.readFile !== undefined && { readFile: input.readFile }),
     });
     return { ...resolved, warnings: [...warnings, ...resolved.warnings] };
   }
   ```

4. Create `packages/core/src/autonomy/index.ts`:

   ```ts
   export {
     AutonomyLevelSchema,
     UserConfigSchema,
     SessionOverrideFileSchema,
     parseUserConfig,
     parseSessionOverride,
   } from './schema';
   export {
     harnessHomeDir,
     userConfigPath,
     computeRepoKey,
     validateOverrideSlug,
     sessionOverridePath,
   } from './paths';
   export type { AutonomyPathOptions } from './paths';
   export { resolveAutonomy, AUTONOMY_ENV, AUTONOMY_AUDIT_ENV } from './resolve';
   export type { ResolveAutonomyInput } from './resolve';
   export { readSessionOverride, writeSessionOverride } from './override-store';
   export type { OverrideStoreOptions, ReadOverrideResult } from './override-store';
   export {
     isRaisingChange,
     writeLoweringOverride,
     AutonomyRaiseRejectedError,
     AUTONOMY_RAISE_REJECTED,
   } from './lower-only';
   export { resolveAutonomyForSession } from './session';
   export type { ResolveForSessionInput } from './session';
   ```

5. Extend the SC5 scan. In `packages/core/tests/autonomy/resolve-isolation.test.ts`, change `SCANNED` to:

   ```ts
   const SCANNED = [
     'resolve.ts',
     'schema.ts',
     'paths.ts',
     'override-store.ts',
     'lower-only.ts',
     'session.ts',
     'index.ts',
   ];
   ```

   This edits a 4th file. The edit is one line, so the task stays in one context window.

6. Run `pnpm --filter @harness-engineering/core exec vitest run tests/autonomy/` and observe all pass. Then run `pnpm --filter @harness-engineering/core typecheck`.
7. Run `harness validate` and `harness check-deps`.
8. Commit: `feat(core): resolve autonomy per session from home-dir override`

### Task 10: Regenerate core barrel and build

**Depends on:** Task 9 | **Files:** `packages/core/src/index.ts` (generated) | **Category:** integration

1. Run `pnpm run generate:barrels`.
2. Confirm `export * from './autonomy';` was added: `grep -n "from './autonomy'" packages/core/src/index.ts` must print exactly one line. Zero lines means discovery skipped the directory. Do not proceed in that case.
3. Run `pnpm run generate:barrels:check` and expect exit 0.
4. Run `pnpm --filter @harness-engineering/core typecheck`. A `TS2308` (duplicate star-export name) here means an autonomy export collides. Rename it in `autonomy/index.ts` and re-run.
5. Run `npx turbo build --filter=@harness-engineering/cli...`. This builds types, then core, then cli. CLI tests consume core via dist.
6. Smoke-check the built export: `node -e "const c=require('./packages/core/dist/index.js'); console.log(typeof c.resolveAutonomyForSession, typeof c.writeLoweringOverride, c.AUTONOMY_RAISE_REJECTED)"` and expect `function function AUTONOMY_RAISE_REJECTED`.
7. Run `harness validate`.
8. Commit: `chore(core): export autonomy module from core barrel`

### Task 11: `manage_state` `set-autonomy` action (lower-only, SC13 MCP)

**Depends on:** Task 10 | **Files:** `packages/cli/src/mcp/tools/state.ts`, `packages/cli/tests/mcp/tools/state-set-autonomy.test.ts`

1. Create `packages/cli/tests/mcp/tools/state-set-autonomy.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import {
     resolveAutonomyForSession,
     sessionOverridePath,
     writeSessionOverride,
   } from '@harness-engineering/core';
   import { manageStateDefinition, handleManageState } from '../../../src/mcp/tools/state';

   let tmp: string;
   let home: string;
   let project: string;
   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-set-autonomy-'));
     home = path.join(tmp, 'home');
     project = path.join(tmp, 'project');
     fs.mkdirSync(project, { recursive: true });
   });
   afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

   const call = (extra: Record<string, unknown>) =>
     handleManageState(
       { path: project, action: 'set-autonomy', session: 's1', ...extra } as Parameters<
         typeof handleManageState
       >[0],
       { homeDir: home }
     );
   const bytes = () => {
     const p = sessionOverridePath(project, 's1', { homeDir: home });
     if (!p.ok) throw p.error;
     return fs.existsSync(p.value) ? fs.readFileSync(p.value, 'utf-8') : null;
   };

   describe('manage_state set-autonomy', () => {
     it('is declared in the schema with level and audit inputs', () => {
       const props = manageStateDefinition.inputSchema.properties as Record<
         string,
         { enum?: string[] }
       >;
       expect(props.action.enum).toContain('set-autonomy');
       expect(props.level.enum).toEqual(['supervised', 'trusted']);
       expect(props).toHaveProperty('audit');
     });

     it('lowers: writes an mcp-origin override in the home dir that the next resolve returns', async () => {
       const res = await call({ level: 'supervised', audit: true });
       expect(res.isError).toBeFalsy();
       const r = resolveAutonomyForSession({
         projectPath: project,
         session: 's1',
         env: {},
         homeDir: home,
       });
       expect([r.level, r.source.level, r.audit, r.source.audit]).toEqual([
         'supervised',
         'session',
         true,
         'session',
       ]);
       expect(fs.existsSync(path.join(project, '.harness'))).toBe(false);
     });

     it.each([{ level: 'trusted' }, { audit: false }, { level: 'supervised', audit: false }])(
       'rejects raise %j with a structured error and leaves the override unchanged (SC13)',
       async (change) => {
         writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home });
         const before = bytes();
         const res = await call(change);
         expect(res.isError).toBe(true);
         expect(JSON.parse(res.content[0]!.text).error).toBe('AUTONOMY_RAISE_REJECTED');
         expect(bytes()).toBe(before);
       }
     );

     it('requires a session, a valid level, and at least one field', async () => {
       const noSession = await handleManageState(
         { path: project, action: 'set-autonomy', level: 'supervised' } as Parameters<
           typeof handleManageState
         >[0],
         { homeDir: home }
       );
       expect(noSession.isError).toBe(true);
       expect((await call({ level: 'yolo' })).isError).toBe(true);
       expect((await call({})).isError).toBe(true);
       expect(bytes()).toBeNull();
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/state-set-autonomy.test.ts` and observe it fail.
3. Edit `packages/cli/src/mcp/tools/state.ts`:
   - Change `description` to: `'Manage harness project state: show current state, record learnings/failures, archive failures, reset state, run mechanical gate checks, save/load session handoff, or lower session autonomy (set-autonomy; lower-only)'`.
   - Append `'set-autonomy',` to the `action.enum` array after `'task-transition',`.
   - Add to `properties` after `reason`:

     ```ts
     level: {
       type: 'string',
       enum: ['supervised', 'trusted'],
       description:
         'Autonomy level for set-autonomy. Agent calls may only lower: "trusted" is rejected (raise with `harness autonomy set` on a TTY).',
     },
     audit: {
       type: 'boolean',
       description: 'Audit setting for set-autonomy. Agent calls may only turn audit on; false is rejected.',
     },
     ```

   - Add `level?: string;` and `audit?: boolean;` to `type StateInput`.
   - Add, just above `const ACTION_HANDLERS`:

     ```ts
     /** Injected inputs for set-autonomy (tests); production uses os.homedir() and the clock. */
     export interface SetAutonomyDeps {
       homeDir?: string;
       now?: () => Date;
     }

     async function handleSetAutonomy(
       projectPath: string,
       input: StateInput,
       deps: SetAutonomyDeps
     ): Promise<McpResponse> {
       if (!input.session) return mcpError('Error: session is required for set-autonomy action');
       if (input.level !== undefined && input.level !== 'supervised' && input.level !== 'trusted') {
         return mcpError('Error: level must be supervised or trusted');
       }
       if (input.level === undefined && input.audit === undefined) {
         return mcpError('Error: set-autonomy requires level and/or audit');
       }
       const core = await import('@harness-engineering/core');
       const change = {
         ...(input.level !== undefined && { level: input.level as 'supervised' | 'trusted' }),
         ...(input.audit !== undefined && { audit: input.audit }),
       };
       const result = core.writeLoweringOverride(projectPath, input.session, change, {
         ...(deps.homeDir !== undefined && { homeDir: deps.homeDir }),
         ...(deps.now !== undefined && { now: deps.now }),
       });
       if (!result.ok) {
         if ((result.error as { code?: string }).code === core.AUTONOMY_RAISE_REJECTED) {
           return mcpError(
             JSON.stringify({
               error: core.AUTONOMY_RAISE_REJECTED,
               message: result.error.message,
               rejected: change,
             })
           );
         }
         return resultToMcpResponse(result);
       }
       return resultToMcpResponse(Ok({ session: input.session, override: result.value }));
     }
     ```

   - Change `handleManageState` to:

     ```ts
     export async function handleManageState(input: StateInput, deps: SetAutonomyDeps = {}) {
       try {
         const projectPath = sanitizePath(input.path);
         // set-autonomy takes injected deps, so it is dispatched ahead of the shared table.
         if (input.action === 'set-autonomy')
           return await handleSetAutonomy(projectPath, input, deps);
         const handler = ACTION_HANDLERS[input.action];
         if (!handler) return mcpError('Error: unknown action');
         return await handler(projectPath, input);
       } catch (error) {
         return mcpError(`Error: ${error instanceof Error ? error.message : String(error)}`);
       }
     }
     ```

4. Run the new test plus the existing state suites and observe them pass: `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/state-set-autonomy.test.ts tests/mcp/tools/state.test.ts tests/mcp/tools/state-extra.test.ts`.
5. Run `pnpm --filter @harness-engineering/cli typecheck`.
6. Run `harness validate` and `harness check-deps`.
7. Run `npx turbo build --filter=@harness-engineering/cli...`, then commit: `feat(cli): add lower-only manage_state set-autonomy action`

### Task 12: `gather_context` `autonomy` include

**Depends on:** Task 11 | **Files:** `packages/cli/src/mcp/tools/gather-context.ts`, `packages/cli/tests/mcp/tools/gather-context-autonomy.test.ts`, `packages/cli/tests/mcp/tools/gather-context.test.ts`

1. Create `packages/cli/tests/mcp/tools/gather-context-autonomy.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { writeSessionOverride } from '@harness-engineering/core';
   import {
     gatherContextDefinition,
     handleGatherContext,
   } from '../../../src/mcp/tools/gather-context';
   import { handleManageState } from '../../../src/mcp/tools/state';

   let tmp: string;
   let home: string;
   let project: string;
   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-autonomy-'));
     home = path.join(tmp, 'home');
     project = path.join(tmp, 'project');
     fs.mkdirSync(project, { recursive: true });
   });
   afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

   const gather = async (extra: Record<string, unknown>, env: NodeJS.ProcessEnv = {}) => {
     const res = await handleGatherContext(
       { path: project, intent: 'autonomy test', include: ['autonomy'], ...extra } as Parameters<
         typeof handleGatherContext
       >[0],
       { homeDir: home, env }
     );
     return JSON.parse(res.content[0]!.text);
   };

   describe('gather_context autonomy include', () => {
     it('declares autonomy in the include enum', () => {
       expect(gatherContextDefinition.inputSchema.properties.include.items.enum).toContain(
         'autonomy'
       );
     });
     it('returns the default when nothing is configured', async () => {
       const out = await gather({});
       expect(out.autonomy).toMatchObject({
         level: 'supervised',
         audit: false,
         source: { level: 'default', audit: 'default' },
       });
     });
     it('reflects a session override, then a mid-session lowering (SC7 tool level)', async () => {
       writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { homeDir: home });
       expect((await gather({ session: 's1' })).autonomy.level).toBe('trusted');
       await handleManageState(
         {
           path: project,
           action: 'set-autonomy',
           session: 's1',
           level: 'supervised',
         } as Parameters<typeof handleManageState>[0],
         { homeDir: home }
       );
       const out = await gather({ session: 's1' });
       expect([out.autonomy.level, out.autonomy.source.level]).toEqual(['supervised', 'session']);
     });
     it('honours env', async () => {
       const out = await gather({}, { HARNESS_AUTONOMY: 'trusted' });
       expect([out.autonomy.level, out.autonomy.source.level]).toEqual(['trusted', 'env']);
     });
     it('ignores autonomy keys in the project config (SC5 at tool level)', async () => {
       fs.writeFileSync(
         path.join(project, 'harness.config.json'),
         JSON.stringify({ version: 1, autonomy: { level: 'trusted' } })
       );
       expect((await gather({})).autonomy.source.level).toBe('default');
     });
     it('omits the autonomy key when not requested', async () => {
       const res = await handleGatherContext(
         { path: project, intent: 'x', include: ['handoff'] } as Parameters<
           typeof handleGatherContext
         >[0],
         { homeDir: home, env: {} }
       );
       expect('autonomy' in JSON.parse(res.content[0]!.text)).toBe(false);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/gather-context-autonomy.test.ts` and observe it fail.
3. Edit `packages/cli/src/mcp/tools/gather-context.ts`:
   - Add `| 'autonomy'` to the `IncludeKey` union (after `'comprehension'`, around line 108).
   - Append `'autonomy',` to the `include.items.enum` array (after `'comprehension',`, around line 140). Append to the `include` description: ` "autonomy" (opt-in) returns the resolved user-level autonomy for the session.`
   - Change the handler signature to add a trailing deps parameter:

     ```ts
     export async function handleGatherContext(
       input: { /* existing fields unchanged */ },
       deps: { homeDir?: string; env?: NodeJS.ProcessEnv } = {}
     ) {
     ```

     Keep the existing input type literal unchanged and only add the `deps` parameter. **Do not** add `'autonomy'` to the default `includeSet` list.

   - After `comprehensionPromise` is defined, add:

     ```ts
     // Trusted Autonomy Mode: user-sourced only (D3/D12). Opt-in; never in the default set.
     const autonomyPromise = includeSet.has('autonomy')
       ? import('@harness-engineering/core').then((core) =>
           core.resolveAutonomyForSession({
             projectPath,
             ...(input.session !== undefined && { session: input.session }),
             env: deps.env ?? process.env,
             ...(deps.homeDir !== undefined && { homeDir: deps.homeDir }),
           })
         )
       : Promise.resolve(null);
     ```

   - Append `autonomyResult` to the destructured `Promise.allSettled` result list and `autonomyPromise` to its array (last position in both).
   - After `const comprehensionRaw = ...`, add `const autonomyRaw = extract(autonomyResult, 'autonomy');`.
   - In the `output` object literal, after `businessKnowledge: businessKnowledgeRaw ?? null,`, add `...(includeSet.has('autonomy') && { autonomy: autonomyRaw }),`.

4. In `packages/cli/tests/mcp/tools/gather-context.test.ts`, append `'autonomy',` after `'comprehension',` in the pinned `include enum has all constituent names` array (lines 31-41).
5. Run all gather-context suites and observe them pass: `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/gather-context`.
6. Run `pnpm --filter @harness-engineering/cli typecheck`.
7. Run `harness validate` and `harness check-deps`.
8. Run `npx turbo build --filter=@harness-engineering/cli...`, then commit: `feat(cli): add autonomy include to gather_context`

### Task 13: `harness autonomy show`

**Depends on:** Task 10 | **Files:** `packages/cli/src/commands/autonomy/deps.ts`, `packages/cli/src/commands/autonomy/show.ts`, `packages/cli/tests/commands/autonomy-show.test.ts`

1. Create `packages/cli/tests/commands/autonomy-show.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { Command } from 'commander';
   import { writeSessionOverride } from '@harness-engineering/core';
   import {
     runAutonomyShow,
     formatAutonomy,
     createAutonomyShowCommand,
   } from '../../src/commands/autonomy/show';

   let tmp: string;
   let home: string;
   let project: string;
   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-autonomy-show-'));
     home = path.join(tmp, 'home');
     project = path.join(tmp, 'project');
     fs.mkdirSync(project, { recursive: true });
   });
   afterEach(() => {
     vi.restoreAllMocks();
     fs.rmSync(tmp, { recursive: true, force: true });
   });
   const deps = () => ({ cwd: () => project, homeDir: home, env: {} });

   describe('harness autonomy show', () => {
     it('reports default values and sources', () => {
       const r = runAutonomyShow({}, deps());
       expect(formatAutonomy(r)).toEqual([
         'level: supervised (source: default)',
         'audit: off (source: default)',
       ]);
     });
     it('includes the session override when --session is given', () => {
       writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { homeDir: home });
       expect(runAutonomyShow({ session: 's1' }, deps()).source.level).toBe('session');
       expect(runAutonomyShow({}, deps()).source.level).toBe('default');
     });
     it('prints warnings', () => {
       const r = runAutonomyShow({}, { ...deps(), env: { HARNESS_AUTONOMY: 'yolo' } });
       expect(formatAutonomy(r).some((l) => l.startsWith('warning: '))).toBe(true);
     });
     it('emits JSON under the global --json flag', async () => {
       const log = vi.spyOn(console, 'log').mockImplementation(() => {});
       const program = new Command().option('--json').exitOverride();
       program.addCommand(createAutonomyShowCommand(deps()));
       await program.parseAsync(['node', 'harness', '--json', 'show']);
       const printed = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
       expect(printed).toMatchObject({ level: 'supervised', source: { level: 'default' } });
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/autonomy-show.test.ts` and observe it fail.
3. Create `packages/cli/src/commands/autonomy/deps.ts`:

   ```ts
   /** Injected inputs for `harness autonomy` (tests); production defaults are real process/terminal. */
   export interface AutonomyCliDeps {
     cwd?: () => string;
     env?: NodeJS.ProcessEnv;
     homeDir?: string;
     now?: () => Date;
     /** True only when stdin AND stdout are TTYs. */
     isInteractive?: () => boolean;
     /** Ask a yes/no question; resolves true only on an explicit yes. */
     confirm?: (question: string) => Promise<boolean>;
   }
   ```

4. Create `packages/cli/src/commands/autonomy/show.ts`:

   ```ts
   import { Command } from 'commander';
   import { resolveAutonomyForSession, type ResolvedAutonomy } from '@harness-engineering/core';
   import { logger } from '../../output/logger';
   import type { AutonomyCliDeps } from './deps';

   export function runAutonomyShow(
     opts: { session?: string },
     deps: AutonomyCliDeps = {}
   ): ResolvedAutonomy {
     return resolveAutonomyForSession({
       projectPath: (deps.cwd ?? (() => process.cwd()))(),
       ...(opts.session !== undefined && { session: opts.session }),
       env: deps.env ?? process.env,
       ...(deps.homeDir !== undefined && { homeDir: deps.homeDir }),
     });
   }

   export function formatAutonomy(r: ResolvedAutonomy): string[] {
     return [
       `level: ${r.level} (source: ${r.source.level})`,
       `audit: ${r.audit ? 'on' : 'off'} (source: ${r.source.audit})`,
       ...r.warnings.map((w) => `warning: ${w}`),
     ];
   }

   export function createAutonomyShowCommand(deps: AutonomyCliDeps = {}): Command {
     return new Command('show')
       .description('Show the resolved autonomy level and audit setting, and the source of each')
       .option('--session <slug>', 'Include this session’s override')
       .action((opts: { session?: string }, cmd: Command) => {
         const resolved = runAutonomyShow(opts, deps);
         if ((cmd.optsWithGlobals() as { json?: boolean }).json) {
           console.log(JSON.stringify(resolved, null, 2));
           return;
         }
         for (const line of formatAutonomy(resolved)) logger.info(line);
       });
   }
   ```

5. Run the test again and observe it pass. Then run `pnpm --filter @harness-engineering/cli typecheck`.
6. Run `harness validate` and `harness check-deps`.
7. Run `npx turbo build --filter=@harness-engineering/cli...`, then commit: `feat(cli): add harness autonomy show`

### Task 14: `harness autonomy set` with TTY + confirm gate for raises (SC13 CLI)

[checkpoint:human-verify] After this task, show the refusal output of a non-TTY raise and the confirm prompt wording to the human before continuing. This is the only path that can grant autonomy.

**Depends on:** Task 13 | **Files:** `packages/cli/src/commands/autonomy/set.ts`, `packages/cli/tests/commands/autonomy-set.test.ts`

1. Create `packages/cli/tests/commands/autonomy-set.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { sessionOverridePath, writeSessionOverride } from '@harness-engineering/core';
   import { runAutonomySet, defaultIsInteractive } from '../../src/commands/autonomy/set';

   let tmp: string;
   let home: string;
   let project: string;
   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-autonomy-set-'));
     home = path.join(tmp, 'home');
     project = path.join(tmp, 'project');
     fs.mkdirSync(project, { recursive: true });
   });
   afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

   const bytes = () => {
     const p = sessionOverridePath(project, 's1', { homeDir: home });
     if (!p.ok) throw p.error;
     return fs.existsSync(p.value) ? fs.readFileSync(p.value, 'utf-8') : null;
   };
   const deps = (interactive: boolean, answer = true) => {
     const confirm = vi.fn(async () => answer);
     return {
       confirm,
       d: { cwd: () => project, homeDir: home, env: {}, isInteractive: () => interactive, confirm },
     };
   };

   describe('harness autonomy set', () => {
     it.each([
       ['trusted', {}],
       ['supervised', { audit: 'off' }],
     ])(
       'refuses raise %s %j without a TTY, never prompts, writes nothing (SC13)',
       async (level, extra) => {
         const { confirm, d } = deps(false);
         const out = await runAutonomySet(level, { session: 's1', ...extra }, d);
         expect(out).toMatchObject({ status: 'refused', reason: 'not-a-tty' });
         expect(confirm).not.toHaveBeenCalled();
         expect(bytes()).toBeNull();
       }
     );

     it('a refused raise leaves an existing override byte-identical', async () => {
       writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home });
       const before = bytes();
       await runAutonomySet('trusted', { session: 's1' }, deps(false).d);
       expect(bytes()).toBe(before);
     });

     it('raises on a TTY after an explicit yes, with origin cli', async () => {
       const { confirm, d } = deps(true, true);
       const out = await runAutonomySet('trusted', { session: 's1', audit: 'on' }, d);
       expect(confirm).toHaveBeenCalledTimes(1);
       expect(out.status).toBe('written');
       if (out.status === 'written') {
         expect(out.override.level).toMatchObject({ value: 'trusted', origin: 'cli' });
       }
     });

     it('a declined confirm writes nothing', async () => {
       const out = await runAutonomySet('trusted', { session: 's1' }, deps(true, false).d);
       expect(out).toMatchObject({ status: 'refused', reason: 'declined' });
       expect(bytes()).toBeNull();
     });

     it('lowering needs no TTY and no prompt', async () => {
       const { confirm, d } = deps(false);
       const out = await runAutonomySet('supervised', { session: 's1', audit: 'on' }, d);
       expect(out.status).toBe('written');
       expect(confirm).not.toHaveBeenCalled();
     });

     it.each([
       ['yolo', {}],
       ['supervised', { audit: 'maybe' }],
     ])('rejects invalid input %s %j', async (level, extra) => {
       const out = await runAutonomySet(level, { session: 's1', ...extra }, deps(true).d);
       expect(out).toMatchObject({ status: 'refused', reason: 'invalid' });
       expect(bytes()).toBeNull();
     });

     it('the production TTY probe is false when stdin is not a TTY', () => {
       const desc = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
       Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
       try {
         expect(defaultIsInteractive()).toBe(false);
       } finally {
         if (desc) Object.defineProperty(process.stdin, 'isTTY', desc);
         else delete (process.stdin as { isTTY?: boolean }).isTTY;
       }
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/autonomy-set.test.ts` and observe it fail.
3. Create `packages/cli/src/commands/autonomy/set.ts`:

   ```ts
   import { Command } from 'commander';
   import {
     isRaisingChange,
     writeSessionOverride,
     type AutonomySessionOverride,
     type AutonomySetting,
   } from '@harness-engineering/core';
   import { logger } from '../../output/logger';
   import { prompt } from '../../output/prompt';
   import type { AutonomyCliDeps } from './deps';

   export interface AutonomySetOptions {
     session: string;
     audit?: string;
   }

   export type AutonomySetOutcome =
     | { status: 'written'; override: AutonomySessionOverride }
     | { status: 'refused'; reason: 'not-a-tty' | 'declined' | 'invalid'; message: string };

   export function defaultIsInteractive(): boolean {
     return Boolean(process.stdin.isTTY && process.stdout.isTTY);
   }

   async function defaultConfirm(question: string): Promise<boolean> {
     const answer = await prompt(question);
     return answer === 'y' || answer === 'yes';
   }

   function refuse(
     reason: 'not-a-tty' | 'declined' | 'invalid',
     message: string
   ): AutonomySetOutcome {
     return { status: 'refused', reason, message };
   }

   function parseChange(levelArg: string, auditArg: string | undefined): AutonomySetting | string {
     if (levelArg !== 'supervised' && levelArg !== 'trusted') {
       return `level must be supervised or trusted (got "${levelArg}")`;
     }
     if (auditArg !== undefined && auditArg !== 'on' && auditArg !== 'off') {
       return `--audit must be on or off (got "${auditArg}")`;
     }
     return {
       level: levelArg,
       ...(auditArg !== undefined && { audit: auditArg === 'on' }),
     };
   }

   /** Raising (trusted or audit off) requires an interactive TTY and an explicit yes (D12). */
   export async function runAutonomySet(
     levelArg: string,
     opts: AutonomySetOptions,
     deps: AutonomyCliDeps = {}
   ): Promise<AutonomySetOutcome> {
     const change = parseChange(levelArg, opts.audit);
     if (typeof change === 'string') return refuse('invalid', change);
     if (isRaisingChange(change)) {
       if (!(deps.isInteractive ?? defaultIsInteractive)()) {
         return refuse(
           'not-a-tty',
           'Raising autonomy requires an interactive terminal (stdin and stdout must be a TTY). Run this command yourself; an agent cannot raise autonomy.'
         );
       }
       const ok = await (deps.confirm ?? defaultConfirm)(
         `Raise autonomy for session "${opts.session}" to ${JSON.stringify(change)}? ` +
           'Workflow skills will auto-approve ceremony pauses and auto-take audited recommendations. (y/N) '
       );
       if (!ok) return refuse('declined', 'Aborted; override unchanged.');
     }
     const written = writeSessionOverride(
       (deps.cwd ?? (() => process.cwd()))(),
       opts.session,
       change,
       'cli',
       {
         ...(deps.homeDir !== undefined && { homeDir: deps.homeDir }),
         ...(deps.now !== undefined && { now: deps.now }),
       }
     );
     if (!written.ok) return refuse('invalid', written.error.message);
     return { status: 'written', override: written.value };
   }

   export function createAutonomySetCommand(deps: AutonomyCliDeps = {}): Command {
     return new Command('set')
       .description('Set the session autonomy override (raising requires an interactive terminal)')
       .argument('<level>', 'supervised | trusted')
       .requiredOption('--session <slug>', 'Session slug to override')
       .option('--audit <on|off>', 'Self-audit on judgment forks')
       .action(async (level: string, opts: AutonomySetOptions) => {
         const out = await runAutonomySet(level, opts, deps);
         if (out.status === 'written') {
           logger.success(`Autonomy override for session "${opts.session}" saved.`);
           return;
         }
         logger.error(out.message);
         process.exitCode = 1;
       });
   }
   ```

   If `AutonomySessionOverride`/`AutonomySetting` are not re-exported by core (they come from `export * from '@harness-engineering/types'` in the core barrel), import them from `@harness-engineering/types` instead.

4. Run the test again and observe it pass. Then run `pnpm --filter @harness-engineering/cli typecheck`.
5. Run `harness validate` and `harness check-deps`.
6. Run `npx turbo build --filter=@harness-engineering/cli...`, then commit: `feat(cli): add harness autonomy set with TTY-gated raise`

### Task 15: `harness autonomy` command group and registry regeneration

**Depends on:** Task 13, Task 14 | **Files:** `packages/cli/src/commands/autonomy/index.ts`, `packages/cli/src/commands/_registry.ts` (generated), `packages/cli/tests/commands/autonomy-command.test.ts` | **Category:** integration

1. Create `packages/cli/tests/commands/autonomy-command.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { createAutonomyCommand } from '../../src/commands/autonomy/index';
   import { commandCreators } from '../../src/commands/_registry';

   describe('harness autonomy command group', () => {
     it('exposes show and set (log arrives in Phase 2)', () => {
       const cmd = createAutonomyCommand();
       expect(cmd.name()).toBe('autonomy');
       expect(cmd.commands.map((c) => c.name()).sort()).toEqual(['set', 'show']);
     });
     it('is registered in the generated command registry', () => {
       expect(commandCreators).toContain(createAutonomyCommand);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/autonomy-command.test.ts` and observe it fail.
3. Create `packages/cli/src/commands/autonomy/index.ts`:

   ```ts
   import { Command } from 'commander';
   import type { AutonomyCliDeps } from './deps';
   import { createAutonomyShowCommand } from './show';
   import { createAutonomySetCommand } from './set';

   export function createAutonomyCommand(deps: AutonomyCliDeps = {}): Command {
     const command = new Command('autonomy').description(
       'Show or set user-level trusted autonomy (never read from project config)'
     );
     command.addCommand(createAutonomyShowCommand(deps));
     command.addCommand(createAutonomySetCommand(deps));
     return command;
   }
   ```

4. Run `pnpm run generate-barrel-exports`. Then confirm `grep -n "createAutonomyCommand" packages/cli/src/commands/_registry.ts` prints both the import line and the array entry.
5. Run the test again and observe it pass. Then run `pnpm run generate:barrels:check` and `pnpm --filter @harness-engineering/cli typecheck`.
6. Run `npx turbo build --filter=@harness-engineering/cli...`. Then smoke-test with a throwaway HOME so the real `~/.harness` is untouched:

   ```bash
   H=$(mktemp -d) && HOME=$H node packages/cli/dist/bin/harness.js autonomy show; \
   HOME=$H node packages/cli/dist/bin/harness.js autonomy set trusted --session smoke </dev/null; echo "exit=$?"; \
   ls -R "$H/.harness" 2>/dev/null || echo "no override written (expected)"
   ```

   Expect `level: supervised (source: default)`, a TTY-refusal message, `exit=1`, and no override written.

7. Run `harness validate` and `harness check-deps`.
8. Commit: `feat(cli): register harness autonomy command group`

### Task 16: Generated docs and full Phase 1 verification

[checkpoint:human-verify] Present the gate results and the SC trace table below for sign-off before Phase 2.

**Depends on:** Task 11, Task 12, Task 15 | **Files:** `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md`, `docs/reference/tool-catalog.md` (all generated) | **Category:** integration

1. Run `pnpm run generate-docs`, then `pnpm run generate:tool-catalog`.
2. Confirm the diffs touch only the expected entries: `git diff --stat docs/reference/` shows only `cli-commands.md`, `mcp-tools.md`, `tool-catalog.md`. Then run `git diff docs/reference/ | grep -E "autonomy|set-autonomy"` and expect a non-empty match.
3. Run the targeted suites at their own scope:
   - `pnpm --filter @harness-engineering/types exec vitest run tests/autonomy.test.ts`
   - `pnpm --filter @harness-engineering/core exec vitest run tests/autonomy/`
   - `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/state-set-autonomy.test.ts tests/mcp/tools/gather-context tests/mcp/tools/state.test.ts tests/commands/autonomy-show.test.ts tests/commands/autonomy-set.test.ts tests/commands/autonomy-command.test.ts tests/mcp/server.test.ts`

   For each suite, assert the reported test count is > 0 so a mistyped path cannot pass as green. `server.test.ts` must still pin `toHaveLength(115)`, because Phase 1 adds no MCP tool.

4. Run `pnpm --filter @harness-engineering/types typecheck && pnpm --filter @harness-engineering/core typecheck && pnpm --filter @harness-engineering/cli typecheck`.
5. Run `pnpm lint --filter=@harness-engineering/core --filter=@harness-engineering/cli`.
6. Run `pnpm run generate:barrels:check` and `pnpm run generate:tool-catalog:check`.
7. Run `harness validate`, `harness check-deps`, and `harness check-security --severity error`. For check-security, expect zero findings under `packages/core/src/autonomy/` and `packages/cli/src/commands/autonomy/`.
8. Commit: `docs(reference): regenerate for harness autonomy and set-autonomy`

## Success-Criteria Trace

| Criterion                          | Tasks           |
| ---------------------------------- | --------------- |
| SC5 (project config ignored)       | 6, 9 (scan), 12 |
| SC6 (precedence + source, table)   | 4, 5            |
| SC7 (resolver level)               | 9, 12           |
| SC13 (MCP raise rejected)          | 8, 11           |
| SC13 (CLI non-TTY refuses)         | 14, 15 (smoke)  |
| D12 (home-dir only, never in repo) | 3, 7, 11        |
| Registrations                      | 10, 15, 16      |

## Dependency Graph (for `plan_parallelization`)

- Wave A: Task 1, Task 3 (independent)
- Then: Task 2 (←1); Task 4 (←1,2,3); Task 5 (←4) ∥ Task 6 (←4); Task 7 (←2,3) ∥ Task 4; Task 8 (←7); Task 9 (←5,6,8); Task 10 (←9)
- After Task 10: Task 11 ∥ Task 13; Task 12 (←11); Task 14 (←13); Task 15 (←13,14); Task 16 (←11,12,15)
- No wave reaches `minWaveSize` 3 with disjoint files except {1, 3}, so expect mostly serial execution.
