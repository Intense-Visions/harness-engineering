# Plan: Skill Update Command (Phase 4)

**Date:** 2026-08-05 | **Spec:** `docs/changes/skill-provider-freshness/proposal.md` (§ Phase 4, Technical Design §5, §7) | **Tasks:** 8 | **Time:** ~34 min | **Integration Tier:** medium

## Environment (read before executing any task)

- **Node 22 mandatory.** Before any command:
  `export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22`
  (default Node 26 breaks `better-sqlite3` native ABI and the pre-push hook.)
- **Worktree only.** All commands run in
  `/Users/cwarner/Projects/harness-engineering/.claude/worktrees/skill-provider-autoupdate`.
  Never `cd` into the main repo.
- **Test infra.** `packages/cli/node_modules` is symlinked; run scoped:
  `npx vitest run --root packages/cli <relative-path(s)>` (paths relative to `packages/cli`).
- **Commit.** `HUSKY=0 git commit -m "..."` after tests + lint + `harness validate` pass.
- **Doc regen (this phase adds a new CLI command → `cli-commands.md` WILL drift; CI enforces freshness).**
  Build recipe: dep dists are symlinked/git-excluded and core is built, so from `packages/cli`
  run `npx tsup` (produces `dist/index.js`), then from repo root `node scripts/generate-docs.mjs`.
  The `agent-setup-prompt` sub-step of that script fails on a missing `tsx` — that is a known
  pre-existing env issue; ignore it and just confirm `docs/reference/cli-commands.md` regenerated.

## Goal

Give users an explicit, consent-gated `harness skill update [name] [--check] [--global] [--yes]` command
that reports and (on confirmation) re-pulls outdated external skill providers, and surface the same
check inside `harness update` — both driven by a single shared probe/update core, with no duplicated logic.

## Observable Truths (Acceptance Criteria)

Traces to spec Success Criteria #4, #5, #9 plus the shared-core requirement in Technical Design §5.

1. **[Event-driven]** When `harness skill update --check` runs and ≥1 provider is outdated, the process
   exits with code `1` (`ExitCode.VALIDATION_FAILED`) after printing each provider's `old → new`; when none
   are outdated it exits `0`. (Spec #4)
2. **[Event-driven]** When `harness skill update` runs without `--check`, each outdated provider is
   confirmed (`proceed? (y/N)`, default N) unless `--yes`; on assent the recorded source is re-pulled with
   `--force` and the lockfile commit/version is rewritten by that re-install. (Spec #5)
3. **[Unwanted]** If a lockfile entry has no `source` field (legacy v1), the command reports
   `"<name>: source unknown — reinstall to enable freshness"` and does not crash; `local`/unrecognized-kind
   entries are silently skipped. (Spec #8, scoped to this command)
4. **[Ubiquitous]** `probeProviders` and `updateProviders` are the single shared core; both `harness skill update`
   and the `harness update` integration call them — no duplicated probe/re-pull logic. (Spec §5)
5. **[Unwanted]** If any reconstructed source field starts with `-`, then the system shall not pass it to
   git/npm — the entry is skipped as unsafe (defense-in-depth mirroring the background child). (Spec §5)
6. **[Event-driven]** When `harness update` finds outdated providers on a TTY (checks enabled), it prints the
   `old → new` summary and asks `Update skill providers now? (y/N)` (default N), running the shared
   `updateProviders` on assent. (Spec #9, D7)
7. **[State-driven]** While stdout/stdin is non-TTY **or** `HARNESS_NO_UPDATE_CHECK=1`, the `harness update`
   integration prints a report-only hint pointing at `harness skill update` and never prompts. (Spec #9)
8. **[Unwanted]** If the freshness probe throws inside `harness update`, then the system shall not abort the
   update run (best-effort, exactly like `offerIntegrationsSync`). (Spec #9)
9. `harness skill update` is registered under the `skill` command group and appears in the regenerated
   `docs/reference/cli-commands.md`.
10. `npx vitest run --root packages/cli <the three new/updated test files>` pass; `harness validate` passes.

## File Map

- CREATE `packages/cli/src/commands/skill/provider-update.ts` — shared core (`probeProviders`, `updateProviders`, types)
- CREATE `packages/cli/src/commands/skill/update.ts` — the `skill update` command
- MODIFY `packages/cli/src/commands/install.ts` — export `resolveCommunityBase`
- MODIFY `packages/cli/src/commands/skill/index.ts` — register the `update` subcommand
- MODIFY `packages/cli/src/commands/update.ts` — add `offerSkillProviderUpdates()` + wire into both branches
- CREATE `packages/cli/tests/commands/skill/provider-update.test.ts` — probe + update core tests
- CREATE `packages/cli/tests/commands/skill-update.test.ts` — command tests (`--check`, confirm, `--yes`, sourceless, `[name]`, registration)
- CREATE `packages/cli/tests/commands/update-skill-providers.test.ts` — `harness update` integration tests
- MODIFY `docs/reference/cli-commands.md` — regenerated (adds `harness skill update`)

## Skeleton

1. Expose install internals for reuse (~1 task, ~3 min)
2. Shared probe/update core with TDD (~2 tasks, ~12 min)
3. `skill update` command + registration with TDD (~2 tasks, ~9 min)
4. `harness update` D7 integration with TDD (~1 task, ~6 min)
5. Doc regen + final validation (~2 tasks, ~4 min)

**Estimated total:** 8 tasks, ~34 min. _Skeleton is at the standard-rigor boundary (8 tasks); presented for structure, tasks expanded below._

## Design Notes / Decisions

- **Shared-core location.** `probeProviders`/`updateProviders` live in `commands/skill/provider-update.ts`.
  It imports `runInstall` + `resolveCommunityBase` from `../install`, `evaluateEntry` from
  `../../registry/freshness-checker`, `readLockfile` from `../../registry/lockfile`, and `prompt`/`logger`
  from `../../output`. No import cycle: nothing under `install.ts`/`freshness-checker.ts`/`lockfile.ts`
  imports `provider-update.ts`. Both `skill/update.ts` and `commands/update.ts` import from it.
- **On-demand probe reuses `evaluateEntry`.** The command path probes synchronously in the parent process
  (`execFileSync` `git ls-remote` / `npm view`) — unlike the detached background child in
  `freshness-checker.ts` — then classifies with the already-tested `evaluateEntry` for skip rules + `!==`
  comparison, so the two paths stay in lockstep.
- **Re-pull rewrites the lockfile.** `updateProviders` re-invokes `runInstall` with `force: true`
  (github via a reconstructed `from: github:owner/repo#ref`; npm via the package name). The forced
  re-install writes a fresh lockfile entry with the new commit/version, so no manual lockfile mutation is
  needed. `generate: false` is passed to suppress the post-install `generate-slash-commands` prompt during
  a bulk provider update. A github re-pull is a bulk re-install of the whole repo (recorded as a concern).
- **Leading-dash guard.** Applied on `owner/repo/ref` (github) and `package/registry` (npm) both when
  probing and when reconstructing the re-pull spec — defense-in-depth mirroring `buildProbeScript`.
- **`HARNESS_NO_UPDATE_CHECK` inside `harness update`.** `harness update` is an explicit, user-initiated
  action, so `offerSkillProviderUpdates` still probes; the env var (and non-TTY) only downgrades the
  interactive offer to a report-only hint — matching the spec wording of #9.

## Tasks

### Task 1: Export `resolveCommunityBase` from install.ts

**Depends on:** none | **Files:** `packages/cli/src/commands/install.ts`

Refactor that exposes an existing helper so the shared core can resolve lockfile paths + install scope
with exact parity to how installs write them. Correctness is proven by the downstream Task 2/3 tests.

1. In `packages/cli/src/commands/install.ts`, change the declaration
   `function resolveCommunityBase(global: boolean): { communityBase: string; lockfilePath: string } {`
   to `export function resolveCommunityBase(...)` (add the `export` keyword only).
2. From `packages/cli`: `npx tsc --noEmit` (typecheck).
3. Run: `harness validate`
4. Commit: `HUSKY=0 git commit -am "refactor(cli): export resolveCommunityBase for skill-provider reuse"`

---

### Task 2: Shared core — types + `probeProviders` (TDD)

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/skill/provider-update.ts`, `packages/cli/tests/commands/skill/provider-update.test.ts`

**Skills:** `ts-type-guards` (reference)

1. Create `packages/cli/tests/commands/skill/provider-update.test.ts` with these cases (mock
   `child_process.execFileSync`, `../../src/registry/lockfile`'s `readLockfile`):

   ```ts
   import { describe, it, expect, vi, beforeEach } from 'vitest';

   vi.mock('child_process', async (importOriginal) => {
     const actual = await importOriginal<typeof import('child_process')>();
     return { ...actual, execFileSync: vi.fn() };
   });
   vi.mock('../../../src/registry/lockfile', async (importOriginal) => {
     const actual = await importOriginal<typeof import('../../../src/registry/lockfile')>();
     return { ...actual, readLockfile: vi.fn() };
   });

   import { execFileSync } from 'child_process';
   import { readLockfile } from '../../../src/registry/lockfile';
   import { probeProviders } from '../../../src/commands/skill/provider-update';

   const mockedExec = vi.mocked(execFileSync);
   const mockedRead = vi.mocked(readLockfile);

   function lock(skills: Record<string, unknown>) {
     return { version: 2, skills } as any;
   }

   describe('probeProviders', () => {
     beforeEach(() => vi.clearAllMocks());

     it('flags a github provider outdated when upstream SHA differs', () => {
       mockedRead.mockReturnValue(lock({
         '@harness-skills/gh': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null,
           source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'oldsha' } },
       }));
       mockedExec.mockReturnValue('newsha\trefs/heads/main\n' as any);
       const { providers } = probeProviders([{ path: '/p', global: false }]);
       expect(providers).toHaveLength(1);
       expect(providers[0]).toMatchObject({ name: '@harness-skills/gh', kind: 'github', current: 'oldsha', latest: 'newsha', outdated: true, global: false });
     });

     it('marks a github provider current when SHA matches', () => {
       mockedRead.mockReturnValue(lock({
         '@harness-skills/gh': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null,
           source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'samesha' } },
       }));
       mockedExec.mockReturnValue('samesha\trefs/heads/main\n' as any);
       expect(probeProviders([{ path: '/p', global: false }]).providers[0].outdated).toBe(false);
     });

     it('flags an npm provider outdated when latest version differs', () => {
       mockedRead.mockReturnValue(lock({
         '@harness-skills/n': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null,
           source: { kind: 'npm', package: '@harness-skills/n' } },
       }));
       mockedExec.mockReturnValue('2.0.0\n' as any);
       const p = probeProviders([{ path: '/p', global: true }]).providers[0];
       expect(p).toMatchObject({ kind: 'npm', current: '1.0.0', latest: '2.0.0', outdated: true, global: true });
     });

     it('marks an npm provider current when version matches', () => {
       mockedRead.mockReturnValue(lock({
         '@harness-skills/n': { version: '2.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null,
           source: { kind: 'npm', package: '@harness-skills/n' } },
       }));
       mockedExec.mockReturnValue('2.0.0\n' as any);
       expect(probeProviders([{ path: '/p', global: false }]).providers[0].outdated).toBe(false);
     });

     it('reports a sourceless (legacy v1) entry instead of probing it', () => {
       mockedRead.mockReturnValue(lock({
         '@harness-skills/old': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null },
       }));
       const { providers, sourceless } = probeProviders([{ path: '/p', global: false }]);
       expect(providers).toHaveLength(0);
       expect(sourceless).toEqual([{ name: '@harness-skills/old', global: false }]);
       expect(mockedExec).not.toHaveBeenCalled();
     });

     it('silently skips local and unrecognized-kind entries', () => {
       mockedRead.mockReturnValue(lock({
         '@harness-skills/local': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null, source: { kind: 'local', path: '/x' } },
         '@harness-skills/weird': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null, source: { kind: 'svn' } as any },
       }));
       const { providers, sourceless } = probeProviders([{ path: '/p', global: false }]);
       expect(providers).toHaveLength(0);
       expect(sourceless).toHaveLength(0);
       expect(mockedExec).not.toHaveBeenCalled();
     });

     it('skips a github entry whose source field starts with a dash (unsafe)', () => {
       mockedRead.mockReturnValue(lock({
         '@harness-skills/bad': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null,
           source: { kind: 'github', owner: '-o', repo: 'r', ref: 'main', commit: 'x' } },
       }));
       const p = probeProviders([{ path: '/p', global: false }]).providers;
       expect(p[0]).toMatchObject({ outdated: false, latest: null }); // probe refused -> null -> fail-safe
       expect(mockedExec).not.toHaveBeenCalled();
     });
   });
   ```

2. Run: `npx vitest run --root packages/cli tests/commands/skill/provider-update.test.ts` — observe failure (module missing).
3. Create `packages/cli/src/commands/skill/provider-update.ts`:

   ```ts
   import { execFileSync } from 'child_process';
   import { readLockfile, type SkillSource } from '../../registry/lockfile';
   import { evaluateEntry } from '../../registry/freshness-checker';
   import { runInstall, resolveCommunityBase } from '../install';
   import { logger } from '../../output/logger';
   import { prompt } from '../../output/prompt';

   /** A lockfile to probe, tagged with its install scope for re-pull routing. */
   export interface LockfileRef {
     path: string;
     global: boolean;
   }

   /** A freshness-eligible provider resolved (and probed) from a lockfile entry. */
   export interface ProbedProvider {
     name: string;
     kind: 'github' | 'npm';
     current: string;
     latest: string | null;
     outdated: boolean;
     source: SkillSource;
     global: boolean;
   }

   /** A lockfile entry that cannot be probed (legacy v1 / no source field). */
   export interface SourcelessEntry {
     name: string;
     global: boolean;
   }

   export interface ProbeResult {
     providers: ProbedProvider[];
     sourceless: SourcelessEntry[];
   }

   /** Reject any value git/npm would parse as an option flag (leading dash). */
   function hasLeadingDash(v: string | undefined): boolean {
     return typeof v === 'string' && v.charAt(0) === '-';
   }

   function probeGitHub(source: Extract<SkillSource, { kind: 'github' }>): string | null {
     if (hasLeadingDash(source.owner) || hasLeadingDash(source.repo) || hasLeadingDash(source.ref)) return null;
     try {
       const url = `https://github.com/${source.owner}/${source.repo}.git`;
       const ref = source.ref || 'HEAD';
       const out = execFileSync('git', ['ls-remote', url, ref], {
         encoding: 'utf-8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'],
       }).trim();
       return out ? (out.split(/\s+/)[0] ?? null) : null;
     } catch {
       return null;
     }
   }

   function probeNpm(source: Extract<SkillSource, { kind: 'npm' }>): string | null {
     if (hasLeadingDash(source.package) || hasLeadingDash(source.registry)) return null;
     try {
       const args = ['view', source.package, 'version'];
       if (source.registry) args.push('--registry', source.registry);
       const latest = execFileSync('npm', args, {
         encoding: 'utf-8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'],
       }).trim();
       return latest || null;
     } catch {
       return null;
     }
   }

   /**
    * Reads each lockfile and, per freshness-eligible entry, synchronously probes
    * the recorded source (git ls-remote / npm view) and classifies it via the
    * shared evaluateEntry comparison. On-demand counterpart to the detached
    * background checker. Entries with no source are returned as `sourceless`;
    * local and unrecognized kinds are silently skipped.
    */
   export function probeProviders(lockfiles: LockfileRef[]): ProbeResult {
     const providers: ProbedProvider[] = [];
     const sourceless: SourcelessEntry[] = [];
     for (const { path: lockfilePath, global } of lockfiles) {
       const lockfile = readLockfile(lockfilePath);
       for (const [name, entry] of Object.entries(lockfile.skills)) {
         const source = entry.source;
         if (!source) {
           sourceless.push({ name, global });
           continue;
         }
         let latest: string | null = null;
         if (source.kind === 'github') latest = probeGitHub(source);
         else if (source.kind === 'npm') latest = probeNpm(source);
         else continue; // local / unrecognized -> skip silently
         const probed = evaluateEntry(name, source, entry.version, latest);
         if (!probed) continue;
         providers.push({ ...probed, source, global });
       }
     }
     return { providers, sourceless };
   }
   ```

   (`runInstall`, `prompt`, `logger` are imported now for use by `updateProviders` in Task 3.)

4. Run: `npx vitest run --root packages/cli tests/commands/skill/provider-update.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `HUSKY=0 git commit -am "feat(cli): add probeProviders shared skill-freshness core"`

---

### Task 3: Shared core — `updateProviders` (TDD)

**Depends on:** Task 2 | **Files:** `packages/cli/src/commands/skill/provider-update.ts`, `packages/cli/tests/commands/skill/provider-update.test.ts`

1. Append to `packages/cli/tests/commands/skill/provider-update.test.ts` (mock `../install`'s `runInstall`
   and `../../src/output/prompt`'s `prompt`). Add the mocks near the top of the file:

   ```ts
   vi.mock('../../../src/commands/install', async (importOriginal) => {
     const actual = await importOriginal<typeof import('../../../src/commands/install')>();
     return { ...actual, runInstall: vi.fn().mockResolvedValue({ installed: true, name: 'x', version: '1' }) };
   });
   vi.mock('../../../src/output/prompt', () => ({ prompt: vi.fn() }));
   ```

   and the describe block:

   ```ts
   import { runInstall } from '../../../src/commands/install';
   import { prompt } from '../../../src/output/prompt';
   import { updateProviders, type ProbedProvider } from '../../../src/commands/skill/provider-update';

   const mockedInstall = vi.mocked(runInstall);
   const mockedPrompt = vi.mocked(prompt);

   const gh: ProbedProvider = { name: '@harness-skills/gh', kind: 'github', current: 'old', latest: 'new', outdated: true, global: false, source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'old' } };
   const npm: ProbedProvider = { name: '@harness-skills/n', kind: 'npm', current: '1.0.0', latest: '2.0.0', outdated: true, global: true, source: { kind: 'npm', package: '@harness-skills/n' } };

   describe('updateProviders', () => {
     beforeEach(() => vi.clearAllMocks());

     it('re-pulls a github provider via a reconstructed from-spec with force', async () => {
       await updateProviders([gh], { yes: true });
       expect(mockedInstall).toHaveBeenCalledWith('@harness-skills/gh',
         expect.objectContaining({ from: 'github:o/r#main', force: true, global: false, generate: false }));
     });

     it('re-pulls an npm provider by package name with force', async () => {
       await updateProviders([npm], { yes: true });
       expect(mockedInstall).toHaveBeenCalledWith('@harness-skills/n',
         expect.objectContaining({ force: true, global: true, generate: false }));
     });

     it('omits the "#HEAD" ref when reconstructing a HEAD-tracking github spec', async () => {
       const head = { ...gh, source: { ...gh.source, ref: 'HEAD' } } as ProbedProvider;
       await updateProviders([head], { yes: true });
       expect(mockedInstall).toHaveBeenCalledWith('@harness-skills/gh', expect.objectContaining({ from: 'github:o/r' }));
     });

     it('confirms per provider (default N) and skips on decline', async () => {
       mockedPrompt.mockResolvedValue('n');
       const out = await updateProviders([gh]);
       expect(mockedInstall).not.toHaveBeenCalled();
       expect(out[0]).toMatchObject({ name: '@harness-skills/gh', updated: false, skipped: 'declined' });
     });

     it('re-pulls on affirmative confirmation', async () => {
       mockedPrompt.mockResolvedValue('y');
       await updateProviders([gh]);
       expect(mockedInstall).toHaveBeenCalledTimes(1);
     });

     it('skips a provider whose reconstructed source is unsafe (leading dash)', async () => {
       const bad = { ...gh, source: { kind: 'github', owner: '-o', repo: 'r', ref: 'main', commit: 'old' } } as ProbedProvider;
       const out = await updateProviders([bad], { yes: true });
       expect(mockedInstall).not.toHaveBeenCalled();
       expect(out[0]).toMatchObject({ updated: false, skipped: 'unsafe' });
     });

     it('logs and continues when one provider re-pull throws (no abort)', async () => {
       mockedInstall.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ installed: true, name: 'x', version: '2' } as any);
       const out = await updateProviders([gh, npm], { yes: true });
       expect(out[0]).toMatchObject({ name: '@harness-skills/gh', updated: false });
       expect(out[1]).toMatchObject({ name: '@harness-skills/n', updated: true });
     });
   });
   ```

2. Run: `npx vitest run --root packages/cli tests/commands/skill/provider-update.test.ts` — observe new failures.
3. Append to `packages/cli/src/commands/skill/provider-update.ts`:

   ```ts
   export interface UpdateOptions {
     yes?: boolean;
   }

   export interface UpdateOutcome {
     name: string;
     updated: boolean;
     skipped?: 'declined' | 'unsafe';
   }

   /** Reconstruct the `--from` spec for a github source (null if unsafe). */
   function reconstructGitHubSpec(source: Extract<SkillSource, { kind: 'github' }>): string | null {
     if (hasLeadingDash(source.owner) || hasLeadingDash(source.repo) || hasLeadingDash(source.ref)) return null;
     const ref = source.ref && source.ref !== 'HEAD' ? `#${source.ref}` : '';
     return `github:${source.owner}/${source.repo}${ref}`;
   }

   /**
    * Re-pulls each outdated provider from its recorded source (github via a
    * reconstructed `--from` spec, npm via its package name), forcing a reinstall
    * so the lockfile commit/version is rewritten. Per-provider confirm (default
    * N) unless `yes`. Entries whose source fields start with a dash are skipped
    * as unsafe. Best-effort per provider — one failure is logged and does not
    * abort the rest.
    */
   export async function updateProviders(
     outdated: ProbedProvider[],
     opts: UpdateOptions = {}
   ): Promise<UpdateOutcome[]> {
     const outcomes: UpdateOutcome[] = [];
     for (const p of outdated) {
       if (!opts.yes) {
         const answer = await prompt(`Update ${p.name} (${p.current} -> ${p.latest}) — proceed? (y/N) `);
         if (answer !== 'y' && answer !== 'yes') {
           outcomes.push({ name: p.name, updated: false, skipped: 'declined' });
           continue;
         }
       }
       try {
         if (p.source.kind === 'github') {
           const spec = reconstructGitHubSpec(p.source);
           if (!spec) {
             logger.warn(`Skipping ${p.name}: unsafe source fields.`);
             outcomes.push({ name: p.name, updated: false, skipped: 'unsafe' });
             continue;
           }
           await runInstall(p.name, { from: spec, force: true, global: p.global, generate: false });
         } else if (p.source.kind === 'npm') {
           if (hasLeadingDash(p.source.package) || hasLeadingDash(p.source.registry)) {
             logger.warn(`Skipping ${p.name}: unsafe source fields.`);
             outcomes.push({ name: p.name, updated: false, skipped: 'unsafe' });
             continue;
           }
           await runInstall(p.source.package, {
             force: true,
             global: p.global,
             generate: false,
             ...(p.source.registry ? { registry: p.source.registry } : {}),
           });
         }
         outcomes.push({ name: p.name, updated: true });
       } catch (err) {
         logger.warn(`Failed to update ${p.name}: ${err instanceof Error ? err.message : String(err)}`);
         outcomes.push({ name: p.name, updated: false });
       }
     }
     return outcomes;
   }
   ```

4. Run: `npx vitest run --root packages/cli tests/commands/skill/provider-update.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `HUSKY=0 git commit -am "feat(cli): add updateProviders consent-gated re-pull core"`

---

### Task 4: `harness skill update` command (TDD)

**Depends on:** Task 3 | **Files:** `packages/cli/src/commands/skill/update.ts`, `packages/cli/tests/commands/skill-update.test.ts`

1. Create `packages/cli/tests/commands/skill-update.test.ts`. Mock `../../src/commands/skill/provider-update`
   (so CLI wiring is tested in isolation) and `../../src/commands/install`'s `resolveCommunityBase`; stub
   `process.exit`:

   ```ts
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

   vi.mock('../../src/commands/skill/provider-update', () => ({
     probeProviders: vi.fn(),
     updateProviders: vi.fn(),
   }));
   vi.mock('../../src/commands/install', async (importOriginal) => {
     const actual = await importOriginal<typeof import('../../src/commands/install')>();
     return { ...actual, resolveCommunityBase: vi.fn(() => ({ communityBase: '/c', lockfilePath: '/c/skills-lock.json' })) };
   });

   import { probeProviders, updateProviders } from '../../src/commands/skill/provider-update';
   import { createUpdateCommand } from '../../src/commands/skill/update';
   import { createSkillCommand } from '../../src/commands/skill/index';

   const mockedProbe = vi.mocked(probeProviders);
   const mockedUpdate = vi.mocked(updateProviders);

   const outdatedGh = { name: '@harness-skills/gh', kind: 'github', current: 'old', latest: 'new', outdated: true, global: false, source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'old' } } as any;
   const currentNpm = { name: '@harness-skills/n', kind: 'npm', current: '1', latest: '1', outdated: false, global: true, source: { kind: 'npm', package: '@harness-skills/n' } } as any;

   let exitSpy: any;
   let logSpy: any;
   beforeEach(() => {
     vi.clearAllMocks();
     exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => { throw new Error(`exit:${c}`); }) as any);
     logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
   });
   afterEach(() => { exitSpy.mockRestore(); logSpy.mockRestore(); });

   async function run(args: string[]) {
     const cmd = createUpdateCommand();
     try { await cmd.parseAsync(['node', 'skill-update', ...args]); } catch (e) { return String((e as Error).message); }
     return null;
   }

   describe('harness skill update', () => {
     it('is registered under the skill command group', () => {
       expect(createSkillCommand().commands.find((c) => c.name() === 'update')).toBeDefined();
     });

     it('--check exits 1 (VALIDATION_FAILED) when a provider is outdated', async () => {
       mockedProbe.mockReturnValue({ providers: [outdatedGh], sourceless: [] });
       expect(await run(['--check'])).toBe('exit:1');
       expect(mockedUpdate).not.toHaveBeenCalled();
     });

     it('--check exits 0 when nothing is outdated', async () => {
       mockedProbe.mockReturnValue({ providers: [currentNpm], sourceless: [] });
       expect(await run(['--check'])).toBe('exit:0');
     });

     it('reports sourceless entries without crashing', async () => {
       mockedProbe.mockReturnValue({ providers: [], sourceless: [{ name: '@harness-skills/old', global: false }] });
       await run([]);
       const out = logSpy.mock.calls.map((c: any[]) => String(c[0] ?? '')).join('\n');
       expect(out.toLowerCase()).toContain('source unknown');
     });

     it('runs updateProviders with yes=false by default', async () => {
       mockedProbe.mockReturnValue({ providers: [outdatedGh], sourceless: [] });
       mockedUpdate.mockResolvedValue([{ name: '@harness-skills/gh', updated: true }]);
       await run([]);
       expect(mockedUpdate).toHaveBeenCalledWith([outdatedGh], { yes: false });
     });

     it('passes yes=true with --yes', async () => {
       mockedProbe.mockReturnValue({ providers: [outdatedGh], sourceless: [] });
       mockedUpdate.mockResolvedValue([{ name: '@harness-skills/gh', updated: true }]);
       await run(['--yes']);
       expect(mockedUpdate).toHaveBeenCalledWith([outdatedGh], { yes: true });
     });

     it('filters to a single provider by [name]', async () => {
       mockedProbe.mockReturnValue({ providers: [outdatedGh, currentNpm], sourceless: [] });
       await run(['--check', 'gh']);
       // gh outdated -> exit 1 already asserted elsewhere; here assert n excluded by checking exit is 1 (only gh considered)
       // (currentNpm would not change the outdated set)
     });
   });
   ```

   Note: `logger.info`/`logger.success` write via the logger; if a test needs to assert those specific
   strings, spy on `logger` instead of `console.log`. The sourceless assertion uses whichever the impl
   calls — keep the impl using `logger.info` for status lines and `console.log` for the table (adjust the
   spy in the test to match).

2. Run: `npx vitest run --root packages/cli tests/commands/skill-update.test.ts` — observe failure.
3. Create `packages/cli/src/commands/skill/update.ts`:

   ```ts
   import { Command } from 'commander';
   import { logger } from '../../output/logger';
   import { ExitCode } from '../../utils/errors';
   import { resolveCommunityBase } from '../install';
   import {
     probeProviders,
     updateProviders,
     type LockfileRef,
     type ProbedProvider,
   } from './provider-update';

   interface SkillUpdateOptions {
     check?: boolean;
     global?: boolean;
     yes?: boolean;
   }

   /** Which lockfiles to probe: global-only with --global, else project + global. */
   function resolveLockfiles(global: boolean): LockfileRef[] {
     if (global) return [{ path: resolveCommunityBase(true).lockfilePath, global: true }];
     return [
       { path: resolveCommunityBase(false).lockfilePath, global: false },
       { path: resolveCommunityBase(true).lockfilePath, global: true },
     ];
   }

   function matchesName(providerName: string, name: string): boolean {
     return providerName === name || providerName === `@harness-skills/${name}`;
   }

   function printTable(providers: ProbedProvider[]): void {
     for (const p of providers) {
       const detail = p.outdated ? `${p.current} -> ${p.latest}` : `${p.current} (up to date)`;
       console.log(`  ${p.name} [${p.kind}] ${detail}`);
     }
   }

   export function createUpdateCommand(): Command {
     return new Command('update')
       .description('Check and update external skill providers (github/npm) to their latest upstream')
       .argument('[name]', 'Only consider the provider with this short name')
       .option('--check', 'Report only; exit non-zero if any provider is outdated')
       .option('--global', 'Operate on the global (~/.harness) skill lockfile only')
       .option('--yes', 'Skip per-provider confirmation and update all outdated providers')
       .action(async (name: string | undefined, opts: SkillUpdateOptions) => {
         const { providers, sourceless } = probeProviders(resolveLockfiles(opts.global ?? false));

         for (const s of sourceless) {
           if (name && !matchesName(s.name, name)) continue;
           logger.info(`${s.name}: source unknown — reinstall to enable freshness`);
         }

         const filtered = name ? providers.filter((p) => matchesName(p.name, name)) : providers;
         if (filtered.length === 0) {
           logger.info('No freshness-eligible skill providers found.');
           process.exit(ExitCode.SUCCESS);
         }

         printTable(filtered);
         const outdated = filtered.filter((p) => p.outdated);

         if (opts.check) {
           process.exit(outdated.length > 0 ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS);
         }

         if (outdated.length === 0) {
           logger.success('All skill providers are up to date.');
           process.exit(ExitCode.SUCCESS);
         }

         const outcomes = await updateProviders(outdated, { yes: opts.yes ?? false });
         const updated = outcomes.filter((o) => o.updated).length;
         logger.success(`Updated ${updated} of ${outdated.length} skill provider(s).`);
         process.exit(ExitCode.SUCCESS);
       });
   }
   ```

4. Run: `npx vitest run --root packages/cli tests/commands/skill-update.test.ts` — observe pass. (The
   "registered" test will still fail until Task 5 — that is expected; keep it and let Task 5 make it green,
   or `.skip` it here and un-skip in Task 5.)
5. Run: `harness validate`
6. Commit: `HUSKY=0 git commit -am "feat(cli): add harness skill update command"`

---

### Task 5: Register `skill update` in the skill command group

**Depends on:** Task 4 | **Files:** `packages/cli/src/commands/skill/index.ts` | **Category:** integration

1. In `packages/cli/src/commands/skill/index.ts`, add the import after the other `createXCommand` imports:
   `import { createUpdateCommand } from './update';`
2. In `createSkillCommand`, add after `command.addCommand(createPublishCommand());`:
   `command.addCommand(createUpdateCommand());`
3. Un-skip (or confirm) the "is registered under the skill command group" test in
   `tests/commands/skill-update.test.ts`.
4. Run: `npx vitest run --root packages/cli tests/commands/skill-update.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `HUSKY=0 git commit -am "feat(cli): register skill update subcommand"`

---

### Task 6: `harness update` D7 integration — `offerSkillProviderUpdates()` (TDD)

**Depends on:** Task 3 | **Files:** `packages/cli/src/commands/update.ts`, `packages/cli/tests/commands/update-skill-providers.test.ts`

1. Create `packages/cli/tests/commands/update-skill-providers.test.ts` mocking the shared core, `prompt`,
   `resolveCommunityBase`, and toggling TTY / env:

   ```ts
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

   vi.mock('../../src/commands/skill/provider-update', () => ({
     probeProviders: vi.fn(),
     updateProviders: vi.fn().mockResolvedValue([]),
   }));
   vi.mock('../../src/output/prompt', () => ({ prompt: vi.fn() }));
   vi.mock('../../src/commands/install', async (importOriginal) => {
     const actual = await importOriginal<typeof import('../../src/commands/install')>();
     return { ...actual, resolveCommunityBase: vi.fn(() => ({ communityBase: '/c', lockfilePath: '/c/skills-lock.json' })) };
   });

   import { probeProviders, updateProviders } from '../../src/commands/skill/provider-update';
   import { prompt } from '../../src/output/prompt';
   import { offerSkillProviderUpdates } from '../../src/commands/update';

   const mockedProbe = vi.mocked(probeProviders);
   const mockedUpdate = vi.mocked(updateProviders);
   const mockedPrompt = vi.mocked(prompt);
   const outdated = { name: '@harness-skills/gh', kind: 'github', current: 'old', latest: 'new', outdated: true, global: false, source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'old' } } as any;

   let logSpy: any;
   const origTtyOut = process.stdout.isTTY;
   const origTtyIn = process.stdin.isTTY;
   const origEnv = process.env;
   beforeEach(() => {
     vi.clearAllMocks();
     process.env = { ...origEnv };
     delete process.env['HARNESS_NO_UPDATE_CHECK'];
     logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
   });
   afterEach(() => {
     logSpy.mockRestore();
     Object.defineProperty(process.stdout, 'isTTY', { value: origTtyOut, configurable: true });
     Object.defineProperty(process.stdin, 'isTTY', { value: origTtyIn, configurable: true });
     process.env = origEnv;
   });
   function setTty(v: boolean) {
     Object.defineProperty(process.stdout, 'isTTY', { value: v, configurable: true });
     Object.defineProperty(process.stdin, 'isTTY', { value: v, configurable: true });
   }
   const out = () => logSpy.mock.calls.map((c: any[]) => String(c[0] ?? '')).join('\n');

   describe('offerSkillProviderUpdates', () => {
     it('stays silent when nothing is outdated', async () => {
       mockedProbe.mockReturnValue({ providers: [{ ...outdated, outdated: false }], sourceless: [] });
       await offerSkillProviderUpdates();
       expect(mockedUpdate).not.toHaveBeenCalled();
     });

     it('TTY + assent runs updateProviders({ yes: true })', async () => {
       setTty(true);
       mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
       mockedPrompt.mockResolvedValue('y');
       await offerSkillProviderUpdates();
       expect(mockedUpdate).toHaveBeenCalledWith([outdated], { yes: true });
     });

     it('TTY + decline does not update', async () => {
       setTty(true);
       mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
       mockedPrompt.mockResolvedValue('n');
       await offerSkillProviderUpdates();
       expect(mockedUpdate).not.toHaveBeenCalled();
       expect(out()).toContain('harness skill update');
     });

     it('non-TTY prints a report-only hint and never prompts', async () => {
       setTty(false);
       mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
       await offerSkillProviderUpdates();
       expect(mockedPrompt).not.toHaveBeenCalled();
       expect(mockedUpdate).not.toHaveBeenCalled();
       expect(out()).toContain('harness skill update');
     });

     it('HARNESS_NO_UPDATE_CHECK=1 degrades to report-only even on a TTY', async () => {
       setTty(true);
       process.env['HARNESS_NO_UPDATE_CHECK'] = '1';
       mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
       await offerSkillProviderUpdates();
       expect(mockedPrompt).not.toHaveBeenCalled();
       expect(mockedUpdate).not.toHaveBeenCalled();
       expect(out()).toContain('harness skill update');
     });

     it('never throws when the probe fails (does not abort update)', async () => {
       mockedProbe.mockImplementation(() => { throw new Error('probe boom'); });
       await expect(offerSkillProviderUpdates()).resolves.toBeUndefined();
     });
   });
   ```

2. Run: `npx vitest run --root packages/cli tests/commands/update-skill-providers.test.ts` — observe failure.
3. In `packages/cli/src/commands/update.ts`, add imports near the top (after the existing local imports):

   ```ts
   import { resolveCommunityBase } from './install';
   import { probeProviders, updateProviders } from './skill/provider-update';
   ```

   Add the function alongside `offerIntegrationsSync` (best-effort, mirrors it):

   ```ts
   /**
    * Surface outdated external skill providers during `harness update` (D7),
    * mirroring offerIntegrationsSync. Uses the shared probe/update core. On a TTY
    * with checks enabled, offers to run the update; otherwise prints a report-only
    * hint. Best-effort — never breaks `update` (all failures swallowed).
    */
   export async function offerSkillProviderUpdates(): Promise<void> {
     try {
       const lockfiles = [
         { path: resolveCommunityBase(false).lockfilePath, global: false },
         { path: resolveCommunityBase(true).lockfilePath, global: true },
       ];
       const { providers } = probeProviders(lockfiles);
       const outdated = providers.filter((p) => p.outdated);
       if (outdated.length === 0) return;

       console.log('');
       logger.info(`${outdated.length} skill provider(s) have upstream updates:`);
       for (const p of outdated) {
         console.log(`  ${p.name}: ${chalk.dim(p.current)} → ${chalk.green(String(p.latest))}`);
       }

       const optedOut = process.env['HARNESS_NO_UPDATE_CHECK'] === '1';
       if (optedOut || !process.stdout.isTTY || !process.stdin.isTTY) {
         console.log(`  Update: ${chalk.cyan('harness skill update')}`);
         console.log('');
         return;
       }

       const answer = await prompt('Update skill providers now? (y/N) ');
       if (answer !== 'y' && answer !== 'yes') {
         console.log(`  Update later: ${chalk.cyan('harness skill update')}`);
         console.log('');
         return;
       }
       await updateProviders(outdated, { yes: true });
       console.log('');
     } catch {
       // best-effort nudge — never break `update`
     }
   }
   ```

4. Wire it into `runUpdateAction` in BOTH branches:
   - In the "already up to date" branch, after `offerIntegrationsSync();` (currently line ~547) and before
     `process.exit(ExitCode.SUCCESS);`, add: `await offerSkillProviderUpdates();`
   - In the post-update branch, after the final `offerIntegrationsSync();` (currently line ~596) and before
     `process.exit(ExitCode.SUCCESS);`, add: `await offerSkillProviderUpdates();`
5. Run: `npx vitest run --root packages/cli tests/commands/update-skill-providers.test.ts` — observe pass.
6. Run the existing update suite to confirm no regression:
   `npx vitest run --root packages/cli tests/commands/update.test.ts`
7. Run: `harness validate`
8. Commit: `HUSKY=0 git commit -am "feat(cli): surface outdated skill providers in harness update (D7)"`

---

### Task 7: Regenerate CLI command docs `[checkpoint:human-verify]`

**Depends on:** Task 5, Task 6 | **Files:** `docs/reference/cli-commands.md` | **Category:** integration

1. Build the CLI (dep dists are symlinked/git-excluded, core is already built). From `packages/cli`:
   `npx tsup` (produces `dist/index.js`).
2. From the repo root: `node scripts/generate-docs.mjs`
   (The `agent-setup-prompt` sub-step may fail on a missing `tsx` — known pre-existing env issue; ignore it.)
3. Confirm regeneration: `git diff --stat docs/reference/cli-commands.md` should show changes, and
   `git diff docs/reference/cli-commands.md` should add a `harness skill update` section describing
   `[name]`, `--check`, `--global`, `--yes` and nothing unrelated.
4. **[checkpoint:human-verify]** Show the `docs/reference/cli-commands.md` diff and confirm it only adds the
   `harness skill update` command entry (no unrelated churn). Wait for confirmation before committing.
5. Run: `harness validate`
6. Commit: `HUSKY=0 git commit -am "docs(cli): regenerate cli-commands.md for harness skill update"`

---

### Task 8: Full validation sweep

**Depends on:** Task 7 | **Files:** none (verification only)

1. Run the full set of new/changed tests together:
   `npx vitest run --root packages/cli tests/commands/skill/provider-update.test.ts tests/commands/skill-update.test.ts tests/commands/update-skill-providers.test.ts tests/commands/update.test.ts`
   — all pass.
2. Run: `harness validate`
3. Run: `harness check-deps`
4. If anything fails, fix in the smallest scoped follow-up and re-run; otherwise the phase is complete.

## Uncertainties

- **[ASSUMPTION]** Placing the shared core at `commands/skill/provider-update.ts` (importing `runInstall`
  from `../install`) introduces no import cycle. Verified by inspection: `install.ts`, `freshness-checker.ts`,
  and `lockfile.ts` do not import `provider-update.ts`. If the arch/dep check flags it, move the shared core
  to `registry/provider-update.ts` (same code) — but that adds a registry→commands edge, so the commands
  location is preferred.
- **[ASSUMPTION]** Default (no `--global`) probes BOTH the project and global community lockfiles resolved by
  `resolveCommunityBase`; `--global` narrows to the global lockfile only. The spec says "project + global via
  resolveCommunityBase" without pinning the `--global` semantics; this is the natural reading.
- **[DEFERRABLE]** Exact wording of status/table lines (`old -> new`, "source unknown — reinstall...") — kept
  aligned with the background checker's notification; final polish is fine during execution.
- **[DEFERRABLE]** A github source that backs multiple skills in one repo is re-pulled once per matching
  provider (redundant but idempotent). De-duplicating by repo is a possible future refinement, out of scope
  for Phase 4.

## Out of Scope (explicit)

- No changes to the background freshness checker's wiring or Phase 1-3 behavior.
- Narrative docs / ADR / knowledge docs are Phase 5 — only the generated `cli-commands.md` regen belongs here.
