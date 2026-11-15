# Plan: Trusted Autonomy Mode — Phase 2 (Decision log)

**Date:** 2026-11-13 | **Spec:** `docs/changes/trusted-autonomy-mode/proposal.md` (Phase 2 only; Decision log, D6, D11, Threat model, D12-D16) | **Tasks:** 16 | **Time:** ~70 min | **Integration Tier:** medium | **Rigor:** standard | **Session:** `changes--trusted-autonomy-mode--proposal`

## Goal

An agent records each auto-taken decision through the `record_auto_decision` MCP tool. The tool validates the entry strictly. It stamps `ts` and `autonomySource` itself and refuses anything the resolved autonomy did not allow. It then appends exactly one line to `.harness/sessions/<slug>/auto-decisions.jsonl`, or returns an unambiguous structured failure. A human reads the log back with `harness autonomy log --session <slug> [--json]`, which prints counts by class, `audited N/M`, the agreement rate, and the escalation count. The renderer is a pure core function that Phase 3's terminal skills will call.

Phase 2 also carries two items forward from the Phase 1 review: a dogfood-hook parity test, and override-lock release that checks ownership.

Out of scope (Phase 3): the pause-protocol template, skill retrofits, skills calling `record_auto_decision` and pausing on its failure (the skill half of SC14), wiring the summary into terminal skills (the call site of SC11), and invocation flags. Out of scope (Phase 4): ADRs, AGENTS.md, guide, knowledge node.

## Observable Truths (Acceptance Criteria)

1. **SC9.** `harness autonomy log --session <slug>` shall print `audited N/M`. M counts every `judgment` decision, including audit `unavailable` and `off`. N counts `agreed + escalated`. With 5 judgments (2 agreed, 1 escalated, 1 unavailable, 1 off) it prints `audited 3/5`. → Tasks 8, 13
2. **SC11 (rendering half).** `renderAutoDecisionSummary(entries, opts)` shall be a pure core function. It returns `[]` when there are no entries and no unreadable lines, so a terminal skill prints nothing. Otherwise it returns the counts by class, `audited N/M`, the agreement rate (`agreed ÷ audited`, rendered `n/a` when nothing was audited, never `100%`) and the escalation count. → Task 8
3. **D6.** When `record_auto_decision` is called with a valid entry while autonomy resolves to `trusted`, the system shall append exactly one JSON line to `<project root>/.harness/sessions/<slug>/auto-decisions.jsonl`. The call returns `{ recorded: true, entry }`. → Tasks 5, 7, 10
4. **Anti-spoof.** If the caller supplies `autonomySource` or `ts`, then the system shall reject the call with `AUTO_DECISION_INVALID` (naming the field) and shall not write. On success, `autonomySource` equals `resolveAutonomyForSession(...).source.level` and `ts` comes from the server clock. → Tasks 4, 7, 10
5. **SC14 (tool half).** If the append fails (missing session dir, I/O error, partial write, oversize entry), then the tool shall return `isError` with `{ recorded: false, error: <CODE>, message, action: "pause" }`. It shall never return `recorded: true` for an unwritten entry. → Tasks 5, 7, 10
6. **Append-only.** Core exports no API that rewrites, truncates, or deletes the log. The writer opens the file only in append mode. A source scan and an export-surface test enforce both. The raw appender is not exported from the core barrel, so `recordAutoDecision` (validate, authorize, stamp) is the only public write path. → Tasks 5, 9
7. **Concurrency.** When 4 OS processes each append 40 entries larger than 4 KiB at the same time, the log shall contain 160 lines that all parse, each (writer, i) exactly once. → Task 6
8. **Shared slug rule.** Slugs are validated by `validateOverrideSlug` (backed by `packages/core/src/shared/session-slug.ts`). `../x`, `CON`, and ` s1` are rejected with `AUTO_DECISION_INVALID` / field `session`, and nothing is written. → Tasks 5, 7
9. **Authorization (pending checkpoint, Task 7).** If autonomy resolves to `supervised`, then the system shall reject a non-escalated entry with `AUTO_DECISION_NOT_AUTHORIZED`. If audit resolves on, then the system shall reject an entry with audit `off`. → Task 7
10. **Strict validation.** MCP args arrive unvalidated, so the core validator (Zod, strict) shall reject: unknown keys; pause classes other than `ceremony`/`judgment`; `audit` on a ceremony entry; a judgment entry with no `audit`; `chosen` that is not in `options` (except escalated, where `chosen` must equal `humanChoice`); `agreed` with `blindPick ≠ chosen`; control or bidi characters; and over-length fields. → Task 4
11. **Carry-forward 1.** A test fails if a `.harness/hooks/<name>.js` dogfood copy listed in `profile.json` with a `packages/cli/src/hooks` source differs from that source, or if its recorded hash differs from its content. Two pre-existing exceptions are listed by name as a known gap that can only shrink: `format-check.js` and `quality-warner.js`. `autonomy-guard.js` and `block-no-verify.js` can never be exempted. → Task 1
12. **Carry-forward 2.** If writer A's override lock was broken and re-acquired by writer B during A's critical section, then A's release shall not delete B's lock. → Task 2
13. `record_auto_decision` is registered (definition plus handler) in tier `standard`, and the tool count is 116. `ALL_MCP_TOOLS` and `TOOL_CAPABILITY_DECLARATIONS` include it. Reference docs and the tool catalog are regenerated. `generate:barrels:check`, `generate:tool-catalog:check` and `check-deps` pass. `harness validate` stays at the pre-existing 496-issue baseline. → Tasks 11, 12, 15, 16

## Uncertainties

- [ASSUMPTION — **checkpoint:decision at Task 7**] **The tool authorizes entries, not only stamps them.** `record_auto_decision` rejects non-escalated entries unless autonomy resolves to `trusted`, and rejects audit `off` while audit resolves on. The rationale: the pause protocol requires logging before proceeding (fail-safe rule), so a refused log entry forces a pause. That makes "the agent auto-proceeded while supervised", or "skipped a required audit", mechanically impossible on the sanctioned path. The cost: Phase 3 flag-only trusted runs (`--trusted` with no override or user config) will be refused until Phase 3 decides how flags reach MCP. That decision was deferred in Phase 1. Alternative B: stamp only, never refuse. If B is chosen, delete `authorizationError` and its 4 tests from Task 7; nothing else changes.
- [ASSUMPTION] A caller-supplied `ts` / `autonomySource` is **rejected** (strict schema), not silently stripped. A spoof attempt is loud, and the tool definition does not advertise either field.
- [ASSUMPTION] Cross-field rules (Truth 10) are planning-phase refinements of the spec's `AutoDecision` type. They are what make `audited N/M` and the agreement rate trustworthy: an `agreed` entry whose blind pick differs is a false agreement, and a judgment with no audit status cannot be counted in M.
- [ASSUMPTION] **The session dir must already exist.** The tool never creates `.harness/sessions/<slug>/`, so an agent cannot scatter session dirs by naming slugs. Autopilot and brainstorming create the dir at session start. A missing dir is `AUTO_DECISION_SESSION_NOT_FOUND`, which makes the skill pause (fail-safe rule "no resolvable session").
- [ASSUMPTION] **No lock for appends.** Each entry is one `write(2)` on an `O_APPEND` descriptor, capped at `MAX_AUTO_DECISION_LINE_BYTES = 16 KiB`, and the written byte count is checked. Task 6 proves this across processes with lines larger than 4 KiB on all three CI OSes. If Task 6 fails on any OS, fall back to holding a lock around the append (extract `withOverrideLock` as a generic `withFileLock`). Record that as a deviation.
- [ASSUMPTION] The log path is `resolveProjectRoot(projectPath)/.harness/sessions/<slug>/auto-decisions.jsonl`. This is the same layout `resolveSessionDir` produces, plus the per-worktree git toplevel that Phase 1's `sessionDirForRaise` uses. The plan does **not** import `state/session-resolver` into `autonomy/`: that pulls in `identity/store`, and Phase 1 learned that new import edges trip the dependency-depth arch gate. Task 5 has a parity test against `resolveSessionDir`.
- [ASSUMPTION] Unreadable log lines (hand-edited or cut-short writes) are skipped, counted, and rendered as a `WARNING` line. `harness autonomy log` still exits 0 and reports them in `--json` as `invalidLines`.
- [ASSUMPTION] `--json` for `autonomy log` is the **global** flag read through `cmd.optsWithGlobals()`, the same as `autonomy show`. A subcommand-local `--json` is shadowed by the root program.
- [DEFERRABLE → Phase 3/4] **Same-user residual (Threat model).** An agent with Write/Edit/Bash can still rewrite `auto-decisions.jsonl` directly. Append-only is enforced on the sanctioned API only. Extending `autonomy-guard.js` to block agent writes to `**/.harness/sessions/*/auto-decisions.jsonl` is a candidate follow-up. Unreadable-line reporting makes crude tampering visible, but it does not catch rewrites that keep the line valid.
- [DEFERRABLE] A write cut short (disk full) leaves a fragment with no newline, so the next append joins it. Both lines then read as unreadable and are counted. Truncation is not available (append-only).
- [DEFERRABLE] Symlink at the log path. The writer does not use `O_NOFOLLOW` (not portable to win32). This falls under the same-user residual.
- [DEFERRABLE] Exact error and summary wording beyond what the tests pin.
- [SPEC GAP — fixed in Task 11] The spec's Registrations list omits `ALL_MCP_TOOLS` (`packages/cli/src/commands/setup-mcp.ts:54`, sync test `packages/cli/tests/commands/setup-mcp.test.ts:424`) and `TOOL_CAPABILITY_DECLARATIONS` (`packages/cli/src/mcp/tool-capability-declarations.ts`, coverage test `packages/cli/tests/commands/mcp-list-capabilities.test.ts:114`). Both must list every registered tool. **Recommend a spec amendment.**

## Decisions (planning phase)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Evidence                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Q1  | All validation, authorization, stamping and writing live in core (`recordAutoDecision`). The MCP handler is a thin adapter that maps `error.code` to JSON. CLI tests resolve core via **dist**, so security logic is tested on src in core.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Phase 1 P3/P5; `packages/cli/src/mcp/tools/state.ts:500-542` |
| Q2  | Errors are classes with a string `code` (`AUTO_DECISION_INVALID`, `_SESSION_NOT_FOUND`, `_NOT_AUTHORIZED`, `_WRITE_FAILED`). They are matched by `code`, never `instanceof`, because of the dist boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `packages/core/src/autonomy/lower-only.ts:9-22`              |
| Q3  | The core barrel exports `recordAutoDecision`, `readAutoDecisions`, the schemas, and the summary/render functions. It does **not** export `appendAutoDecision`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Truth 6                                                      |
| Q4  | The handler takes `deps = { homeDir?, now?, env? }` as a trailing optional argument. The server calls `handler(args)`, so production is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `packages/cli/src/mcp/server.ts:753` (Phase 1 P3)            |
| Q5  | Lock ownership uses a per-acquisition token `${pid}:${Date.now()}:${seq}:${randomUUID()}` written into the lock. Release claims the lock by atomic rename, compares the token, and restores a foreign lock with `link(2)`. This is the same claim-then-verify technique as `claimStaleLock` (N3). A pid alone is not unique enough (one process, sequential writers); an inode is reused after unlink.                                                                                                                                                                                                                                                                                               | `packages/core/src/autonomy/override-store.ts:118-137`       |
| Q6  | Hook parity: the test lists `KNOWN_CONTENT_DRIFT = ['format-check.js', 'quality-warner.js']`. These dogfood copies are older than their source, but their recorded hash matches the copy. Each listed name must _still_ drift, so the list only shrinks. Recorded-hash drift in `block-no-verify.js` and `protect-config.js` is **fixed** (their content is byte-identical to source; only `profile.json` is stale since `c0920a339`). A stale recorded hash makes `harness hooks init` treat the file as hand-edited and stop refreshing it. Measured 2026-11-13: content SAME for 14/16, hash OK for 14/16; DIFF content: format-check, quality-warner; bad hash: block-no-verify, protect-config. | `packages/cli/src/commands/hooks/init.ts:150-205`            |

## File Map

- CREATE `packages/cli/tests/hooks/dogfood-hook-parity.test.ts`
- MODIFY `.harness/hooks/profile.json` (two recorded hashes)
- MODIFY `packages/core/src/autonomy/override-store.ts` (lock token + ownership-checked release)
- MODIFY `packages/core/tests/autonomy/override-store.test.ts`
- MODIFY `packages/types/src/autonomy.ts` (AutoDecision contract)
- MODIFY `packages/types/src/index.ts` (export block)
- MODIFY `packages/types/tests/autonomy.test.ts`
- CREATE `packages/core/src/autonomy/decision-schema.ts`
- CREATE `packages/core/tests/autonomy/decision-schema.test.ts`
- CREATE `packages/core/src/autonomy/decision-log.ts`
- CREATE `packages/core/tests/autonomy/decision-log.test.ts`
- CREATE `packages/core/tests/autonomy/decision-log-worker.mts`
- CREATE `packages/core/tests/autonomy/decision-log-concurrency.test.ts`
- CREATE `packages/core/src/autonomy/record.ts`
- CREATE `packages/core/tests/autonomy/record.test.ts`
- CREATE `packages/core/src/autonomy/summary.ts`
- CREATE `packages/core/tests/autonomy/summary.test.ts`
- MODIFY `packages/core/src/autonomy/index.ts`
- CREATE `packages/core/tests/autonomy/decision-log-surface.test.ts`
- MODIFY `packages/core/tests/autonomy/resolve-isolation.test.ts` (scan list)
- CREATE `packages/cli/src/mcp/tools/auto-decision.ts`
- CREATE `packages/cli/tests/mcp/tools/auto-decision.test.ts`
- MODIFY `packages/cli/src/mcp/server.ts` (import, definition, handler)
- MODIFY `packages/cli/src/commands/setup-mcp.ts` (`ALL_MCP_TOOLS`)
- MODIFY `packages/cli/src/mcp/tool-capability-declarations.ts`
- MODIFY `packages/cli/tests/mcp/server.test.ts` (115 → 116)
- MODIFY `packages/cli/tests/mcp/server-integration.test.ts` (115 → 116, `toContain`)
- MODIFY `packages/cli/src/mcp/tool-tiers.ts` (`STANDARD_EXTRA`)
- MODIFY `packages/cli/tests/mcp/tool-tiers.test.ts`
- CREATE `packages/cli/src/commands/autonomy/log.ts`
- CREATE `packages/cli/tests/commands/autonomy-log.test.ts`
- MODIFY `packages/cli/src/commands/autonomy/index.ts`
- MODIFY `packages/cli/tests/commands/autonomy-command.test.ts`
- MODIFY `docs/reference/mcp-tools.md`, `docs/reference/tool-catalog.md`, `docs/reference/cli-commands.md`, plus any `docs/reference/packages-*.md` the generator touches (generated)
- MODIFY `.changeset/trusted-autonomy-mode.md`

`packages/core/src/index.ts` already has `export * from './autonomy';` (line 286), so no barrel regeneration is needed. `generate:barrels:check` must still pass. `_registry.ts` is unchanged because the `autonomy` group is already registered.

## Skeleton

1. Phase 1 carry-forwards: dogfood hook parity, lock-release ownership (2 tasks, ~8 min, parallel with everything)
2. Contract types (1 task, ~3 min)
3. Core decision log: strict schema, append-only writer, cross-process concurrency proof, `recordAutoDecision` (validate, authorize, stamp, append), summary and renderer, exports (6 tasks, ~30 min)
4. MCP: handler, registration and sync lists, standard tier (3 tasks, ~12 min)
5. CLI: `autonomy log` runner and formatter, command-group wiring (2 tasks, ~8 min)
6. Generated docs, changeset, full verification (2 tasks, ~9 min)

**Estimated total:** 16 tasks, ~70 min. _Skeleton approval: PENDING. This plan was produced by a planning subagent that cannot hold a dialogue, so the parent or human approves the skeleton together with the plan._

## NFR Targets

Not elicited: Phase 1.6 needs a dialogue the planning subagent could not hold, so every dimension took its default. This phase is an audit trail an agent writes. Task 16 still runs `harness check-security --severity error` and the Task 6 concurrency proof. **Recommendation for the approver:** treat "If `harness check-security --severity error` reports a finding under `packages/core/src/autonomy/` or `packages/cli/src/mcp/tools/auto-decision.ts`, the build shall not pass" as a Security NFR. It is already wired into Task 16.

## Execution Notes (apply to every task)

- Work only in `/Users/cwarner/Projects/iv/harness-engineering/_wt/trust-mode`. Do not push. Do not touch the roadmap.
- Tests compare paths after `p.replaceAll('\\', '/')`. Tests never touch the real `~/.harness`: pass `homeDir` and `env: {}`.
- Core tests in tmp dirs inject `gitToplevel: () => undefined` and `gitCommonDir: () => undefined`, so the project root is the tmp dir regardless of where `os.tmpdir()` sits.
- `exactOptionalPropertyTypes` is on. Build optional fields with `...(x !== undefined && { x })`.
- CLI tests import core from **dist**. After any core or types change, run `npx turbo build --filter=@harness-engineering/core...` before CLI tests. The pre-commit arch hook reads `packages/cli/dist`, so run `npx turbo build --filter=@harness-engineering/cli...` before each commit.
- Never put the literal `harness.config` in any `packages/core/src/autonomy/*.ts` file. The SC5 scan in `resolve-isolation.test.ts` reads every file in the dir.
- **Mutation probes.** Each security-relevant task names a probe. Back up the file to `$TMPDIR`, apply the one-line mutation, and run the named test (expect FAIL). Restore from the backup and re-run (expect PASS). Print the diff and the test result in the same command. Record both outcomes in the commit body. Never restore with `git checkout HEAD -- <file>`, because it discards uncommitted work.
- `harness validate` means `node packages/cli/dist/bin/harness.js validate`. It currently exits 1 with **496** pre-existing issues; "passes" means the count is unchanged.

## Tasks

### Task 1: Dogfood hook parity test (carry-forward 1)

**Depends on:** none | **Files:** `packages/cli/tests/hooks/dogfood-hook-parity.test.ts`, `.harness/hooks/profile.json` | **Owns:** `packages/cli/tests/hooks/dogfood-hook-parity.test.ts`

1. Create `packages/cli/tests/hooks/dogfood-hook-parity.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { createHash } from 'node:crypto';
   import { fileURLToPath } from 'node:url';

   // packages/cli/tests/hooks -> repo root
   const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
   const DOGFOOD = path.join(REPO, '.harness', 'hooks');
   const SOURCE = path.join(REPO, 'packages', 'cli', 'src', 'hooks');
   const profile = JSON.parse(fs.readFileSync(path.join(DOGFOOD, 'profile.json'), 'utf-8')) as {
     fileHashes: Record<string, string>;
   };
   const read = (p: string) => fs.readFileSync(p, 'utf-8');
   const sha = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

   /**
    * KNOWN GAP (pre-existing, deliberately not auto-fixed): dogfood copies older than their source.
    * Their recorded hash matches the stale copy, so `harness hooks init` would refresh them. This
    * list may only shrink: each entry must still drift, or the test asks for its removal.
    */
   const KNOWN_CONTENT_DRIFT = ['format-check.js', 'quality-warner.js'];
   /** Security hooks that may never be exempted. */
   const MUST_MATCH = ['autonomy-guard.js', 'block-no-verify.js'];

   const withSource = Object.keys(profile.fileHashes)
     .filter((n) => fs.existsSync(path.join(SOURCE, n)))
     .sort();

   describe('dogfood .harness/hooks match packages/cli/src/hooks', () => {
     it('positive control: the profile lists sourced hooks, including the security hooks', () => {
       expect(withSource.length).toBeGreaterThanOrEqual(10);
       for (const n of MUST_MATCH) {
         expect(withSource).toContain(n);
         expect(KNOWN_CONTENT_DRIFT).not.toContain(n);
       }
     });

     it.each(withSource.filter((n) => !KNOWN_CONTENT_DRIFT.includes(n)))(
       '%s: dogfood copy is byte-identical to its source',
       (n) => {
         expect(read(path.join(DOGFOOD, n))).toBe(read(path.join(SOURCE, n)));
       }
     );

     it.each(withSource)('%s: profile.json records the hash of the dogfood copy', (n) => {
       expect(profile.fileHashes[n]).toBe(sha(path.join(DOGFOOD, n)));
     });

     it.each(KNOWN_CONTENT_DRIFT)(
       '%s: still drifted (remove it from KNOWN_CONTENT_DRIFT once synced)',
       (n) => {
         expect(read(path.join(DOGFOOD, n))).not.toBe(read(path.join(SOURCE, n)));
       }
     );
   });
   ```

2. Run `cd packages/cli && npx vitest run tests/hooks/dogfood-hook-parity.test.ts`. Expect exactly 2 failures, both in the hash block: `block-no-verify.js` and `protect-config.js`.
3. Refresh only those two recorded hashes. Both copies are byte-identical to source, which step 2's content block proves:

   ```bash
   node -e "const fs=require('fs'),c=require('crypto');const p='.harness/hooks/profile.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));for(const n of ['block-no-verify.js','protect-config.js'])j.fileHashes[n]=c.createHash('sha256').update(fs.readFileSync('.harness/hooks/'+n)).digest('hex');fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')"
   git diff .harness/hooks/profile.json   # exactly 2 lines change: aa1db903… and 270a5cce…
   ```

4. Re-run the test. All pass.
5. Mutation probe: append `// x` to `.harness/hooks/autonomy-guard.js`. Both the content and hash cases for `autonomy-guard.js` FAIL. Restore it and confirm PASS.
6. Run `harness validate` (496 unchanged).
7. Commit: `test(hooks): pin dogfood hook copies to their source and recorded hash`. Note in the body that format-check.js and quality-warner.js are a known gap, with the probe result.

### Task 2: Override lock release verifies ownership (carry-forward 2)

**Depends on:** none | **Files:** `packages/core/src/autonomy/override-store.ts`, `packages/core/tests/autonomy/override-store.test.ts` | **Owns:** `packages/core/src/autonomy/override-store.ts`

1. Add `releaseOverrideLock` to the import list at the top of `packages/core/tests/autonomy/override-store.test.ts`. Then append inside the top-level `describe('session override store', ...)`, after the N3 `describe`:

   ```ts
   /**
    * Carry-forward (Phase 1 review): release must verify ownership. A writer that overran
    * staleLockMs can have its lock broken and re-acquired by writer B; an unconditional unlink at
    * A's release would delete B's lock and admit a third writer into B's critical section.
    */
   describe('lock release verifies ownership', () => {
     it("does not delete a lock another writer re-acquired during this writer's critical section", () => {
       const p = sessionOverridePath(project, 's1', { homeDir: home });
       if (!p.ok) throw p.error;
       const lock = `${p.value}.lock`;
       const w = writeSessionOverride(project, 's1', { audit: true }, 'mcp', {
         homeDir: home,
         beforeWrite: () => {
           fs.rmSync(lock); // B broke A's lock (judged stale)...
           fs.writeFileSync(lock, 'writer-B-token', { flag: 'wx' }); // ...and took it
         },
       });
       expect(w.ok).toBe(true);
       expect(fs.readFileSync(lock, 'utf-8')).toBe('writer-B-token');
       expect(fs.readdirSync(path.dirname(lock)).filter((n) => n.includes('.release.'))).toEqual(
         []
       );
     });

     it('writes a per-acquisition token beginning with the pid', () => {
       const p = sessionOverridePath(project, 's1', { homeDir: home });
       if (!p.ok) throw p.error;
       const seen: string[] = [];
       const opts = {
         homeDir: home,
         beforeWrite: () => seen.push(fs.readFileSync(`${p.value}.lock`, 'utf-8')),
       };
       expect(writeSessionOverride(project, 's1', { audit: true }, 'mcp', opts).ok).toBe(true);
       expect(writeSessionOverride(project, 's1', { audit: true }, 'mcp', opts).ok).toBe(true);
       expect(seen).toHaveLength(2);
       expect(seen[0]).not.toBe(seen[1]);
       for (const t of seen) expect(t.startsWith(`${process.pid}:`)).toBe(true);
       expect(fs.existsSync(`${p.value}.lock`)).toBe(false); // own lock still released
     });

     it('releaseOverrideLock removes only a lock holding the given token', () => {
       const lock = path.join(tmp, 'x.lock');
       fs.writeFileSync(lock, 'mine');
       expect(releaseOverrideLock(lock, 'theirs')).toBe(false);
       expect(fs.readFileSync(lock, 'utf-8')).toBe('mine');
       expect(releaseOverrideLock(lock, 'mine')).toBe(true);
       expect(fs.existsSync(lock)).toBe(false);
       expect(releaseOverrideLock(lock, 'mine')).toBe(false); // already gone
       expect(fs.readdirSync(tmp).filter((n) => n.includes('.release.'))).toEqual([]);
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/autonomy/override-store.test.ts`. It fails: `releaseOverrideLock` is not exported, and the first case finds the lock deleted.
3. In `packages/core/src/autonomy/override-store.ts`:
   - Add `import { randomUUID } from 'node:crypto';`.
   - Below `claimStaleLock`, add:

     ```ts
     let lockSeq = 0;

     /** Unique per acquisition (a pid alone repeats across sequential writers in one process). */
     function newLockToken(): string {
       return `${process.pid}:${Date.now()}:${lockSeq++}:${randomUUID()}`;
     }

     function readLockToken(p: string): string | undefined {
       try {
         return fs.readFileSync(p, 'utf-8');
       } catch {
         return undefined;
       }
     }

     /**
      * Release a lock only if this writer still owns it. If this writer overran staleLockMs, another
      * writer may have broken the lock and re-acquired it; an unconditional unlink would delete THAT
      * writer's lock. The lock is claimed by atomic rename (as in claimStaleLock), its token compared,
      * and a lock that is not ours is restored with link(2), which never clobbers a lock created
      * meanwhile. Returns true when this writer's own lock was removed.
      * @internal Exported for the ownership race test.
      */
     export function releaseOverrideLock(lockPath: string, token: string): boolean {
       const claimed = `${lockPath}.release.${process.pid}.${Date.now()}.${claimSeq++}`;
       try {
         fs.renameSync(lockPath, claimed);
       } catch {
         return false; // already gone (broken by another writer, or never ours)
       }
       try {
         if (readLockToken(claimed) === token) return true;
         try {
           fs.linkSync(claimed, lockPath); // not ours: hand it back to its holder
         } catch {
           // A newer lock already exists; leave it.
         }
         return false;
       } finally {
         fs.rmSync(claimed, { force: true });
       }
     }
     ```

   - In `withOverrideLock`, before the `for (;;)` loop, add `const token = newLockToken();`. Replace `fs.writeSync(fd, String(process.pid));` with `fs.writeSync(fd, token);`. Replace the `finally { fs.rmSync(lockPath, { force: true }); }` body with `releaseOverrideLock(lockPath, token);`.

4. Re-run the test. All pass, including the existing N3 and `releases the lock after a write` cases.
5. Mutation probe: in the `finally`, replace `releaseOverrideLock(lockPath, token);` with `fs.rmSync(lockPath, { force: true });`. The first new case FAILS. Restore and confirm PASS.
6. Run `npx turbo build --filter=@harness-engineering/core...` and `harness validate` (496).
7. Commit: `fix(core): release the override lock only when this writer still owns it`

### Task 3: AutoDecision contract types

**Depends on:** none | **Files:** `packages/types/src/autonomy.ts`, `packages/types/src/index.ts`, `packages/types/tests/autonomy.test.ts` | **Owns:** `packages/types/src/autonomy.ts`

1. Append to `packages/types/tests/autonomy.test.ts`. Add `AUTO_DECISION_PAUSE_CLASSES` and `AUTO_DECISION_AUDIT_STATUSES` to the value import, and `AutoDecision` and `AutoDecisionSummary` to the type import:

   ```ts
   describe('auto-decision contract (D6)', () => {
     it('logs only ceremony and judgment pauses; irreversible and gate never auto-proceed (D1)', () => {
       expect(AUTO_DECISION_PAUSE_CLASSES).toEqual(['ceremony', 'judgment']);
     });
     it('defines the four audit statuses (D7, D8, D11)', () => {
       expect(AUTO_DECISION_AUDIT_STATUSES).toEqual(['agreed', 'escalated', 'unavailable', 'off']);
     });
     it('entry and summary shapes compile', () => {
       const d: AutoDecision = {
         ts: '2026-11-13T00:00:00.000Z',
         skill: 'harness-planning',
         phase: 'DECOMPOSE',
         pauseClass: 'judgment',
         question: 'Which approach?',
         options: ['A', 'B'],
         chosen: 'A',
         rationale: 'smaller blast radius',
         autonomySource: 'user-config',
         audit: { status: 'agreed', blindPick: 'A' },
       };
       const s: AutoDecisionSummary = {
         total: 1,
         byClass: { ceremony: 0, judgment: 1 },
         judgments: 1,
         audited: 1,
         agreed: 1,
         escalations: 0,
         unavailable: 0,
         off: 0,
         agreementRate: 1,
       };
       expect(d.audit?.status).toBe('agreed');
       expect(s.agreementRate).toBe(1);
     });
   });
   ```

2. Run `cd packages/types && npx vitest run tests/autonomy.test.ts`. It fails on the missing exports.
3. Append to `packages/types/src/autonomy.ts`:

   ```ts
   /** Pause classes an auto-decision can carry (D1). irreversible and gate never auto-proceed. */
   export const AUTO_DECISION_PAUSE_CLASSES = ['ceremony', 'judgment'] as const;
   export type AutoDecisionPauseClass = (typeof AUTO_DECISION_PAUSE_CLASSES)[number];

   export const AUTO_DECISION_AUDIT_STATUSES = [
     'agreed',
     'escalated',
     'unavailable',
     'off',
   ] as const;
   export type AutoDecisionAuditStatus = (typeof AUTO_DECISION_AUDIT_STATUSES)[number];

   /** Self-audit outcome for a judgment fork (D7, D8, D11). */
   export type AutoDecisionAudit =
     | {
         status: 'agreed';
         blindPick: string;
         objection?: { severity: 'non-blocking'; text: string };
       }
     | {
         status: 'escalated';
         blindPick: string;
         objection?: { severity: 'blocking' | 'non-blocking'; text: string };
         humanChoice: string;
       }
     | { status: 'unavailable' | 'off' };

   /** What a caller supplies. `ts` and `autonomySource` are stamped by the writer, never the caller. */
   export interface AutoDecisionInput {
     skill: string;
     phase: string;
     pauseClass: AutoDecisionPauseClass;
     question: string;
     options: string[];
     chosen: string;
     rationale: string;
     /** Required for judgment, absent for ceremony. */
     audit?: AutoDecisionAudit;
   }

   /** One line of .harness/sessions/<slug>/auto-decisions.jsonl (D6). */
   export interface AutoDecision extends AutoDecisionInput {
     ts: string;
     autonomySource: AutonomySource;
   }

   export interface AutoDecisionSummary {
     total: number;
     byClass: Record<AutoDecisionPauseClass, number>;
     /** M: every judgment decision, including audit unavailable/off (SC9). */
     judgments: number;
     /** N: judgment decisions whose audit actually ran (agreed + escalated). */
     audited: number;
     agreed: number;
     escalations: number;
     unavailable: number;
     off: number;
     /** agreed / audited; null when nothing was audited (never shown as 100%). */
     agreementRate: number | null;
   }
   ```

4. In `packages/types/src/index.ts`, extend the Trusted Autonomy block. Add `AUTO_DECISION_PAUSE_CLASSES, AUTO_DECISION_AUDIT_STATUSES` to the value export. Add `AutoDecisionPauseClass, AutoDecisionAuditStatus, AutoDecisionAudit, AutoDecisionInput, AutoDecision, AutoDecisionSummary` to the type export. Change the comment to `// --- Trusted Autonomy Mode (Phases 1-2) ---`.
5. Re-run the test. It passes. Then run `npx turbo build --filter=@harness-engineering/types` and `harness validate` (496).
6. Commit: `feat(types): add the AutoDecision decision-log contract`

### Task 4: Strict AutoDecision schema

**Depends on:** Task 3 | **Files:** `packages/core/src/autonomy/decision-schema.ts`, `packages/core/tests/autonomy/decision-schema.test.ts` | **Owns:** `packages/core/src/autonomy/decision-schema.ts`

1. Create `packages/core/tests/autonomy/decision-schema.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     AUTO_DECISION_LIMITS,
     parseAutoDecisionLine,
     validateAutoDecisionInput,
   } from '../../src/autonomy/decision-schema';

   const ceremony = {
     skill: 'harness-planning',
     phase: 'VALIDATE',
     pauseClass: 'ceremony',
     question: 'Approve plan?',
     options: ['approve'],
     chosen: 'approve',
     rationale: 'all truths traced',
   };
   const judgment = {
     skill: 'harness-brainstorming',
     phase: 'EVALUATE',
     pauseClass: 'judgment',
     question: 'Which approach?',
     options: ['A', 'B'],
     chosen: 'A',
     rationale: 'smaller blast radius',
     audit: { status: 'agreed', blindPick: 'A' },
   };
   const fields = (r: ReturnType<typeof validateAutoDecisionInput>) =>
     r.ok ? [] : (r.error as { fields: string[]; code: string }).fields;
   const code = (r: ReturnType<typeof validateAutoDecisionInput>) =>
     r.ok ? null : (r.error as { code: string }).code;

   describe('validateAutoDecisionInput', () => {
     it('accepts a ceremony entry without audit and judgments with each audit status', () => {
       expect(validateAutoDecisionInput(ceremony).ok).toBe(true);
       expect(validateAutoDecisionInput(judgment).ok).toBe(true);
       for (const audit of [
         {
           status: 'agreed',
           blindPick: 'A',
           objection: { severity: 'non-blocking', text: 'minor' },
         },
         {
           status: 'escalated',
           blindPick: 'B',
           objection: { severity: 'blocking', text: 'x' },
           humanChoice: 'A',
         },
         { status: 'unavailable' },
         { status: 'off' },
       ])
         expect(validateAutoDecisionInput({ ...judgment, audit }).ok).toBe(true);
     });
     it('rejects caller-supplied autonomySource and ts: writer-stamped fields cannot be spoofed', () => {
       const a = validateAutoDecisionInput({ ...ceremony, autonomySource: 'flag' });
       expect(code(a)).toBe('AUTO_DECISION_INVALID');
       expect(fields(a)).toContain('autonomySource');
       expect(
         fields(validateAutoDecisionInput({ ...ceremony, ts: '2026-01-01T00:00:00.000Z' }))
       ).toContain('ts');
     });
     it('rejects irreversible and gate pause classes (they never auto-proceed)', () => {
       for (const pauseClass of ['irreversible', 'gate', 'Ceremony'])
         expect(fields(validateAutoDecisionInput({ ...ceremony, pauseClass }))).toContain(
           'pauseClass'
         );
     });
     it('rejects audit on ceremony and a judgment with no audit (SC9 denominator)', () => {
       expect(
         fields(validateAutoDecisionInput({ ...ceremony, audit: { status: 'off' } }))
       ).toContain('audit');
       const { audit: _a, ...bare } = judgment;
       expect(fields(validateAutoDecisionInput(bare))).toContain('audit');
     });
     it('enforces chosen/blindPick/humanChoice consistency', () => {
       expect(fields(validateAutoDecisionInput({ ...judgment, chosen: 'C' }))).toContain('chosen');
       expect(
         fields(
           validateAutoDecisionInput({ ...judgment, audit: { status: 'agreed', blindPick: 'B' } })
         )
       ).toContain('audit');
       expect(
         fields(
           validateAutoDecisionInput({
             ...judgment,
             audit: { status: 'escalated', blindPick: 'B', humanChoice: 'B' },
           })
         )
       ).toContain('chosen');
       // escalated: the human may pick something outside the listed options
       expect(
         validateAutoDecisionInput({
           ...judgment,
           chosen: 'C',
           audit: { status: 'escalated', blindPick: 'B', humanChoice: 'C' },
         }).ok
       ).toBe(true);
       expect(
         fields(
           validateAutoDecisionInput({
             ...judgment,
             audit: {
               status: 'agreed',
               blindPick: 'A',
               objection: { severity: 'blocking', text: 'x' },
             },
           })
         )
       ).toContain('audit');
     });
     it('rejects malformed options', () => {
       expect(fields(validateAutoDecisionInput({ ...judgment, options: 'A,B' }))).toContain(
         'options'
       );
       expect(fields(validateAutoDecisionInput({ ...judgment, options: ['A', 'A'] }))).toContain(
         'options'
       );
       expect(fields(validateAutoDecisionInput({ ...judgment, options: ['A'] }))).toContain(
         'options'
       );
       expect(
         fields(
           validateAutoDecisionInput({
             ...judgment,
             options: Array.from({ length: 11 }, (_, i) => `o${i}`),
           })
         )
       ).toContain('options');
     });
     it('rejects control and bidi characters that could spoof terminal output; allows newlines in prose', () => {
       expect(
         fields(validateAutoDecisionInput({ ...ceremony, question: 'ok\u001b[2Khidden' }))
       ).toContain('question');
       expect(
         fields(
           validateAutoDecisionInput({ ...ceremony, chosen: 'appr‮ove', options: ['appr‮ove'] })
         )
       ).toContain('chosen');
       expect(fields(validateAutoDecisionInput({ ...ceremony, skill: 'a\nb' }))).toContain('skill');
       expect(validateAutoDecisionInput({ ...ceremony, rationale: 'line 1\nline 2\tx' }).ok).toBe(
         true
       );
     });
     it('rejects blank and over-length text', () => {
       expect(fields(validateAutoDecisionInput({ ...ceremony, rationale: '   ' }))).toContain(
         'rationale'
       );
       expect(
         fields(
           validateAutoDecisionInput({
             ...ceremony,
             question: 'q'.repeat(AUTO_DECISION_LIMITS.question + 1),
           })
         )
       ).toContain('question');
     });
     it('rejects non-objects at the root', () => {
       for (const v of [null, [], 'x', 1])
         expect(fields(validateAutoDecisionInput(v))).toEqual(['(root)']);
     });
   });

   describe('parseAutoDecisionLine', () => {
     const stored = { ts: '2026-11-13T00:00:00.000Z', ...ceremony, autonomySource: 'user-config' };
     it('round-trips a stored entry', () => {
       const r = parseAutoDecisionLine(JSON.stringify(stored));
       expect(r.ok && r.value).toEqual(stored);
     });
     it('rejects bad JSON, a missing autonomySource, and a non-ISO ts', () => {
       expect(parseAutoDecisionLine('{not json').ok).toBe(false);
       const { autonomySource: _s, ...noSource } = stored;
       expect(parseAutoDecisionLine(JSON.stringify(noSource)).ok).toBe(false);
       expect(parseAutoDecisionLine(JSON.stringify({ ...stored, ts: 'yesterday' })).ok).toBe(false);
       expect(
         parseAutoDecisionLine(JSON.stringify({ ...stored, autonomySource: 'agent' })).ok
       ).toBe(false);
     });
   });
   ```

   (Run `npx prettier --write` on the file; the long object literals above are compressed for the plan.)

2. Run `cd packages/core && npx vitest run tests/autonomy/decision-schema.test.ts`. It fails because the module is missing.
3. Create `packages/core/src/autonomy/decision-schema.ts`:

   ```ts
   import { z } from 'zod';
   import {
     AUTO_DECISION_PAUSE_CLASSES,
     AUTONOMY_SOURCES,
     type AutoDecision,
     type AutoDecisionInput,
   } from '@harness-engineering/types';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';

   /** Per-field caps. Typical entries stay far below MAX_AUTO_DECISION_LINE_BYTES (decision-log). */
   export const AUTO_DECISION_LIMITS = {
     name: 100,
     option: 300,
     options: 10,
     question: 2000,
     rationale: 4000,
     objection: 1000,
   } as const;

   export const AUTO_DECISION_INVALID = 'AUTO_DECISION_INVALID';

   export class AutoDecisionInvalidError extends Error {
     readonly code = AUTO_DECISION_INVALID;
     /** Offending top-level fields, deduplicated, in issue order ('(root)' for a non-object). */
     readonly fields: string[];
     constructor(message: string, fields: string[] = []) {
       super(`Invalid auto-decision: ${message}`);
       this.name = 'AutoDecisionInvalidError';
       this.fields = fields;
     }
   }

   const BIDI_CONTROLS = new Set([
     0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
   ]);

   /**
    * A code point that could rewrite or hide terminal output when the log is rendered for a human:
    * C0/C1 controls (including ESC) and bidi overrides. Tab and newline are allowed when multiline.
    */
   export function isUnsafeLogChar(code: number, multiline: boolean): boolean {
     if (multiline && (code === 0x09 || code === 0x0a)) return false;
     return code < 0x20 || (code >= 0x7f && code <= 0x9f) || BIDI_CONTROLS.has(code);
   }

   function hasUnsafeChars(s: string, multiline: boolean): boolean {
     for (const ch of s) if (isUnsafeLogChar(ch.codePointAt(0) ?? 0, multiline)) return true;
     return false;
   }

   function text(max: number, multiline = false) {
     return z
       .string()
       .min(1)
       .max(max)
       .refine((s) => s.trim() !== '', { message: 'must not be blank' })
       .refine((s) => !hasUnsafeChars(s, multiline), {
         message: multiline
           ? 'must not contain control or bidi characters (tab and newline are allowed)'
           : 'must be one line with no control or bidi characters',
       });
   }

   const L = AUTO_DECISION_LIMITS;

   export const AutoDecisionAuditSchema = z.union([
     z.strictObject({
       status: z.literal('agreed'),
       blindPick: text(L.option),
       objection: z
         .strictObject({ severity: z.literal('non-blocking'), text: text(L.objection, true) })
         .optional(),
     }),
     z.strictObject({
       status: z.literal('escalated'),
       blindPick: text(L.option),
       objection: z
         .strictObject({
           severity: z.enum(['blocking', 'non-blocking']),
           text: text(L.objection, true),
         })
         .optional(),
       humanChoice: text(L.option),
     }),
     z.strictObject({ status: z.enum(['unavailable', 'off']) }),
   ]);

   const inputShape = {
     skill: text(L.name),
     phase: text(L.name),
     pauseClass: z.enum(AUTO_DECISION_PAUSE_CLASSES),
     question: text(L.question, true),
     options: z.array(text(L.option)).min(1).max(L.options),
     chosen: text(L.option),
     rationale: text(L.rationale, true),
     audit: AutoDecisionAuditSchema.optional(),
   };
   const InputObject = z.strictObject(inputShape);
   type InputOut = z.output<typeof InputObject>;

   const IsoTimestamp = z.string().refine(
     (s) => {
       const t = Date.parse(s);
       return !Number.isNaN(t) && new Date(t).toISOString() === s;
     },
     { message: 'must be an ISO-8601 UTC timestamp (Date#toISOString)' }
   );

   type IssueSink = {
     addIssue: (i: { code: 'custom'; path: PropertyKey[]; message: string }) => void;
   };

   /** Rules that make audited N/M and the agreement rate trustworthy (SC9, D7, D8). */
   function crossFieldIssues(d: InputOut, ctx: IssueSink): void {
     const issue = (path: PropertyKey[], message: string) =>
       ctx.addIssue({ code: 'custom', path, message });
     if (new Set(d.options).size !== d.options.length)
       issue(['options'], 'options must be distinct');
     if (d.pauseClass === 'ceremony' && d.audit !== undefined) {
       issue(['audit'], 'ceremony decisions are never audited (D1); omit audit');
     }
     if (d.pauseClass === 'judgment') {
       if (d.audit === undefined) {
         issue(
           ['audit'],
           'a judgment decision must record its audit status (agreed | escalated | unavailable | off) so audited N/M counts it (SC9)'
         );
       }
       if (d.options.length < 2) issue(['options'], 'a judgment fork needs at least two options');
     }
     if (d.audit?.status === 'escalated') {
       if (d.chosen !== d.audit.humanChoice) {
         issue(
           ['chosen'],
           'an escalated decision records the human choice: chosen must equal audit.humanChoice'
         );
       }
     } else if (!d.options.includes(d.chosen)) {
       issue(['chosen'], 'chosen must be one of options');
     }
     if (d.audit?.status === 'agreed' && d.audit.blindPick !== d.chosen) {
       issue(
         ['audit', 'blindPick'],
         'agreed means the blind pick matched: blindPick must equal chosen (D7)'
       );
     }
   }

   /**
    * Caller input (MCP args). Strict: `ts` and `autonomySource` are stamped by the writer, so
    * supplying either is an error, never a spoof.
    */
   export const AutoDecisionInputSchema = InputObject.superRefine(crossFieldIssues);

   /** One stored line: the same rules plus the writer-stamped fields. */
   export const AutoDecisionSchema = z
     .strictObject({ ts: IsoTimestamp, ...inputShape, autonomySource: z.enum(AUTONOMY_SOURCES) })
     .superRefine(crossFieldIssues);

   type ZodIssueLike = { code: string; path: PropertyKey[]; message: string; keys?: string[] };

   function describeIssues(issues: readonly ZodIssueLike[]): string {
     return issues
       .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
       .join('; ');
   }

   function issueFields(issues: readonly ZodIssueLike[]): string[] {
     return [
       ...new Set(
         issues.flatMap((i) =>
           i.code === 'unrecognized_keys' && i.keys ? i.keys : [String(i.path[0] ?? '(root)')]
         )
       ),
     ];
   }

   /** Validate untrusted input (e.g. MCP args) before any policy decision or write. */
   export function validateAutoDecisionInput(
     raw: unknown
   ): Result<AutoDecisionInput, AutoDecisionInvalidError> {
     const r = AutoDecisionInputSchema.safeParse(raw);
     if (!r.success) {
       const issues = r.error.issues as unknown as ZodIssueLike[];
       return Err(new AutoDecisionInvalidError(describeIssues(issues), issueFields(issues)));
     }
     // JSON input never yields explicit `undefined`, so the zod output matches the contract.
     return Ok(r.data as AutoDecisionInput);
   }

   /** Parse one stored log line. */
   export function parseAutoDecisionLine(line: string): Result<AutoDecision, Error> {
     let json: unknown;
     try {
       json = JSON.parse(line);
     } catch (err) {
       return Err(new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`));
     }
     const r = AutoDecisionSchema.safeParse(json);
     if (!r.success)
       return Err(new Error(describeIssues(r.error.issues as unknown as ZodIssueLike[])));
     return Ok(r.data as AutoDecision);
   }
   ```

   If `tsc` rejects `IssueSink` as the `superRefine` ctx type, use `z.RefinementCtx` instead. The behavior is identical.

4. Re-run the test. All pass.
5. Mutation probe: delete the `agreed`/`blindPick` rule. The "enforces chosen/blindPick/humanChoice consistency" case FAILS. Restore and confirm PASS.
6. Run `cd packages/core && npx tsc --noEmit -p .` and `harness validate` (496).
7. Commit: `feat(core): add the strict AutoDecision schema with anti-spoof and audit consistency rules`

### Task 5: Append-only JSONL writer and reader

**Depends on:** Task 4 | **Files:** `packages/core/src/autonomy/decision-log.ts`, `packages/core/tests/autonomy/decision-log.test.ts` | **Owns:** `packages/core/src/autonomy/decision-log.ts`

1. Create `packages/core/tests/autonomy/decision-log.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import type { AutoDecision } from '@harness-engineering/types';
   import {
     appendAutoDecision,
     autoDecisionLogPath,
     readAutoDecisions,
     MAX_AUTO_DECISION_LINE_BYTES,
   } from '../../src/autonomy/decision-log';
   import { resolveSessionDir } from '../../src/state/session-resolver';

   let tmp: string;
   let project: string;
   const git = { gitToplevel: () => undefined, gitCommonDir: () => undefined };
   const entry = (over: Partial<AutoDecision> = {}): AutoDecision => ({
     ts: '2026-11-13T00:00:00.000Z',
     skill: 'harness-planning',
     phase: 'VALIDATE',
     pauseClass: 'ceremony',
     question: 'Approve plan?',
     options: ['approve'],
     chosen: 'approve',
     rationale: 'all truths traced',
     autonomySource: 'user-config',
     ...over,
   });
   const sessionDir = (slug = 's1') => path.join(project, '.harness', 'sessions', slug);
   const logFile = () => path.join(sessionDir(), 'auto-decisions.jsonl');
   const codeOf = (r: { ok: boolean; error?: unknown }) =>
     r.ok ? null : (r.error as { code?: string }).code;

   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-dlog-'));
     project = path.join(tmp, 'project');
     fs.mkdirSync(sessionDir(), { recursive: true });
   });
   afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

   describe('autoDecisionLogPath', () => {
     it('matches the resolveSessionDir layout (parity without importing state into autonomy)', () => {
       const p = autoDecisionLogPath(project, 's1', git);
       const dir = resolveSessionDir(project, 's1');
       expect(p.ok && dir.ok).toBe(true);
       if (p.ok && dir.ok) {
         expect(p.value.replaceAll('\\', '/')).toBe(
           path.join(dir.value, 'auto-decisions.jsonl').replaceAll('\\', '/')
         );
       }
     });
     it.each(['../x', 'CON', ' s1', 'a/b', ''])('rejects slug %j via the shared rule', (slug) => {
       expect(autoDecisionLogPath(project, slug, git).ok).toBe(false);
       expect(appendAutoDecision(project, slug, entry(), git).ok).toBe(false);
     });
   });

   describe('appendAutoDecision', () => {
     it('appends one line per call and never truncates existing content', () => {
       fs.writeFileSync(logFile(), 'pre-existing\n');
       expect(appendAutoDecision(project, 's1', entry({ question: 'one' }), git).ok).toBe(true);
       expect(appendAutoDecision(project, 's1', entry({ question: 'two' }), git).ok).toBe(true);
       const lines = fs.readFileSync(logFile(), 'utf-8').split('\n');
       expect(lines[0]).toBe('pre-existing');
       expect(JSON.parse(lines[1] ?? '').question).toBe('one');
       expect(JSON.parse(lines[2] ?? '').question).toBe('two');
       expect(lines[3]).toBe('');
     });
     it('refuses a missing session dir and does not create it', () => {
       const r = appendAutoDecision(project, 'nope', entry(), git);
       expect(codeOf(r)).toBe('AUTO_DECISION_SESSION_NOT_FOUND');
       expect(fs.existsSync(sessionDir('nope'))).toBe(false);
     });
     it('returns AUTO_DECISION_WRITE_FAILED when the log path cannot be appended (EISDIR)', () => {
       fs.mkdirSync(logFile());
       const r = appendAutoDecision(project, 's1', entry(), git);
       expect(codeOf(r)).toBe('AUTO_DECISION_WRITE_FAILED');
       expect(!r.ok && r.error.message).toContain('auto-decisions.jsonl');
     });
     it('returns AUTO_DECISION_WRITE_FAILED on a throwing or partial write', () => {
       const thrown = appendAutoDecision(project, 's1', entry(), {
         ...git,
         appendBytes: () => {
           throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
         },
       });
       expect(codeOf(thrown)).toBe('AUTO_DECISION_WRITE_FAILED');
       const partial = appendAutoDecision(project, 's1', entry(), {
         ...git,
         appendBytes: (_f, data) => data.length - 1,
       });
       expect(codeOf(partial)).toBe('AUTO_DECISION_WRITE_FAILED');
       expect(!partial.ok && partial.error.message).toContain('partial write');
     });
     it('rejects an entry over the line cap as AUTO_DECISION_INVALID without writing', () => {
       const big = entry({ rationale: 'é'.repeat(MAX_AUTO_DECISION_LINE_BYTES) });
       const r = appendAutoDecision(project, 's1', big, git);
       expect(codeOf(r)).toBe('AUTO_DECISION_INVALID');
       expect(fs.existsSync(logFile())).toBe(false);
     });
   });

   describe('readAutoDecisions', () => {
     it('reports an absent log as present:false with no entries', () => {
       const r = readAutoDecisions(project, 's1', git);
       expect(r.ok && { present: r.value.present, n: r.value.entries.length }).toEqual({
         present: false,
         n: 0,
       });
     });
     it('returns valid entries and reports unreadable lines with their 1-based numbers', () => {
       fs.writeFileSync(
         logFile(),
         [JSON.stringify(entry()), 'garbage', '', JSON.stringify(entry({ question: 'b' }))].join(
           '\n'
         ) + '\n'
       );
       const r = readAutoDecisions(project, 's1', git);
       expect(r.ok).toBe(true);
       if (!r.ok) return;
       expect(r.value.present).toBe(true);
       expect(r.value.entries.map((e) => e.question)).toEqual(['Approve plan?', 'b']);
       expect(r.value.invalid.map((i) => i.line)).toEqual([2, 3]);
     });
     it('refuses a missing session dir', () => {
       expect(codeOf(readAutoDecisions(project, 'nope', git))).toBe(
         'AUTO_DECISION_SESSION_NOT_FOUND'
       );
     });
   });

   describe('append-only by construction', () => {
     const src = fs.readFileSync(
       path.join(__dirname, '../../src/autonomy/decision-log.ts'),
       'utf-8'
     );
     it('positive control: the real module was read', () => {
       expect(src).toContain('export function appendAutoDecision');
     });
     it('never rewrites, truncates, renames or deletes, and opens only in append mode', () => {
       expect(src).not.toMatch(
         /writeFileSync|rmSync|unlinkSync|truncate|renameSync|copyFileSync|rmdirSync/
       );
       expect(src.match(/openSync\([^)]*\)/g)).toEqual(["openSync(file, 'a', 0o600)"]);
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/autonomy/decision-log.test.ts`. It fails because the module is missing.
3. Create `packages/core/src/autonomy/decision-log.ts`:

   ```ts
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import type { AutoDecision } from '@harness-engineering/types';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';
   import { resolveProjectRoot, validateOverrideSlug, type AutonomyPathOptions } from './paths';
   import { AutoDecisionInvalidError, parseAutoDecisionLine } from './decision-schema';

   export const AUTO_DECISIONS_FILE = 'auto-decisions.jsonl';
   /** Hard cap on one serialized entry (newline included); one entry is always one write(2). */
   export const MAX_AUTO_DECISION_LINE_BYTES = 16 * 1024;

   export const AUTO_DECISION_SESSION_NOT_FOUND = 'AUTO_DECISION_SESSION_NOT_FOUND';
   export const AUTO_DECISION_WRITE_FAILED = 'AUTO_DECISION_WRITE_FAILED';

   export class AutoDecisionSessionNotFoundError extends Error {
     readonly code = AUTO_DECISION_SESSION_NOT_FOUND;
     constructor(slug: string, dir: string) {
       super(
         `Cannot record an auto-decision for session "${slug}": ${dir} does not exist. The decision ` +
           'log never creates a session; pause and ask the human (fail-safe).'
       );
       this.name = 'AutoDecisionSessionNotFoundError';
     }
   }

   export class AutoDecisionWriteFailedError extends Error {
     readonly code = AUTO_DECISION_WRITE_FAILED;
     constructor(file: string, reason: string) {
       super(
         `Failed to append to ${file}: ${reason}. The decision was NOT recorded; pause instead of ` +
           'auto-proceeding (SC14).'
       );
       this.name = 'AutoDecisionWriteFailedError';
     }
   }

   export interface DecisionLogOptions extends AutonomyPathOptions {
     /** @internal Test seam: append `data` to `file`, returning the bytes written. */
     appendBytes?: (file: string, data: Buffer) => number;
   }

   export interface ReadAutoDecisionsOptions extends AutonomyPathOptions {
     /** Returns undefined when the file does not exist. */
     readFile?: (p: string) => string | undefined;
   }

   export interface AutoDecisionLogRead {
     file: string;
     present: boolean;
     entries: AutoDecision[];
     /** Lines that failed to parse (hand-edited or cut short), 1-based; never counted. */
     invalid: Array<{ line: number; error: string }>;
   }

   function isDirectory(p: string): boolean {
     try {
       return fs.statSync(p).isDirectory();
     } catch {
       return false;
     }
   }

   /** `<project root>/.harness/sessions/<slug>`: the resolveSessionDir layout, per worktree. */
   function sessionDir(
     projectPath: string,
     slug: string,
     opts: AutonomyPathOptions
   ): Result<string, Error> {
     const valid = validateOverrideSlug(slug);
     if (!valid.ok) return Err(new AutoDecisionInvalidError(valid.error.message, ['session']));
     return Ok(path.join(resolveProjectRoot(projectPath, opts), '.harness', 'sessions', slug));
   }

   export function autoDecisionLogPath(
     projectPath: string,
     slug: string,
     opts: AutonomyPathOptions = {}
   ): Result<string, Error> {
     const dir = sessionDir(projectPath, slug, opts);
     return dir.ok ? Ok(path.join(dir.value, AUTO_DECISIONS_FILE)) : dir;
   }

   function defaultAppendBytes(file: string, data: Buffer): number {
     const fd = fs.openSync(file, 'a', 0o600);
     try {
       return fs.writeSync(fd, data, 0, data.length);
     } finally {
       fs.closeSync(fd);
     }
   }

   /**
    * Append one entry as one line. Append-only: the file is opened only in append mode and this
    * module never rewrites or deletes it. The whole line is a single write(2) on an O_APPEND
    * descriptor, so concurrent writers never interleave partial lines. The entry is NOT validated
    * here; recordAutoDecision is the public path (validate, authorize, stamp, then append).
    */
   export function appendAutoDecision(
     projectPath: string,
     slug: string,
     entry: AutoDecision,
     opts: DecisionLogOptions = {}
   ): Result<string, Error> {
     const dir = sessionDir(projectPath, slug, opts);
     if (!dir.ok) return dir;
     if (!isDirectory(dir.value)) return Err(new AutoDecisionSessionNotFoundError(slug, dir.value));
     const file = path.join(dir.value, AUTO_DECISIONS_FILE);
     const data = Buffer.from(`${JSON.stringify(entry)}\n`, 'utf-8');
     if (data.length > MAX_AUTO_DECISION_LINE_BYTES) {
       return Err(
         new AutoDecisionInvalidError(
           `entry serializes to ${data.length} bytes; the limit is ${MAX_AUTO_DECISION_LINE_BYTES}. Shorten question or rationale.`,
           ['entry']
         )
       );
     }
     try {
       const written = (opts.appendBytes ?? defaultAppendBytes)(file, data);
       if (written !== data.length) {
         return Err(
           new AutoDecisionWriteFailedError(
             file,
             `partial write (${written} of ${data.length} bytes)`
           )
         );
       }
     } catch (err) {
       return Err(
         new AutoDecisionWriteFailedError(file, err instanceof Error ? err.message : String(err))
       );
     }
     return Ok(file);
   }

   function defaultReadFile(p: string): string | undefined {
     try {
       return fs.readFileSync(p, 'utf-8');
     } catch (err) {
       if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
       throw err;
     }
   }

   /** Read the log back. Unreadable lines are reported, never silently dropped or counted. */
   export function readAutoDecisions(
     projectPath: string,
     slug: string,
     opts: ReadAutoDecisionsOptions = {}
   ): Result<AutoDecisionLogRead, Error> {
     const dir = sessionDir(projectPath, slug, opts);
     if (!dir.ok) return dir;
     if (!isDirectory(dir.value)) return Err(new AutoDecisionSessionNotFoundError(slug, dir.value));
     const file = path.join(dir.value, AUTO_DECISIONS_FILE);
     let raw: string | undefined;
     try {
       raw = (opts.readFile ?? defaultReadFile)(file);
     } catch (err) {
       return Err(
         new Error(`Cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`)
       );
     }
     if (raw === undefined) return Ok({ file, present: false, entries: [], invalid: [] });
     const lines = raw.split('\n');
     if (lines[lines.length - 1] === '') lines.pop();
     const entries: AutoDecision[] = [];
     const invalid: AutoDecisionLogRead['invalid'] = [];
     lines.forEach((line, i) => {
       if (line.trim() === '') {
         invalid.push({ line: i + 1, error: 'blank line' });
         return;
       }
       const parsed = parseAutoDecisionLine(line);
       if (parsed.ok) entries.push(parsed.value);
       else invalid.push({ line: i + 1, error: parsed.error.message });
     });
     return Ok({ file, present: true, entries, invalid });
   }
   ```

4. Re-run the test. All pass.
5. Mutation probe: change `openSync(file, 'a', 0o600)` to `openSync(file, 'w', 0o600)`. Both "appends one line per call…" and the source-scan case FAIL. Restore and confirm PASS.
6. Run `harness validate` (496) and `node packages/cli/dist/bin/harness.js check-deps` (exit 0). If the dependency-depth arch gate trips at commit, keep `decision-log.ts` importing only `paths`, `decision-schema` and `shared/result`. Do **not** update the baseline.
7. Commit: `feat(core): add the append-only auto-decisions.jsonl writer and reader`

### Task 6: Cross-process append concurrency proof

**Depends on:** Task 5 | **Files:** `packages/core/tests/autonomy/decision-log-worker.mts`, `packages/core/tests/autonomy/decision-log-concurrency.test.ts` | **Owns:** `packages/core/tests/autonomy/decision-log-*.{mts,test.ts}`

1. Create `packages/core/tests/autonomy/decision-log-worker.mts`:

   ```ts
   // Spawned as a separate OS process by decision-log-concurrency.test.ts.
   // Args: <projectDir> <slug> <writer> <count>. Core is CommonJS; under tsx the module is
   // exposed via the default binding (see tests/state/event-sourcing/concurrency-worker.mts).
   import logModule from '../../src/autonomy/decision-log.js';

   const { appendAutoDecision } = logModule;
   const [, , projectDir, slug, writer, countStr] = process.argv;
   const count = Number(countStr);
   // > 4 KiB per line (above PIPE_BUF), still under every field cap.
   const question = 'q'.repeat(1500);
   const pad = 'r'.repeat(3900);

   for (let i = 0; i < count; i++) {
     const r = appendAutoDecision(
       projectDir as string,
       slug as string,
       {
         ts: new Date().toISOString(),
         skill: 'harness-planning',
         phase: writer as string,
         pauseClass: 'ceremony',
         question: `${question} ${i}`,
         options: ['approve'],
         chosen: 'approve',
         rationale: `${writer}:${i}:${pad}`.slice(0, 4000),
         autonomySource: 'user-config',
       },
       { gitToplevel: () => undefined, gitCommonDir: () => undefined }
     );
     if (!r.ok) {
       console.error(String(r.error));
       process.exit(1);
     }
   }
   process.exit(0);
   ```

2. Create `packages/core/tests/autonomy/decision-log-concurrency.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { fileURLToPath } from 'node:url';
   import { spawn } from 'node:child_process';
   import { readAutoDecisions } from '../../src/autonomy/decision-log';

   const WORKER = fileURLToPath(new URL('./decision-log-worker.mts', import.meta.url));

   function runWorker(project: string, writer: string, count: number): Promise<void> {
     return new Promise((resolve, reject) => {
       // process.execPath + --import tsx: the .bin/tsx shim is not spawnable on Windows.
       const child = spawn(
         process.execPath,
         ['--import', 'tsx', WORKER, project, 's1', writer, String(count)],
         { stdio: ['ignore', 'ignore', 'inherit'] }
       );
       child.on('exit', (code) =>
         code === 0 ? resolve() : reject(new Error(`worker ${writer} exited ${code}`))
       );
       child.on('error', reject);
     });
   }

   let project: string;
   beforeEach(() => {
     project = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-dlog-conc-'));
     fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
   });
   afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

   describe('concurrent appends never interleave partial lines', () => {
     it('4 processes x 40 entries > 4 KiB each: 160 lines, all parse, each (writer, i) once', async () => {
       const N = 4;
       const K = 40;
       const writers = Array.from({ length: N }, (_, i) => `w${i}`);
       await Promise.all(writers.map((w) => runWorker(project, w, K)));
       const r = readAutoDecisions(project, 's1', {
         gitToplevel: () => undefined,
         gitCommonDir: () => undefined,
       });
       expect(r.ok).toBe(true);
       if (!r.ok) return;
       expect(r.value.invalid).toEqual([]);
       expect(r.value.entries).toHaveLength(N * K);
       // positive control: lines really exceed PIPE_BUF
       const bytes = fs.statSync(r.value.file).size / (N * K);
       expect(bytes).toBeGreaterThan(4096);
       const keys = new Set(
         r.value.entries.map((e) => e.rationale.split(':').slice(0, 2).join(':'))
       );
       expect(keys.size).toBe(N * K);
     }, 120_000);
   });
   ```

3. Run `cd packages/core && npx vitest run tests/autonomy/decision-log-concurrency.test.ts`. It passes. (The test is the proof here; there is no red phase because Task 5's writer already exists.) If it fails with interleaved lines, stop and apply the lock fallback from Uncertainties. Record that as a deviation.
4. Positive-control probe: in a scratch copy of the worker, split the write into two `appendBytes` calls (first half, then the rest) and run the test against it. `invalid` is non-empty, which shows the test can detect interleaving. Discard the scratch copy.
5. Run `harness validate` (496).
6. Commit: `test(core): prove cross-process auto-decision appends never interleave`

### Task 7: `recordAutoDecision`: validate, authorize, stamp, append

[checkpoint:decision] Before step 3, confirm the **authorization gate** (Uncertainties, first item). Default if unanswered: **A — enforce** (recommended, confidence medium). Option B removes `authorizationError` and the four tests marked `(gate)`.

**Depends on:** Task 5 | **Files:** `packages/core/src/autonomy/record.ts`, `packages/core/tests/autonomy/record.test.ts` | **Owns:** `packages/core/src/autonomy/record.ts`

1. Create `packages/core/tests/autonomy/record.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { recordAutoDecision } from '../../src/autonomy/record';
   import { writeSessionOverride } from '../../src/autonomy/override-store';
   import { writeLoweringOverride } from '../../src/autonomy/lower-only';

   let tmp: string;
   let home: string;
   let project: string;
   const NOW = '2026-11-13T12:00:00.000Z';
   const ceremony = {
     skill: 'harness-planning',
     phase: 'VALIDATE',
     pauseClass: 'ceremony',
     question: 'Approve plan?',
     options: ['approve'],
     chosen: 'approve',
     rationale: 'all truths traced',
   };
   const judgment = (audit: Record<string, unknown>) => ({
     skill: 'harness-brainstorming',
     phase: 'EVALUATE',
     pauseClass: 'judgment',
     question: 'Which approach?',
     options: ['A', 'B'],
     chosen: 'A',
     rationale: 'r',
     audit,
   });
   const opts = () => ({
     homeDir: home,
     env: {},
     now: () => new Date(NOW),
     gitToplevel: () => undefined,
     gitCommonDir: () => undefined,
   });
   const logFile = () => path.join(project, '.harness', 'sessions', 's1', 'auto-decisions.jsonl');
   const lines = () =>
     fs.existsSync(logFile()) ? fs.readFileSync(logFile(), 'utf-8').trim().split('\n') : [];
   const userConfig = (autonomy: unknown) => {
     fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
     fs.writeFileSync(path.join(home, '.harness', 'config.json'), JSON.stringify({ autonomy }));
   };
   const err = (r: ReturnType<typeof recordAutoDecision>) =>
     r.ok
       ? null
       : {
           code: (r.error as { code?: string }).code,
           fields: (r.error as { fields?: string[] }).fields,
         };

   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-record-'));
     home = path.join(tmp, 'home');
     project = path.join(tmp, 'project');
     fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
   });
   afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

   describe('recordAutoDecision', () => {
     it('stamps ts from the clock and autonomySource from the resolver (user config)', () => {
       userConfig({ level: 'trusted' });
       const r = recordAutoDecision(project, 's1', ceremony, opts());
       expect(r.ok && { ts: r.value.ts, src: r.value.autonomySource }).toEqual({
         ts: NOW,
         src: 'user-config',
       });
       expect(lines()).toHaveLength(1);
       expect(JSON.parse(lines()[0] ?? '')).toEqual(r.ok ? r.value : null);
     });
     it('stamps "session" when a session override supplies trusted', () => {
       expect(
         writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { ...opts() }).ok
       ).toBe(true);
       const r = recordAutoDecision(
         project,
         's1',
         judgment({ status: 'agreed', blindPick: 'A' }),
         opts()
       );
       expect(r.ok && r.value.autonomySource).toBe('session');
     });
     it('rejects a caller-supplied autonomySource or ts and writes nothing (anti-spoof)', () => {
       userConfig({ level: 'trusted' });
       expect(
         err(recordAutoDecision(project, 's1', { ...ceremony, autonomySource: 'flag' }, opts()))
       ).toEqual({ code: 'AUTO_DECISION_INVALID', fields: ['autonomySource'] });
       expect(err(recordAutoDecision(project, 's1', { ...ceremony, ts: NOW }, opts()))?.code).toBe(
         'AUTO_DECISION_INVALID'
       );
       expect(lines()).toEqual([]);
       expect(recordAutoDecision(project, 's1', ceremony, opts()).ok).toBe(true); // positive control
     });
     it.each(['../x', 'CON', ' s1', 7])(
       'rejects session %j via the shared slug rule',
       (session) => {
         userConfig({ level: 'trusted' });
         expect(err(recordAutoDecision(project, session, ceremony, opts()))).toEqual({
           code: 'AUTO_DECISION_INVALID',
           fields: ['session'],
         });
       }
     );
     it('refuses a session whose dir does not exist', () => {
       userConfig({ level: 'trusted' });
       expect(err(recordAutoDecision(project, 'gone', ceremony, opts()))?.code).toBe(
         'AUTO_DECISION_SESSION_NOT_FOUND'
       );
     });
     it('returns AUTO_DECISION_WRITE_FAILED when the append fails, and nothing claims success', () => {
       userConfig({ level: 'trusted' });
       fs.mkdirSync(logFile());
       expect(err(recordAutoDecision(project, 's1', ceremony, opts()))?.code).toBe(
         'AUTO_DECISION_WRITE_FAILED'
       );
     });
     it('(gate) refuses a non-escalated entry while autonomy is supervised', () => {
       const r = recordAutoDecision(project, 's1', ceremony, opts());
       expect(err(r)?.code).toBe('AUTO_DECISION_NOT_AUTHORIZED');
       expect(lines()).toEqual([]);
     });
     it('(gate) accepts an escalated entry in any mode: it records the human choice', () => {
       const r = recordAutoDecision(
         project,
         's1',
         judgment({ status: 'escalated', blindPick: 'B', humanChoice: 'A' }),
         opts()
       );
       expect(r.ok && r.value.autonomySource).toBe('default');
     });
     it('(gate) refuses audit "off" while audit resolves on, accepts it when audit is off', () => {
       userConfig({ level: 'trusted' });
       expect(
         err(recordAutoDecision(project, 's1', judgment({ status: 'off' }), opts()))?.code
       ).toBe('AUTO_DECISION_NOT_AUTHORIZED');
       userConfig({ level: 'trusted', audit: { trusted: false } });
       expect(recordAutoDecision(project, 's1', judgment({ status: 'off' }), opts()).ok).toBe(true);
     });
     it('(gate) a mid-session lowering refuses the next entry; earlier lines are unchanged (SC7)', () => {
       userConfig({ level: 'trusted' });
       expect(recordAutoDecision(project, 's1', ceremony, opts()).ok).toBe(true);
       const before = fs.readFileSync(logFile(), 'utf-8');
       expect(writeLoweringOverride(project, 's1', { level: 'supervised' }, { ...opts() }).ok).toBe(
         true
       );
       expect(err(recordAutoDecision(project, 's1', ceremony, opts()))?.code).toBe(
         'AUTO_DECISION_NOT_AUTHORIZED'
       );
       expect(fs.readFileSync(logFile(), 'utf-8')).toBe(before);
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/autonomy/record.test.ts`. It fails because the module is missing.
3. Create `packages/core/src/autonomy/record.ts`:

   ```ts
   import type {
     AutoDecision,
     AutoDecisionInput,
     ResolvedAutonomy,
   } from '@harness-engineering/types';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';
   import { validateOverrideSlug } from './paths';
   import { AutoDecisionInvalidError, validateAutoDecisionInput } from './decision-schema';
   import { appendAutoDecision, type DecisionLogOptions } from './decision-log';
   import { resolveAutonomyForSession, type ResolveForSessionInput } from './session';

   export const AUTO_DECISION_NOT_AUTHORIZED = 'AUTO_DECISION_NOT_AUTHORIZED';

   export class AutoDecisionNotAuthorizedError extends Error {
     readonly code = AUTO_DECISION_NOT_AUTHORIZED;
     constructor(message: string) {
       super(`${message} Pause and ask the human (fail-safe).`);
       this.name = 'AutoDecisionNotAuthorizedError';
     }
   }

   /** No invocation flag: a flag relayed by an agent is agent-asserted (Phase 1 deferral to Phase 3). */
   export type RecordAutoDecisionOptions = DecisionLogOptions &
     Omit<ResolveForSessionInput, 'projectPath' | 'session' | 'flag'>;

   /**
    * The log records only what the resolved autonomy permitted. Anything else is refused, and a
    * refused log entry makes the skill pause (fail-safe rule), so on the sanctioned path an agent
    * cannot auto-proceed while supervised or skip an audit that is on.
    */
   export function authorizationError(
     d: AutoDecisionInput,
     r: ResolvedAutonomy
   ): AutoDecisionNotAuthorizedError | null {
     if (d.audit?.status === 'escalated') return null; // the human made this choice
     if (r.level !== 'trusted') {
       return new AutoDecisionNotAuthorizedError(
         `Autonomy resolves to ${r.level} (source: ${r.source.level}); only trusted mode may auto-take a ${d.pauseClass} decision.`
       );
     }
     if (d.audit?.status === 'off' && r.audit) {
       return new AutoDecisionNotAuthorizedError(
         `Audit is on (source: ${r.source.audit}); a judgment cannot be recorded with audit "off". Run the self-audit, or record "unavailable" if no subagent can be spawned (D11).`
       );
     }
     return null;
   }

   /**
    * The only public write path for auto-decisions.jsonl. Order: validate the slug (shared rule),
    * validate the entry (strict; caller ts/autonomySource rejected), resolve autonomy for the
    * session, authorize, stamp ts and autonomySource, append one line. Never throws.
    */
   export function recordAutoDecision(
     projectPath: string,
     session: unknown,
     input: unknown,
     opts: RecordAutoDecisionOptions = {}
   ): Result<AutoDecision, Error> {
     try {
       const slug = validateOverrideSlug(session as string);
       if (!slug.ok) return Err(new AutoDecisionInvalidError(slug.error.message, ['session']));
       const valid = validateAutoDecisionInput(input);
       if (!valid.ok) return valid;
       const resolved = resolveAutonomyForSession({ ...opts, projectPath, session: slug.value });
       const denied = authorizationError(valid.value, resolved);
       if (denied) return Err(denied);
       const entry: AutoDecision = {
         ts: (opts.now ?? (() => new Date()))().toISOString(),
         ...valid.value,
         autonomySource: resolved.source.level,
       };
       const appended = appendAutoDecision(projectPath, slug.value, entry, opts);
       return appended.ok ? Ok(entry) : appended;
     } catch (err) {
       return Err(err instanceof Error ? err : new Error(String(err)));
     }
   }
   ```

   Note: `validateOverrideSlug` is typed `(slug: string)` and wraps `sessionSlugError(unknown)`, so the cast is safe. A non-string slug returns `Session slug must be a string`.

4. Re-run the test. All pass.
5. Mutation probes:
   - Replace `autonomySource: resolved.source.level` with `autonomySource: 'flag'`. The first two cases FAIL.
   - Delete `if (denied) return Err(denied);`. All four `(gate)` refusal cases FAIL.

   Restore after each and confirm PASS.

6. Run `harness validate` (496) and `check-deps` (exit 0).
7. Commit: `feat(core): add recordAutoDecision (validate, authorize, stamp, append)`. In the body, state the checkpoint outcome (A or B).

### Task 8: Summary and pure end-of-run renderer

**Depends on:** Task 4 | **Files:** `packages/core/src/autonomy/summary.ts`, `packages/core/tests/autonomy/summary.test.ts` | **Owns:** `packages/core/src/autonomy/summary.ts`

1. Create `packages/core/tests/autonomy/summary.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import type { AutoDecision } from '@harness-engineering/types';
   import { renderAutoDecisionSummary, summarizeAutoDecisions } from '../../src/autonomy/summary';

   const base = {
     ts: '2026-11-13T00:00:00.000Z',
     skill: 'harness-planning',
     phase: 'DECOMPOSE',
     question: 'Which approach?',
     options: ['A', 'B'],
     chosen: 'A',
     rationale: 'r',
     autonomySource: 'user-config' as const,
   };
   const ceremony = (): AutoDecision => ({
     ...base,
     pauseClass: 'ceremony',
     options: ['approve'],
     chosen: 'approve',
   });
   const judgment = (audit: AutoDecision['audit']): AutoDecision => ({
     ...base,
     pauseClass: 'judgment',
     ...(audit !== undefined && { audit }),
   });
   const fixture: AutoDecision[] = [
     ceremony(),
     ceremony(),
     judgment({ status: 'agreed', blindPick: 'A' }),
     judgment({ status: 'agreed', blindPick: 'A' }),
     judgment({ status: 'escalated', blindPick: 'B', humanChoice: 'A' }),
     judgment({ status: 'unavailable' }),
     judgment({ status: 'off' }),
   ];

   describe('summarizeAutoDecisions', () => {
     it('M counts every judgment including unavailable/off; N counts agreed + escalated (SC9)', () => {
       expect(summarizeAutoDecisions(fixture)).toEqual({
         total: 7,
         byClass: { ceremony: 2, judgment: 5 },
         judgments: 5,
         audited: 3,
         agreed: 2,
         escalations: 1,
         unavailable: 1,
         off: 1,
         agreementRate: 2 / 3,
       });
     });
     it('agreement rate is null, not 1, when nothing was audited', () => {
       expect(
         summarizeAutoDecisions([judgment({ status: 'unavailable' })]).agreementRate
       ).toBeNull();
     });
   });

   describe('renderAutoDecisionSummary (SC11 rendering half)', () => {
     it('returns [] when there is nothing to report, so terminal skills print nothing', () => {
       expect(renderAutoDecisionSummary([])).toEqual([]);
     });
     it('renders counts by class, audited N/M, agreement rate and escalations', () => {
       expect(renderAutoDecisionSummary(fixture, { session: 's1' })).toEqual([
         'Auto-decisions (session s1): 7',
         '  by class: ceremony 2, judgment 5',
         '  audited 3/5 (unavailable 1, off 1)',
         '  agreement rate: 67% (2/3)',
         '  escalations: 1',
       ]);
     });
     it('never presents an unaudited run as agreed', () => {
       expect(
         renderAutoDecisionSummary([
           judgment({ status: 'off' }),
           judgment({ status: 'unavailable' }),
         ])
       ).toContain('  agreement rate: n/a (nothing audited)');
     });
     it('reports unreadable lines even when no entry parsed', () => {
       const out = renderAutoDecisionSummary([], { invalidLines: 2 });
       expect(out[0]).toBe('Auto-decisions: 0');
       expect(out.at(-1)).toMatch(/^ {2}WARNING: 2 unreadable log line\(s\)/);
     });
     it('lists judgment decisions on one sanitized line each', () => {
       const j = {
         ...judgment({ status: 'agreed', blindPick: 'A' }),
         question: 'Which\napproach?‮',
       };
       expect(renderAutoDecisionSummary([j], { includeJudgments: true }).at(-1)).toBe(
         '  - [agreed] harness-planning/DECOMPOSE: Which approach? -> A'
       );
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/autonomy/summary.test.ts`. It fails because the module is missing.
3. Create `packages/core/src/autonomy/summary.ts`:

   ```ts
   import type { AutoDecision, AutoDecisionSummary } from '@harness-engineering/types';
   import { isUnsafeLogChar } from './decision-schema';

   /** Pure. N = agreed + escalated (the audit ran); M = every judgment decision (SC9). */
   export function summarizeAutoDecisions(entries: readonly AutoDecision[]): AutoDecisionSummary {
     const s: AutoDecisionSummary = {
       total: entries.length,
       byClass: { ceremony: 0, judgment: 0 },
       judgments: 0,
       audited: 0,
       agreed: 0,
       escalations: 0,
       unavailable: 0,
       off: 0,
       agreementRate: null,
     };
     for (const e of entries) {
       s.byClass[e.pauseClass] += 1;
       if (e.pauseClass !== 'judgment') continue;
       s.judgments += 1;
       const status = e.audit?.status;
       if (status === 'agreed') s.agreed += 1;
       else if (status === 'escalated') s.escalations += 1;
       else if (status === 'unavailable') s.unavailable += 1;
       else s.off += 1; // 'off' (or absent on a hand-edited line): never counted as audited
     }
     s.audited = s.agreed + s.escalations;
     s.agreementRate = s.audited === 0 ? null : s.agreed / s.audited;
     return s;
   }

   export interface RenderAutoDecisionOptions {
     session?: string;
     /** Unreadable log lines skipped by the reader; reported, never counted. */
     invalidLines?: number;
     /** Append one line per judgment decision (harness autonomy log). */
     includeJudgments?: boolean;
   }

   /** One terminal line: control, newline and bidi characters become spaces. */
   function oneLine(s: string): string {
     let out = '';
     for (const ch of s) out += isUnsafeLogChar(ch.codePointAt(0) ?? 0, false) ? ' ' : ch;
     return out.replace(/ {2,}/g, ' ').trim();
   }

   /**
    * End-of-run summary (SC11). Pure: terminal skills (Phase 3) print the returned lines. Returns []
    * when there is nothing to report, so a session with no auto-decisions prints nothing.
    */
   export function renderAutoDecisionSummary(
     entries: readonly AutoDecision[],
     opts: RenderAutoDecisionOptions = {}
   ): string[] {
     const invalid = opts.invalidLines ?? 0;
     if (entries.length === 0 && invalid === 0) return [];
     const s = summarizeAutoDecisions(entries);
     const rate =
       s.agreementRate === null
         ? 'n/a (nothing audited)'
         : `${Math.round(s.agreementRate * 100)}% (${s.agreed}/${s.audited})`;
     const lines = [
       `Auto-decisions${opts.session !== undefined ? ` (session ${oneLine(opts.session)})` : ''}: ${s.total}`,
       `  by class: ceremony ${s.byClass.ceremony}, judgment ${s.byClass.judgment}`,
       `  audited ${s.audited}/${s.judgments} (unavailable ${s.unavailable}, off ${s.off})`,
       `  agreement rate: ${rate}`,
       `  escalations: ${s.escalations}`,
     ];
     if (invalid > 0) {
       lines.push(
         `  WARNING: ${invalid} unreadable log line(s) were skipped and are not counted; the log may have been edited or a write was cut short.`
       );
     }
     if (opts.includeJudgments) {
       for (const e of entries) {
         if (e.pauseClass !== 'judgment') continue;
         lines.push(
           `  - [${e.audit?.status ?? 'off'}] ${oneLine(e.skill)}/${oneLine(e.phase)}: ${oneLine(e.question)} -> ${oneLine(e.chosen)}`
         );
       }
     }
     return lines;
   }
   ```

   The renderer warning comes after the counts and before the judgment lines. In the "reports unreadable lines" test there are no judgment lines, so `out.at(-1)` is the warning.

4. Re-run the test. All pass.
5. Mutation probe: change `${s.audited}/${s.judgments}` to `${s.audited}/${s.audited}`. The SC9 render case FAILS. Restore and confirm PASS.
6. Run `harness validate` (496).
7. Commit: `feat(core): add the auto-decision summary and pure end-of-run renderer`

### Task 9: Export the decision-log API and pin the public surface

**Depends on:** Tasks 6, 7, 8 | **Files:** `packages/core/src/autonomy/index.ts`, `packages/core/tests/autonomy/decision-log-surface.test.ts`, `packages/core/tests/autonomy/resolve-isolation.test.ts`

1. Create `packages/core/tests/autonomy/decision-log-surface.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as autonomy from '../../src/autonomy/index';

   describe('auto-decision public surface is append-only', () => {
     const names = Object.keys(autonomy);
     it('positive control: the write, read and render entry points are exported', () => {
       for (const n of [
         'recordAutoDecision',
         'readAutoDecisions',
         'renderAutoDecisionSummary',
         'summarizeAutoDecisions',
         'validateAutoDecisionInput',
         'AutoDecisionSchema',
       ])
         expect(names).toContain(n);
     });
     it('exports no raw appender and nothing that rewrites, truncates or deletes the log', () => {
       expect(names).not.toContain('appendAutoDecision');
       expect(
         names.filter((n) =>
           /(write|delete|remove|clear|truncate|rewrite|update|reset)\w*AutoDecision/i.test(n)
         )
       ).toEqual([]);
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/autonomy/decision-log-surface.test.ts`. It fails because the names are not exported.
3. Append to `packages/core/src/autonomy/index.ts`:

   ```ts
   export {
     AUTO_DECISION_LIMITS,
     AUTO_DECISION_INVALID,
     AutoDecisionInvalidError,
     AutoDecisionAuditSchema,
     AutoDecisionInputSchema,
     AutoDecisionSchema,
     validateAutoDecisionInput,
     parseAutoDecisionLine,
   } from './decision-schema';
   // appendAutoDecision is deliberately NOT exported: recordAutoDecision is the only write path.
   export {
     AUTO_DECISIONS_FILE,
     MAX_AUTO_DECISION_LINE_BYTES,
     AUTO_DECISION_SESSION_NOT_FOUND,
     AUTO_DECISION_WRITE_FAILED,
     AutoDecisionSessionNotFoundError,
     AutoDecisionWriteFailedError,
     autoDecisionLogPath,
     readAutoDecisions,
   } from './decision-log';
   export type { AutoDecisionLogRead, ReadAutoDecisionsOptions } from './decision-log';
   export {
     recordAutoDecision,
     AUTO_DECISION_NOT_AUTHORIZED,
     AutoDecisionNotAuthorizedError,
   } from './record';
   export type { RecordAutoDecisionOptions } from './record';
   export { summarizeAutoDecisions, renderAutoDecisionSummary } from './summary';
   export type { RenderAutoDecisionOptions } from './summary';
   ```

4. In `packages/core/tests/autonomy/resolve-isolation.test.ts`, add `'decision-log.ts'`, `'decision-schema.ts'`, `'record.ts'` and `'summary.ts'` to the `arrayContaining([...])` list in "the scan covers every known autonomy module".
5. Run `cd packages/core && npx vitest run tests/autonomy` (all pass) and `pnpm run generate:barrels:check` (clean; `export * from './autonomy'` already carries the names). Grep for collisions: `grep -rn "export .*AutoDecision" packages/core/src | grep -v autonomy/` returns nothing.
6. Build: `npx turbo build --filter=@harness-engineering/cli...` (builds types, core and cli dist). Then run `harness validate` (496) and `check-deps` (exit 0).
7. Commit: `feat(core): export the auto-decision API; pin an append-only public surface`

### Task 10: `record_auto_decision` MCP handler

**Depends on:** Task 9 | **Files:** `packages/cli/src/mcp/tools/auto-decision.ts`, `packages/cli/tests/mcp/tools/auto-decision.test.ts` | **Owns:** `packages/cli/src/mcp/tools/auto-decision.ts`

1. Create `packages/cli/tests/mcp/tools/auto-decision.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import {
     recordAutoDecisionDefinition,
     handleRecordAutoDecision,
   } from '../../../src/mcp/tools/auto-decision';

   let tmp: string;
   let home: string;
   let project: string;
   const NOW = '2026-11-13T12:00:00.000Z';
   const ceremony = {
     skill: 'harness-planning',
     phase: 'VALIDATE',
     pauseClass: 'ceremony',
     question: 'Approve plan?',
     options: ['approve'],
     chosen: 'approve',
     rationale: 'all truths traced',
   };
   const call = (args: Record<string, unknown>) =>
     handleRecordAutoDecision(
       { path: project, session: 's1', ...ceremony, ...args },
       { homeDir: home, env: {}, now: () => new Date(NOW) }
     );
   const body = (r: Awaited<ReturnType<typeof call>>) => JSON.parse(r.content[0]?.text ?? '{}');
   const logFile = () => path.join(project, '.harness', 'sessions', 's1', 'auto-decisions.jsonl');
   const trusted = () => {
     fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
     fs.writeFileSync(
       path.join(home, '.harness', 'config.json'),
       JSON.stringify({ autonomy: { level: 'trusted' } })
     );
   };

   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-auto-decision-'));
     home = path.join(tmp, 'home');
     project = path.join(tmp, 'project');
     fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
   });
   afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

   describe('record_auto_decision definition', () => {
     it('is named, requires the entry fields, and offers only ceremony/judgment', () => {
       expect(recordAutoDecisionDefinition.name).toBe('record_auto_decision');
       const schema = recordAutoDecisionDefinition.inputSchema as {
         required: string[];
         properties: Record<string, { enum?: string[] }>;
       };
       expect(schema.required).toEqual([
         'path',
         'session',
         'skill',
         'phase',
         'pauseClass',
         'question',
         'options',
         'chosen',
         'rationale',
       ]);
       expect(schema.properties.pauseClass?.enum).toEqual(['ceremony', 'judgment']);
       expect(schema.properties.autonomySource).toBeUndefined();
       expect(schema.properties.ts).toBeUndefined();
     });
   });

   describe('record_auto_decision handler', () => {
     it('appends one stamped line and returns recorded:true', async () => {
       trusted();
       const r = await call({});
       expect(r.isError).toBeFalsy();
       expect(body(r)).toMatchObject({
         recorded: true,
         entry: { ts: NOW, autonomySource: 'user-config' },
       });
       expect(fs.readFileSync(logFile(), 'utf-8').trim().split('\n')).toHaveLength(1);
     });
     it('rejects a spoofed autonomySource with a structured error and writes nothing', async () => {
       trusted();
       const r = await call({ autonomySource: 'flag' });
       expect(r.isError).toBe(true);
       expect(body(r)).toMatchObject({
         recorded: false,
         error: 'AUTO_DECISION_INVALID',
         field: 'autonomySource',
         action: 'pause',
       });
       expect(fs.existsSync(logFile())).toBe(false);
     });
     it('rejects mistyped args (MCP args arrive unvalidated)', async () => {
       trusted();
       expect(body(await call({ options: 'approve' }))).toMatchObject({
         error: 'AUTO_DECISION_INVALID',
         field: 'options',
       });
     });
     it('refuses while supervised (fail-safe: the skill pauses)', async () => {
       expect(body(await call({}))).toMatchObject({
         recorded: false,
         error: 'AUTO_DECISION_NOT_AUTHORIZED',
         action: 'pause',
       });
     });
     it('makes a failed write unambiguous (SC14)', async () => {
       trusted();
       fs.mkdirSync(logFile());
       const r = await call({});
       expect(r.isError).toBe(true);
       expect(body(r)).toMatchObject({
         recorded: false,
         error: 'AUTO_DECISION_WRITE_FAILED',
         action: 'pause',
       });
     });
   });
   ```

2. Run `cd packages/cli && npx vitest run tests/mcp/tools/auto-decision.test.ts`. It fails because the module is missing.
3. Create `packages/cli/src/mcp/tools/auto-decision.ts`:

   ```ts
   import { sanitizePath } from '../utils/sanitize-path.js';
   import { type McpResponse, mcpError } from '../utils.js';
   import type { ToolDefinition } from '../tool-types.js';

   /**
    * Trusted Autonomy Mode, Phase 2: record_auto_decision (D6). Appends one entry to
    * .harness/sessions/<session>/auto-decisions.jsonl via core recordAutoDecision, which validates
    * strictly, authorizes against the resolved autonomy, and stamps ts + autonomySource itself.
    */
   export const recordAutoDecisionDefinition: ToolDefinition = {
     name: 'record_auto_decision',
     description:
       'Append an auto-taken decision (trusted autonomy) to .harness/sessions/<session>/auto-decisions.jsonl. ' +
       'Append-only. The server stamps ts and autonomySource and refuses entries the resolved autonomy ' +
       'does not allow (an escalated decision recording the human choice is always accepted). ' +
       'If this returns isError (recorded:false), do NOT auto-proceed: pause and ask the human.',
     inputSchema: {
       type: 'object' as const,
       properties: {
         path: { type: 'string', description: 'Path to project root' },
         session: {
           type: 'string',
           description: 'Session slug; .harness/sessions/<slug>/ must exist',
         },
         skill: {
           type: 'string',
           description: 'Skill at the pause point, e.g. "harness-planning"',
         },
         phase: { type: 'string', description: 'Skill phase, e.g. "VALIDATE"' },
         pauseClass: {
           type: 'string',
           enum: ['ceremony', 'judgment'],
           description: 'irreversible and gate pauses never auto-proceed and cannot be recorded',
         },
         question: { type: 'string', description: 'The question the pause would have asked' },
         options: {
           type: 'array',
           items: { type: 'string' },
           description: 'Distinct options offered',
         },
         chosen: { type: 'string', description: 'One of options (escalated: the human choice)' },
         rationale: { type: 'string', description: 'Why this option was taken' },
         audit: {
           type: 'object',
           description:
             'Required for judgment, omitted for ceremony. agreed: {status,blindPick(=chosen),objection?{severity:"non-blocking",text}}; ' +
             'escalated: {status,blindPick,objection?,humanChoice(=chosen)}; or {status:"unavailable"|"off"}',
           properties: {
             status: { type: 'string', enum: ['agreed', 'escalated', 'unavailable', 'off'] },
             blindPick: { type: 'string' },
             humanChoice: { type: 'string' },
             objection: {
               type: 'object',
               properties: {
                 severity: { type: 'string', enum: ['blocking', 'non-blocking'] },
                 text: { type: 'string' },
               },
               required: ['severity', 'text'],
             },
           },
           required: ['status'],
         },
       },
       required: [
         'path',
         'session',
         'skill',
         'phase',
         'pauseClass',
         'question',
         'options',
         'chosen',
         'rationale',
       ],
     },
   };

   /** Injected inputs (tests); production uses os.homedir(), the real clock and process.env. */
   export interface RecordAutoDecisionDeps {
     homeDir?: string;
     now?: () => Date;
     env?: NodeJS.ProcessEnv;
   }

   function failure(code: string, message: string, field?: string): McpResponse {
     return mcpError(
       JSON.stringify({
         recorded: false,
         error: code,
         ...(field !== undefined && { field }),
         message,
         action: 'pause',
       })
     );
   }

   export async function handleRecordAutoDecision(
     input: Record<string, unknown>,
     deps: RecordAutoDecisionDeps = {}
   ): Promise<McpResponse> {
     try {
       const core = await import('@harness-engineering/core');
       const { path: rawPath, session, ...decision } = input;
       const projectPath = sanitizePath(String(rawPath));
       const r = core.recordAutoDecision(projectPath, session, decision, {
         env: deps.env ?? process.env,
         ...(deps.homeDir !== undefined && { homeDir: deps.homeDir }),
         ...(deps.now !== undefined && { now: deps.now }),
       });
       if (!r.ok) {
         const err = r.error as Error & { code?: string; fields?: string[] };
         return failure(err.code ?? core.AUTO_DECISION_WRITE_FAILED, err.message, err.fields?.[0]);
       }
       return {
         content: [
           { type: 'text' as const, text: JSON.stringify({ recorded: true, entry: r.value }) },
         ],
       };
     } catch (error) {
       return failure(
         'AUTO_DECISION_WRITE_FAILED',
         `The decision was NOT recorded: ${error instanceof Error ? error.message : String(error)}`
       );
     }
   }
   ```

4. Re-run the test. All pass (it uses core dist from Task 9).
5. Mutation probe: in `failure`, change `recorded: false` to `recorded: true`. Three cases FAIL. Restore and confirm PASS.
6. Run `npx turbo build --filter=@harness-engineering/cli...` and `harness validate` (496).
7. Commit: `feat(cli): add the record_auto_decision MCP handler`

### Task 11: Register `record_auto_decision` (server, sync lists, counts)

**Depends on:** Task 10 | **Files:** `packages/cli/src/mcp/server.ts`, `packages/cli/src/commands/setup-mcp.ts`, `packages/cli/src/mcp/tool-capability-declarations.ts`, `packages/cli/tests/mcp/server.test.ts`, `packages/cli/tests/mcp/server-integration.test.ts`

_This task touches 5 files, which breaks the 3-file rule on purpose. Two sync tests (`setup-mcp.test.ts:424` "ALL_MCP_TOOLS sync" and `mcp-list-capabilities.test.ts:114` coverage) fail on any commit where the registry and these lists disagree. Every edit is a single line._

1. Tests first:
   - `packages/cli/tests/mcp/server.test.ts:14-16`: change `'registers all 115 tools'` to `'registers all 116 tools'` and `toHaveLength(115)` to `toHaveLength(116)`.
   - `packages/cli/tests/mcp/server-integration.test.ts`: after `expect(names).toContain('emit_skill_proposal');` (line 60), add `    // Trusted Autonomy Mode Phase 2 — decision log` and `    expect(names).toContain('record_auto_decision');`. At line 129, change `toHaveLength(115)` to `toHaveLength(116)`.
2. Run `cd packages/cli && npx vitest run tests/mcp/server.test.ts tests/mcp/server-integration.test.ts`. It fails (115 registered).
3. `packages/cli/src/mcp/server.ts`:
   - After the `emitSkillProposalDefinition` import (line 192), add:

     ```ts
     // Trusted Autonomy Mode Phase 2: append-only auto-decision log (D6).
     import {
       recordAutoDecisionDefinition,
       handleRecordAutoDecision,
     } from './tools/auto-decision.js';
     ```

   - In `TOOL_DEFINITIONS`, after `emitSkillProposalDefinition,` (line 402), add `recordAutoDecisionDefinition,`.
   - In `TOOL_HANDLERS`, after `emit_skill_proposal: …` (line 526), add `record_auto_decision: handleRecordAutoDecision as unknown as ToolHandler,`.

4. `packages/cli/src/commands/setup-mcp.ts`: in `ALL_MCP_TOOLS`, after `'emit_skill_proposal',` (line 136), add `  // Trusted Autonomy Mode Phase 2 — append-only auto-decision log` and `  'record_auto_decision',`.
5. `packages/cli/src/mcp/tool-capability-declarations.ts`: after the `emit_skill_proposal` entry (line 131), add `  record_auto_decision: { scopes: ['write'] }, // appends one line to .harness/sessions/<slug>/auto-decisions.jsonl`.
6. Run `cd packages/cli && npx vitest run tests/mcp/server.test.ts tests/mcp/server-integration.test.ts tests/commands/setup-mcp.test.ts tests/commands/mcp-list-capabilities.test.ts`. All pass.
7. Run `npx turbo build --filter=@harness-engineering/cli...` and `harness validate` (496).
8. Commit: `feat(cli): register record_auto_decision (116 tools)`

### Task 12: Put `record_auto_decision` in the standard tier

**Depends on:** Task 11 | **Files:** `packages/cli/src/mcp/tool-tiers.ts`, `packages/cli/tests/mcp/tool-tiers.test.ts`

1. In `packages/cli/tests/mcp/tool-tiers.test.ts`, inside `describe('STANDARD_TOOL_NAMES', …)`, add:

   ```ts
   it('exposes record_auto_decision in standard but not core (spec: tier standard)', () => {
     expect(STANDARD_TOOL_NAMES).toContain('record_auto_decision');
     expect(CORE_TOOL_NAMES).not.toContain('record_auto_decision');
   });
   ```

2. Run `cd packages/cli && npx vitest run tests/mcp/tool-tiers.test.ts`. It fails.
3. In `packages/cli/src/mcp/tool-tiers.ts` `STANDARD_EXTRA`, after `'emit_skill_proposal',`, add:

   ```ts
     // Trusted Autonomy Mode Phase 2 — skills record auto-taken decisions (D6)
     'record_auto_decision',
   ```

4. Re-run the test. It passes. Also run `npx vitest run tests/mcp/context-surface-cov544b.test.ts` (pass).
5. Run `harness validate` (496).
6. Commit: `feat(cli): expose record_auto_decision in the standard MCP tier`

### Task 13: `harness autonomy log` runner and formatter

**Depends on:** Task 9 | **Files:** `packages/cli/src/commands/autonomy/log.ts`, `packages/cli/tests/commands/autonomy-log.test.ts` | **Owns:** `packages/cli/src/commands/autonomy/log.ts`

1. Create `packages/cli/tests/commands/autonomy-log.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { Command } from 'commander';
   import {
     runAutonomyLog,
     formatAutonomyLog,
     createAutonomyLogCommand,
   } from '../../src/commands/autonomy/log';

   let tmp: string;
   let project: string;
   const deps = () => ({ cwd: () => project });
   const base = {
     ts: '2026-11-13T00:00:00.000Z',
     skill: 'harness-planning',
     phase: 'DECOMPOSE',
     question: 'Which approach?',
     options: ['A', 'B'],
     chosen: 'A',
     rationale: 'r',
     autonomySource: 'user-config',
   };
   const ceremony = { ...base, pauseClass: 'ceremony', options: ['approve'], chosen: 'approve' };
   const j = (audit: unknown) => ({ ...base, pauseClass: 'judgment', audit });
   const logFile = () => path.join(project, '.harness', 'sessions', 's1', 'auto-decisions.jsonl');
   const writeLog = (lines: string[]) => fs.writeFileSync(logFile(), lines.join('\n') + '\n');

   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-autonomy-log-'));
     project = path.join(tmp, 'project');
     fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
   });
   afterEach(() => {
     vi.restoreAllMocks();
     process.exitCode = undefined;
     fs.rmSync(tmp, { recursive: true, force: true });
   });

   describe('harness autonomy log', () => {
     it('renders counts, audited N/M with M counting unavailable/off (SC9), and each judgment', () => {
       writeLog(
         [
           ceremony,
           ceremony,
           j({ status: 'agreed', blindPick: 'A' }),
           j({ status: 'agreed', blindPick: 'A' }),
           j({ status: 'escalated', blindPick: 'B', humanChoice: 'A' }),
           j({ status: 'unavailable' }),
           j({ status: 'off' }),
         ].map((e) => JSON.stringify(e))
       );
       const out = runAutonomyLog({ session: 's1' }, deps());
       expect(out.ok).toBe(true);
       if (!out.ok) return;
       const lines = formatAutonomyLog(out.report);
       expect(lines.slice(0, 5)).toEqual([
         'Auto-decisions (session s1): 7',
         '  by class: ceremony 2, judgment 5',
         '  audited 3/5 (unavailable 1, off 1)',
         '  agreement rate: 67% (2/3)',
         '  escalations: 1',
       ]);
       expect(lines.filter((l) => l.startsWith('  - ['))).toHaveLength(5);
     });
     it('distinguishes an absent log from an empty one (a zero is not evidence)', () => {
       const absent = runAutonomyLog({ session: 's1' }, deps());
       expect(absent.ok && formatAutonomyLog(absent.report)[0]).toMatch(/no log file at/);
       fs.writeFileSync(logFile(), '');
       const empty = runAutonomyLog({ session: 's1' }, deps());
       expect(empty.ok && formatAutonomyLog(empty.report)[0]).toMatch(/log is empty/);
     });
     it('warns about unreadable lines and reports them in the report', () => {
       writeLog([JSON.stringify(ceremony), '{tampered']);
       const out = runAutonomyLog({ session: 's1' }, deps());
       expect(out.ok && out.report.invalidLines.map((i) => i.line)).toEqual([2]);
       expect(
         out.ok && formatAutonomyLog(out.report).some((l) => l.includes('WARNING: 1 unreadable'))
       ).toBe(true);
     });
     it('fails for a missing session or an invalid slug', () => {
       expect(runAutonomyLog({ session: 'gone' }, deps()).ok).toBe(false);
       expect(runAutonomyLog({ session: '../x' }, deps()).ok).toBe(false);
     });
     it('emits the report as JSON under the global --json flag', async () => {
       writeLog([JSON.stringify(ceremony)]);
       const log = vi.spyOn(console, 'log').mockImplementation(() => {});
       const program = new Command().option('--json').exitOverride();
       program.addCommand(createAutonomyLogCommand(deps()));
       await program.parseAsync(['node', 'harness', '--json', 'log', '--session', 's1']);
       const parsed = JSON.parse(String(log.mock.calls[0]?.[0]));
       expect(parsed).toMatchObject({
         session: 's1',
         logPresent: true,
         summary: { total: 1, judgments: 0 },
         invalidLines: [],
       });
     });
     it('sets exit code 1 when the session does not exist', async () => {
       vi.spyOn(console, 'error').mockImplementation(() => {});
       const program = new Command().option('--json').exitOverride();
       program.addCommand(createAutonomyLogCommand(deps()));
       await program.parseAsync(['node', 'harness', 'log', '--session', 'gone']);
       expect(process.exitCode).toBe(1);
     });
   });
   ```

2. Run `cd packages/cli && npx vitest run tests/commands/autonomy-log.test.ts`. It fails because the module is missing.
3. Create `packages/cli/src/commands/autonomy/log.ts`:

   ```ts
   import { Command } from 'commander';
   import {
     readAutoDecisions,
     renderAutoDecisionSummary,
     summarizeAutoDecisions,
     type AutoDecision,
     type AutoDecisionSummary,
   } from '@harness-engineering/core';
   import { logger } from '../../output/logger';
   import type { AutonomyCliDeps } from './deps';

   export interface AutonomyLogReport {
     session: string;
     file: string;
     logPresent: boolean;
     summary: AutoDecisionSummary;
     entries: AutoDecision[];
     invalidLines: Array<{ line: number; error: string }>;
   }

   export type AutonomyLogOutcome =
     | { ok: true; report: AutonomyLogReport }
     | { ok: false; message: string };

   export function runAutonomyLog(
     opts: { session: string },
     deps: AutonomyCliDeps = {}
   ): AutonomyLogOutcome {
     const r = readAutoDecisions((deps.cwd ?? (() => process.cwd()))(), opts.session);
     if (!r.ok) return { ok: false, message: r.error.message };
     return {
       ok: true,
       report: {
         session: opts.session,
         file: r.value.file,
         logPresent: r.value.present,
         summary: summarizeAutoDecisions(r.value.entries),
         entries: r.value.entries,
         invalidLines: r.value.invalid,
       },
     };
   }

   export function formatAutonomyLog(report: AutonomyLogReport): string[] {
     const lines = renderAutoDecisionSummary(report.entries, {
       session: report.session,
       invalidLines: report.invalidLines.length,
       includeJudgments: true,
     });
     if (lines.length > 0) return lines;
     return [
       report.logPresent
         ? `No auto-decisions recorded for session ${report.session} (log is empty: ${report.file}).`
         : `No auto-decisions recorded for session ${report.session} (no log file at ${report.file}).`,
     ];
   }

   export function createAutonomyLogCommand(deps: AutonomyCliDeps = {}): Command {
     return new Command('log')
       .description(
         'Summarize a session’s auto-decisions: counts by class, audited N/M, agreement rate, escalations'
       )
       .requiredOption('--session <slug>', 'Session whose auto-decisions.jsonl to read')
       .action((opts: { session: string }, cmd: Command) => {
         const out = runAutonomyLog(opts, deps);
         if (!out.ok) {
           logger.error(out.message);
           process.exitCode = 1;
           return;
         }
         if ((cmd.optsWithGlobals() as { json?: boolean }).json) {
           console.log(JSON.stringify(out.report, null, 2));
           return;
         }
         for (const line of formatAutonomyLog(out.report)) logger.info(line);
       });
   }
   ```

   If `logger.error` writes through something other than `console.error`, adjust the spy in the last test to silence that logger instead. Its assertion is only on `process.exitCode`.

4. Re-run the test. All pass.
5. Run `npx turbo build --filter=@harness-engineering/cli...` and `harness validate` (496).
6. Commit: `feat(cli): add harness autonomy log (summary, audited N/M, --json)`

### Task 14: Wire `log` into the `harness autonomy` group

**Depends on:** Task 13 | **Files:** `packages/cli/src/commands/autonomy/index.ts`, `packages/cli/tests/commands/autonomy-command.test.ts`

1. In `packages/cli/tests/commands/autonomy-command.test.ts`, change the first case to:

   ```ts
   it('exposes show, set and log', () => {
     const cmd = createAutonomyCommand();
     expect(cmd.name()).toBe('autonomy');
     expect(cmd.commands.map((c) => c.name()).sort()).toEqual(['log', 'set', 'show']);
   });
   ```

2. Run `cd packages/cli && npx vitest run tests/commands/autonomy-command.test.ts`. It fails.
3. In `packages/cli/src/commands/autonomy/index.ts`, add `import { createAutonomyLogCommand } from './log';` and, after `command.addCommand(createAutonomySetCommand(deps));`, add `command.addCommand(createAutonomyLogCommand(deps));`. Change the description's first sentence to `'Show, set, or review autonomy. …'` and keep the rest.
4. Re-run the test. It passes. Then `npx turbo build --filter=@harness-engineering/cli...` and smoke-test: `node packages/cli/dist/bin/harness.js autonomy log --session changes--trusted-autonomy-mode--proposal` prints `No auto-decisions recorded … (no log file at …)` and exits 0.
5. Run `pnpm run generate:barrels:check` (clean: the registry is unchanged) and `harness validate` (496).
6. Commit: `feat(cli): add log to the harness autonomy command group`

### Task 15: Regenerate reference docs and tool catalog; update the changeset

**Depends on:** Tasks 12, 14 | **Files:** `docs/reference/*` (generated), `.changeset/trusted-autonomy-mode.md` | **Category:** integration

1. Run `npx turbo build --filter=@harness-engineering/cli...`, then `pnpm run generate:tool-catalog` and `pnpm run generate-docs`.
2. Run `git status --short docs/reference`. Expect `mcp-tools.md`, `tool-catalog.md` and `cli-commands.md` to change, plus any `packages-core-*.md` / `packages-cli-*.md` indices that list the new files. Run `grep -n "record_auto_decision" docs/reference/mcp-tools.md docs/reference/tool-catalog.md` (both match) and `grep -n "autonomy log" docs/reference/cli-commands.md` (matches).
3. Append this paragraph to `.changeset/trusted-autonomy-mode.md`:

   ```markdown
   Add the trusted-autonomy decision log: a `record_auto_decision` MCP tool (standard tier) that validates each entry strictly, stamps `ts` and `autonomySource` itself (caller-supplied values are rejected), refuses entries the resolved autonomy does not permit, and appends one line to `.harness/sessions/<slug>/auto-decisions.jsonl` (append-only; a failed write returns `recorded: false` with `action: "pause"`). `harness autonomy log --session <slug> [--json]` summarizes counts by class, `audited N/M` (M counts every judgment decision, including audit `unavailable`/`off`), the agreement rate and escalations; core exports the pure `renderAutoDecisionSummary` for end-of-run summaries. Override-lock release now verifies ownership before unlinking.
   ```

4. Run `npx prettier --check docs/reference .changeset/trusted-autonomy-mode.md`, then `pnpm run generate:tool-catalog:check` and `pnpm run generate:barrels:check` (all clean).
5. Run `harness validate` (496).
6. Commit: `docs(reference): regenerate for record_auto_decision and autonomy log`

### Task 16: Full verification

[checkpoint:human-verify] Show the gate outputs below and the Task 14 smoke output. Wait for confirmation.

**Depends on:** Tasks 1, 2, 15 | **Files:** none (verification only)

1. `cd packages/types && npx vitest run`
2. `cd packages/core && npx vitest run tests/autonomy tests/shared` (all pass; record counts)
3. `cd packages/cli && npx vitest run tests/mcp tests/commands/autonomy-*.test.ts tests/commands/setup-mcp.test.ts tests/commands/mcp-list-capabilities.test.ts tests/hooks/dogfood-hook-parity.test.ts tests/hooks/autonomy-guard.test.ts`
4. `pnpm typecheck --filter=@harness-engineering/types --filter=@harness-engineering/core --filter=@harness-engineering/cli` and `pnpm lint --filter=@harness-engineering/core --filter=@harness-engineering/cli`
5. `node packages/cli/dist/bin/harness.js validate` (496 unchanged) and `node packages/cli/dist/bin/harness.js check-deps` (exit 0)
6. `node packages/cli/dist/bin/harness.js check-security --severity error` (zero findings under `packages/core/src/autonomy/` and `packages/cli/src/mcp/tools/auto-decision.ts`; Security NFR)
7. `pnpm run generate:plugin:check`, `pnpm run generate:barrels:check`, `pnpm run generate:tool-catalog:check`
8. Traceability: every Observable Truth 1-13 maps to a passing test named in its task. Record that every mutation probe failed and then passed.
9. Write the session handoff (`.harness/sessions/changes--trusted-autonomy-mode--proposal/handoff.json`) for review. Do not push.

## Traceability

| Truth                      | Tasks          | Proof                                                                |
| -------------------------- | -------------- | -------------------------------------------------------------------- |
| 1 SC9                      | 8, 13          | `summary.test.ts` "M counts every judgment…"; `autonomy-log.test.ts` |
| 2 SC11 render              | 8              | `summary.test.ts` render cases                                       |
| 3 D6 append                | 5, 7, 10       | `decision-log.test.ts`, `record.test.ts`, `auto-decision.test.ts`    |
| 4 anti-spoof               | 4, 7, 10       | spoof cases in all three                                             |
| 5 SC14 tool half           | 5, 7, 10       | EISDIR / partial / throwing write cases                              |
| 6 append-only              | 5, 9           | source scan + `decision-log-surface.test.ts`                         |
| 7 concurrency              | 6              | `decision-log-concurrency.test.ts`                                   |
| 8 shared slug rule         | 5, 7           | `it.each(['../x','CON',' s1',…])`                                    |
| 9 authorization            | 7              | `(gate)` cases                                                       |
| 10 strict validation       | 4              | `decision-schema.test.ts`                                            |
| 11 hook parity             | 1              | `dogfood-hook-parity.test.ts`                                        |
| 12 lock ownership          | 2              | `override-store.test.ts` "lock release verifies ownership"           |
| 13 registration/docs/gates | 11, 12, 15, 16 | count 116, tier test, sync tests, generators' `--check`              |
