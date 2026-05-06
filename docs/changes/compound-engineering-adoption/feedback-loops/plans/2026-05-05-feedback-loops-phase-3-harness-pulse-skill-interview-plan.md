# Plan: Feedback Loops — Phase 3: harness-pulse Skill (Interview)

**Date:** 2026-05-05 | **Spec:** `docs/changes/compound-engineering-adoption/feedback-loops/proposal.md` | **Tasks:** 11 | **Time:** ~38 min | **Integration Tier:** medium

> Phase 3 of the feedback-loops spec. Builds on Phase 1 (`PulseConfig` schema, `SanitizeFn` type, `validatePulseConfig`) and Phase 2 (multi-platform skill structure proven by `harness-compound`). Adds the `harness-pulse` skill prose for the **first-run interview only** (Phase 0/1 of the skill's runtime), the config-writer that persists the interview's output to `harness.config.json`, the optional STRATEGY.md seeder, and the `SanitizeFn` adapter REGISTRY contract that Phase 4 will populate. The actual `harness pulse run` CLI and provider adapters (PostHog, Sentry) are explicitly out of scope — deferred to Phase 4.

## Goal

A user runs `/harness:pulse` on a project that has no `pulse:` block; the skill conducts a SMART-pushback interview (seeded from `STRATEGY.md` if present), refuses any read-write DB credential offered, and on completion writes a valid `pulse:` block to `harness.config.json` (preserving every other key). A registry exists at `packages/core/src/pulse/adapters/` so Phase 4 can register `SanitizeFn` adapters by name without Phase 3 touching any provider implementation.

## Observable Truths (Acceptance Criteria)

1. **[Ubiquitous]** `agents/skills/{claude-code,gemini-cli,cursor,codex}/harness-pulse/SKILL.md` and `skill.yaml` all exist and are byte-identical across the 4 platforms (passes `agents/skills/tests/platform-parity.test.ts`).
2. **[Ubiquitous]** SKILL.md documents Phase 0 (route by config), Phase 1 (interview) and references `agents/skills/claude-code/harness-pulse/references/interview.md`. Phase 2-4 (run, assemble, save) are stubbed with a "deferred to Phase 4" note.
3. **[Ubiquitous]** `references/interview.md` documents the SMART-pushback rule for proposed metrics/events and the **READ-WRITE-DB rejection rule** (any connection string with write/admin scope is refused; only read-only is accepted).
4. **[Event-driven]** When `writePulseConfig(config, { configPath })` is called against a `harness.config.json` that contains keys other than `pulse`, the resulting file preserves all non-`pulse` keys byte-for-byte (modulo the new `pulse` block) and the `pulse` block validates against `PulseConfigSchema`.
5. **[Event-driven]** When `writePulseConfig` is called against a `harness.config.json` that already has a `pulse` block, the existing block is replaced (not merged) and a backup is written to `harness.config.json.bak` before mutation.
6. **[Event-driven]** When `seedFromStrategy({ cwd })` is called and `STRATEGY.md` is absent, returns `{ name: null, keyMetrics: [] }` without throwing (soft-fail).
7. **[Event-driven]** When `STRATEGY.md` exists with frontmatter `name: <X>` and a `## Key metrics` H2 followed by a bulleted list, `seedFromStrategy` returns `{ name: '<X>', keyMetrics: [<list items>] }`.
8. **[Event-driven]** When frontmatter is missing but an `# <Title>` H1 exists, `seedFromStrategy` falls back to the H1 text as `name` and emits a warning string in the returned `warnings` array.
9. **[Ubiquitous]** `registerPulseAdapter(name, adapter)` stores a `SanitizeFn` keyed by name; `getPulseAdapter(name)` returns it; `getPulseAdapter('unknown')` returns `undefined`. Re-registering a name throws `PulseAdapterAlreadyRegisteredError`.
10. **[Ubiquitous]** The registry, config writer, and strategy seeder are exported from `@harness-engineering/core` via `packages/core/src/pulse/index.ts`.
11. **[Ubiquitous]** Running `pnpm -F @harness-engineering/cli build && node packages/cli/dist/index.js generate-slash-commands --platform claude-code --output /tmp/sc-pulse` produces a `harness/pulse.md` file.
12. **[Ubiquitous]** `pnpm -F @harness-engineering/core test` passes (existing + new pulse-config-writer, strategy-seeder, adapter-registry tests).
13. **[Ubiquitous]** `harness validate` passes at plan end.

## Uncertainties

- **[ASSUMPTION]** Config writer lives in `packages/core/src/pulse/config-writer.ts` (alongside the existing `schema.ts` and `sanitize.ts`). Strategy seeder lives in `packages/core/src/pulse/strategy-seeder.ts`. Adapter registry lives in `packages/core/src/pulse/adapters/index.ts`. If a reviewer prefers a different layout, only Tasks 2, 4, 6 change.
- **[ASSUMPTION]** No new runtime dependency added; we use Node-builtin `fs` + an existing JSON parse/stringify path. STRATEGY.md frontmatter parsing uses a simple regex (or an existing yaml dep already in the workspace if available — checked at implementation time).
- **[ASSUMPTION]** The skill prose is the executable artifact — there is NO `harness pulse interview` CLI in this phase. The interview is conducted by an agent reading SKILL.md + `references/interview.md` and using its standard tools (Read, Write, Bash, the `emit_interaction` MCP tool when present, with chat fallback). The agent calls `writePulseConfig` either via a Node one-liner or an MCP tool exposed in a later phase. We document the Node one-liner path in SKILL.md.
- **[DEFERRABLE]** Exact wording of SMART-pushback prompts — drafted in `references/interview.md`, tightenable during real use.
- **[DEFERRABLE]** Whether the interview should also persist a `pendingMetrics` list when the user proposes metrics whose data sources aren't wired yet. The schema has the field; the interview can fill it; exact UX deferred to first-real-user feedback.

## File Map

```
CREATE packages/core/src/pulse/config-writer.ts
CREATE packages/core/src/pulse/config-writer.test.ts
CREATE packages/core/src/pulse/strategy-seeder.ts
CREATE packages/core/src/pulse/strategy-seeder.test.ts
CREATE packages/core/src/pulse/adapters/index.ts
CREATE packages/core/src/pulse/adapters/registry.ts
CREATE packages/core/src/pulse/adapters/registry.test.ts
MODIFY packages/core/src/pulse/index.ts                                   (re-export new modules)

CREATE agents/skills/claude-code/harness-pulse/SKILL.md
CREATE agents/skills/claude-code/harness-pulse/skill.yaml
CREATE agents/skills/claude-code/harness-pulse/references/interview.md
CREATE agents/skills/gemini-cli/harness-pulse/SKILL.md                    (byte-identical mirror)
CREATE agents/skills/gemini-cli/harness-pulse/skill.yaml                  (byte-identical mirror)
CREATE agents/skills/gemini-cli/harness-pulse/references/interview.md     (byte-identical mirror)
CREATE agents/skills/cursor/harness-pulse/SKILL.md                        (byte-identical mirror)
CREATE agents/skills/cursor/harness-pulse/skill.yaml                      (byte-identical mirror)
CREATE agents/skills/cursor/harness-pulse/references/interview.md         (byte-identical mirror)
CREATE agents/skills/codex/harness-pulse/SKILL.md                         (byte-identical mirror)
CREATE agents/skills/codex/harness-pulse/skill.yaml                       (byte-identical mirror)
CREATE agents/skills/codex/harness-pulse/references/interview.md          (byte-identical mirror)
```

## Skeleton

_Not produced — fast rigor mode skips skeleton; task structure is dictated by the named Phase-3 deliverables in the spec._

## Tasks

---

### Task 1: Write failing tests for `writePulseConfig` (preserve non-pulse keys; replace pulse block; backup)

**Depends on:** none | **Files:** `packages/core/src/pulse/config-writer.test.ts`

1. Create `packages/core/src/pulse/config-writer.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { writePulseConfig } from './config-writer';
   import type { PulseConfig } from '@harness-engineering/types';

   const samplePulse: PulseConfig = {
     enabled: true,
     lookbackDefault: '24h',
     primaryEvent: 'session_started',
     valueEvent: 'plan_completed',
     completionEvents: ['plan_completed'],
     qualityScoring: false,
     qualityDimension: null,
     sources: { analytics: 'posthog', tracing: 'sentry', payments: null, db: { enabled: false } },
     metricSourceOverrides: {},
     pendingMetrics: [],
     excludedMetrics: [],
   };

   describe('writePulseConfig', () => {
     let tmpDir: string;
     let cfgPath: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-cfg-'));
       cfgPath = path.join(tmpDir, 'harness.config.json');
     });
     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('preserves non-pulse keys byte-for-byte', () => {
       const original = { version: 1, name: 'p', layers: [{ name: 'a', pattern: 'x' }] };
       fs.writeFileSync(cfgPath, JSON.stringify(original, null, 2));
       writePulseConfig(samplePulse, { configPath: cfgPath });
       const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
       expect(parsed.version).toBe(1);
       expect(parsed.name).toBe('p');
       expect(parsed.layers).toEqual(original.layers);
       expect(parsed.pulse).toBeDefined();
       expect(parsed.pulse.enabled).toBe(true);
     });

     it('replaces an existing pulse block (not merges)', () => {
       const original = {
         version: 1,
         pulse: { enabled: false, lookbackDefault: '7d', extraKey: 'should-be-gone' },
       };
       fs.writeFileSync(cfgPath, JSON.stringify(original, null, 2));
       writePulseConfig(samplePulse, { configPath: cfgPath });
       const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
       expect(parsed.pulse.lookbackDefault).toBe('24h');
       expect(parsed.pulse.extraKey).toBeUndefined();
     });

     it('writes a .bak before mutating an existing config', () => {
       const original = { version: 1, name: 'p' };
       fs.writeFileSync(cfgPath, JSON.stringify(original, null, 2));
       writePulseConfig(samplePulse, { configPath: cfgPath });
       expect(fs.existsSync(`${cfgPath}.bak`)).toBe(true);
       const bak = JSON.parse(fs.readFileSync(`${cfgPath}.bak`, 'utf-8'));
       expect(bak).toEqual(original);
     });

     it('rejects a config path that does not exist', () => {
       expect(() =>
         writePulseConfig(samplePulse, { configPath: path.join(tmpDir, 'missing.json') })
       ).toThrow(/not found/i);
     });

     it('rejects an invalid PulseConfig', () => {
       fs.writeFileSync(cfgPath, JSON.stringify({ version: 1 }, null, 2));
       expect(() =>
         writePulseConfig(
           { ...samplePulse, lookbackDefault: 'banana' as never },
           { configPath: cfgPath }
         )
       ).toThrow();
     });
   });
   ```

2. Run: `pnpm -F @harness-engineering/core test -- config-writer` — observe failure (module not found).
3. Commit: `test(core): failing tests for pulse config-writer`.

---

### Task 2: Implement `writePulseConfig`

**Depends on:** Task 1 | **Files:** `packages/core/src/pulse/config-writer.ts`

1. Create `packages/core/src/pulse/config-writer.ts`:

   ```typescript
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { PulseConfigSchema } from './schema';
   import type { PulseConfig } from '@harness-engineering/types';

   export interface WritePulseConfigOptions {
     /** Absolute path to harness.config.json. */
     configPath: string;
     /** When true, do not write a .bak (default: false). */
     skipBackup?: boolean;
   }

   /**
    * Persist a `pulse:` block to harness.config.json, preserving every other
    * top-level key. Existing pulse blocks are replaced (not merged). A `.bak`
    * is written before mutation unless `skipBackup` is true.
    *
    * Throws when:
    * - configPath does not exist
    * - the existing config is not valid JSON
    * - the supplied PulseConfig fails PulseConfigSchema validation
    */
   export function writePulseConfig(config: PulseConfig, opts: WritePulseConfigOptions): void {
     // Validate input first; do not touch disk if invalid.
     PulseConfigSchema.parse(config);

     if (!fs.existsSync(opts.configPath)) {
       throw new Error(`harness.config.json not found at ${opts.configPath}`);
     }
     const raw = fs.readFileSync(opts.configPath, 'utf-8');
     let parsed: Record<string, unknown>;
     try {
       parsed = JSON.parse(raw);
     } catch (e) {
       throw new Error(`Invalid JSON in ${opts.configPath}: ${(e as Error).message}`);
     }

     if (!opts.skipBackup) {
       fs.writeFileSync(`${opts.configPath}.bak`, raw, 'utf-8');
     }

     parsed.pulse = config;
     const serialized = JSON.stringify(parsed, null, 2) + '\n';
     fs.writeFileSync(opts.configPath, serialized, 'utf-8');
   }
   ```

2. Run: `pnpm -F @harness-engineering/core test -- config-writer` — all 5 tests pass.
3. Run: `pnpm -F @harness-engineering/core typecheck` — zero errors.
4. Run: `harness validate`.
5. Commit: `feat(core): pulse config-writer preserves non-pulse keys with .bak`.

---

### Task 3: Write failing tests for `seedFromStrategy` (absent / frontmatter-name / H1-fallback / malformed)

**Depends on:** none | **Files:** `packages/core/src/pulse/strategy-seeder.test.ts`

1. Create `packages/core/src/pulse/strategy-seeder.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { seedFromStrategy } from './strategy-seeder';

   describe('seedFromStrategy', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-'));
     });
     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('soft-fails when STRATEGY.md is absent', () => {
       const result = seedFromStrategy({ cwd: tmpDir });
       expect(result.name).toBeNull();
       expect(result.keyMetrics).toEqual([]);
       expect(result.warnings).toContain('STRATEGY.md not found');
     });

     it('extracts name from frontmatter and Key metrics list', () => {
       fs.writeFileSync(
         path.join(tmpDir, 'STRATEGY.md'),
         [
           '---',
           "name: 'Acme Widgets'",
           '---',
           '# Strategy',
           '',
           '## Key metrics',
           '- Daily active users',
           '- Plans completed per week',
           '- p95 latency on /api/plan',
           '',
           '## Other section',
           '- not a metric',
         ].join('\n')
       );
       const result = seedFromStrategy({ cwd: tmpDir });
       expect(result.name).toBe('Acme Widgets');
       expect(result.keyMetrics).toEqual([
         'Daily active users',
         'Plans completed per week',
         'p95 latency on /api/plan',
       ]);
       expect(result.warnings).toEqual([]);
     });

     it('falls back to H1 when frontmatter has no name', () => {
       fs.writeFileSync(
         path.join(tmpDir, 'STRATEGY.md'),
         ['# My Product', '', '## Key metrics', '- Metric one'].join('\n')
       );
       const result = seedFromStrategy({ cwd: tmpDir });
       expect(result.name).toBe('My Product');
       expect(result.keyMetrics).toEqual(['Metric one']);
       expect(result.warnings.some((w) => /frontmatter/i.test(w))).toBe(true);
     });

     it('soft-fails when Key metrics section is missing', () => {
       fs.writeFileSync(
         path.join(tmpDir, 'STRATEGY.md'),
         '---\nname: X\n---\n# X\n\n## Vision\n- nothing'
       );
       const result = seedFromStrategy({ cwd: tmpDir });
       expect(result.name).toBe('X');
       expect(result.keyMetrics).toEqual([]);
       expect(result.warnings.some((w) => /key metrics/i.test(w))).toBe(true);
     });
   });
   ```

2. Run: `pnpm -F @harness-engineering/core test -- strategy-seeder` — observe failure.
3. Commit: `test(core): failing tests for pulse strategy-seeder`.

---

### Task 4: Implement `seedFromStrategy`

**Depends on:** Task 3 | **Files:** `packages/core/src/pulse/strategy-seeder.ts`

1. Create `packages/core/src/pulse/strategy-seeder.ts`:

   ```typescript
   import * as fs from 'node:fs';
   import * as path from 'node:path';

   export interface StrategySeed {
     name: string | null;
     keyMetrics: string[];
     warnings: string[];
   }

   export interface SeedOptions {
     cwd?: string;
   }

   /**
    * Read STRATEGY.md from cwd if present and extract product name and
    * `## Key metrics` bullet items.
    *
    * Defensive: every failure mode degrades to a non-empty `warnings` array
    * with `name: null` and `keyMetrics: []` rather than throwing.
    */
   export function seedFromStrategy(opts: SeedOptions = {}): StrategySeed {
     const cwd = opts.cwd ?? process.cwd();
     const strategyPath = path.join(cwd, 'STRATEGY.md');
     const warnings: string[] = [];

     if (!fs.existsSync(strategyPath)) {
       return { name: null, keyMetrics: [], warnings: ['STRATEGY.md not found'] };
     }

     const raw = fs.readFileSync(strategyPath, 'utf-8');

     // Extract frontmatter name if present.
     let name: string | null = null;
     const fmMatch = /^---\s*\n([\s\S]*?)\n---\s*\n/.exec(raw);
     if (fmMatch) {
       const fm = fmMatch[1];
       const nameMatch = /^name:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(fm);
       if (nameMatch) {
         name = nameMatch[1].trim();
       }
     }

     // Fallback: first H1
     if (name === null) {
       const h1 = /^#\s+(.+)$/m.exec(raw);
       if (h1) {
         name = h1[1].trim();
         warnings.push('STRATEGY.md frontmatter missing name; used H1 fallback');
       }
     }

     // Extract `## Key metrics` bullet list.
     const keyMetrics: string[] = [];
     const keyMatch = /^##\s+Key metrics\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/m.exec(raw);
     if (keyMatch) {
       const block = keyMatch[1];
       for (const line of block.split('\n')) {
         const m = /^[-*]\s+(.+)$/.exec(line.trim());
         if (m) keyMetrics.push(m[1].trim());
       }
     } else {
       warnings.push('STRATEGY.md is missing a `## Key metrics` section');
     }

     return { name, keyMetrics, warnings };
   }
   ```

2. Run: `pnpm -F @harness-engineering/core test -- strategy-seeder` — all 4 tests pass.
3. Run: `pnpm -F @harness-engineering/core typecheck` — zero errors.
4. Run: `harness validate`.
5. Commit: `feat(core): pulse strategy-seeder reads STRATEGY.md defensively`.

---

### Task 5: Write failing tests for the `SanitizeFn` adapter registry

**Depends on:** none | **Files:** `packages/core/src/pulse/adapters/registry.test.ts`

1. Create `packages/core/src/pulse/adapters/registry.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach } from 'vitest';
   import {
     registerPulseAdapter,
     getPulseAdapter,
     listPulseAdapters,
     clearPulseAdapters,
     PulseAdapterAlreadyRegisteredError,
   } from './registry';
   import type { SanitizeFn } from '@harness-engineering/types';

   const noopAdapter: SanitizeFn = (raw) => ({
     events: [],
     counts: {},
     bucketStart: new Date(0).toISOString(),
     bucketEnd: new Date(0).toISOString(),
   });

   describe('pulse adapter registry', () => {
     beforeEach(() => clearPulseAdapters());

     it('register / get round-trip', () => {
       registerPulseAdapter('posthog', noopAdapter);
       expect(getPulseAdapter('posthog')).toBe(noopAdapter);
     });

     it('returns undefined for unknown adapters', () => {
       expect(getPulseAdapter('nope')).toBeUndefined();
     });

     it('throws when re-registering the same name', () => {
       registerPulseAdapter('sentry', noopAdapter);
       expect(() => registerPulseAdapter('sentry', noopAdapter)).toThrow(
         PulseAdapterAlreadyRegisteredError
       );
     });

     it('listPulseAdapters returns sorted names', () => {
       registerPulseAdapter('sentry', noopAdapter);
       registerPulseAdapter('posthog', noopAdapter);
       expect(listPulseAdapters()).toEqual(['posthog', 'sentry']);
     });
   });
   ```

2. Run: `pnpm -F @harness-engineering/core test -- adapters/registry` — observe failure.
3. Commit: `test(core): failing tests for pulse adapter registry`.

---

### Task 6: Implement adapter registry and barrel-export

**Depends on:** Task 5 | **Files:** `packages/core/src/pulse/adapters/registry.ts`, `packages/core/src/pulse/adapters/index.ts`, `packages/core/src/pulse/index.ts`

1. Create `packages/core/src/pulse/adapters/registry.ts`:

   ```typescript
   import type { SanitizeFn } from '@harness-engineering/types';

   export class PulseAdapterAlreadyRegisteredError extends Error {
     constructor(public readonly name: string) {
       super(`Pulse adapter "${name}" is already registered.`);
       this.name = 'PulseAdapterAlreadyRegisteredError';
     }
   }

   const REGISTRY = new Map<string, SanitizeFn>();

   export function registerPulseAdapter(name: string, adapter: SanitizeFn): void {
     if (REGISTRY.has(name)) {
       throw new PulseAdapterAlreadyRegisteredError(name);
     }
     REGISTRY.set(name, adapter);
   }

   export function getPulseAdapter(name: string): SanitizeFn | undefined {
     return REGISTRY.get(name);
   }

   export function listPulseAdapters(): string[] {
     return [...REGISTRY.keys()].sort();
   }

   /** Test-only: clear the registry between tests. */
   export function clearPulseAdapters(): void {
     REGISTRY.clear();
   }
   ```

2. Create `packages/core/src/pulse/adapters/index.ts`:

   ```typescript
   export {
     registerPulseAdapter,
     getPulseAdapter,
     listPulseAdapters,
     clearPulseAdapters,
     PulseAdapterAlreadyRegisteredError,
   } from './registry';
   ```

3. Update `packages/core/src/pulse/index.ts` to add (preserving existing exports):

   ```typescript
   export { writePulseConfig } from './config-writer';
   export type { WritePulseConfigOptions } from './config-writer';
   export { seedFromStrategy } from './strategy-seeder';
   export type { StrategySeed, SeedOptions } from './strategy-seeder';
   export {
     registerPulseAdapter,
     getPulseAdapter,
     listPulseAdapters,
     clearPulseAdapters,
     PulseAdapterAlreadyRegisteredError,
   } from './adapters';
   ```

4. Run: `pnpm run generate:barrels` (if the repo uses generated barrels); otherwise the change above is final.
5. Run: `pnpm -F @harness-engineering/core test -- adapters/registry` — all 4 tests pass.
6. Run: `pnpm -F @harness-engineering/core test` — full suite green.
7. Run: `pnpm -F @harness-engineering/core typecheck` — zero errors.
8. Run: `pnpm -F @harness-engineering/cli typecheck` — zero errors (downstream consumers happy).
9. Run: `harness validate`.
10. Commit: `feat(core): pulse adapter registry and barrel exports`.

---

### Task 7: Author `references/interview.md` (SMART pushback + read-write-DB rejection rules)

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-pulse/references/interview.md`

1. Create the directory and file `agents/skills/claude-code/harness-pulse/references/interview.md`:

   ````markdown
   # Pulse First-Run Interview Reference

   The first-run interview converts vague intent ("I want to know how the product is doing") into a concrete `pulse:` block in `harness.config.json`. This document is the rule book the skill quotes when pushing back on input.

   ## SMART Pushback Rules

   For every metric or event the user proposes, the skill MUST evaluate it against the SMART bar and push back when it fails. SMART = **S**pecific, **M**easurable, **A**chievable, **R**elevant, **T**ime-bound.

   | Test       | Question                                                             | Reject when                                         |
   | ---------- | -------------------------------------------------------------------- | --------------------------------------------------- |
   | Specific   | Does the name uniquely identify one event/metric?                    | "engagement", "activity", "usage" without qualifier |
   | Measurable | Is there a wired data source that emits this?                        | No analytics/tracing source covers it               |
   | Achievable | Can it be queried in <30s within the lookback window?                | Requires a full-table scan over years of data       |
   | Relevant   | Does it map to a `STRATEGY.md` Key metric or a documented user pain? | Vanity metric ("total signups ever")                |
   | Time-bound | Is the window declared (24h, 7d, 30d)?                               | Naked counter with no time scope                    |

   ### Pushback script

   When a proposed metric fails, the skill MUST:

   1. Quote the failing test and the rule.
   2. Suggest a concrete repair (example: "engagement" → "session_started events per active user per day").
   3. Ask the user to either accept the repair, propose a new name, or skip this metric (it lands in `pendingMetrics` if no source covers it).

   The skill MUST NOT silently accept a metric that fails the bar. Pushback is mandatory.

   ## READ-WRITE-DB Rejection Rule

   When the user offers a database connection string for the `db` source:

   1. The skill MUST inspect the connection string and reject any of the following without exception:
      - User has `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, or `GRANT` privileges
      - Connection string includes `?role=admin`, `?role=write`, `?ssl=disable` (the last is a separate red flag worth surfacing)
      - The connection user is named `root`, `admin`, `postgres`, `mysql`, or any name matching `*_admin`, `*_write`, `*_rw`
   2. The skill MUST NOT attempt to "downgrade" the credentials silently. It MUST ask the user to provide a read-only credential.
   3. If the user insists, the skill MUST refuse and write `sources.db.enabled: false`. Pulse is read-only by contract (Decision 6).
   4. The rejection message MUST cite "Decision 6 of the feedback-loops spec: pulse refuses read-write DB credentials".

   The skill cannot verify the privilege grant directly without connecting (and connecting is exactly what we're refusing for write creds). The signal-set above is heuristic; when in doubt, refuse and ask.

   ## Adapter availability check

   Before accepting a `sources.analytics` or `sources.tracing` value, the skill MUST verify a `SanitizeFn` adapter is registered for that name:

   ```ts
   import { getPulseAdapter } from '@harness-engineering/core';
   if (!getPulseAdapter(value)) {
     // refuse — Decision 7: pulse refuses to enable for a provider whose
     // adapter has no `sanitize` implementation.
   }
   ```
   ````

   In Phase 3 NO adapters are registered yet — Phase 4 ships them. So during the interview the skill warns:

   > "No `SanitizeFn` adapters are currently registered. Recording your selection but pulse will refuse to run until Phase 4 ships adapters for posthog/sentry."

   The selection is still written to `harness.config.json` (so re-running pulse later finds it); the runtime refusal is the safety gate.

   ## Strategy seeding

   If `STRATEGY.md` exists at repo root:
   - The product `name` is read from frontmatter (`name: '<X>'`); fallback to the first `# <Title>` H1.
   - The `## Key metrics` bullet list is treated as a list of REQUIRED metrics that the interview MUST walk through one-by-one.
   - Each Key metric goes through the SMART bar; the user may map it to an event/source, defer it to `pendingMetrics`, or explicitly exclude it (which lands it in `excludedMetrics`).

   If `STRATEGY.md` is absent, the skill proceeds with no seed and prompts the user from scratch.

   ## Interview output

   After the interview, the skill calls `writePulseConfig(config, { configPath })` from `@harness-engineering/core`:
   - The full config matches `PulseConfigSchema`.
   - All non-pulse keys in `harness.config.json` are preserved.
   - A `harness.config.json.bak` is written before mutation.

   Then the skill offers to register the `product-pulse` maintenance task (deferred — that wiring is Phase 6 of the spec; for now the skill notes the offer and explains the user can register it manually later).

   ```

   ```

2. Run: `harness validate`.
3. Commit: `docs(skill): pulse interview reference (SMART + read-write-DB)`.

---

### Task 8: Author `harness-pulse` SKILL.md and skill.yaml (claude-code, source of truth)

**Depends on:** Tasks 6, 7 | **Files:** `agents/skills/claude-code/harness-pulse/SKILL.md`, `agents/skills/claude-code/harness-pulse/skill.yaml`

1. Create `agents/skills/claude-code/harness-pulse/SKILL.md`:

   ````markdown
   # Harness Pulse

   > Single-page time-windowed product pulse. **Phase 3 ships the first-run interview only**: it converts vague intent into a concrete `pulse:` block in `harness.config.json`, refuses read-write DB credentials, and seeds from `STRATEGY.md` when present. The actual `harness pulse run` (Phases 2-4 of the runtime) is deferred to spec Phase 4.

   ## When to Use

   - Manually, when a project wants to start receiving daily pulse reports
   - When `harness.config.json` has no `pulse:` block and the user invokes `/harness:pulse`
   - NOT for ad-hoc one-off metric queries (that's the analytics tool's job)
   - NOT for replacing dashboards (pulse is a single-page summary, not a metrics platform)
   - NOT for projects that have not yet decided what their key metrics are (run `harness-strategy` first to write `STRATEGY.md`; pulse seeds from it)

   ## Process

   ### Iron Law

   **No PII reaches `harness.config.json` and no read-write DB credential is accepted.** Both are interview-time gates; both are hard refusals (no warnings, no overrides without an explicit user-typed escape).

   ---

   ### Phase 0: ROUTE BY CONFIG STATE

   1. Read `harness.config.json`.
   2. If `pulse.enabled` is set (true OR false), skip directly to "Phase 2: RUN" — **deferred to spec Phase 4**. For now, surface "pulse already configured; the run path ships in Phase 4" and stop.
   3. Otherwise enter Phase 1.

   ---

   ### Phase 1: FIRST-RUN INTERVIEW

   Read `references/interview.md` for the SMART pushback rules and the READ-WRITE-DB rejection rule. Both are mandatory.

   1. **Seed from STRATEGY.md.** Shell out to a Node one-liner that imports `seedFromStrategy` from `@harness-engineering/core`. Capture `{ name, keyMetrics, warnings }`.
      - Surface `warnings` to the user verbatim.
      - If `name` is non-null, confirm it as the product name; otherwise prompt.
      - For each `keyMetric`, walk it through the SMART bar in step 4.

   2. **Pick the lookback default.** Use `emit_interaction` (type: `question`) when in MCP mode; otherwise present numbered options in chat: `["24h", "7d", "30d", "custom"]`. Default `24h` per spec.

   3. **Identify the primary engagement event** (e.g. `session_started`). Apply the SMART bar. If the user can't name one, set `null` and add a pending entry. Record the event name in `primaryEvent`.

   4. **Identify the value-realization event** (e.g. `plan_completed`). SMART bar applies. Record in `valueEvent`.

   5. **Identify completion events** (zero or more). SMART bar per item. Record in `completionEvents`.

   6. **Quality scoring (optional).** Ask whether the user wants quality sampling on a single dimension (e.g. "did the plan deliver value"). Default off. If enabled, set `qualityScoring: true` and record `qualityDimension`.

   7. **Wire data sources.** Ask which providers are available:
      - `analytics`: posthog, amplitude, mixpanel, custom — or null
      - `tracing`: sentry, datadog, custom — or null
      - `payments`: stripe, custom — or null
      - `db`: opt-in only, with the **READ-WRITE-DB rejection rule** active
        For each non-null choice, check `getPulseAdapter(name)`. If absent, surface the "Phase 4 will ship the adapter" warning from `references/interview.md`.

   8. **Walk every STRATEGY.md key metric** through SMART. Map to an event when wired; otherwise append to `pendingMetrics` (or `excludedMetrics` if explicitly skipped). Cite `STRATEGY.md` when seeding so the user understands provenance.

   9. **Confirm the assembled config.** Show the user the proposed `pulse:` block; ask for confirmation.

   10. **Write the config.** Shell out to a Node one-liner that imports `writePulseConfig` from `@harness-engineering/core`:

       ```bash
       node -e "import('@harness-engineering/core').then(({ writePulseConfig }) => writePulseConfig(<json>, { configPath: 'harness.config.json' })).catch(err => { console.error(err.message); process.exit(1); })"
       ```

       The writer preserves all other config keys and writes a `.bak`.

   11. **Offer to register the `product-pulse` maintenance task.** Deferred: Phase 6 of the spec wires it. For now, surface "the daily 8am `product-pulse` task will be registered automatically once Phase 6 of the feedback-loops spec ships; you can also run pulse on demand with `/harness:pulse [window]` once Phase 4 ships."

   12. **Run `harness validate`** to confirm the new `pulse:` block parses.

   ---

   ### Phase 2: RUN — deferred to spec Phase 4

   Stub: when `pulse.enabled === true`, this phase will dispatch analytics/tracing/payments queries in parallel, run the SanitizeFn for each provider's response, and stash sanitized results for Phase 3. NOT YET IMPLEMENTED. The skill exits early with a "deferred to Phase 4" message if it reaches this phase.

   ### Phase 3: ASSEMBLE — deferred

   ### Phase 4: SAVE — deferred

   ## Harness Integration

   - **`harness validate`** — Run after `writePulseConfig`; the existing pulse-schema validator catches malformed blocks.
   - **`@harness-engineering/core`** primitives consumed by this skill:
     - `writePulseConfig(config, { configPath })` — atomic config update with .bak.
     - `seedFromStrategy({ cwd })` — defensive STRATEGY.md reader.
     - `getPulseAdapter(name)` / `listPulseAdapters()` — adapter discovery (Phase 4 populates).
     - `PulseConfigSchema` / `PII_FIELD_DENYLIST` — schema and PII contracts (already shipped Phase 1).
   - **Boundary with `harness-strategy`** — Strategy writes `STRATEGY.md`; pulse reads it to seed. Pulse never writes to `STRATEGY.md`.
   - **Boundary with `harness-observability`** — Observability designs _what_ to instrument; pulse is the read-side companion that surfaces what was instrumented.
   - **Decision 6 (read-only)** — Pulse refuses read-write DB credentials. Documented in `references/interview.md`.
   - **Decision 7 (PII contract)** — Every provider source must have a registered `SanitizeFn` adapter. Phase 3 ships the registry; Phase 4 ships the adapters.

   ## Success Criteria

   - On a project with no `pulse:` block, the interview produces a valid `pulse:` block in `harness.config.json` with all non-pulse keys preserved.
   - A `harness.config.json.bak` is written before mutation.
   - A read-write DB credential is refused; the interview either accepts a read-only credential or sets `sources.db.enabled: false`.
   - When `STRATEGY.md` exists, `name` and `Key metrics` seed the interview; missing/malformed STRATEGY.md soft-fails with warnings.
   - `harness validate` passes after the interview completes.

   ## Examples

   ### Example: greenfield (no STRATEGY.md, no existing pulse block)

   - Phase 0: route to Phase 1.
   - Phase 1.1: `seedFromStrategy` returns `{ name: null, keyMetrics: [], warnings: ['STRATEGY.md not found'] }`.
   - Phase 1.2-7: prompt user; collect `lookbackDefault: '24h'`, `primaryEvent: 'session_started'`, `valueEvent: 'plan_completed'`, `sources.analytics: 'posthog'` (with adapter-availability warning), `sources.db.enabled: false`.
   - Phase 1.10: `writePulseConfig` writes the block; `.bak` saved.
   - Phase 1.12: `harness validate` passes.

   ### Example: STRATEGY.md present with 3 Key metrics

   - Phase 1.1: seed returns `{ name: 'Acme', keyMetrics: ['DAU', 'plans/week', 'p95 latency'] }`.
   - Phase 1.8: walk each metric through SMART.
     - "DAU" → mapped to `session_started` count over 24h, accepted.
     - "plans/week" → mapped to `plan_completed` count over 7d, accepted (recorded as a future custom window).
     - "p95 latency" → no tracing source wired yet; lands in `pendingMetrics`.

   ### Example: user offers an admin DB credential

   - Phase 1.7: user pastes `postgresql://admin:pwd@host/db`.
   - Skill matches `admin` username against the rejection list; refuses; cites Decision 6.
   - User declines to provide a read-only credential; skill writes `sources.db.enabled: false`.

   ## Gates

   - **READ-WRITE-DB rejection is non-negotiable.** No flag, no override, no "I know what I'm doing" path. Refuse and document.
   - **SMART pushback is mandatory on every proposed metric/event.** Silently accepting a vague name pollutes the corpus.
   - **`writePulseConfig` is the only sanctioned write path.** Do not hand-edit `harness.config.json`. The writer is the layer that preserves non-pulse keys and writes the .bak.
   - **`harness validate` must pass before exit.** A malformed `pulse:` block silently breaks the daily task once Phase 4 ships.

   ## Escalation

   - **User insists on read-write DB credentials:** Refuse. Set `sources.db.enabled: false`. Stop.
   - **Adapter not registered for a chosen provider:** Warn, record the choice, continue. The runtime gate (Phase 4) refuses to run until the adapter ships.
   - **STRATEGY.md frontmatter is malformed but H1 is present:** Use H1 as `name` and surface a warning. If neither is parseable, prompt the user.
   - **`writePulseConfig` throws:** Report the validator error verbatim. Do not retry without user fix.
   ````

2. Create `agents/skills/claude-code/harness-pulse/skill.yaml`:

   ```yaml
   name: harness-pulse
   version: '0.1.0'
   description: First-run pulse interview. Converts intent into a validated pulse config with SMART pushback, read-write-DB rejection, STRATEGY.md seeding. Phase 3 ships the interview; the run path is deferred to Phase 4.
   stability: static
   cognitive_mode: configuration-interviewer
   triggers:
     - manual
   platforms:
     - claude-code
     - gemini-cli
     - cursor
     - codex
   tools:
     - Bash
     - Read
     - Write
     - Edit
     - Glob
     - Grep
   cli:
     command: harness skill run harness-pulse
     args:
       - name: window
         description: Lookback window for run mode (deferred until Phase 4); ignored during the interview
         required: false
   mcp:
     tool: run_skill
     input:
       skill: harness-pulse
       window: string
   type: rigid
   tier: 2
   phases:
     - name: route
       description: Route by harness.config.json pulse state
       required: true
     - name: interview
       description: SMART pushback + STRATEGY.md seeding + read-write-DB rejection; writes pulse block to harness.config.json
       required: true
     - name: run
       description: Deferred to spec Phase 4
       required: false
     - name: assemble
       description: Deferred to spec Phase 4
       required: false
     - name: save
       description: Deferred to spec Phase 4
       required: false
   state:
     persistent: true
     files:
       - harness.config.json
       - harness.config.json.bak
   depends_on:
     - harness-strategy
   keywords:
     - pulse
     - product-pulse
     - feedback-loops
     - read-side
     - smart-metrics
     - strategy-seeding
   ```

3. Run: `pnpm -F @harness-engineering/skills test -- structure` (or `cd agents/skills && pnpm test -- structure`) — required sections present.
4. Run: `pnpm -F @harness-engineering/skills test -- schema` (or `cd agents/skills && pnpm test -- schema`) — yaml validates.
5. Run: `harness validate`.
6. Commit: `feat(skill): add harness-pulse SKILL.md and skill.yaml (interview only)`.

---

### Task 9: Mirror SKILL.md, skill.yaml, and references/interview.md to gemini-cli, cursor, codex

**Depends on:** Task 8 | **Files:** `agents/skills/{gemini-cli,cursor,codex}/harness-pulse/`

1. Run from repo root:

   ```bash
   for p in gemini-cli cursor codex; do
     mkdir -p "agents/skills/$p/harness-pulse/references"
     cp "agents/skills/claude-code/harness-pulse/SKILL.md" "agents/skills/$p/harness-pulse/SKILL.md"
     cp "agents/skills/claude-code/harness-pulse/skill.yaml" "agents/skills/$p/harness-pulse/skill.yaml"
     cp "agents/skills/claude-code/harness-pulse/references/interview.md" "agents/skills/$p/harness-pulse/references/interview.md"
   done
   ```

2. Verify byte-identical:

   ```bash
   for p in gemini-cli cursor codex; do
     diff "agents/skills/claude-code/harness-pulse/SKILL.md" "agents/skills/$p/harness-pulse/SKILL.md" || echo "DIFF in SKILL.md $p"
     diff "agents/skills/claude-code/harness-pulse/skill.yaml" "agents/skills/$p/harness-pulse/skill.yaml" || echo "DIFF in skill.yaml $p"
     diff "agents/skills/claude-code/harness-pulse/references/interview.md" "agents/skills/$p/harness-pulse/references/interview.md" || echo "DIFF in interview.md $p"
   done
   ```

3. Run: `pnpm -F @harness-engineering/skills test -- platform-parity` — must pass.
4. Run: `harness validate`.
5. Commit: `feat(skill): mirror harness-pulse to gemini-cli, cursor, codex`.

---

### Task 10: [checkpoint:human-verify] Regenerate slash commands and verify `/harness:pulse` is discoverable

**Depends on:** Task 9 | **Files:** generated `harness/pulse.md` under `/tmp/sc-*/`

**Category:** integration

1. Run from repo root:

   ```bash
   pnpm -F @harness-engineering/cli build
   node packages/cli/dist/index.js generate-slash-commands --platform claude-code --output /tmp/sc-pulse-cc
   node packages/cli/dist/index.js generate-slash-commands --platform gemini-cli --output /tmp/sc-pulse-gem
   node packages/cli/dist/index.js generate-slash-commands --platform cursor --output /tmp/sc-pulse-cur
   node packages/cli/dist/index.js generate-slash-commands --platform codex --output /tmp/sc-pulse-cdx
   ```

2. Verify each output dir contains a `harness/pulse.md` file:

   ```bash
   for d in /tmp/sc-pulse-cc /tmp/sc-pulse-gem /tmp/sc-pulse-cur /tmp/sc-pulse-cdx; do
     ls -la "$d/harness/pulse.md" && echo "OK $d"
   done
   ```

3. **[checkpoint:human-verify]** Open `/tmp/sc-pulse-cc/harness/pulse.md` and confirm:
   - It references `harness-pulse` correctly.
   - The `[window]` argument hint matches the `skill.yaml` `cli.args` shape.
   - Tier-2 skills are surfaced.

4. Run: `harness validate`.
5. Commit (only if generated slash commands are tracked in this repo; currently they are not): skip.

---

### Task 11: [checkpoint:human-verify] Final validation pass — Phase 3 acceptance

**Depends on:** Task 10 | **Files:** none (read-only verification)

**Category:** integration

1. Run: `harness validate` — must pass.
2. Run: `harness check-deps` — must pass.
3. Run: `pnpm -F @harness-engineering/core test` — full suite green (existing + 13 new tests across config-writer, strategy-seeder, registry).
4. Run: `pnpm -F @harness-engineering/core typecheck` — zero errors.
5. Run: `pnpm -F @harness-engineering/cli typecheck` — zero errors.
6. Run from `agents/skills/`: `pnpm test` — platform-parity, structure, schema all green.
7. **[checkpoint:human-verify]** Verify `harness-pulse` appears in skill index:

   ```bash
   pnpm -F @harness-engineering/cli build
   node packages/cli/dist/index.js skill list 2>&1 | grep -i pulse
   node packages/cli/dist/index.js skill info harness-pulse 2>&1 | head -40
   ```

   Expected: skill name, version 0.1.0, 5 phases (route, interview, run, assemble, save) with run/assemble/save flagged `required: false`.

8. **[checkpoint:human-verify]** Confirm Phase 3 acceptance checklist:
   - [ ] SKILL.md, skill.yaml, references/interview.md exist for all 4 platforms (byte-identical).
   - [ ] `writePulseConfig` preserves non-pulse keys + writes .bak (5 tests).
   - [ ] `seedFromStrategy` soft-fails on absent/malformed STRATEGY.md (4 tests).
   - [ ] `registerPulseAdapter`/`getPulseAdapter` round-trip and reject duplicates (4 tests).
   - [ ] Slash command `/harness:pulse [window]` regenerates cleanly.
   - [ ] `harness validate` passes.
   - [ ] Phase 3 explicitly DOES NOT include `harness pulse run` CLI, PostHogAdapter/SentryAdapter implementations, maintenance-task registration, or roadmap-pilot integration. These are confirmed deferred to Phases 4, 6, 7.

9. Commit (only if anything changed): `chore(phase-3): final validation`.

---

## Integration Tasks Derived from Spec's Integration Points

The spec's `## Integration Points` section enumerates many integrations across all 8 phases. Phase 3 owns a small subset.

| Spec Integration Point                                           | Task in this plan                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| Entry Point: New slash command `/harness:pulse [window]`         | Task 10                                              |
| Registration: Skill barrel exports for `harness-pulse`           | Tasks 8, 9                                           |
| Registration: `pulse:` schema registered with `harness validate` | Already shipped Phase 1; confirmed by Task 11 step 1 |

**Explicitly deferred to later phases (NOT in this plan):**

- `harness pulse run` CLI subcommand (Phase 4)
- `harness pulse scan-candidates` CLI (separate; spec shows under compound)
- PostHogAdapter, SentryAdapter, StripeAdapter implementations (Phase 4)
- `BUILT_IN_TASKS` registry entries for `product-pulse` (Phase 6)
- Roadmap-pilot reading latest pulse report (Phase 7)
- AGENTS.md updates surfacing `docs/pulse-reports/` (Phase 8)
- ADR-2 (maintenance-task), ADR-3 (config-location) (Phase 8)
- harness-observability SKILL.md note about pulse (Phase 7/8)

---

## Risks Specific to Phase 3

- **`writePulseConfig` clobbers a manually-edited `pulse:` block.** Mitigation: `.bak` is always written before mutation; the writer documents this, and the SKILL.md confirms with the user before invoking it.
- **`seedFromStrategy` regex parser is brittle.** A `STRATEGY.md` with non-standard frontmatter or non-`##` heading levels will produce `name: null`. Mitigation: the seeder soft-fails (warnings, not throws) and the interview surfaces every warning to the user. If brittleness becomes a real problem, swap the regex for `gray-matter` (if already a workspace dep) without changing the public API.
- **The interview's chat-fallback path diverges from `emit_interaction` MCP path.** Mitigation: the SKILL.md cites both paths once per question category; the SMART rules in `references/interview.md` are tool-agnostic. Add an integration test in Phase 4 that exercises the chat-fallback transcript shape.
- **No adapter is registered in Phase 3, so the interview always warns "deferred to Phase 4".** Mitigation: this is intentional — the interview can run end-to-end and write a config; the runtime gate prevents accidental Phase-4-shaped breakage. The warning is documented in `references/interview.md`.
- **`harness.config.json.bak` accumulates across runs.** Mitigation: only the most recent backup exists (the writer overwrites). Document this clearly. If users want history they can use git.
- **Cross-spec drift: `harness-strategy` renames `Key metrics` → `Metrics`.** Already called out in the spec's risk list (Risk: Cross-spec schema drift). Mitigation: `seedFromStrategy` returns a warning when the section is missing; spec's longer-term mitigation is "config-drift warning surfaced in maintenance dashboard" which lands in Phase 6.

---

## Final Checks

- `harness validate` — Run before plan write (PASS at plan start) and as the last step of every task.
- `.harness/failures.md` — Does not exist in this repo; nothing to cross-reference.
- Soundness-review — Run `harness-soundness-review --mode plan` against this draft after writing it; iterate until convergence.
