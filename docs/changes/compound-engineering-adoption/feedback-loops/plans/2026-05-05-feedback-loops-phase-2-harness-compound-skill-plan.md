# Plan: Feedback Loops — Phase 2: harness-compound Skill

**Date:** 2026-05-05 | **Spec:** `docs/changes/compound-engineering-adoption/feedback-loops/proposal.md` | **Tasks:** 11 | **Time:** ~38 min | **Integration Tier:** medium

> Phase 2 of the feedback-loops spec. Builds on Phase 1's schema and validation foundation. Adds the `harness-compound` skill prose (5 phases: identify → classify → overlap-check → assemble → write), the per-category file-lock primitive that serializes concurrent same-category invocations, and integration-test fixtures for the four scenarios called out by Success Criteria 5, 6, and 13.

## Goal

A user runs `/harness:compound "<problem context>"` and gets a structured solution doc written to `docs/solutions/<track>/<category>/<slug>.md` with valid frontmatter; concurrent invocations on the same category serialize via a file lock; the second invocation on an already-documented problem updates the existing doc instead of creating a duplicate.

## Observable Truths (Acceptance Criteria)

1. **[Ubiquitous]** `agents/skills/{claude-code,gemini-cli,cursor,codex}/harness-compound/SKILL.md` and `skill.yaml` all exist and are byte-identical across platforms (passes `agents/skills/tests/platform-parity.test.ts`).
2. **[Ubiquitous]** The skill SKILL.md documents the 5 phases (identify, classify, overlap-check, assemble, write) and references `docs/solutions/references/schema.yaml`, `docs/solutions/references/category-mapping.md`, and `docs/solutions/assets/resolution-template.md`.
3. **[Ubiquitous]** `agents/skills/tests/structure.test.ts` and `agents/skills/tests/schema.test.ts` pass for `harness-compound` (rigid-type sections present, schema validates).
4. **[Ubiquitous]** A new `acquireCompoundLock(category)` function in `packages/core/src/locks/compound-lock.ts` returns a release handle when the lock is free and throws `CompoundLockHeldError` when the lock file already exists for that category. Lock files live at `.harness/locks/compound-<category>.lock`.
5. **[Event-driven]** When the lock-holding process exits (normal exit, SIGINT, SIGTERM, or uncaught exception), the lock file is removed. Tested by spawning a child process that acquires and exits.
6. **[Event-driven]** When two concurrent acquirers target the same category, exactly one succeeds and the other receives `CompoundLockHeldError` with the holding PID embedded in the message.
7. **[State-driven]** While a lock is held on `bug-track:integration-issues`, an acquirer for `bug-track:test-failures` succeeds (different category, no contention).
8. **[Ubiquitous]** Lock primitive is exported from `@harness-engineering/core` via the barrel and surfaced in `packages/core/src/index.ts`.
9. **[Ubiquitous]** Running `pnpm --filter @harness-engineering/cli build && node packages/cli/dist/index.js generate-slash-commands --platform claude-code --output /tmp/sc-out` produces a `harness/compound.md` file under `/tmp/sc-out/harness/` (slash command discoverable).
10. **[Ubiquitous]** `pnpm -F @harness-engineering/core test` passes (existing 2495 + new lock tests).
11. **[Ubiquitous]** `pnpm -F @harness-engineering/skills test` (or whichever runner exercises `agents/skills/tests/`) passes.
12. **[Ubiquitous]** `harness validate` passes at the end of the plan.

## Uncertainties

- **[ASSUMPTION]** Lock primitive lives in `@harness-engineering/core` (alongside other shared primitives), not in `@harness-engineering/cli`. Rationale: the skill prose may be invoked by the CLI command path or directly from a future programmatic API; placing it in core keeps it reusable. If a reviewer prefers `cli/`, only Tasks 1–3 need re-homing.
- **[ASSUMPTION]** No `proper-lockfile` runtime dep is added. We use a Node-builtin `fs.openSync(path, 'wx')` (O_EXCL) primitive plus `process.on('exit'/'SIGINT'/'SIGTERM'/'uncaughtException')` cleanup. Justification: avoids a new dependency for a 50-line utility; matches the harness-engineering preference for minimal deps. If concurrency semantics need stale-lock recovery later, this can be swapped for `proper-lockfile` without API changes.
- **[ASSUMPTION]** SKILL.md is mirrored across platforms by manual copy (the existing convention — diffs are zero by inspection). No new sync script is introduced in this phase; `platform-parity.test.ts` enforces parity.
- **[ASSUMPTION]** The skill prose is the executable artifact. There is NO CLI subcommand `harness compound run` in this phase — that's deferred to Phase 5 (`harness compound scan-candidates`) and does not exist as a user-facing run command at all per spec Decision 10 (auto-invocation deferred). The skill is invoked manually via `/harness:compound`, and the agent reads SKILL.md, performs the phases, and writes the doc directly using its standard tools (Read, Write, Bash). The lock primitive is invoked by the agent via a small `harness-internal` Bash one-liner OR exposed as an MCP tool — we choose the latter for cleanliness (Task 4).
- **[DEFERRABLE]** Exact slug derivation rules (kebab-case from problem title, dedupe with numeric suffix) — drafted in SKILL.md, can be tightened during real use.
- **[DEFERRABLE]** Whether `--no-lock` escape hatch should be a flag to the slash command. Not in spec; defer.

## File Map

```
CREATE packages/core/src/locks/compound-lock.ts
CREATE packages/core/src/locks/compound-lock.test.ts
CREATE packages/core/src/locks/index.ts
MODIFY packages/core/src/index.ts                                        (add export of locks)

CREATE agents/skills/claude-code/harness-compound/SKILL.md
CREATE agents/skills/claude-code/harness-compound/skill.yaml
CREATE agents/skills/gemini-cli/harness-compound/SKILL.md                (byte-identical mirror)
CREATE agents/skills/gemini-cli/harness-compound/skill.yaml              (byte-identical mirror)
CREATE agents/skills/cursor/harness-compound/SKILL.md                    (byte-identical mirror)
CREATE agents/skills/cursor/harness-compound/skill.yaml                  (byte-identical mirror)
CREATE agents/skills/codex/harness-compound/SKILL.md                     (byte-identical mirror)
CREATE agents/skills/codex/harness-compound/skill.yaml                   (byte-identical mirror)

CREATE agents/skills/tests/harness-compound.test.ts                      (4 fixture-driven scenarios)
CREATE agents/skills/tests/fixtures/harness-compound/bug-track-fixture/  (input: problem statement)
CREATE agents/skills/tests/fixtures/harness-compound/knowledge-track-fixture/
CREATE agents/skills/tests/fixtures/harness-compound/duplicate-detection-fixture/

MODIFY .gitignore                                                        (ignore .harness/locks/)
CREATE .harness/locks/.gitkeep                                           (placeholder, lock dir reserved)
```

## Skeleton

_Not produced — fast rigor mode skips skeleton; task count (11) is moderate and the structure is dictated by the spec's named phases._

## Tasks

---

### Task 1: Write failing test for `acquireCompoundLock` happy path and same-category contention

**Depends on:** none | **Files:** `packages/core/src/locks/compound-lock.test.ts`

1. Create `packages/core/src/locks/compound-lock.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { acquireCompoundLock, CompoundLockHeldError } from './compound-lock';

   describe('acquireCompoundLock', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compound-lock-'));
     });
     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('creates the lock file and returns a release handle', () => {
       const handle = acquireCompoundLock('integration-issues', { cwd: tmpDir });
       const lockPath = path.join(tmpDir, '.harness', 'locks', 'compound-integration-issues.lock');
       expect(fs.existsSync(lockPath)).toBe(true);
       handle.release();
       expect(fs.existsSync(lockPath)).toBe(false);
     });

     it('throws CompoundLockHeldError when same category is locked', () => {
       const handle = acquireCompoundLock('test-failures', { cwd: tmpDir });
       expect(() => acquireCompoundLock('test-failures', { cwd: tmpDir })).toThrow(
         CompoundLockHeldError
       );
       handle.release();
     });

     it('embeds the holder PID in the error message', () => {
       const handle = acquireCompoundLock('runtime-errors', { cwd: tmpDir });
       try {
         acquireCompoundLock('runtime-errors', { cwd: tmpDir });
         expect.fail('should have thrown');
       } catch (e) {
         expect(e).toBeInstanceOf(CompoundLockHeldError);
         expect((e as Error).message).toMatch(/pid/i);
       }
       handle.release();
     });

     it('allows different categories to lock concurrently', () => {
       const a = acquireCompoundLock('integration-issues', { cwd: tmpDir });
       const b = acquireCompoundLock('test-failures', { cwd: tmpDir });
       a.release();
       b.release();
     });

     it('rejects unknown category', () => {
       expect(() => acquireCompoundLock('unicorn-bugs' as never, { cwd: tmpDir })).toThrow(
         /unknown category/i
       );
     });
   });
   ```

2. Run: `pnpm -F @harness-engineering/core test -- compound-lock` — observe failure (module not found).
3. Commit: `test(core): add failing tests for compound-lock primitive`.

---

### Task 2: Implement `acquireCompoundLock` primitive

**Depends on:** Task 1 | **Files:** `packages/core/src/locks/compound-lock.ts`, `packages/core/src/locks/index.ts`

1. Create `packages/core/src/locks/compound-lock.ts`:

   ```typescript
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { ALL_SOLUTION_CATEGORIES, type SolutionCategory } from '../solutions/schema';

   export class CompoundLockHeldError extends Error {
     constructor(
       public readonly category: SolutionCategory,
       public readonly holderPid: number,
       public readonly lockPath: string
     ) {
       super(
         `Compound lock for category "${category}" is held by pid ${holderPid} (lock file: ${lockPath}).`
       );
       this.name = 'CompoundLockHeldError';
     }
   }

   export interface CompoundLockHandle {
     readonly category: SolutionCategory;
     readonly lockPath: string;
     release(): void;
   }

   export interface AcquireOptions {
     /** Project root; defaults to process.cwd(). */
     cwd?: string;
   }

   const KNOWN_CATEGORIES = new Set<string>(ALL_SOLUTION_CATEGORIES);

   /**
    * Acquire a per-category file lock for /harness:compound. Lock file is
    * .harness/locks/compound-<category>.lock and contains the holder PID.
    *
    * Concurrency model: O_EXCL create. If the file exists, throws
    * CompoundLockHeldError. The handle's release() removes the file. Process
    * exit handlers ensure cleanup on crash.
    *
    * Different categories never contend; same category serializes.
    */
   export function acquireCompoundLock(
     category: SolutionCategory,
     opts: AcquireOptions = {}
   ): CompoundLockHandle {
     if (!KNOWN_CATEGORIES.has(category)) {
       throw new Error(
         `Unknown category "${category}". Must be one of: ${[...KNOWN_CATEGORIES].join(', ')}`
       );
     }
     const cwd = opts.cwd ?? process.cwd();
     const lockDir = path.join(cwd, '.harness', 'locks');
     fs.mkdirSync(lockDir, { recursive: true });
     const lockPath = path.join(lockDir, `compound-${category}.lock`);

     let fd: number;
     try {
       fd = fs.openSync(lockPath, 'wx');
     } catch (e) {
       const err = e as NodeJS.ErrnoException;
       if (err.code === 'EEXIST') {
         const holderPid = readHolderPid(lockPath);
         throw new CompoundLockHeldError(category, holderPid, lockPath);
       }
       throw err;
     }
     fs.writeSync(fd, String(process.pid));
     fs.closeSync(fd);

     let released = false;
     const release = (): void => {
       if (released) return;
       released = true;
       try {
         fs.unlinkSync(lockPath);
       } catch {
         /* lock already gone — fine */
       }
     };
     // Ensure release on abrupt exit. Best-effort.
     const onExit = (): void => release();
     process.once('exit', onExit);
     process.once('SIGINT', onExit);
     process.once('SIGTERM', onExit);
     process.once('uncaughtException', onExit);

     return { category, lockPath, release };
   }

   function readHolderPid(lockPath: string): number {
     try {
       const raw = fs.readFileSync(lockPath, 'utf-8').trim();
       const n = Number.parseInt(raw, 10);
       return Number.isFinite(n) ? n : -1;
     } catch {
       return -1;
     }
   }
   ```

2. Create `packages/core/src/locks/index.ts`:

   ```typescript
   export {
     acquireCompoundLock,
     CompoundLockHeldError,
     type CompoundLockHandle,
     type AcquireOptions,
   } from './compound-lock';
   ```

3. Run: `pnpm -F @harness-engineering/core test -- compound-lock` — all 5 tests pass.
4. Run: `pnpm -F @harness-engineering/core typecheck` — zero errors.
5. Run: `harness validate`.
6. Commit: `feat(core): add per-category compound-lock primitive`.

---

### Task 3: Export locks module from `@harness-engineering/core` barrel

**Depends on:** Task 2 | **Files:** `packages/core/src/index.ts`

1. Read `packages/core/src/index.ts` to find the appropriate insertion point (look for the section that re-exports submodules; the file is auto-generated by `pnpm run generate:barrels`).
2. Run: `pnpm run generate:barrels` from repo root. Verify `packages/core/src/index.ts` now contains `export * from './locks';` (or equivalent).
3. If the generator did not pick up the new directory, manually add `export * from './locks';` at the bottom of the explicit export section, mirroring how `solutions` is exported.
4. Run: `pnpm -F @harness-engineering/core build` — clean.
5. Run: `pnpm -F @harness-engineering/core typecheck` — zero errors.
6. Run: `pnpm -F @harness-engineering/cli typecheck` — zero errors (verifies downstream consumers are happy).
7. Run: `harness validate`.
8. Commit: `feat(core): export locks module from package barrel`.

---

### Task 4: Write failing test for cross-process lock cleanup on exit

**Depends on:** Task 3 | **Files:** `packages/core/src/locks/compound-lock.test.ts`

1. Append to `packages/core/src/locks/compound-lock.test.ts`:

   ```typescript
   import { execFileSync } from 'node:child_process';

   describe('acquireCompoundLock cross-process cleanup', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compound-lock-x-'));
     });
     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('releases the lock when the holding process exits normally', () => {
       const script = `
         const { acquireCompoundLock } = require(${JSON.stringify(
           path.resolve(__dirname, './compound-lock.ts')
         )});
         acquireCompoundLock('integration-issues', { cwd: ${JSON.stringify(tmpDir)} });
         process.exit(0);
       `;
       // Use tsx so we can require the .ts source directly.
       execFileSync('node', ['--import', 'tsx', '-e', script], { stdio: 'pipe' });
       const lockPath = path.join(tmpDir, '.harness', 'locks', 'compound-integration-issues.lock');
       expect(fs.existsSync(lockPath)).toBe(false);
     });
   });
   ```

2. Run: `pnpm -F @harness-engineering/core test -- compound-lock` — the test should pass (the implementation already registers `process.once('exit', release)`). If it fails, fix the implementation in Task 2.
3. If the `tsx` import path is brittle in the test runner, fall back to spawning a small node script that imports the compiled dist; document the chosen approach in a code comment.
4. Run: `harness validate`.
5. Commit: `test(core): verify compound-lock releases on process exit`.

---

### Task 5: Author `harness-compound` SKILL.md (claude-code, source of truth)

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/harness-compound/SKILL.md`

1. Create `agents/skills/claude-code/harness-compound/SKILL.md` with the following structure (matching the rigid-skill conventions enforced by `agents/skills/tests/structure.test.ts` — must include `## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Gates`, `## Escalation`):

   ````markdown
   # Harness Compound

   > 5-phase post-mortem capture. When a problem is solved, distill it into a structured doc at `docs/solutions/<track>/<category>/<slug>.md` so the next person (or agent) finds the playbook before re-deriving it.

   ## When to Use

   - Manually, after solving a non-trivial problem (a bug fix that took >1 commit, a debugging session, an architectural decision worth preserving)
   - When the orchestrator's step 6b mechanical triggers fire (deferred until Phase 7 wires it)
   - When the weekly `compound-candidates` scanner surfaces a candidate (deferred until Phase 5)
   - NOT for trivial fixes (typos, lint, one-line obvious)
   - NOT for facts that belong in `docs/knowledge/` (use `harness-knowledge-pipeline`; the boundary is: knowledge-pipeline extracts structural facts FROM CODE; compound captures post-mortem playbooks WRITTEN AFTER A FIX)
   - NOT for ephemeral session notes (`.harness/learnings.md` still exists for that)

   ## Process

   ### Iron Law

   **One problem, one canonical doc.** Phase 3 (overlap-check) is mandatory. If overlap is high, UPDATE the existing doc (bump `last_updated`, append to relevant section). Do not create a duplicate.

   ---

   ### Phase 1: IDENTIFY

   Extract the problem and the solution from available context:

   1. Read recent conversation, the active debug session at `.harness/debug/active/*.md` if present, and recent `git log --oneline -20`.
   2. Distill into a 1-2 sentence problem statement and 1-2 sentence solution statement.
   3. Note the affected `module` (package name or area, e.g. `orchestrator`, `cli/validate`).

   **Output:** `{ problem, solution, module, candidateTags }`.

   ---

   ### Phase 2: CLASSIFY

   Read `docs/solutions/references/schema.yaml` for the authoritative track/category enum and `docs/solutions/references/category-mapping.md` for examples of which problems land in which category.

   1. Choose `track`:
      - `bug-track` — a thing was broken; you fixed it. Concrete failure, concrete cause.
      - `knowledge-track` — a pattern, convention, or decision worth preserving as guidance, not a fix.
   2. Choose `category` from the enum for that track. If nothing fits, **stop and escalate** — adding categories requires a PR (Decision 8).

   **Output:** `{ track, category }`.

   ---

   ### Phase 3: OVERLAP-CHECK

   1. List every existing `docs/solutions/<track>/<category>/*.md`.
   2. For each, read the `# <Title>` heading and the first 200 chars of the `## Problem` (bug-track) or `## Context` (knowledge-track) section.
   3. Compute overlap heuristically: shared `module`, shared `problem_type`, similar problem statement (Jaccard on bag-of-words >= 0.5 is a reasonable threshold; the agent uses judgment).
   4. If high overlap with one existing doc:
      - Open the existing doc.
      - Update relevant sections (append a new bullet under `## Solution` or `## Guidance` describing the new instance, bump `last_updated`).
      - Skip Phase 4 and most of Phase 5 (only the write-with-lock step runs).
   5. If no overlap, proceed to Phase 4.

   ---

   ### Phase 4: ASSEMBLE

   1. Copy `docs/solutions/assets/resolution-template.md` to a working buffer.
   2. Fill the frontmatter:

      ```yaml
      ---
      module: <from Phase 1>
      tags: [<from Phase 1 candidateTags, lowercase, hyphenated>]
      problem_type: <short noun phrase, e.g. 'race-condition'>
      last_updated: '<YYYY-MM-DD, today>'
      track: <bug-track | knowledge-track>
      category: <from Phase 2>
      ---
      ```
   ````

   3. Replace the `# <Title>` placeholder with a concise problem statement.
   4. For `bug-track`: fill `## Problem`, `## Root cause`, `## Solution`, `## Prevention`. Delete the knowledge-track sections (`## Context`, `## Guidance`, `## Applicability`).
   5. For `knowledge-track`: fill `## Context`, `## Guidance`, `## Applicability`. Delete the bug-track sections.
   6. Cite commit SHAs and `file:line` where helpful.

   ***

   ### Phase 5: WRITE (lock-protected)
   1. Compute slug: kebab-case from the title; if a file with that slug already exists in the target directory, append `-2`, `-3`, etc.
   2. **Acquire the per-category lock.** Use the MCP tool `acquire_compound_lock` (or shell out to a small Node one-liner that imports `acquireCompoundLock` from `@harness-engineering/core`). Lock path: `.harness/locks/compound-<category>.lock`.
      - On `CompoundLockHeldError`: report "compound lock for category `<category>` is held by pid `<N>` — wait for it to release or run `/harness:compound` for a different category" and stop. **Do not retry automatically.** A second invocation on the same problem after release will go through Phase 3 and find the doc the first invocation produced.
   3. Re-run a quick Phase 3 overlap-check inside the lock (defends against TOCTOU when the first overlap-check returned "no overlap" but another agent on a different category — wait, same category is locked. The re-check defends against the case where overlap was borderline; it is cheap).
   4. Write the file at `docs/solutions/<track>/<category>/<slug>.md`.
   5. Validate frontmatter against `SolutionDocFrontmatterSchema` by running `harness validate` (which runs `validateSolutionsDir`).
   6. Release the lock.
   7. Surface to chat: file path created (or updated), category, and a one-sentence summary.

   ## Harness Integration
   - **`harness validate`** — Run after writing the doc; the solutions validator catches frontmatter errors before commit.
   - **`harness check-deps`** — Not required (no new module imports introduced by writing a doc).
   - **`@harness-engineering/core` lock primitive** — `acquireCompoundLock(category, { cwd })` returns a release handle; throws `CompoundLockHeldError` on contention. See `packages/core/src/locks/compound-lock.ts`.
   - **Schema authority** — `packages/core/src/solutions/schema.ts` is the single source of truth for tracks and categories. `docs/solutions/references/schema.yaml` mirrors it for human reading.
   - **Boundary with `harness-knowledge-pipeline`** — Knowledge-pipeline extracts structural facts FROM CODE. Compound captures post-mortem playbooks WRITTEN AFTER A FIX. Compound's knowledge-track output is a _candidate input_ to the pipeline (Phase 7 of the spec wires this).
   - **Boundary with `.harness/learnings.md`** — The file remains for ephemeral session notes. It is no longer the canonical sink for compounding knowledge — that's `docs/solutions/`.

   ## Success Criteria
   - A new solution doc is written to `docs/solutions/<track>/<category>/<slug>.md` with valid frontmatter (passes `validateSolutionsDir`).
   - Two concurrent invocations on the same category cannot both succeed: one writes, the other returns `CompoundLockHeldError`.
   - A second invocation on the same problem updates the existing doc instead of creating a duplicate.
   - The skill never invents a new category — unknown categories are escalated.
   - PII is not written into the doc (the agent reads from local conversation/commits; no remote queries).

   ## Examples

   ### Example: bug-track

   Input: "Stalled lease cleanup in orchestrator caused stuck issues. Fix was to add a 5-minute lease TTL with a sweep at startup. Took 4 commits, debugged via `harness-debugging`."
   - Phase 1: `module=orchestrator`, problem="stuck issues from stalled leases", solution="lease TTL + startup sweep".
   - Phase 2: `track=bug-track`, `category=integration-issues` (lease coordination is integration-shaped).
   - Phase 3: no overlap.
   - Phase 4: fill Problem / Root cause / Solution / Prevention.
   - Phase 5: write `docs/solutions/bug-track/integration-issues/stalled-lease-cleanup.md` under lock.

   ### Example: knowledge-track

   Input: "We standardized on `Result<T, E>` returns for all I/O paths in `packages/core`. Document the convention and when not to use it."
   - Phase 1: `module=core`, problem="when to use Result vs throwing", solution="convention doc".
   - Phase 2: `track=knowledge-track`, `category=conventions`.
   - Phase 3: no overlap.
   - Phase 4: fill Context / Guidance / Applicability.
   - Phase 5: write `docs/solutions/knowledge-track/conventions/result-type-for-io.md` under lock.

   ### Example: overlap-check updates existing doc

   Input: "Hit the same stalled-lease bug today on a different code path."
   - Phase 1, 2 produce the same `bug-track/integration-issues` target.
   - Phase 3 finds `stalled-lease-cleanup.md` with high overlap.
   - Append a bullet to `## Solution` describing the new instance, bump `last_updated`, do not create a new file.

   ## Gates
   - **Phase 3 is mandatory.** No exceptions. Skipping overlap-check produces duplicate docs and erodes the value of the corpus.
   - **No invented categories.** Unknown categories require a PR to `packages/core/src/solutions/schema.ts`. Escalate.
   - **Lock must wrap Phase 5.** Without the lock, two concurrent invocations on the same category race on overlap-check and produce duplicates.
   - **`harness validate` must pass before exit.** Frontmatter errors silently break the corpus.

   ## Escalation
   - **Cannot decide track/category:** Escalate to the user. Show the candidate (track, category) pairs and the rationale for each. Wait for selection.
   - **Lock held by another invocation:** Report and stop. Do not retry. The user re-runs after release.
   - **`validateSolutionsDir` rejects the doc:** Show the validator error, fix the frontmatter, re-validate. Do not commit a doc that fails validation.
   - **Problem does not fit any category:** Escalate. Adding a category requires a PR (Decision 8 of the feedback-loops spec).

   ```

   ```

2. Run: `pnpm -F @harness-engineering/skills test -- structure` (or `cd agents/skills && pnpm test -- structure`) — verify the `structure.test.ts` finds `harness-compound` and the required sections check passes.
3. Run: `harness validate`.
4. Commit: `feat(skill): add harness-compound SKILL.md`.

---

### Task 6: Author `harness-compound` skill.yaml (claude-code, source of truth)

**Depends on:** Task 5 | **Files:** `agents/skills/claude-code/harness-compound/skill.yaml`

1. Create `agents/skills/claude-code/harness-compound/skill.yaml`:

   ```yaml
   name: harness-compound
   version: '1.0.0'
   description: 5-phase post-mortem capture. Writes a structured solution doc at docs/solutions/<track>/<category>/<slug>.md with frontmatter, overlap-detection, and per-category lock for concurrency safety.
   stability: static
   cognitive_mode: reflective-historian
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
     command: harness skill run harness-compound
     args:
       - name: context
         description: Free-text problem context (e.g. 'stalled lease cleanup in orchestrator')
         required: false
   mcp:
     tool: run_skill
     input:
       skill: harness-compound
       context: string
   type: rigid
   tier: 2
   phases:
     - name: identify
       description: Extract problem and solution from conversation, debug session, recent commits
       required: true
     - name: classify
       description: Choose track and category from the v1 schema enums
       required: true
     - name: overlap-check
       description: Scan existing docs/solutions/<track>/<category>/ for matching problems; update existing if high overlap
       required: true
     - name: assemble
       description: Fill the resolution template with track-appropriate sections
       required: true
     - name: write
       description: Write doc under per-category lock; validate frontmatter; release lock
       required: true
   state:
     persistent: false
     files:
       - .harness/locks/compound-<category>.lock
   depends_on: []
   keywords:
     - post-mortem
     - solutions
     - compound-learning
     - playbook
     - bug-track
     - knowledge-track
   ```

2. Run: `pnpm -F @harness-engineering/skills test -- schema` (or `cd agents/skills && pnpm test -- schema`) — verify `schema.test.ts` validates the yaml against `SkillMetadataSchema`.
3. Run: `harness validate`.
4. Commit: `feat(skill): add harness-compound skill.yaml metadata`.

---

### Task 7: Mirror SKILL.md and skill.yaml to gemini-cli, cursor, codex

**Depends on:** Task 6 | **Files:** `agents/skills/{gemini-cli,cursor,codex}/harness-compound/SKILL.md`, `agents/skills/{gemini-cli,cursor,codex}/harness-compound/skill.yaml`

1. Run from repo root:
   ```bash
   for p in gemini-cli cursor codex; do
     mkdir -p "agents/skills/$p/harness-compound"
     cp "agents/skills/claude-code/harness-compound/SKILL.md" "agents/skills/$p/harness-compound/SKILL.md"
     cp "agents/skills/claude-code/harness-compound/skill.yaml" "agents/skills/$p/harness-compound/skill.yaml"
   done
   ```
2. Verify byte-identical:
   ```bash
   for p in gemini-cli cursor codex; do
     diff "agents/skills/claude-code/harness-compound/SKILL.md" "agents/skills/$p/harness-compound/SKILL.md" || echo "DIFF in $p"
     diff "agents/skills/claude-code/harness-compound/skill.yaml" "agents/skills/$p/harness-compound/skill.yaml" || echo "DIFF in $p"
   done
   ```
3. Run: `pnpm -F @harness-engineering/skills test -- platform-parity` (or `cd agents/skills && pnpm test -- platform-parity`) — must pass.
4. Run: `harness validate`.
5. Commit: `feat(skill): mirror harness-compound to gemini-cli, cursor, codex platforms`.

---

### Task 8: Write failing integration tests for compound skill (4 fixtures)

**Depends on:** Task 7 | **Files:** `agents/skills/tests/harness-compound.test.ts`, `agents/skills/tests/fixtures/harness-compound/*`

1. Create `agents/skills/tests/fixtures/harness-compound/bug-track-fixture/input.json`:

   ```json
   {
     "problem": "Stalled lease cleanup in orchestrator caused stuck issues",
     "solution": "Added 5-minute lease TTL with sweep on startup",
     "module": "orchestrator",
     "expected": {
       "track": "bug-track",
       "category": "integration-issues",
       "slugPrefix": "stalled-lease"
     }
   }
   ```

2. Create `agents/skills/tests/fixtures/harness-compound/knowledge-track-fixture/input.json` with a `conventions`-shaped problem.

3. Create `agents/skills/tests/fixtures/harness-compound/duplicate-detection-fixture/`:
   - A pre-seeded `docs/solutions/bug-track/integration-issues/stalled-lease-cleanup.md` (a minimal file with valid frontmatter).
   - An `input.json` whose problem statement is highly overlapping with the seeded doc.
   - `expected.json` asserting `mode: 'update'` (not 'create').

4. Create `agents/skills/tests/harness-compound.test.ts` that exercises the **lock primitive directly** (the skill prose itself is run by an agent, not by node — but the lock contract is testable in isolation, and overlap-detection on a fixture directory is testable as a pure function once we surface it). For Phase 2 we test:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { acquireCompoundLock, CompoundLockHeldError } from '@harness-engineering/core';

   describe('harness-compound integration', () => {
     describe('lock primitive', () => {
       it('serializes same-category invocations', () => {
         const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-'));
         const a = acquireCompoundLock('integration-issues', { cwd: tmp });
         expect(() => acquireCompoundLock('integration-issues', { cwd: tmp })).toThrow(
           CompoundLockHeldError
         );
         a.release();
         // Now a fresh acquire succeeds
         const b = acquireCompoundLock('integration-issues', { cwd: tmp });
         b.release();
         fs.rmSync(tmp, { recursive: true, force: true });
       });

       it('parallelizes different-category invocations', () => {
         const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-'));
         const a = acquireCompoundLock('integration-issues', { cwd: tmp });
         const b = acquireCompoundLock('test-failures', { cwd: tmp });
         a.release();
         b.release();
         fs.rmSync(tmp, { recursive: true, force: true });
       });
     });

     describe('fixtures', () => {
       const fixturesRoot = path.resolve(__dirname, 'fixtures/harness-compound');

       it('bug-track fixture has expected shape', () => {
         const input = JSON.parse(
           fs.readFileSync(path.join(fixturesRoot, 'bug-track-fixture/input.json'), 'utf-8')
         );
         expect(input.expected.track).toBe('bug-track');
         expect(input.expected.category).toBe('integration-issues');
       });

       it('knowledge-track fixture has expected shape', () => {
         const input = JSON.parse(
           fs.readFileSync(path.join(fixturesRoot, 'knowledge-track-fixture/input.json'), 'utf-8')
         );
         expect(input.expected.track).toBe('knowledge-track');
       });

       it('duplicate-detection fixture seeds an existing doc', () => {
         const seedPath = path.join(
           fixturesRoot,
           'duplicate-detection-fixture/docs/solutions/bug-track/integration-issues/stalled-lease-cleanup.md'
         );
         expect(fs.existsSync(seedPath)).toBe(true);
         const expected = JSON.parse(
           fs.readFileSync(
             path.join(fixturesRoot, 'duplicate-detection-fixture/expected.json'),
             'utf-8'
           )
         );
         expect(expected.mode).toBe('update');
       });
     });
   });
   ```

   _Note: end-to-end skill execution (agent reads SKILL.md, performs phases) is exercised by Success Criterion 8 ("step 6b end-to-end") in Phase 7 of the spec. Phase 2 tests cover the lock primitive (machine-testable) and the fixture artifacts (machine-checkable). The skill prose's correctness is reviewed by humans during the soundness-review phase._

5. Run: `pnpm -F @harness-engineering/skills test -- harness-compound` — observe failures (fixtures missing). Create the fixture files step-by-step and re-run until green.
6. Run: `harness validate` — confirm the seeded `stalled-lease-cleanup.md` in the duplicate-detection fixture has valid frontmatter (the validator walks `docs/solutions/`, but fixture files live under `agents/skills/tests/fixtures/` so they are NOT walked — confirm this is the case; if `validateSolutionsDir` accidentally walks fixtures, file an issue and exclude the path).
7. Commit: `test(skill): integration tests and fixtures for harness-compound`.

---

### Task 9: [checkpoint:human-verify] Regenerate slash commands and verify `/harness:compound` is discoverable

**Depends on:** Task 7 | **Files:** `agents/commands/{claude-code,gemini-cli,cursor,codex}/harness/compound.md` (generated)

**Category:** integration

1. Run from repo root:
   ```bash
   pnpm -F @harness-engineering/cli build
   node packages/cli/dist/index.js generate-slash-commands --platform claude-code --output /tmp/sc-claude-code
   node packages/cli/dist/index.js generate-slash-commands --platform gemini-cli --output /tmp/sc-gemini
   node packages/cli/dist/index.js generate-slash-commands --platform cursor --output /tmp/sc-cursor
   node packages/cli/dist/index.js generate-slash-commands --platform codex --output /tmp/sc-codex
   ```
2. Verify each output dir contains a `harness/compound.md` file:
   ```bash
   for p in claude-code gemini cursor codex; do
     ls -la /tmp/sc-$p/harness/compound.md && echo "OK $p"
   done
   ```
3. **[checkpoint:human-verify]** Open `/tmp/sc-claude-code/harness/compound.md` and confirm:
   - It references `harness-compound` correctly.
   - The argument hint (if any) makes sense for `/harness:compound [context]`.
   - Tier-2 skills are surfaced (Tier 3 are skipped per `shouldSkipSkill`).

   If output looks wrong, check `packages/cli/src/slash-commands/render-claude-code.ts` and `skill.yaml` `tier`/`platforms` fields.

4. If the project commits generated slash commands (check `agents/commands/` — currently absent in the repo, so this is a no-op), regenerate in place. Otherwise, the slash commands are generated on demand by users; no commit needed for the generated output.
5. Run: `harness validate`.
6. Commit (only if any generated files are tracked): `chore(slash-commands): regenerate after harness-compound addition`.

---

### Task 10: Reserve `.harness/locks/` directory and gitignore it

**Depends on:** Task 2 | **Files:** `.gitignore`, `.harness/locks/.gitkeep`

**Category:** integration

1. Read current `.gitignore`. If `.harness/locks/` is not already ignored, append:
   ```
   # compound-skill per-category locks (auto-cleanup on process exit)
   .harness/locks/
   ```
2. Create `.harness/locks/.gitkeep` with an explanatory comment file beside it (the `.gitkeep` itself is in an ignored dir, so use a tracked sibling). Actually — since the directory is gitignored, no `.gitkeep` is needed. The `acquireCompoundLock` primitive creates the directory on demand (`fs.mkdirSync(lockDir, { recursive: true })`). Skip creating the `.gitkeep`.
3. Verify nothing in `.harness/locks/` is staged: `git status` should be clean.
4. Run: `harness validate`.
5. Commit: `chore: gitignore .harness/locks/ for compound skill lock files`.

---

### Task 11: [checkpoint:human-verify] Verify skill is discoverable via skill registry and final validation pass

**Depends on:** Task 10 | **Files:** none (read-only verification)

**Category:** integration

1. Run: `harness validate` — must pass.
2. Run: `harness check-deps` — must pass.
3. Run: `pnpm -F @harness-engineering/core test` — all tests pass (existing 2495 + lock tests).
4. Run: `pnpm -F @harness-engineering/core typecheck` — zero errors.
5. Run: `pnpm -F @harness-engineering/cli typecheck` — zero errors.
6. Run from `agents/skills/`: `pnpm test` — all platform-parity, structure, schema, and harness-compound tests pass.
7. **[checkpoint:human-verify]** Verify `harness-compound` appears in the skill index:
   ```bash
   pnpm -F @harness-engineering/cli build
   node packages/cli/dist/index.js skill list 2>&1 | grep -i compound
   node packages/cli/dist/index.js skill info harness-compound 2>&1 | head -30
   ```
   Expected: skill name, version 1.0.0, 5 phases listed (identify, classify, overlap-check, assemble, write).
8. **[checkpoint:human-verify]** Confirm `recommend_skills` MCP tool surfaces `harness-compound` for relevant prompts. From the dashboard's chat view, run a prompt like "I just fixed a stuck-issue bug in the orchestrator — capture this." Expected: `harness-compound` is in the recommendations.
9. **[checkpoint:human-verify]** Confirm Phase 2 acceptance: present this checklist to the human:
   - [ ] SKILL.md and skill.yaml exist for all 4 platforms (byte-identical).
   - [ ] `acquireCompoundLock` works: same-category contention rejected, different-category parallel.
   - [ ] Cross-process cleanup verified.
   - [ ] Slash command `/harness:compound` regenerates cleanly.
   - [ ] Integration test fixtures (bug-track, knowledge-track, duplicate-detection) exist and tests pass.
   - [ ] `harness validate` passes.
10. Commit (only if anything changed in step 1-7; otherwise skip): `chore: phase-2 final validation`.

---

## Integration Tasks Derived from Spec's Integration Points

The spec's `## Integration Points` section enumerates many integrations across all 8 phases. Phase 2 only owns a subset — the others are explicitly deferred to Phases 3-8 by the spec's `## Implementation Order`. The following are the Phase-2-scoped integrations, already present in the task list above:

| Spec Integration Point                                       | Task in this plan |
| ------------------------------------------------------------ | ----------------- |
| Entry Point: New slash command `/harness:compound [context]` | Task 9            |
| Registration: Skill barrel exports for `harness-compound`    | Tasks 5–7         |
| Registration: Slash command regeneration                     | Task 9            |

**Explicitly deferred to later phases (NOT in this plan):**

- `harness compound scan-candidates` CLI (Phase 5)
- `BUILT_IN_TASKS` registry entries for `compound-candidates` (Phase 6)
- `harness.orchestrator.md` step 6b directive + `.harness/learnings.md` deprecation (Phase 7)
- `harness-knowledge-pipeline` SKILL.md update (Phase 7)
- `harness-roadmap-pilot` SKILL.md update (Phase 7)
- ADRs 1, 4, 5 (Phase 8)
- AGENTS.md updates (Phase 8)
- `docs/conventions/` boundary doc (Phase 8)
- Compound categories registered with `BusinessKnowledgeIngestor` (Phase 7)

---

## Risks Specific to Phase 2

- **Lock primitive is a `wx` open with manual cleanup, not `proper-lockfile`.** A SIGKILL or hard crash during lock-hold leaves a stale lock that is never cleaned up. Mitigation: documented in SKILL.md ("if you see a stale lock, delete the file"). Acceptable for v1; can swap to `proper-lockfile` later without changing the API. Re-evaluate if stale-lock incidents are reported.
- **TOCTOU between Phase 3 (overlap-check) and Phase 5 (write).** Mitigated by Phase 5's re-check inside the lock. Cost is negligible — re-reading a small directory.
- **Skill prose drift across platforms.** Mitigated by `platform-parity.test.ts` enforcing byte-identical files. Any future edit must update all 4 copies; CI catches drift.
- **The skill is a prose document executed by an agent, not a CLI command.** End-to-end correctness ("does the skill actually produce a good post-mortem doc?") is human-judged. Phase 2 tests the _contract_ (lock, fixtures, structure); the _prose quality_ is reviewed by humans during the soundness-review phase and by real-use feedback in Phases 3-8.
- **The MCP tool `acquire_compound_lock` is referenced in SKILL.md but not implemented in this plan.** The plan's Phase 5 step says "use the MCP tool OR shell out to a Node one-liner". The shell-out is the path that works without additional MCP wiring; the MCP tool is a future ergonomic improvement. Document this in SKILL.md so the agent does not block on a missing tool.

---

## Final Checks

- `harness validate` — Run before plan write (PASS at plan start) and as the last step of every task.
- `.harness/failures.md` — Does not exist yet in this repo; nothing to cross-reference.
- Soundness-review — Run `harness-soundness-review --mode plan` against this draft after writing it; iterate until convergence.
