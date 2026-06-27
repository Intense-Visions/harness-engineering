# Plan: Roadmap Shard Store — Phase 3 (Git and Hook Integration)

**Date:** 2026-06-27 | **Spec:** `docs/changes/roadmap-shard-store/proposal.md` (Phase 3) | **Tasks:** 13 | **Time:** ~50 min | **Integration Tier:** medium

## Goal

Make `docs/roadmap.md` a self-healing, conflict-free generated aggregate: regenerate it deterministically on commit and merge, declare it `merge=ours`, configure the merge driver on init, and mechanically forbid any tool from reading it except the regenerator — without breaking the unmigrated legacy readers that Phase 4 will move onto `RoadmapStore`.

## Background / What already exists (do NOT re-implement)

- **Phase 1 core** (`packages/core/src/roadmap/store/`): `writeRegeneratedRoadmap(shardDir, roadmapPath, io)` is deterministic + byte-stable + prettier-clean; `readShardDir`, `RoadmapStore`, `monolith-store`, `shard-store`, `assembler`, `regenerator`, `migration`, `meta`.
- **Phase 2 CLI** (`packages/cli/src/commands/roadmap/`): `harness roadmap regen` (`regen.ts` → `runRoadmapRegen` → `writeRegeneratedRoadmap`; **errors if `docs/roadmap.d/` is absent**), plus `shard` / `unshard`. The built CLI entry is `node packages/cli/dist/bin/harness.js roadmap regen`.

## Investigated repo facts (real paths, load-bearing)

- **Git hooks are husky-managed** at `.husky/pre-commit` and `.husky/pre-push` (husky 9, `"prepare": "husky"`). There is **no** `.husky/post-merge` yet. The existing pre-commit already contains a precedent "detect staged generator inputs → regenerate → `git add`" block (the plugin-artifact regen) that the roadmap regen block will mirror exactly.
- **`harness init` does NOT install git hooks** into adopter projects (no `core.hooksPath` / pre-commit scaffolding anywhere in `packages/cli/src`). It scaffolds via `scaffoldProject` in `packages/cli/src/commands/init.ts`.
- **No code anywhere sets `git config merge.ours.driver true`** — the existing baseline `merge=ours` entries in `.gitattributes` rely on a documented, manual, per-clone one-time setup (see the comment block at `.gitattributes:17-20`).
- **The agent-hook registries are a different system from git hooks.** `packages/cli/src/hooks/profiles.ts` (`HOOK_SCRIPTS`, `PROFILES`) and `scripts/lib/plugin-config.mjs` (`STANDARD_HOOKS`) register **Claude Code tool-use hooks** whose only events are `PreToolUse | PostToolUse | PreCompact | Stop`. They install `.harness/hooks/*.js` and fire on agent tool calls — never on `git commit` / `git merge`, and never for human commits. See **Concern C1**.
- **Invariant-R surface:** ~22 source files reference `roadmap.md` today (e.g. `packages/core/src/roadmap/{pilot-scoring,health,assignee-lifecycle,mode,sync-engine}.ts`, `packages/core/src/roadmap/migrate/*`, `packages/cli/src/mcp/tools/roadmap*.ts`, `packages/cli/src/commands/{validate,publish-analyses,sync-analyses}.ts`, etc.). **None migrate to the store until Phase 4.** See **Concern C2**.
- **Validation barrel:** `packages/core/src/validation/index.ts` exists; `packages/core/src/index.ts` re-exports `./validation`. `validate.ts` (CLI) registers checks by pushing to `result.checks` / `result.issues` (see `validateRoadmapMode` wiring at `packages/cli/src/commands/validate.ts:182-195`) — the pattern to mirror.
- **Gates pass at baseline:** `harness validate` exit 0 (design-token findings are pre-existing test-fixture noise), `harness check-deps` exit 0 (2 pre-existing circular deps). **pre-push runs `check:changesets`, `format:check`, `typecheck`, `test:coverage`, `coverage-ratchet`, `generate-docs --check`** — so a changeset is required and regen output must stay prettier-clean (Phase 1 guarantees the latter).

## Observable Truths (Acceptance Criteria)

1. **(Ubiquitous)** `.gitattributes` contains `docs/roadmap.md merge=ours`, grouped with the existing auto-generated-file entries.
2. **(Event-driven)** When shard files under `docs/roadmap.d/` are staged for commit, the pre-commit hook shall regenerate `docs/roadmap.md` and re-stage it, so the aggregate never drifts from the shards. When no shard files are staged (e.g. pre-dogfood, today), the hook shall be a no-op.
3. **(Event-driven)** When a merge completes and `docs/roadmap.d/` exists, the post-merge hook shall regenerate `docs/roadmap.md`, clearing any `merge=ours` staleness. When `docs/roadmap.d/` is absent, the hook shall be a no-op (no error).
4. **(Event-driven)** When `harness init` runs in a git repo, the system shall set `git config merge.ours.driver true`; if git is unavailable or the cwd is not a git repo, it shall warn and continue (never fail init).
5. **(State-driven)** While `.gitattributes` declares any `merge=ours` entry but `merge.ours.driver` is unset in the current clone, `harness validate` shall emit a warning naming the one-time fix (`git config merge.ours.driver true`).
6. **(Unwanted)** If any source file outside the explicit allowlist reads `docs/roadmap.md`, then the invariant-R guard test shall fail. The allowlist currently includes the regenerator plus the unmigrated legacy readers; it shrinks in Phase 4.
7. **(Ubiquitous)** `harness validate` holds at its baseline and `harness check-deps` holds at 2 baseline cycles after every task.

## File Map

- MODIFY `.gitattributes` — add `docs/roadmap.md merge=ours`
- MODIFY `.husky/pre-commit` — staged-shard → regen → re-stage block
- CREATE `.husky/post-merge` — regen when `docs/roadmap.d/` exists
- CREATE `packages/core/src/validation/merge-driver.ts` — pure `needsMergeOursDriverWarning()` helper
- CREATE `packages/core/src/validation/merge-driver.test.ts`
- MODIFY `packages/core/src/validation/index.ts` — barrel export (merge-driver + read-source)
- MODIFY `packages/cli/src/commands/validate.ts` — wire merge-driver doctor warning
- CREATE `packages/cli/src/git/merge-driver-setup.ts` — `configureMergeOursDriver(cwd, runner?)`
- CREATE `packages/cli/src/git/merge-driver-setup.test.ts`
- MODIFY `packages/cli/src/commands/init.ts` — call `configureMergeOursDriver` in scaffold
- CREATE `packages/core/src/validation/roadmap-read-source.ts` — detector + `ROADMAP_READ_ALLOWLIST`
- CREATE `packages/core/src/validation/roadmap-read-source.test.ts` — unit tests (fixtures)
- CREATE `packages/core/src/validation/roadmap-read-source.repo.test.ts` — repo guard test
- MODIFY `docs/changes/roadmap-shard-store/proposal.md` — note the C1 hook-mechanism decision (only if Task 1 resolves to git-hook path)
- CREATE `.changeset/roadmap-shard-phase3.md` — changeset (pre-push `check:changesets`)

## Skeleton

_Skeleton approved: pre-approved by standalone invocation. Task count (13) is above the standard-mode threshold (8); presented inline below rather than via a separate gate because the autopilot session pre-authorized Phase 3 decomposition._

1. Decision gate: hook mechanism (~1 task)
2. `.gitattributes` + merge-driver setup/warning (~4 tasks)
3. Regen git hooks + e2e verify + registration reconciliation (~4 tasks)
4. Invariant-R detector + barrel + repo guard (~3 tasks)
5. Changeset (~1 task)

## Concerns / Decisions (READ FIRST — these shape the tasks)

### C1 — DECISION: the regen hook is a GIT hook, not an agent hook (category mismatch in the spec)

The spec (Integration Points → Registrations Required) says to register the regen hook in **both** `profiles.ts` AND `plugin-config.mjs STANDARD_HOOKS`. **Investigation shows this is a category error.** Those registries describe Claude Code **tool-use** hooks (`PreToolUse`/`PostToolUse`/`PreCompact`/`Stop`); they install `.harness/hooks/*.js` and fire on *agent tool calls*. They cannot model `pre-commit`/`post-merge`, do not fire for human commits, and do not fire on `git merge` — exactly the events the spec's Phase-3 body ("pre-commit + post-merge regeneration") requires.

**Recommendation (Option A): implement as husky git hooks; do NOT touch the agent-hook registries.** A `git merge` and the post-merge `merge=ours`-staleness clear can only be handled by a real git hook. Registering a regen entry in `profiles.ts`/`STANDARD_HOOKS` would create a non-functional agent hook and reintroduce the dual-registration desync hazard for no benefit.

- **Option A (recommended):** husky `.husky/pre-commit` block + new `.husky/post-merge`. This repo (the dogfood target, Phase 7) gets working hooks immediately. **Adopter-facing git-hook installation is out of Phase-3 scope** (harness init installs no git hooks today) — flag as a Phase-6 rollout follow-up. Pros: matches the spec body, covers human+merge events, no fake registry entry. Cons: leaves adopter git-hook install for later; a future dev might mistake the absence from `profiles.ts` for a desync bug → mitigated by Task 9's documenting comment.
- **Option B (literal spec reading):** add an agent `PostToolUse` hook on `Edit|Write` that regenerates when a shard is edited, registered in both registries. Pros: satisfies the spec's literal registration text; covers agent shard edits. Cons: does NOT cover human commits or `git merge` (so it cannot satisfy "post-merge"); adds latency to every Edit/Write; still needs a git hook anyway.

**Task 1 is a `[checkpoint:decision]` to confirm Option A before any hook task runs.** Tasks 6–9 are written for Option A and branch in Task 9 if Option B is chosen.

### C2 — DECISION: invariant-R enforced as `violations ⊆ allowlist`, in harness's OWN repo, not adopter `validate`

~22 legacy files read `roadmap.md` and do not migrate until Phase 4. Two sub-decisions:

1. **Sequencing:** author the check **now** but enforce it as "the set of files reading `roadmap.md` must be a subset of `ROADMAP_READ_ALLOWLIST`." The allowlist enumerates today's legacy readers + the regenerator, each annotated `// Phase 4: remove when migrated to RoadmapStore`. This **fails on any NEW reader** (the real risk) while passing on the legacy set. Phase 4 shrinks the allowlist toward `{ regenerator }`.
2. **Enforcement surface:** the invariant is about *harness's own tools*, whose source lives only in this repo — an adopter's `harness validate` has no harness source to scan. So enforcement is a **repo guard test** (`roadmap-read-source.repo.test.ts`, runs under `test:coverage` / pre-push), not an adopter-facing `harness validate` rule. The detector is still a reusable core function so a future `ci check` rule can adopt it. (The separate, adopter-relevant `merge.ours.driver` doctor warning IS wired into `harness validate` — Tasks 3–4 — because that is about the adopter's clone, not harness source.)

### C3 — `.gitattributes merge=ours` lands before the repo is sharded (Phase 7): low risk

Adding `docs/roadmap.md merge=ours` while `roadmap.md` is still the human-authored monolith could, in principle, silently keep "ours" on a merge that brings legitimate roadmap edits from main. **Mitigation: `merge=ours` no-ops unless `merge.ours.driver` is configured per-clone**, and no automation configures it. Net risk is low; the entry is inert until a clone opts in. Flagged, not blocking.

### C4 — existing clones need the one-time `git config merge.ours.driver true`

`harness init` (Task 5) fixes only NEW clones. This repo and current adopters that already ran init still need the manual command. Task 4 adds a `harness validate` doctor warning so existing clones are told. (This repo itself: run it once after this plan lands.)

## Tasks

### Task 1: [checkpoint:decision] Confirm the regen-hook mechanism

**Depends on:** none | **Files:** none (decision only)

1. Present Concern **C1** (Option A husky git hooks — recommended — vs Option B agent `PostToolUse` hook) to the human with the analysis above.
2. Record the decision in the session handoff `decisions` field.
3. If **Option A**: proceed; Tasks 6–9 apply as written.
4. If **Option B**: stop and revise Tasks 6–9 (Task 9 becomes "register in both `profiles.ts` `HOOK_SCRIPTS` AND `plugin-config.mjs STANDARD_HOOKS`, update `support-files.ts` if shared logic, verify parity") and still add a git `post-merge` hook because Option B cannot satisfy the post-merge truth.

> No commit. This is a gate.

### Task 2: Add `docs/roadmap.md merge=ours` to `.gitattributes`

**Depends on:** none | **Files:** `.gitattributes`

1. Under the existing "Auto-generated baseline files" block (after `benchmark-baselines.json merge=ours`), add:
   ```gitattributes
   # Generated roadmap aggregate — shards under docs/roadmap.d/ are the source of
   # truth; docs/roadmap.md is regenerated by the pre-commit/post-merge hook.
   # Same one-time per-clone setup as above: git config merge.ours.driver true
   docs/roadmap.md merge=ours
   ```
2. Verify the attribute resolves: `git check-attr merge -- docs/roadmap.md` prints `docs/roadmap.md: merge: ours`.
3. Run: `node packages/cli/dist/bin/harness.js validate` (expect baseline).
4. Commit: `chore(roadmap): declare docs/roadmap.md merge=ours`

### Task 3: (TDD) Pure `needsMergeOursDriverWarning` helper in core

**Depends on:** none | **Files:** `packages/core/src/validation/merge-driver.ts`, `packages/core/src/validation/merge-driver.test.ts`, `packages/core/src/validation/index.ts`

1. Write `merge-driver.test.ts`:
   - returns `true` when gitattributes content contains a `merge=ours` line AND `driverConfigured === false`;
   - returns `false` when no `merge=ours` line is present (regardless of driver);
   - returns `false` when `driverConfigured === true`;
   - ignores commented (`#`) lines.
2. Run: `pnpm --filter @harness-engineering/core test -- merge-driver` — observe failure.
3. Implement `export function needsMergeOursDriverWarning(gitattributesContent: string, driverConfigured: boolean): boolean` — pure string scan (uncommented line matching `/\bmerge=ours\b/`).
4. Add `export * from './merge-driver';` to `validation/index.ts`.
5. Run the test — observe pass. Run: `pnpm --filter @harness-engineering/core build`.
6. Run: `node packages/cli/dist/bin/harness.js validate` (baseline).
7. Commit: `feat(core): add needsMergeOursDriverWarning validation helper`

### Task 4: (TDD) Wire the merge-driver doctor warning into `harness validate`

**Depends on:** Task 3 | **Files:** `packages/cli/src/commands/validate.ts` (+ its sibling test file)

1. In the validate test, add a case: a temp project whose `.gitattributes` has `x merge=ours` and whose `git config --get merge.ours.driver` is empty produces a warning issue `check: 'mergeDriver'` whose message names `git config merge.ours.driver true`; when the config is `true`, no such issue.
2. Run the validate test — observe failure.
3. In `validate.ts`, after the `validateRoadmapMode` block (~line 195), read `<cwd>/.gitattributes` (if present) and `git config --get merge.ours.driver` (mirror the git-exec pattern in `packages/cli/src/commands/validate-cross-check.ts`), call `needsMergeOursDriverWarning(...)`, and on `true` push a **warning** issue (`result.checks.mergeDriver = false` + `result.issues.push({ check: 'mergeDriver', message: ... })`). Add `mergeDriver?: boolean` to the `checks` type.
4. Run the test — observe pass.
5. Run: `pnpm --filter @harness-engineering/cli build && node packages/cli/dist/bin/harness.js validate` (baseline; on this repo the warning may now appear until `git config merge.ours.driver true` is run — that is the intended C4 nudge).
6. Commit: `feat(cli): warn when merge=ours is declared but merge.ours.driver is unset`

### Task 5: (TDD) `harness init` configures `merge.ours.driver`

**Depends on:** none (parallel with 2–4) | **Files:** `packages/cli/src/git/merge-driver-setup.ts`, `packages/cli/src/git/merge-driver-setup.test.ts`, `packages/cli/src/commands/init.ts`

1. Write `merge-driver-setup.test.ts`: `configureMergeOursDriver(cwd, runner)` with an injected `runner` invokes it with `['config', 'merge.ours.driver', 'true']`; when the runner throws (git missing / not a repo) it returns a non-fatal result (resolves, no throw) and surfaces a warning flag.
2. Run the test — observe failure.
3. Implement `merge-driver-setup.ts`: `export async function configureMergeOursDriver(cwd: string, runner = defaultGitRunner): Promise<{ configured: boolean; warning?: string }>` where `defaultGitRunner` uses `spawnSync('git', args, { cwd })` (mirror existing git-exec usage). Swallow errors → `{ configured: false, warning: '...' }`.
4. In `init.ts` `scaffoldProject` (near `ensureHarnessGitignore(cwd)` at ~line 172), `await`/call `configureMergeOursDriver(cwd)` and `logger.warn` on the warning. (Keep init non-failing.)
5. Run the test — observe pass. Run: `pnpm --filter @harness-engineering/cli build`.
6. Run: `node packages/cli/dist/bin/harness.js validate` (baseline).
7. Commit: `feat(cli): init sets git merge.ours.driver for generated-file merges`

### Task 6: Add the pre-commit regen-and-restage block (Option A)

**Depends on:** Task 1 (Option A), Task 2 | **Files:** `.husky/pre-commit`

1. After the existing plugin-artifact regen block, append (mirroring its `git diff --cached --name-only | grep` shape):
   ```sh
   # Regenerate the roadmap aggregate when any shard is staged, so docs/roadmap.md
   # (merge=ours) never drifts from docs/roadmap.d/. No-op when no shard is staged
   # (e.g. before this repo is sharded). Output is deterministic + prettier-clean
   # (writeRegeneratedRoadmap), so it never trips the pre-push format:check.
   if git diff --cached --name-only | grep -qE '^docs/roadmap\.d/'; then
     node packages/cli/dist/bin/harness.js roadmap regen >/dev/null 2>&1 || true
     git add docs/roadmap.md 2>/dev/null || true
   fi
   ```
2. Confirm the block is a no-op today: `git diff --cached --name-only | grep -qE '^docs/roadmap\.d/'` matches nothing on a normal commit.
3. Run: `node packages/cli/dist/bin/harness.js validate` (baseline).
4. Commit: `chore(hooks): regenerate roadmap aggregate when shards are staged`

> Config edit (shell), not application code — verified end-to-end in Task 8. Regen logic itself is covered by Phase 2 tests.

### Task 7: Add the post-merge regen hook (Option A)

**Depends on:** Task 1 (Option A), Task 2 | **Files:** `.husky/post-merge`

1. Create `.husky/post-merge`:
   ```sh
   # Clear merge=ours staleness: after a merge, regenerate docs/roadmap.md from the
   # shards. No-op (and never errors) when the repo is not sharded yet.
   if [ -d docs/roadmap.d ]; then
     node packages/cli/dist/bin/harness.js roadmap regen >/dev/null 2>&1 || true
   fi
   ```
2. `chmod +x .husky/post-merge` (match `.husky/pre-push` perms).
3. Run: `node packages/cli/dist/bin/harness.js validate` (baseline).
4. Commit: `chore(hooks): regenerate roadmap aggregate after merge`

### Task 8: [checkpoint:human-verify] End-to-end git-hook verification

**Depends on:** Tasks 6, 7 | **Files:** none (verification)

1. In a throwaway temp git repo (or a scratch branch), scaffold a minimal `docs/roadmap.d/<slug>.md` + `_meta.md` (reuse a Phase-2 round-trip fixture), stage a shard edit, and `git commit`. **Verify** `docs/roadmap.md` was regenerated and included in the commit (pre-commit re-stage worked).
2. Create a second branch editing a *different* shard; merge it. **Verify** `.husky/post-merge` regenerated `docs/roadmap.md` with no error.
3. **Verify** on the current (un-sharded) repo: a normal commit with no staged `docs/roadmap.d/` files does NOT invoke regen and does NOT fail (`harness roadmap regen` would error on a missing shard dir — the guard must prevent that path).
4. Pause and show results; wait for human confirmation before continuing.

> No commit (verification only). If step 3 reveals the guard is wrong, fix Task 6/7 before proceeding.

### Task 9: [integration] Reconcile hook registration with the agent-hook registries

**Depends on:** Task 1 | **Files (Option A):** `docs/changes/roadmap-shard-store/proposal.md` | **Files (Option B):** `packages/cli/src/hooks/profiles.ts`, `scripts/lib/plugin-config.mjs`, `packages/cli/src/hooks/support-files.ts` | **Category:** integration

1. **If Option A (recommended):** add a short note to the proposal's Integration Points / Registrations section (and a one-line comment near `.husky/post-merge`) recording that the regen hook is intentionally a **git** hook and is deliberately NOT in `profiles.ts`/`STANDARD_HOOKS` (those are Claude Code tool-use hooks). This prevents a future dev from "fixing" the perceived desync. No registry edits.
2. **If Option B:** add the regen entry to BOTH `HOOK_SCRIPTS` in `profiles.ts` AND `STANDARD_HOOKS` in `plugin-config.mjs` (keep them parity-identical — no test catches a desync), update `support-files.ts` if the hook shares logic, run `pnpm generate:plugin:all`, and verify `pnpm generate:plugin:check` passes.
3. Run: `node packages/cli/dist/bin/harness.js validate` (baseline).
4. Commit (Option A): `docs(roadmap): record regen hook is a git hook, not an agent hook` / (Option B): `feat(hooks): register roadmap-regen agent hook in profiles and STANDARD_HOOKS`

### Task 10: (TDD) Invariant-R detector + allowlist in core

**Depends on:** none (parallel with hook tasks) | **Files:** `packages/core/src/validation/roadmap-read-source.ts`, `packages/core/src/validation/roadmap-read-source.test.ts`

1. Write `roadmap-read-source.test.ts` against temp fixture trees:
   - a file outside the allowlist containing `roadmap.md` in a read context is reported as a violation;
   - a file ON the allowlist is not reported;
   - the regenerator/store paths are not reported;
   - returns `[]` for a clean tree.
2. Run: `pnpm --filter @harness-engineering/core test -- roadmap-read-source` — observe failure.
3. Implement `roadmap-read-source.ts`:
   - `export const ROADMAP_READ_ALLOWLIST: readonly string[]` — repo-relative paths of every current `roadmap.md` reader (enumerate from the investigated list: `packages/core/src/roadmap/{pilot-scoring,health,assignee-lifecycle,mode,sync-engine}.ts`, `packages/core/src/roadmap/migrate/{plan-builder,run,types}.ts`, `packages/core/src/architecture/prediction-engine.ts`, `packages/core/src/validation/roadmap-mode.ts`, `packages/cli/src/config/schema.ts`, `packages/cli/src/mcp/tools/{roadmap-file-less,roadmap-auto-sync,roadmap}.ts`, `packages/cli/src/commands/{validate,publish-analyses,sync-analyses}.ts`, `packages/cli/src/commands/roadmap/{shard,migrate,migrate-lock,unshard}.ts`, plus the regenerator/`regen.ts`), each annotated `// Phase 4: remove when migrated to RoadmapStore` (except the regenerator + store, which stay permanently).
   - `export function findRoadmapReadSourceViolations(repoRoot: string, allowlist = ROADMAP_READ_ALLOWLIST): string[]` — walk `packages/*/src/**/*.ts` (skip `*.test.ts`, `dist/`, `node_modules/`), flag files whose contents reference `roadmap.md` and that are not in `allowlist`; return repo-relative paths sorted.
4. Run the test — observe pass.
5. Run: `pnpm --filter @harness-engineering/core build && node packages/cli/dist/bin/harness.js validate` (baseline).
6. Commit: `feat(core): add roadmap read-source invariant detector (invariant R)`

### Task 11: Barrel-export the read-source detector

**Depends on:** Task 10 | **Files:** `packages/core/src/validation/index.ts`

1. Add `export * from './roadmap-read-source';` to `validation/index.ts` (confirm `packages/core/src/index.ts` already re-exports `./validation`).
2. Run: `pnpm --filter @harness-engineering/core build`.
3. Run: `node packages/cli/dist/bin/harness.js check-deps` (expect 2 baseline cycles, no new ones).
4. Commit: `feat(core): export roadmap read-source invariant detector`

### Task 12: (TDD) Repo guard test enforcing `violations ⊆ allowlist`

**Depends on:** Tasks 10, 11 | **Files:** `packages/core/src/validation/roadmap-read-source.repo.test.ts`

1. Write `roadmap-read-source.repo.test.ts`: resolve the monorepo root (walk up from `__dirname`/`import.meta` to the dir containing `pnpm-workspace.yaml`), call `findRoadmapReadSourceViolations(repoRoot)`, and `expect(violations).toEqual([])` — i.e. every actual reader must be on the allowlist (catches a NEW reader; passes on the curated legacy set).
2. Run: `pnpm --filter @harness-engineering/core test -- roadmap-read-source.repo` — it must PASS immediately (allowlist already enumerates today's readers). If it fails, a reader was missed in Task 10's allowlist — add it (annotated) and note the gap.
3. Run: `node packages/cli/dist/bin/harness.js validate` (baseline).
4. Commit: `test(core): guard the roadmap read-source invariant against new readers`

### Task 13: [integration] Add the Phase-3 changeset

**Depends on:** Tasks 2–12 | **Files:** `.changeset/roadmap-shard-phase3.md` | **Category:** integration

1. Create `.changeset/roadmap-shard-phase3.md` with the appropriate package bump(s) (`@harness-engineering/core`, `@harness-engineering/cli`) summarizing: roadmap regen git hooks, `merge=ours` declaration + init driver config + validate warning, and the read-source invariant guard.
2. Run: `pnpm run check:changesets` (the pre-push gate) — observe pass.
3. Run: `node packages/cli/dist/bin/harness.js validate` (baseline).
4. Commit: `chore(roadmap): add changeset for Phase 3 git/hook integration`

## Sequencing summary

- **Gate:** Task 1 (decision) precedes Tasks 6–9.
- **Independent tracks (parallelizable):** {2,3,4,5} merge-driver/gitattributes · {10,11,12} invariant-R · {6,7,8,9} hooks (after Task 1+2).
- **Last:** Task 13 changeset (after all code lands).
- Each task ends with `harness validate` at baseline; barrel/import changes also run `harness check-deps`.

## Traceability (truth → task)

| Truth | Tasks |
| ----- | ----- |
| 1 (`merge=ours` declared) | 2 |
| 2 (pre-commit regen) | 6, 8 |
| 3 (post-merge regen) | 7, 8 |
| 4 (init sets driver) | 5 |
| 5 (validate doctor warning) | 3, 4 |
| 6 (invariant-R guard) | 10, 11, 12 |
| 7 (gates at baseline) | every task |

## Out of scope / deferred (flag for later phases)

- **Adopter-facing git-hook installation** (`harness init` installing pre-commit/post-merge into adopter repos) — harness installs no git hooks today; defer to Phase 6 rollout.
- **Shrinking `ROADMAP_READ_ALLOWLIST`** — happens in Phase 4 as writers move onto `RoadmapStore`.
- **ADRs for invariant R and D2** — the spec assigns these to Phase 6 (Rollout); only a forward-pointing note is added here.
- **Running the migration on this repo's real roadmap.md** — Phase 7 dogfood.
