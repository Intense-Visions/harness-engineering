# Plan: Freshness Checker (Phase 3)

**Date:** 2026-08-05 | **Spec:** `docs/changes/skill-provider-freshness/proposal.md` (Phase 3 + Technical Design §3 and §4) | **Tasks:** 5 | **Time:** ~28 min | **Integration Tier:** small

## Environment (executor MUST read first)

This repo requires **Node 22** — the system default (Node 26) breaks `better-sqlite3`'s native ABI and hangs the git hooks. Before running **any** `node` / `npx` / `vitest` / build / lint / commit command, first run:

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22
```

Work exclusively in the worktree at `/Users/cwarner/Projects/harness-engineering/.claude/worktrees/skill-provider-autoupdate`. Do **not** `cd` to the main repo. All paths below are relative to the worktree root.

**Test infra (already set up, but verify/recreate):** `packages/cli/node_modules` is a symlink to the parent repo's installed deps. If it is missing, recreate it before running tests:

```bash
ln -s /Users/cwarner/Projects/harness-engineering/packages/cli/node_modules \
  /Users/cwarner/Projects/harness-engineering/.claude/worktrees/skill-provider-autoupdate/packages/cli/node_modules
```

Run tests with (paths are relative to `packages/cli`):

```bash
npx vitest run --root packages/cli tests/registry/freshness-checker.test.ts tests/bin/freshness-check-hooks.test.ts
```

**Lint** only touched `src/` files (`eslint` config excludes `tests/**` from the tsconfig project):

```bash
cd packages/cli && npx eslint src/registry/freshness-checker.ts src/bin/freshness-check-hooks.ts src/bin/update-check-hooks.ts src/bin/harness.ts
```

**Commits:** hooks hang under any Node here — use `HUSKY=0 git commit`. Run tests + lint + `harness validate` manually before every commit (done in each task below). `timeout` is not available on this shell — do not wrap commands in it.

**Doc regen:** Phase 3 adds **no** new CLI command and **no** new flag (the `harness skill update` command is Phase 4). The background freshness check + notification line are internal wiring, not a command. No generated reference doc enumerates them (verified pattern: the existing `update-check` background spawn appears in no generated doc). **No `generate-docs` / `tsup` build is needed.**

## Goal

Add a CLI-located background freshness checker (`packages/cli/src/registry/freshness-checker.ts`) that, mirroring the structure of `packages/core/src/update-checker.ts`, detects when a GitHub- or npm-sourced skill provider has upstream changes and passively surfaces a one-line nudge — wired into `bin/harness.ts` alongside the CLI's own update check, sharing the same enable/interval gating, never blocking or breaking a normal CLI invocation.

## Scope (Phase 3 ONLY)

**In scope:** the new `freshness-checker.ts` (state IO + validation for `~/.harness/skill-freshness.json`; enable/interval gating reusing core's `isUpdateCheckEnabled`; a detached, `unref()`-ed background probe that runs `git ls-remote` / `npm view` per eligible entry and writes state atomically; `getFreshnessNotification()`); a `bin/freshness-check-hooks.ts` that mirrors `bin/update-check-hooks.ts` (resolves the global + project community lockfile paths, spawns the check, prints the notification); wiring both into `bin/harness.ts`; unit tests for comparison logic, notification formatting, defensive skipping, state read/write validation, and the hooks.

**Out of scope (later phases — do NOT touch):** the `harness skill update` command (`commands/skill/update.ts`) and its registration (Phase 4), the `harness update` `offerSkillProviderUpdates()` integration (Phase 4), and all docs/ADR (Phase 5). Do **not** implement any actual provider re-pull/update here — Phase 3 only _detects and nudges_.

## Observable Truths (Acceptance Criteria)

1. `freshness-checker.ts` exports `readFreshnessState(): FreshnessState | null` and `writeFreshnessState(state)` targeting `~/.harness/skill-freshness.json`; a round-trip preserves the state, and a missing/corrupt/mis-shaped file yields `null` (never throws).
2. **Unwanted:** If `HARNESS_NO_UPDATE_CHECK=1` (or the configured interval is `0`), then the system shall not run the background freshness check and shall not print a freshness notification (gating reused from core's `isUpdateCheckEnabled`).
3. **State-driven:** While the last check is younger than the interval, `shouldRunFreshnessCheck` shall return `false`; when state is `null` (never checked) or older than the interval it shall return `true`.
4. **Comparison — github:** `evaluateEntry` marks a `github` source `outdated` iff the upstream `latest` SHA differs from the recorded `source.commit` (moving `ref` `HEAD`/branch → tip may have moved → outdated; pinned tag → ls-remote returns the tag's stable SHA → not outdated).
5. **Comparison — npm:** `evaluateEntry` marks an `npm` source `outdated` iff the upstream `latest` version differs from the recorded entry `version`.
6. **Defensive skip:** `evaluateEntry` returns `null` (skips, never crashes) for an entry with **no** `source` (legacy v1) or an **unrecognized** `source.kind`, and for `kind: 'local'` (recorded, never probed).
7. `getFreshnessNotification()` returns `null` when 0 providers are outdated and `"N skill provider(s) have updates — run \`harness skill update\`"` (correctly pluralized) when ≥1 is outdated.
8. **Event-driven:** When invoked, `spawnBackgroundFreshnessCheck(lockfilePaths)` spawns a **detached**, `unref()`-ed child with `stdio: 'ignore'` and returns immediately; a `spawn()` throw is swallowed (parent never blocks or crashes).
9. **Wiring:** `bin/harness.ts` calls the freshness startup hook (resolving the global **and** project community `skills-lock.json` paths, filtered to those that exist) alongside `runUpdateCheckAtStartup()`, and appends `getFreshnessNotification()` to the existing notification surface under the same `argv[2] !== 'update'` guard; a normal invocation is not slowed or broken and all freshness errors are swallowed.
10. `harness validate` passes; `npx vitest run` for both new test files passes; `eslint` is clean on the touched `src` files.

## File Map

- CREATE `packages/cli/src/registry/freshness-checker.ts` (types; state IO+validation; `isFreshnessCheckEnabled` re-export; `shouldRunFreshnessCheck`; `evaluateEntry`; `getFreshnessNotification`; `spawnBackgroundFreshnessCheck`)
- CREATE `packages/cli/tests/registry/freshness-checker.test.ts` (state round-trip/validation, gating, comparison, defensive skip, notification formatting, spawn detached/unref/swallow)
- CREATE `packages/cli/src/bin/freshness-check-hooks.ts` (`runFreshnessCheckAtStartup`, `printFreshnessNotification`, lockfile-path resolution)
- CREATE `packages/cli/tests/bin/freshness-check-hooks.test.ts` (gating, path resolution + existence filter, spawn/notification delegation, error swallowing)
- MODIFY `packages/cli/src/bin/update-check-hooks.ts` (export `DEFAULT_INTERVAL_MS` and `readConfigInterval` for reuse — behavior unchanged)
- MODIFY `packages/cli/src/bin/harness.ts` (import + call the two freshness hooks)

## Skeleton

_Not produced — task count (5) is below the standard-mode skeleton threshold (8)._

## Verified Facts (evidence)

- `packages/core/src/update-checker.ts:20-46` — `getStatePath()` uses `process.env['HOME'] || os.homedir()` + `.harness/<file>.json`; `isUpdateCheckEnabled(configInterval?)` returns false on `HARNESS_NO_UPDATE_CHECK==='1'` or interval `0`; `shouldRunCheck(state, intervalMs)` returns true when `state === null` else `lastCheckTime + intervalMs <= Date.now()`.
- `packages/core/src/update-checker.ts:74-97` — `readCheckState` validates object-ness + field types and returns `null` on any failure (the pattern to mirror for `readFreshnessState`).
- `packages/core/src/update-checker.ts:111-151` — `spawnBackgroundCheck`: self-contained inline string program run via `spawn(process.execPath, ['-e', script], { detached: true, stdio: 'ignore' })` then `child.unref()`; atomic write = `mkdirSync(recursive)` → write `.<name>-<rand>.tmp` (mode `0o644`) → `renameSync` to final; whole spawn wrapped in `try/catch` that swallows.
- `packages/core/src/update-checker.ts:189-199` — `getUpdateNotification` reads state, bails to `null` when absent/no update, else returns a formatted string (pattern for `getFreshnessNotification`).
- `packages/core/src/index.ts:150-156` — core re-exports `isUpdateCheckEnabled`, `shouldRunCheck` (importable as `@harness-engineering/core`).
- `packages/cli/src/registry/lockfile.ts:4-17` — `SkillSource` union (`github` {owner,repo,ref,commit} | `npm` {package,registry?} | `local` {path}) and `LockfileEntry` with optional `source?`. **Phase 2 already shipped this** (commits `9a1e068cd`/`7e198b658`/`f7ad7467d`).
- `packages/cli/src/commands/install.ts:117-135` — GitHub clone URL is `https://github.com/${owner}/${repo}.git`; the recorded `source.commit` is `git rev-parse HEAD` in the clone (so `git ls-remote <url> <ref>` yields the comparable upstream SHA).
- `packages/cli/src/commands/install.ts:82-91` — `resolveCommunityBase(global)`: global → `resolveGlobalCommunityBaseDir()`; project → `path.dirname(resolveGlobalSkillsDir())` + `community`, both `+ '/skills-lock.json'`. Mirrored verbatim in `list.ts:58-62`.
- `packages/cli/src/utils/paths.ts:95-130` — `resolveGlobalSkillsDir()` (`.../agents/skills/claude-code`) and `resolveGlobalCommunityBaseDir()` (`~/.harness/skills/community`).
- `packages/cli/src/bin/update-check-hooks.ts:11,21-71,80-91` — `DEFAULT_INTERVAL_MS = 86_400_000`; `readConfigInterval()` (module-cached, reads `updateCheckInterval` from config, never throws); `runUpdateCheckAtStartup()` (gate → `readCheckState` → `shouldRunCheck` → `spawnBackgroundCheck`) and `printUpdateNotification()` (gate → `getUpdateNotification` → stderr), both fully `try/catch`-swallowed.
- `packages/cli/src/bin/harness.ts:4,15,37-39` — imports `{ runUpdateCheckAtStartup, printUpdateNotification }` from `./update-check-hooks`; calls the startup hook near the top of `main()`; prints the notification inside `if (process.argv[2] !== 'update') { … }` after `parseAsync`.
- `packages/core/tests/update-checker/update-checker.test.ts:12-27` — the `child_process.spawn` mock pattern (`vi.mock('child_process', importOriginal)` + a `mockSpawn` returning `{ unref }`) to reuse for the spawn test.
- `harness validate` and `harness check-deps` both pass on the current tree (Node 22).

## Uncertainties

- [ASSUMPTION] The child probe stores `outdated` in state (per the task's stated shape `{name,kind,current,latest,outdated}`), and `getFreshnessNotification` counts `providers.filter(p => p.outdated)`. The **same** comparison lives in the exported pure `evaluateEntry` (unit-tested); the detached string program inlines the identical trivial `!==` comparison because it must be self-contained (a `node -e` string cannot import project TS) — this deliberately mirrors how `update-checker.ts` inlines its write logic in the string while exposing tested pure helpers alongside. Documented in a code comment.
- [ASSUMPTION] `HARNESS_NO_UPDATE_CHECK` is intentionally the **shared** kill-switch for all background network probes (task: "honor `HARNESS_NO_UPDATE_CHECK=1`"), so freshness reuses core's `isUpdateCheckEnabled` rather than introducing a second env var. The interval concept is likewise shared (reuse `DEFAULT_INTERVAL_MS` + `readConfigInterval` from `update-check-hooks`).
- [ASSUMPTION] The child uses `execFileSync('git', [...])` / `execFileSync('npm', [...])` (argument-array form) rather than `execSync` with string interpolation — a deliberate hardening over update-checker's `execSync`, since `owner`/`repo`/`package`/`registry` come from a lockfile and must not be shell-interpolated.
- [DEFERRABLE] The nudge is currently gated by `argv[2] !== 'update'` (matching the update notification). Phase 4's `harness update` integration (D7) will surface freshness inside `update` itself, so suppressing the passive nudge on that subcommand now avoids a future double-surface.
- [DEFERRABLE] A per-provider `latest === null` (probe failed / empty `ls-remote`) is recorded as `outdated: false` (fail-safe: never nudge on a failed probe). Providers whose probe throws are simply omitted from `providers`.

## Tasks

### Task 1: Freshness state types, IO + validation, and gating helpers

**Depends on:** none | **Files:** `packages/cli/src/registry/freshness-checker.ts`, `packages/cli/tests/registry/freshness-checker.test.ts`

1. **Write tests first.** Create `packages/cli/tests/registry/freshness-checker.test.ts`. Redirect `HOME` to a temp dir so state IO hits a sandbox, and import the not-yet-written module:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as os from 'os';
   import * as path from 'path';
   import {
     readFreshnessState,
     writeFreshnessState,
     isFreshnessCheckEnabled,
     shouldRunFreshnessCheck,
     type FreshnessState,
   } from '../../src/registry/freshness-checker';

   describe('freshness state IO + gating', () => {
     const originalEnv = process.env;
     let tmpHome: string;

     beforeEach(() => {
       process.env = { ...originalEnv };
       tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-fresh-home-'));
       process.env['HOME'] = tmpHome;
       delete process.env['HARNESS_NO_UPDATE_CHECK'];
     });

     afterEach(() => {
       process.env = originalEnv;
       fs.rmSync(tmpHome, { recursive: true, force: true });
     });

     it('round-trips state through write then read', () => {
       const state: FreshnessState = {
         lastCheckTime: 123,
         providers: [{ name: 'a', kind: 'github', current: 'abc', latest: 'def', outdated: true }],
       };
       writeFreshnessState(state);
       expect(readFreshnessState()).toEqual(state);
     });

     it('returns null when the state file is missing', () => {
       expect(readFreshnessState()).toBeNull();
     });

     it('returns null when the state file is corrupt or mis-shaped', () => {
       const p = path.join(tmpHome, '.harness', 'skill-freshness.json');
       fs.mkdirSync(path.dirname(p), { recursive: true });
       fs.writeFileSync(p, 'not json');
       expect(readFreshnessState()).toBeNull();
       fs.writeFileSync(p, JSON.stringify({ lastCheckTime: 'nope', providers: [] }));
       expect(readFreshnessState()).toBeNull();
     });

     it('drops malformed provider entries but keeps valid ones', () => {
       const p = path.join(tmpHome, '.harness', 'skill-freshness.json');
       fs.mkdirSync(path.dirname(p), { recursive: true });
       fs.writeFileSync(
         p,
         JSON.stringify({
           lastCheckTime: 5,
           providers: [
             { name: 'ok', kind: 'npm', current: '1.0.0', latest: '1.1.0', outdated: true },
             { bogus: true },
           ],
         })
       );
       expect(readFreshnessState()).toEqual({
         lastCheckTime: 5,
         providers: [
           { name: 'ok', kind: 'npm', current: '1.0.0', latest: '1.1.0', outdated: true },
         ],
       });
     });

     it('isFreshnessCheckEnabled honors HARNESS_NO_UPDATE_CHECK and interval 0', () => {
       process.env['HARNESS_NO_UPDATE_CHECK'] = '1';
       expect(isFreshnessCheckEnabled()).toBe(false);
       delete process.env['HARNESS_NO_UPDATE_CHECK'];
       expect(isFreshnessCheckEnabled(0)).toBe(false);
       expect(isFreshnessCheckEnabled(86_400_000)).toBe(true);
     });

     it('shouldRunFreshnessCheck gates by interval', () => {
       expect(shouldRunFreshnessCheck(null, 1000)).toBe(true);
       expect(
         shouldRunFreshnessCheck({ lastCheckTime: Date.now(), providers: [] }, 1_000_000)
       ).toBe(false);
       expect(shouldRunFreshnessCheck({ lastCheckTime: 0, providers: [] }, 1000)).toBe(true);
     });
   });
   ```

2. **Run — observe failure** (module does not exist):

   ```bash
   npx vitest run --root packages/cli tests/registry/freshness-checker.test.ts
   ```

3. **Create implementation.** Create `packages/cli/src/registry/freshness-checker.ts` with exactly:

   ```ts
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import * as crypto from 'crypto';
   import { spawn } from 'child_process';
   import { isUpdateCheckEnabled } from '@harness-engineering/core';
   import type { SkillSource } from './lockfile';

   // ---------------------------------------------------------------------------
   // Types
   // ---------------------------------------------------------------------------

   export interface FreshnessProvider {
     name: string;
     kind: 'github' | 'npm';
     current: string;
     latest: string | null;
     outdated: boolean;
   }

   export interface FreshnessState {
     lastCheckTime: number;
     providers: FreshnessProvider[];
   }

   function getStatePath(): string {
     const home = process.env['HOME'] || os.homedir();
     return path.join(home, '.harness', 'skill-freshness.json');
   }

   // ---------------------------------------------------------------------------
   // Gating — reuse the CLI-version update-check switches so a single
   // HARNESS_NO_UPDATE_CHECK / interval controls all background network probes.
   // ---------------------------------------------------------------------------

   export const isFreshnessCheckEnabled = isUpdateCheckEnabled;

   /** Re-expresses core's shouldRunCheck for the freshness state shape. */
   export function shouldRunFreshnessCheck(
     state: FreshnessState | null,
     intervalMs: number
   ): boolean {
     if (state === null) return true;
     return state.lastCheckTime + intervalMs <= Date.now();
   }

   // ---------------------------------------------------------------------------
   // State IO + validation
   // ---------------------------------------------------------------------------

   function isValidProvider(p: unknown): p is FreshnessProvider {
     return (
       typeof p === 'object' &&
       p !== null &&
       typeof (p as FreshnessProvider).name === 'string' &&
       ((p as FreshnessProvider).kind === 'github' || (p as FreshnessProvider).kind === 'npm') &&
       typeof (p as FreshnessProvider).current === 'string' &&
       (typeof (p as FreshnessProvider).latest === 'string' ||
         (p as FreshnessProvider).latest === null) &&
       typeof (p as FreshnessProvider).outdated === 'boolean'
     );
   }

   /**
    * Reads ~/.harness/skill-freshness.json. Returns null if the file is missing,
    * unreadable, or mis-shaped. Malformed provider entries are dropped.
    */
   export function readFreshnessState(): FreshnessState | null {
     try {
       const raw = fs.readFileSync(getStatePath(), 'utf-8');
       const parsed: unknown = JSON.parse(raw);
       if (
         typeof parsed === 'object' &&
         parsed !== null &&
         'lastCheckTime' in parsed &&
         typeof (parsed as FreshnessState).lastCheckTime === 'number' &&
         'providers' in parsed &&
         Array.isArray((parsed as FreshnessState).providers)
       ) {
         return {
           lastCheckTime: (parsed as FreshnessState).lastCheckTime,
           providers: ((parsed as FreshnessState).providers as unknown[]).filter(isValidProvider),
         };
       }
       return null;
     } catch {
       return null;
     }
   }

   /** Atomically writes state (tmp-file + rename), mirroring update-checker. */
   export function writeFreshnessState(state: FreshnessState): void {
     const statePath = getStatePath();
     const stateDir = path.dirname(statePath);
     fs.mkdirSync(stateDir, { recursive: true });
     const tmpFile = path.join(
       stateDir,
       '.skill-freshness-' + crypto.randomBytes(4).toString('hex') + '.tmp'
     );
     fs.writeFileSync(tmpFile, JSON.stringify(state), { mode: 0o644 });
     fs.renameSync(tmpFile, statePath);
   }
   ```

   > Note: `spawn`, `crypto`, and `SkillSource` are imported now but used by Tasks 2–3; if lint flags unused imports at this checkpoint, add them in Task 2/3 instead. To keep each task green, you may temporarily add only `fs/path/os/crypto/isUpdateCheckEnabled` here and add `spawn` + `SkillSource` in the tasks that use them.

4. **Run — observe pass:** `npx vitest run --root packages/cli tests/registry/freshness-checker.test.ts`
5. **Lint:** `cd packages/cli && npx eslint src/registry/freshness-checker.ts`
6. **Run:** `harness validate`
7. **Commit:** `HUSKY=0 git commit -am "feat(cli): add freshness state IO and gating helpers"`

### Task 2: Comparison (`evaluateEntry`) + notification (`getFreshnessNotification`)

**Depends on:** Task 1 | **Files:** `packages/cli/src/registry/freshness-checker.ts`, `packages/cli/tests/registry/freshness-checker.test.ts`

1. **Add tests first** (append to the test file):

   ```ts
   import { evaluateEntry, getFreshnessNotification } from '../../src/registry/freshness-checker';
   import type { SkillSource } from '../../src/registry/lockfile';

   describe('evaluateEntry (comparison + defensive skip)', () => {
     const gh: SkillSource = { kind: 'github', owner: 'o', repo: 'r', ref: 'HEAD', commit: 'aaa' };
     const npm: SkillSource = { kind: 'npm', package: 'p' };

     it('github outdated when upstream SHA differs from recorded commit', () => {
       expect(evaluateEntry('s', gh, '1.0.0', 'bbb')?.outdated).toBe(true);
       expect(evaluateEntry('s', gh, '1.0.0', 'aaa')?.outdated).toBe(false);
     });

     it('npm outdated when upstream version differs from entry version', () => {
       expect(evaluateEntry('s', npm, '1.0.0', '1.1.0')?.outdated).toBe(true);
       expect(evaluateEntry('s', npm, '1.0.0', '1.0.0')?.outdated).toBe(false);
     });

     it('records current/latest/kind correctly per source', () => {
       expect(evaluateEntry('s', gh, '9.9.9', 'bbb')).toEqual({
         name: 's',
         kind: 'github',
         current: 'aaa',
         latest: 'bbb',
         outdated: true,
       });
       expect(evaluateEntry('s', npm, '1.0.0', '1.1.0')).toEqual({
         name: 's',
         kind: 'npm',
         current: '1.0.0',
         latest: '1.1.0',
         outdated: true,
       });
     });

     it('is fail-safe when latest is null (failed probe -> not outdated)', () => {
       expect(evaluateEntry('s', gh, '1.0.0', null)?.outdated).toBe(false);
       expect(evaluateEntry('s', npm, '1.0.0', null)?.outdated).toBe(false);
     });

     it('skips (returns null) for no source, local, or unknown kind', () => {
       expect(evaluateEntry('s', undefined, '1.0.0', 'x')).toBeNull();
       expect(evaluateEntry('s', { kind: 'local', path: '/p' }, '1.0.0', 'x')).toBeNull();
       // legacy / unrecognized kind at runtime must not crash
       expect(
         evaluateEntry('s', { kind: 'svn' } as unknown as SkillSource, '1.0.0', 'x')
       ).toBeNull();
     });
   });

   describe('getFreshnessNotification', () => {
     const originalEnv = process.env;
     let tmpHome: string;
     beforeEach(() => {
       process.env = { ...originalEnv };
       tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-fresh-note-'));
       process.env['HOME'] = tmpHome;
     });
     afterEach(() => {
       process.env = originalEnv;
       fs.rmSync(tmpHome, { recursive: true, force: true });
     });

     function write(providers: FreshnessProvider[]): void {
       const p = path.join(tmpHome, '.harness', 'skill-freshness.json');
       fs.mkdirSync(path.dirname(p), { recursive: true });
       fs.writeFileSync(p, JSON.stringify({ lastCheckTime: Date.now(), providers }));
     }

     it('returns null when there is no state', () => {
       expect(getFreshnessNotification()).toBeNull();
     });

     it('returns null when zero providers are outdated', () => {
       write([{ name: 'a', kind: 'npm', current: '1', latest: '1', outdated: false }]);
       expect(getFreshnessNotification()).toBeNull();
     });

     it('pluralizes correctly', () => {
       write([{ name: 'a', kind: 'npm', current: '1', latest: '2', outdated: true }]);
       expect(getFreshnessNotification()).toBe(
         '1 skill provider has updates — run `harness skill update`'
       );
       write([
         { name: 'a', kind: 'npm', current: '1', latest: '2', outdated: true },
         { name: 'b', kind: 'github', current: 'x', latest: 'y', outdated: true },
       ]);
       expect(getFreshnessNotification()).toBe(
         '2 skill providers have updates — run `harness skill update`'
       );
     });
   });
   ```

2. **Run — observe failure:** `npx vitest run --root packages/cli tests/registry/freshness-checker.test.ts`
3. **Implement.** Ensure `import type { SkillSource } from './lockfile';` is present, then append to `freshness-checker.ts`:

   ```ts
   // ---------------------------------------------------------------------------
   // Comparison — pure, unit-tested. The detached probe (spawnBackgroundFreshnessCheck)
   // inlines the identical trivial `!==` comparison because a `node -e` string cannot
   // import project TS; this mirrors how update-checker.ts inlines its write logic.
   // ---------------------------------------------------------------------------

   /**
    * Builds a provider record for a lockfile entry, or returns null to skip it.
    * Skips: no source (legacy v1), kind 'local' (recorded, never probed), and any
    * unrecognized kind (defensive against future/legacy lockfiles).
    * `latest === null` (failed probe) is fail-safe: outdated is false.
    */
   export function evaluateEntry(
     name: string,
     source: SkillSource | undefined,
     entryVersion: string,
     latest: string | null
   ): FreshnessProvider | null {
     if (!source) return null;
     if (source.kind === 'github') {
       return {
         name,
         kind: 'github',
         current: source.commit,
         latest,
         outdated: latest != null && latest !== source.commit,
       };
     }
     if (source.kind === 'npm') {
       return {
         name,
         kind: 'npm',
         current: entryVersion,
         latest,
         outdated: latest != null && latest !== entryVersion,
       };
     }
     return null; // local or unrecognized kind
   }

   // ---------------------------------------------------------------------------
   // Notification
   // ---------------------------------------------------------------------------

   /**
    * Returns a one-line nudge naming the count of outdated providers, or null
    * when the state is absent or nothing is outdated.
    */
   export function getFreshnessNotification(): string | null {
     const state = readFreshnessState();
     if (!state) return null;
     const n = state.providers.filter((p) => p.outdated).length;
     if (n === 0) return null;
     const noun = n === 1 ? 'provider' : 'providers';
     const verb = n === 1 ? 'has' : 'have';
     return `${n} skill ${noun} ${verb} updates — run \`harness skill update\``;
   }
   ```

4. **Run — observe pass:** `npx vitest run --root packages/cli tests/registry/freshness-checker.test.ts`
5. **Lint:** `cd packages/cli && npx eslint src/registry/freshness-checker.ts`
6. **Run:** `harness validate`
7. **Commit:** `HUSKY=0 git commit -am "feat(cli): add freshness comparison and notification"`

### Task 3: `spawnBackgroundFreshnessCheck` — detached, self-contained probe

**Depends on:** Task 2 | **Files:** `packages/cli/src/registry/freshness-checker.ts`, `packages/cli/tests/registry/freshness-checker.test.ts`

1. **Add tests first** (append). Mirror the update-checker spawn-mock pattern — mock `child_process.spawn` and assert the detached/`unref` contract and error swallowing (NO real spawn/network):

   ```ts
   // Add near the top of the file, before other imports of the module under test:
   import { vi } from 'vitest';
   const mockUnref = vi.fn();
   const mockSpawn = vi.fn().mockReturnValue({ unref: mockUnref, pid: 4321 });
   vi.mock('child_process', async (importOriginal) => {
     const actual = await importOriginal<typeof import('child_process')>();
     return { ...actual, spawn: (...args: unknown[]) => mockSpawn(...args) };
   });
   import { spawnBackgroundFreshnessCheck } from '../../src/registry/freshness-checker';

   describe('spawnBackgroundFreshnessCheck', () => {
     beforeEach(() => {
       mockSpawn.mockClear();
       mockUnref.mockClear();
       mockSpawn.mockReturnValue({ unref: mockUnref, pid: 4321 });
     });

     it('spawns a detached, unref-ed process with stdio ignored', () => {
       spawnBackgroundFreshnessCheck(['/some/skills-lock.json']);
       expect(mockSpawn).toHaveBeenCalledTimes(1);
       const [cmd, args, opts] = mockSpawn.mock.calls[0] as [
         string,
         string[],
         Record<string, unknown>,
       ];
       expect(cmd).toBe(process.execPath);
       expect(args[0]).toBe('-e');
       expect(typeof args[1]).toBe('string');
       expect(args[1]).toContain('/some/skills-lock.json'); // lockfile paths embedded
       expect(opts).toMatchObject({ detached: true, stdio: 'ignore' });
       expect(mockUnref).toHaveBeenCalledTimes(1);
     });

     it('swallows spawn() throwing', () => {
       mockSpawn.mockImplementationOnce(() => {
         throw new Error('ENOENT');
       });
       expect(() => spawnBackgroundFreshnessCheck(['/x'])).not.toThrow();
     });
   });
   ```

   > If `vi.mock('child_process', …)` at the top conflicts with the state-IO tests using real `fs`, keep the mock — it only replaces `spawn`, leaving `fs` untouched (the mock spreads `...actual`). Ensure the `import { vi }` line is merged into the existing top-of-file vitest import.

2. **Run — observe failure:** `npx vitest run --root packages/cli tests/registry/freshness-checker.test.ts`
3. **Implement.** Ensure `import { spawn } from 'child_process';` is present, then append to `freshness-checker.ts`:

   ```ts
   // ---------------------------------------------------------------------------
   // Background probe
   // ---------------------------------------------------------------------------

   /**
    * Spawns a detached, unref-ed Node process that reads the given lockfile(s)
    * and, per freshness-eligible entry:
    *   github -> `git ls-remote <https-url> <ref>`  (outdated = upstream SHA !== source.commit)
    *   npm    -> `npm view <pkg> version` (honoring source.registry) (outdated = latest !== version)
    * then writes ~/.harness/skill-freshness.json atomically (tmp-file + rename).
    *
    * The inline script is fully self-contained: it must handle every error
    * internally so the user never sees a failure. Uses execFileSync (argument
    * arrays) so lockfile-sourced owner/repo/package/registry strings are never
    * shell-interpolated. Skips entries with no source, kind 'local', or an
    * unrecognized kind. Matches the structure of core/update-checker.ts.
    */
   export function spawnBackgroundFreshnessCheck(lockfilePaths: string[]): void {
     const statePath = getStatePath();
     const stateDir = path.dirname(statePath);

     const script = `
   const { execFileSync } = require('child_process');
   const fs = require('fs');
   const path = require('path');
   const crypto = require('crypto');
   try {
     const lockfilePaths = ${JSON.stringify(lockfilePaths)};
     const statePath = ${JSON.stringify(statePath)};
     const stateDir = ${JSON.stringify(stateDir)};
     const providers = [];
     for (const lp of lockfilePaths) {
       let parsed;
       try { parsed = JSON.parse(fs.readFileSync(lp, 'utf-8')); } catch (_) { continue; }
       const skills = parsed && parsed.skills ? parsed.skills : {};
       for (const name of Object.keys(skills)) {
         const entry = skills[name];
         const source = entry && entry.source;
         if (!source || !source.kind) continue;
         try {
           if (source.kind === 'github') {
             const url = 'https://github.com/' + source.owner + '/' + source.repo + '.git';
             const ref = source.ref || 'HEAD';
             const out = execFileSync('git', ['ls-remote', url, ref], { encoding: 'utf-8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
             const sha = out ? out.split(/\\s+/)[0] : null;
             if (sha) providers.push({ name: name, kind: 'github', current: source.commit, latest: sha, outdated: sha !== source.commit });
           } else if (source.kind === 'npm') {
             const args = ['view', source.package, 'version'];
             if (source.registry) { args.push('--registry', source.registry); }
             const latest = execFileSync('npm', args, { encoding: 'utf-8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
             if (latest) providers.push({ name: name, kind: 'npm', current: entry.version, latest: latest, outdated: latest !== entry.version });
           }
           // local / unrecognized kinds are skipped
         } catch (_) { /* per-provider probe failure -> skip */ }
       }
     }
     fs.mkdirSync(stateDir, { recursive: true });
     const tmpFile = path.join(stateDir, '.skill-freshness-' + crypto.randomBytes(4).toString('hex') + '.tmp');
     fs.writeFileSync(tmpFile, JSON.stringify({ lastCheckTime: Date.now(), providers: providers }), { mode: 0o644 });
     fs.renameSync(tmpFile, statePath);
   } catch (_) {}
   `.trim();

     try {
       const child = spawn(process.execPath, ['-e', script], {
         detached: true,
         stdio: 'ignore',
       });
       child.unref();
     } catch {
       // spawn() itself can throw (e.g. ENOENT). Swallow silently.
     }
   }
   ```

4. **Run — observe pass:** `npx vitest run --root packages/cli tests/registry/freshness-checker.test.ts`
5. **Lint:** `cd packages/cli && npx eslint src/registry/freshness-checker.ts`
6. **Run:** `harness validate`
7. **Commit:** `HUSKY=0 git commit -am "feat(cli): add detached background freshness probe"`

### Task 4: Freshness startup/notification hooks (`bin/freshness-check-hooks.ts`)

**Depends on:** Task 3 | **Files:** `packages/cli/src/bin/update-check-hooks.ts`, `packages/cli/src/bin/freshness-check-hooks.ts`, `packages/cli/tests/bin/freshness-check-hooks.test.ts`

1. **Export the shared interval helpers.** In `packages/cli/src/bin/update-check-hooks.ts`, change the two declarations to named exports (behavior unchanged):
   - `const DEFAULT_INTERVAL_MS = 86_400_000;` → `export const DEFAULT_INTERVAL_MS = 86_400_000;`
   - `function readConfigInterval(): number | undefined {` → `export function readConfigInterval(): number | undefined {`

2. **Write tests first.** Create `packages/cli/tests/bin/freshness-check-hooks.test.ts`. Mock the freshness-checker module, the paths util, and `fs.existsSync`; assert gating, path resolution + existence filter, delegation, and error swallowing:

   ```ts
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

   const mockSpawn = vi.fn();
   const mockGetNotification = vi.fn();
   const mockEnabled = vi.fn();
   const mockShouldRun = vi.fn();
   const mockReadState = vi.fn();

   vi.mock('../../src/registry/freshness-checker', () => ({
     spawnBackgroundFreshnessCheck: (...a: unknown[]) => mockSpawn(...a),
     getFreshnessNotification: () => mockGetNotification(),
     isFreshnessCheckEnabled: (...a: unknown[]) => mockEnabled(...a),
     shouldRunFreshnessCheck: (...a: unknown[]) => mockShouldRun(...a),
     readFreshnessState: () => mockReadState(),
   }));
   vi.mock('../../src/bin/update-check-hooks', () => ({
     DEFAULT_INTERVAL_MS: 86_400_000,
     readConfigInterval: () => undefined,
   }));
   vi.mock('../../src/utils/paths', () => ({
     resolveGlobalSkillsDir: () => '/root/agents/skills/claude-code',
     resolveGlobalCommunityBaseDir: () => '/home/.harness/skills/community',
   }));

   import * as fs from 'fs';
   import {
     runFreshnessCheckAtStartup,
     printFreshnessNotification,
   } from '../../src/bin/freshness-check-hooks';

   describe('freshness-check-hooks', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       mockEnabled.mockReturnValue(true);
       mockShouldRun.mockReturnValue(true);
       mockReadState.mockReturnValue(null);
     });
     afterEach(() => vi.restoreAllMocks());

     it('spawns with existing lockfile paths only', () => {
       vi.spyOn(fs, 'existsSync').mockImplementation(
         (p) => String(p) === '/home/.harness/skills/community/skills-lock.json'
       );
       runFreshnessCheckAtStartup();
       expect(mockSpawn).toHaveBeenCalledTimes(1);
       expect(mockSpawn).toHaveBeenCalledWith(['/home/.harness/skills/community/skills-lock.json']);
     });

     it('does not spawn when no lockfile exists', () => {
       vi.spyOn(fs, 'existsSync').mockReturnValue(false);
       runFreshnessCheckAtStartup();
       expect(mockSpawn).not.toHaveBeenCalled();
     });

     it('does not spawn when disabled', () => {
       mockEnabled.mockReturnValue(false);
       vi.spyOn(fs, 'existsSync').mockReturnValue(true);
       runFreshnessCheckAtStartup();
       expect(mockSpawn).not.toHaveBeenCalled();
     });

     it('does not spawn when interval has not elapsed', () => {
       mockShouldRun.mockReturnValue(false);
       vi.spyOn(fs, 'existsSync').mockReturnValue(true);
       runFreshnessCheckAtStartup();
       expect(mockSpawn).not.toHaveBeenCalled();
     });

     it('swallows errors in startup', () => {
       vi.spyOn(fs, 'existsSync').mockImplementation(() => {
         throw new Error('boom');
       });
       expect(() => runFreshnessCheckAtStartup()).not.toThrow();
     });

     it('prints the notification to stderr when present', () => {
       mockGetNotification.mockReturnValue(
         '1 skill provider has updates — run `harness skill update`'
       );
       const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
       printFreshnessNotification();
       expect(write).toHaveBeenCalledWith(expect.stringContaining('has updates'));
     });

     it('prints nothing when disabled or no notification', () => {
       mockEnabled.mockReturnValue(false);
       const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
       printFreshnessNotification();
       expect(write).not.toHaveBeenCalled();
     });
   });
   ```

3. **Run — observe failure:** `npx vitest run --root packages/cli tests/bin/freshness-check-hooks.test.ts`
4. **Implement.** Create `packages/cli/src/bin/freshness-check-hooks.ts`:

   ```ts
   import * as fs from 'fs';
   import * as path from 'path';
   import {
     isFreshnessCheckEnabled,
     shouldRunFreshnessCheck,
     readFreshnessState,
     spawnBackgroundFreshnessCheck,
     getFreshnessNotification,
   } from '../registry/freshness-checker';
   import { DEFAULT_INTERVAL_MS, readConfigInterval } from './update-check-hooks';
   import { resolveGlobalSkillsDir, resolveGlobalCommunityBaseDir } from '../utils/paths';

   /**
    * Resolve the global + project community lockfile paths (mirrors
    * install.ts resolveCommunityBase for both scopes), filtered to those that
    * actually exist. An absent lockfile means nothing to probe for that scope.
    */
   function resolveCommunityLockfilePaths(): string[] {
     const globalPath = path.join(resolveGlobalCommunityBaseDir(), 'skills-lock.json');
     const projectCommunityBase = path.join(path.dirname(resolveGlobalSkillsDir()), 'community');
     const projectPath = path.join(projectCommunityBase, 'skills-lock.json');
     return [globalPath, projectPath].filter((p) => fs.existsSync(p));
   }

   /**
    * Called at CLI startup. Gated by the same enable/interval switches as the
    * version update check. Spawns the detached background freshness probe if the
    * cooldown has elapsed and at least one community lockfile exists.
    *
    * All errors are swallowed — this must never block or crash the CLI.
    */
   export function runFreshnessCheckAtStartup(): void {
     try {
       const configInterval = readConfigInterval();
       if (!isFreshnessCheckEnabled(configInterval)) return;
       const interval = configInterval ?? DEFAULT_INTERVAL_MS;
       if (!shouldRunFreshnessCheck(readFreshnessState(), interval)) return;
       const lockfilePaths = resolveCommunityLockfilePaths();
       if (lockfilePaths.length === 0) return;
       spawnBackgroundFreshnessCheck(lockfilePaths);
     } catch {
       // Silent — freshness checks must never interfere with CLI operation.
     }
   }

   /**
    * Called after parseAsync. Appends the freshness nudge to the notification
    * surface (stderr) if any provider is outdated. Errors swallowed.
    */
   export function printFreshnessNotification(): void {
     try {
       if (!isFreshnessCheckEnabled(readConfigInterval())) return;
       const message = getFreshnessNotification();
       if (message) {
         process.stderr.write(`\n${message}\n`);
       }
     } catch {
       // Silent — freshness checks must never interfere with CLI operation.
     }
   }
   ```

5. **Run — observe pass:** `npx vitest run --root packages/cli tests/bin/freshness-check-hooks.test.ts`
6. **Regression:** `npx vitest run --root packages/cli tests/bin/update-check-hooks.test.ts` (confirm the export change did not break existing update-check tests)
7. **Lint:** `cd packages/cli && npx eslint src/bin/freshness-check-hooks.ts src/bin/update-check-hooks.ts`
8. **Run:** `harness validate`
9. **Commit:** `HUSKY=0 git commit -am "feat(cli): add freshness startup and notification hooks"`

### Task 5: Wire freshness hooks into `bin/harness.ts`

**Depends on:** Task 4 | **Files:** `packages/cli/src/bin/harness.ts` | **Category:** integration

1. **Add the import** after the existing update-check-hooks import in `packages/cli/src/bin/harness.ts`:

   ```ts
   import { runUpdateCheckAtStartup, printUpdateNotification } from './update-check-hooks';
   import { runFreshnessCheckAtStartup, printFreshnessNotification } from './freshness-check-hooks';
   ```

2. **Spawn at startup** — add immediately after the existing `runUpdateCheckAtStartup();` call:

   ```ts
   // Fire-and-forget: spawn background version check if cooldown elapsed
   runUpdateCheckAtStartup();

   // Fire-and-forget: spawn background skill-provider freshness check
   runFreshnessCheckAtStartup();
   ```

3. **Append the notification** inside the existing `if (process.argv[2] !== 'update')` block so both nudges share the same guard (the `update` subcommand will surface freshness itself in Phase 4):

   ```ts
   if (process.argv[2] !== 'update') {
     printUpdateNotification();
     printFreshnessNotification();
   }
   ```

4. **Lint:** `cd packages/cli && npx eslint src/bin/harness.ts`
5. **Run:** `harness validate`
6. `[checkpoint:human-verify]` **Smoke test — the CLI must not slow or break.** Build the CLI and run a trivial command; confirm it exits promptly and errors nowhere:

   ```bash
   cd packages/cli && npx tsup >/dev/null 2>&1 && node dist/bin/harness.js --version
   HARNESS_NO_UPDATE_CHECK=1 node dist/bin/harness.js --version   # nudge suppressed
   ```

   Show the executor/human the output. Confirm: (a) `--version` prints and returns immediately (background spawn does not block), (b) no stack trace, (c) with `HARNESS_NO_UPDATE_CHECK=1` no freshness line appears. Wait for confirmation before committing.

7. **Commit:** `HUSKY=0 git commit -am "feat(cli): wire skill-provider freshness check into CLI startup"`

## Sequence & Parallelism

Strictly sequential: Task 1 → 2 → 3 all edit the same `freshness-checker.ts` (file-overlap edges); Task 4 depends on the exports from Tasks 1–3 plus the `update-check-hooks` export; Task 5 depends on Task 4's hooks module. No parallel waves.

## Validation Checklist (Phase 4 VALIDATE)

- [ ] Every observable truth (1–10) traces to a task: OT1→T1, OT2→T1/T4, OT3→T1, OT4/OT5/OT6→T2, OT7→T2, OT8→T3, OT9→T4/T5, OT10→all.
- [ ] Each task ≤3 files, ~2–5 min, TDD (test → fail → implement → pass).
- [ ] `harness validate` in every task; final green.
- [ ] No `harness skill update` command, no `harness update` integration, no docs — all deferred to Phases 4–5.
- [ ] `.harness/failures.md` checked for matching known-bad approaches (none expected for a new isolated module).

## Handoff

On completion, the next phase is **Phase 4 (Skill Update Command)**: `commands/skill/update.ts` (`[name] [--check] [--global] [--yes]`), its registration in `commands/skill/index.ts`, the shared `probeProviders`/`updateProviders` factoring, and the `harness update` `offerSkillProviderUpdates()` integration (D7). Phase 4 will consume `evaluateEntry` and the lockfile `source` provenance from this phase.
