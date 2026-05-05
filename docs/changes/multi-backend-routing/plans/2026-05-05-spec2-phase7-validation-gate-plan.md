# Plan: Spec 2 Phase 7 — Validation Gate

**Date:** 2026-05-05 | **Spec:** `docs/changes/multi-backend-routing/proposal.md` (§"Implementation Order — Phase 7: Validation gate"; spec phase 7 = autopilot phase index 6) | **Tasks:** 6 | **Time:** ~30 min | **Integration Tier:** small (verification-only) | **Session:** `changes--multi-backend-routing--proposal`

## Goal

Run the full-spec mechanical-suite gate that confirms Spec 2 (multi-backend-routing) is end-to-end ready for merge: typecheck / lint / test / format-check / `harness validate` / `harness check-docs` all pass at the repo root; the SC30 grep invariant and the SC41 state-machine-test-file-unchanged invariant still hold; the consolidated SC1–SC47 trace from Phases 0–5 has no regression versus its prior-phase baselines (test counts byte-identical to Phase 5 final: 826 / 218 / 305); and a structural end-to-end smoke walks a representative multi-backend config through the loaded code paths (config validation → migration shim → router → backend factory → resolver Map → dispatch site → analysis provider → dashboard collection endpoint) by inspecting the on-disk wiring rather than booting a live orchestrator. After this phase, autopilot DONE owns the remaining transitions (KG reindex, roadmap status flip, final handoff, PR prompt).

## Observable Truths (Acceptance Criteria)

These map directly to the spec's Phase 7 exit line (`SC44–SC47 green. Smoke passes.`) plus the regression invariants the Phase 5 verifier flagged as Phase 7 responsibilities (SC30 grep + SC41 test-file unchanged + Phase 0–5 test-count parity).

1. **SC44 (typecheck)** — Running `pnpm typecheck` from the repo root exits 0. All four spec-touched packages (`@harness-engineering/types`, `@harness-engineering/orchestrator`, `@harness-engineering/intelligence`, `@harness-engineering/dashboard`) are covered by the turborepo task graph, so a single root invocation suffices. _Source: spec line 621, "pnpm typecheck passes with strict mode on all changed files."_

2. **SC45 (lint)** — Running `pnpm lint` from the repo root exits 0. The expected output line `FULL TURBO 9/9` (matching Phase 4's verifier baseline) confirms the cache hit when the docs-only Phase 5 introduced zero packages/\*\* changes; if any task in the lint graph re-runs, it must still PASS. No new ESLint suppressions appear in the diff `git diff aee80f44..HEAD` (Phase 5 base → current head). _Source: spec line 622, "pnpm lint passes; no new ESLint suppressions introduced."_

3. **SC46 (test)** — Running `pnpm test` from the repo root exits 0. The aggregate test count in the orchestrator + intelligence + dashboard packages is **826 + 218 + 305 = 1349**, byte-identical to the Phase 5 verifier counts (`phase-5-verification.json` lines 23-25). Any per-package count delta is a regression and blocks the gate. _Source: spec line 623, "pnpm test passes the full test suite, including new router, migration, and multi-backend tests."_

4. **SC47 (harness validate + harness check-docs)** — Running `harness validate` exits 0 and `harness check-docs` exits 0 with documentation coverage **97.0%** (matching Phase 5 final baseline at commit `53debcec`; Phase 5 fixup pass added zero docs and confirmed the figure at `32989caf`). _Source: spec line 624, "harness validate and harness check-docs pass after the spec is written and the implementation lands." Cross-ref: phase-5-verification.json line 20._

5. **SC30 (invariant grep)** — `grep -rEn "backend\s*===\s*'local'|backend\s*==\s*'local'|this\.localRunner\b|this\.runner\b" packages/orchestrator/src/ -- ':(exclude)*.test.ts'` returns zero hits in live code paths. Comment-only references at `packages/orchestrator/src/orchestrator.ts:121` (doc comment about `runner.backend`) and the runtime field accesses elsewhere were removed in Phase 2. _Source: spec line 593-594 (SC30 wording); Phase 2 INTEGRATE artifact closure._

6. **SC41 (state-machine test file unchanged)** — `git diff <spec2-base>..HEAD -- packages/orchestrator/tests/core/state-machine.test.ts` is empty. The spec base for Spec 2 is the predecessor commit `3c59cd34` (autopilot-state.json `startingCommit`); the file path is `packages/orchestrator/tests/core/state-machine.test.ts` (verified — `state-machine.test.ts` lives under `core/`, not at the test-dir root). _Source: spec line 593+ SC41 wording; autopilot-state.json line 5._

7. **OT-Smoke-Legacy** — A structural inspection of the legacy-config path confirms: (a) `packages/orchestrator/src/agent/config-migration.ts` exists and exports `migrateAgentConfig` plus the `MIGRATION_GUIDE = 'docs/guides/multi-backend-routing.md'` constant (config-migration.ts:32 per phase-5-verification.json line 16); (b) the orchestrator's startup-warn message references the migration guide path; (c) the config-migration.test.ts suite exercises the legacy → modern translation table including the `agent.localBackend` synthesize-into-`backends.local` case. No live boot is required; an existing orchestrator integration test in `packages/orchestrator/tests/agent/config-migration.test.ts` already covers the assertion.

8. **OT-Smoke-Modern** — A structural inspection of the modern-config path confirms: (a) `packages/orchestrator/tests/agent/multi-backend-dispatch.test.ts` exercises the dispatch path with a multi-backends config and asserts that `OrchestratorBackendFactory.forUseCase` is called with the correct use-case key for each `dispatchIssue` invocation (per autopilot-state.json line 322 P2-S5 finding context); (b) `packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts` exercises the factory contract; (c) `packages/orchestrator/tests/agent/multi-resolver-independence.test.ts` exercises the multi-resolver Map behavior. All three test files exist on disk (verified by `ls packages/orchestrator/tests/agent/`).

9. **OT-Smoke-Multi-Local** — A structural inspection of the multi-local path confirms: (a) `packages/orchestrator/tests/agent/multi-resolver-independence.test.ts` covers the per-backend-name `Map<string, LocalModelResolver>` lifecycle Phase 3 introduced; (b) `packages/dashboard/src/server/http.ts` routes `/api/v1/local-models/status` (plural) — verified via grep `handleLocalModelsRoute` wiring per phase-4-verification.json line 81; (c) the dashboard's banner component renders one banner per element of the `useLocalModelStatuses()` array (Phase 4 Tasks 12-13 deliverables). No live two-resolver boot required; the existing test wiring is the smoke evidence.

10. **OT-Test-Count-Parity** — The per-package test counts at the head of this phase exactly match Phase 5 final: orchestrator 826, intelligence 218, dashboard 305. Sourced from `phase-5-verification.json` lines 23-25; cross-referenced in `autopilot-state.json` phaseProgress.5.verify.commands.

11. **OT-No-Code-Change** — `git diff 32989caf..HEAD -- 'packages/**/src/**' 'packages/**/tests/**'` is empty. Phase 7 is verification-only; the only commits this phase produces are the Task 5 results-recording commit (touches only the new verification artifact in `.harness/sessions/`) and the optional Task 6 phase-exit chore commit (touches only the Phase 7 plan doc). _Pre-existing dirty-tree items observed in autopilot-state.json phaseProgress.5.verify.concerns ("pre-existing-dirty-tree") carry forward unchanged: `packages/cli/.harness/arch/baselines.json` (modified, Spec 2 baseline drift) and `docs/changes/multi-backend-routing/plans/2026-05-05-spec2-phase6-documentation-adrs-knowledge-plan.md` (untracked Phase 5 plan); both are autopilot DONE responsibilities per the brief._

12. **OT-Format-Check** — Running `pnpm format:check` from the repo root exits 0. Prettier has been auto-running via `lint-staged` on every Phase 5 commit (per phase-5 handoff.json concerns) so this is expected to be clean; Phase 7 verifies it is. The spec's Phase 7 task list (line 711) names `pnpm format:check` explicitly alongside the other three pnpm gates.

13. **OT-SC-Coverage-Trace** — A consolidated SC trace appended to the Task 5 verification artifact lists every SC1–SC47 with its closing phase reference (per the autopilot-state.json `phaseProgress` structure) and confirms zero open SC items remain. SCs land per the spec annotation: SC1–SC15 Phase 0; SC16–SC26 Phase 1; SC15 (re-affirmed)/SC27–SC30/SC37/SC41–SC43 Phase 2; SC31–SC36 Phase 3; SC38–SC40 Phase 4; SC47 (mid-spec docs gate) Phase 5; **SC44–SC46 Phase 7 (this gate)**. _Source: spec §Success Criteria block (lines 552-624) cross-referenced with autopilot-state.json phaseProgress per-phase scResults._

## Skills (from `docs/changes/multi-backend-routing/SKILLS.md`)

The advisor's auto-generated skill list emphasizes TypeScript / Zod skills for code work. Phase 7 is a verification phase — no new code is written — so no Apply-tier skills apply.

- _(no apply-tier skills)_ — All Apply and Reference skills (`ts-template-literal-types`, `ts-zod-integration`, `gof-factory-method`, etc.) target architecture-decision and code-implementation tasks. None apply to running mechanical gates.
- **harness-soundness-review** (process gate, not in SKILLS.md) — invoked once at end of Phase 4 (this plan's VALIDATE phase) before writing the plan, per the harness-planning skill's Phase 4 step 6.

No per-task skill annotations below — none of the listed skills move the needle on a verification-only phase.

## Uncertainties

### Blocking

- _(none)_ — All Phase 7 inputs (commit base, test counts, file paths, gate commands) are knowable from prior verification artifacts; the SC30 grep and SC41 diff-check both pre-verified PASS during planning Phase 4 (see "VALIDATE — Plan author's pre-flight checks" below).

### Assumptions

- **[ASSUMPTION]** No prior phase introduced a new `.skip`, `.skipIf`, `xit`, or `xdescribe` that would make the test counts numerically equal but semantically smaller. Verifiable by `git diff <spec-2-base>..HEAD -- 'packages/**/tests/**' | grep -E '^[+].*\b(\.skip|skipIf|xit|xdescribe)\b'` returning empty (Phase 5 verification antiPatternScan already confirmed this through Phase 5; Phase 7 re-runs the check across the full Spec 2 commit range for safety).
- **[ASSUMPTION]** `pnpm test` at the repo root invokes the per-package test scripts via turborepo and aggregates exit codes correctly (it does — `turbo run test` is the root script per `package.json`). If a future workspace addition introduces a test script that turbo cannot reach, the per-package fallback (`pnpm --filter @harness-engineering/orchestrator test`, etc.) is the manual recovery; per phase-5-verification.json all three per-package invocations are also recorded explicitly.
- **[ASSUMPTION]** `harness check-arch` is **NOT** part of the Phase 7 gate. The spec line 711 lists `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`, `harness validate`, and `harness check-docs` — six commands. `harness check-arch` is run by every prior phase's verifier (Phase 5 line 22 documents the same complexity/module-size/dependency-depth warnings carried forward from Phase 4) but flags as `warnings unchanged`, not `error`. We record the `harness check-arch` result in the Phase 7 verification artifact for traceability but **do not** treat any pre-existing baseline drift as a Phase 7 blocker. _Justification: spec author explicitly omitted check-arch from the Phase 7 task list; carry-forward concerns from Phases 2-5 are tracked in autopilot-state.json `phaseProgress.{2,3,4,5}.verify.findings` and are explicitly closed-as-tracked (not closed-as-fixed)._
- **[ASSUMPTION]** Pre-existing dirty-tree items (`packages/cli/.harness/arch/baselines.json` modified + Phase 5 plan doc untracked + this plan doc once written) are not Phase 7 verification scope. They are autopilot DONE concerns per the user brief. The Task 5 verification artifact records their presence so DONE has the inventory but does not gate on them. _Source: phase-5-verification.json line 61 ("pre-existing-dirty-tree" concern → "Recommend autopilot DONE handle commit decisions")._
- **[ASSUMPTION]** The Phase 7 commit set is at most two commits: (a) the Task 5 verification-artifact commit (`docs/sessions: record Spec 2 Phase 7 verification artifact` style — actual file is in `.harness/sessions/...` so the convention is closer to `chore(spec2): Phase 7 exit gate green`), and (b) an optional plan-doc tracking commit (Task 6) consistent with Phase 4's P4-IMP-2 fixup pattern of `chore(spec2): track Phase N plan doc in git`. If the plan doc is left untracked for autopilot DONE to bundle (option B in Task 6), the phase produces a single commit. _Default: option B (single commit), to mirror the existing convention where Phase 5 left its plan doc untracked for DONE._
- **[ASSUMPTION]** No new SCs land between Phase 5 final (commit `32989caf`) and the start of Phase 7. The spec's SC list is closed at SC47; no Phase has introduced extra-numbered ad-hoc SCs (verified by grep against the spec proposal — only SC1–SC47 appear).
- **[ASSUMPTION]** The 4th legacy `this.config.agent.backend` read at `packages/orchestrator/src/orchestrator.ts:1320` (line 1320 today; the autopilot-state.json line ~1295/~1320 figures align) is **out of Phase 7 scope** per the brief and Phase 3 carry-forward note. It exists in a fallback expression for an error-message string template — not a routing-decision read — and its survival does not contradict SC30 (which targets `backend === 'local'` switches and `this.runner|this.localRunner` field reads, not synonym strings used in error formatting). The phase-3 plan author and Phase 3 verifier both independently called this out as scope for a follow-up alias-removal spec.

### Deferrable

- **[DEFERRABLE]** Knowledge graph reindex (`harness scan` + `harness ingest`). Carried across Phases 2/3/4/5 INTEGRATE artifacts as "deferred to spec completion"; autopilot DONE handles it (per the brief).
- **[DEFERRABLE]** `docs/roadmap.md:1097` planned → done flip. Autopilot DONE convention.
- **[DEFERRABLE]** `packages/cli/.harness/arch/baselines.json` working-tree modification commit decision. Autopilot DONE concern (per phase-5-verification.json line 61).
- **[DEFERRABLE]** Final session handoff write to `.harness/sessions/.../handoff.json` capturing Phase 7 results in a form autopilot DONE can ingest. Phase 7 itself writes a verification-artifact JSON under the same session dir; the DONE handoff is downstream.
- **[DEFERRABLE]** PR creation. Autopilot DONE concern.
- **[DEFERRABLE]** `templates/orchestrator/harness.orchestrator.md` + project-root `harness.orchestrator.md` modern-schema example. Phase 5 planner P6-C3 deliberately deferred to a follow-up alias-removal spec; Phase 7 does not touch.
- **[DEFERRABLE]** 4th legacy `agent.backend` read at `orchestrator.ts:~1320`. Out of Spec 2 scope (Phase 3 + Phase 4 carry-forward concerns; alias-removal follow-up spec).
- **[DEFERRABLE]** Remaining Phase 0–5 suggestions (NF-2, NF-3 from Phase 0; P1-S1/S2/S3/S4 from Phase 1; P2-S1/S2/S3/S5 from Phase 2; P3-SUG-1/3/4/5/7 from Phase 3; P4-S2/S3/S4/S5 from Phase 4; P5-FIXUP-SUG-1/2 from Phase 5). All flagged "no-blocking" by their respective REVIEW phases; carried forward as suggestion-tier inventory for future spec planning.

## File Map

```
CREATE  .harness/sessions/changes--multi-backend-routing--proposal/phase-6-verification.json   (Phase 7 = autopilot index 6 verification artifact)
MODIFY  (none under packages/** — verification phase only)
```

**1 file created (verification artifact).** Zero `packages/**` source/test changes. Zero `docs/**` changes.

**Integration tier: small.** Verification-only phase. Per harness-planning Integration Tier Heuristics: "Bug fix, config change, < 3 files, no new exports" maps to small; verification phases trivially satisfy this. Default wiring checks (`harness validate`, the gate suite itself) run as the phase's primary work; no roadmap mark or knowledge-graph reindex required at this phase boundary (autopilot DONE handles those at spec completion). The verification artifact is non-source persistent state, written under `.harness/sessions/...` per the same convention as `phase-{0..5}-verification.json`.

## Skeleton (groups, ~120 tokens; pending APPROVE_PLAN)

1. Mechanical gate suite — typecheck / lint / test / format:check (~1 task, ~10 min — bulk of wall-clock)
2. Harness gate suite — `harness validate` + `harness check-docs` + `harness check-deps` + `harness check-arch` (record-only) (~1 task, ~3 min)
3. Invariant verification — SC30 grep + SC41 git diff + Phase 0–5 test-count parity (~1 task, ~3 min)
4. End-to-end smoke (structural inspection of legacy + modern + multi-local paths) (~1 task, ~5 min)
5. Verification-artifact write + commit (~1 task, ~7 min)
6. Phase exit gate confirmation (signal autopilot DONE) (~1 task, ~2 min)

**Estimated total:** 6 tasks, ~30 min. **Complexity: low** confirmed (matches spec annotation; no override). **No checkpoints requiring human input** — all tasks are mechanical command runs and a single artifact write. _Tasks 1–4 can technically run in parallel (independent gates) but are kept serial here so a single failure aborts cleanly without orphaning later tasks._

_Skeleton approved: pending APPROVE_PLAN._

---

## Tasks

### Task 1: Run the four-pnpm mechanical gate suite

**Depends on:** none | **Files:** none (read-only command runs) | **Category:** verification

1. From the repo root (`/Users/cwarner/Projects/iv/harness-engineering`), run **in sequence**:

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm format:check
   ```

2. Capture the exit code and the last 5 lines of stdout for each invocation. Expected results:
   - `pnpm typecheck` — exit 0; turbo `FULL TURBO 4/4` (or all-task green) on the four spec-touched packages plus any others in the workspace.
   - `pnpm lint` — exit 0; expect `FULL TURBO 9/9` (the Phase 4 verifier baseline) since Phase 5 introduced zero packages/\*\* changes; if the lint cache misses, all tasks must still pass.
   - `pnpm test` — exit 0; aggregate count must hit **826 + 218 + 305 = 1349** on the orchestrator + intelligence + dashboard packages plus whatever other packages run tests. If the aggregate is `1349 + N` for some N that comes from other packages (e.g., types tests), capture N from the per-package output for the verification record.
   - `pnpm format:check` — exit 0; "All matched files use Prettier code style!" or equivalent green message.

3. **If any of the four gates fails, STOP this phase and surface the failure as a Phase 7 blocker.** Do not proceed to Task 2. The failure is either (a) a regression introduced post-Phase-5-final-fixup-pass `32989caf` (highly unlikely; verify by `git log 32989caf..HEAD --oneline` returning empty against `packages/**` and `docs/**`), or (b) a transient environment issue (e.g., missing `node_modules`; recover with `pnpm install`).

4. Save the captured exit codes + stdout tails into a holding buffer (mental scratchpad or temporary file) for Task 5 to consume into the verification artifact.

5. Run: `harness validate` (no-op since no source/docs changed, but the methodology requires it as a sanity check on the in-flight session state).

6. **Do not commit.** Task 5 writes the verification artifact and commits.

**Time estimate:** ~10 min (dominated by `pnpm test` cold cache; ~3-5 min if turbo cache is hot from Phase 5 verification).

---

### Task 2: Run the harness gate suite

**Depends on:** Task 1 (PASS) | **Files:** none (read-only command runs) | **Category:** verification

1. From the repo root, run **in sequence**:

   ```bash
   harness validate
   harness check-docs
   harness check-deps
   harness check-arch
   ```

2. Expected results:
   - `harness validate` — exit 0, "v validation passed" (verified to PASS during planning Phase 4 pre-flight).
   - `harness check-docs` — exit 0, "v Documentation coverage: 97.0%" (Phase 5 final baseline at `32989caf` confirmed during planning Phase 4 pre-flight; matches phase-5-verification.json line 20).
   - `harness check-deps` — exit 0, "v validation passed" (verified to PASS during planning Phase 4 pre-flight).
   - `harness check-arch` — exit 0 OR exit 0-with-warnings. **Warnings are accepted** if and only if the warning set matches the Phase 5 final baseline (per phase-5-verification.json line 22: "Same complexity/module-size/dependency-depth regression deltas as Phase 4 final; pre-existing baseline drift in packages/cli/.harness/arch/baselines.json. Phase 5 introduced zero new violations."). **Any new violation is a regression and aborts the phase.** Capture the full warning output for the verification record.

3. **If `harness validate`, `harness check-docs`, or `harness check-deps` fails, abort.** SC47 explicitly names `harness validate` and `harness check-docs`; `harness check-deps` is the methodology-required wiring check. `harness check-arch` failure is contextual (see step 2 above).

4. Save exit codes + stdout tails into the holding buffer for Task 5.

**Time estimate:** ~3 min (each gate is sub-second to ~30s).

---

### Task 3: Verify the SC30 grep and SC41 diff invariants and Phase 0–5 test-count parity

**Depends on:** Task 2 (PASS) | **Files:** none (read-only) | **Category:** verification

1. **SC30 grep invariant** — From the repo root, run:

   ```bash
   grep -rEn "backend\s*===\s*'local'|backend\s*==\s*'local'|this\.localRunner\b|this\.runner\b" packages/orchestrator/src/ | grep -v '\.test\.' | grep -v '^[^:]*:[0-9]*: *\*' | grep -v '^[^:]*:[0-9]*: *//'
   ```

   Expected: zero hits in live (non-comment, non-test) source code. _Note:_ a doc-comment hit at `packages/orchestrator/src/orchestrator.ts:121` (`overrides.backend → this.runner.backend behavior so existing`) and a doc-comment hit at `:1435` (`runner ?? this.runner fallback is gone with the field removal.`) both describe the post-Phase-2 state and are intentional historical notes — they are filtered out by the `^.*: *//` exclusion above. _Cross-ref:_ SC30 wording in spec line 593-594; Phase 2 INTEGRATE closure in autopilot-state.json `phaseProgress.2.verify.scResults`.

2. **SC41 diff invariant** — From the repo root, run:

   ```bash
   git diff 3c59cd34..HEAD -- packages/orchestrator/tests/core/state-machine.test.ts
   ```

   The base commit `3c59cd34` is the Spec 2 starting commit per autopilot-state.json line 5. Expected: empty output. The state-machine test file path is `packages/orchestrator/tests/core/state-machine.test.ts` (verified by `find packages/orchestrator/tests -name 'state-machine*'` during planning Phase 4 pre-flight).

3. **Phase 0–5 test-count parity** — From the repo root, run **without re-running tests** (Task 1 already produced the counts):

   ```bash
   # No new command — read the per-package counts captured in Task 1 and assert:
   # orchestrator == 826
   # intelligence == 218
   # dashboard == 305
   ```

   Expected: exact match. Any delta (positive or negative) is a regression and blocks the gate. _Source baselines:_ phase-5-verification.json lines 23-25.

4. **Anti-pattern scan across full Spec 2 range** — Run:

   ```bash
   git diff 3c59cd34..HEAD -- 'packages/**/tests/**' | grep -E '^\+.*\b(\.skip|\.skipIf|xit|xdescribe|test\.skip|describe\.skip|it\.skip)\b'
   ```

   Expected: empty output. Confirms no skipped tests were introduced anywhere in Spec 2's commit range — the test-count parity in step 3 is "real" and not "numerically equal but semantically smaller."

5. Save the four invariant results (3 PASS/FAIL + the anti-pattern scan output) into the holding buffer for Task 5.

**Time estimate:** ~3 min.

---

### Task 4: End-to-end smoke — structural inspection of legacy + modern + multi-local paths

**Depends on:** Task 3 (PASS) | **Files:** none (read-only) | **Category:** verification

This task is a **structural** smoke (file-existence + grep wiring), not a runtime smoke. The user brief explicitly notes: "If your plan introduces remediation code, surface that as a complexity override." A structural smoke avoids any code introduction; the runtime evidence already lives in the existing test suites Task 1 ran.

1. **OT-Smoke-Legacy (legacy config still dispatches with deprecation warn)** — Verify three things:

   ```bash
   # (a) MIGRATION_GUIDE constant exists at the path the orchestrator points operators at
   grep -n "MIGRATION_GUIDE" packages/orchestrator/src/agent/config-migration.ts
   # Expected hit at line 32, value 'docs/guides/multi-backend-routing.md'

   # (b) The orchestrator startup-warn surface references the migration guide
   grep -n "multi-backend-routing.md" packages/orchestrator/src/orchestrator.ts
   # Expected hit at line ~1379, in a deprecation warn message

   # (c) The legacy → modern translation table is exercised by tests
   ls packages/orchestrator/tests/agent/config-migration.test.ts
   # Expected: file exists
   ```

2. **OT-Smoke-Modern (multi-backend dispatch wiring)** — Verify three test files exist and reference the modern surface:

   ```bash
   ls packages/orchestrator/tests/agent/multi-backend-dispatch.test.ts
   ls packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts
   ls packages/orchestrator/tests/agent/multi-resolver-independence.test.ts

   # Confirm each file references the modern factory entry-point
   grep -l "OrchestratorBackendFactory\|forUseCase" packages/orchestrator/tests/agent/multi-backend-dispatch.test.ts packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts
   # Expected: both filenames printed (both files reference the factory)
   ```

3. **OT-Smoke-Multi-Local (two-banner dashboard surface)** — Verify three things:

   ```bash
   # (a) The plural endpoint route handler exists
   grep -n "handleLocalModelsRoute\|/api/v1/local-models/status" packages/dashboard/src/server/http.ts
   # Expected: at least one hit (Phase 4 wiring)

   # (b) The multi-resolver hook exists and is plural
   grep -rn "useLocalModelStatuses" packages/dashboard/src/client/ | head -3
   # Expected: hits in the hook file + at least one consumer

   # (c) The multi-resolver Map exists in the orchestrator
   grep -n "Map<string, LocalModelResolver>\|localModelResolvers\b" packages/orchestrator/src/orchestrator.ts | head -5
   # Expected: at least one hit declaring or using the Map
   ```

4. **OT-No-Code-Change** — Confirm Phase 7 has not yet introduced packages/\*\* changes:

   ```bash
   git diff 32989caf..HEAD -- 'packages/**/src/**' 'packages/**/tests/**'
   # Expected: empty (Phase 7 has not committed anything yet at this point)
   ```

5. Save all 11 grep/ls results (3 + 4 + 3 + 1) into the holding buffer for Task 5. Each must be PASS for the smoke to pass overall.

**Time estimate:** ~5 min (mostly mechanical greps).

---

### Task 5: Write the Phase 7 verification artifact and commit

**Depends on:** Task 4 (PASS) | **Files:** `.harness/sessions/changes--multi-backend-routing--proposal/phase-6-verification.json` (CREATE) | **Category:** verification

1. Create `.harness/sessions/changes--multi-backend-routing--proposal/phase-6-verification.json` with this structure (the file is named `phase-6-verification.json` because autopilot phase index = 6, matching the per-phase naming convention `phase-{N}-verification.json` used by phases 0/2/3/4/5; the spec phase number is 7, recorded in the `specPhase` field for traceability):

   ```json
   {
     "verifiedAt": "2026-05-05T<HH:MM:SS>Z",
     "verifier": "harness-verification",
     "session": "changes--multi-backend-routing--proposal",
     "autopilotPhaseIndex": 6,
     "specPhase": "Phase 7 — Validation gate",
     "phaseBase": "32989caf",
     "phaseHead": "<head SHA at start of Task 1>",
     "diffScope": "git diff 32989caf..HEAD",
     "rigor": "standard",
     "status": "passed",
     "tiers": {
       "exists": "PASS — verification artifact created at .harness/sessions/.../phase-6-verification.json",
       "substantive": "PASS — all 13 OTs PASS (SC44–SC47 mechanical, SC30+SC41 invariants, OT-Smoke-{Legacy,Modern,Multi-Local}, OT-Test-Count-Parity, OT-No-Code-Change, OT-Format-Check, OT-SC-Coverage-Trace)",
       "wired": "PASS — full SC1–SC47 trace closes; no open SCs"
     },
     "commands": [
       { "cmd": "pnpm typecheck", "result": "PASS", "stdout": "<last 5 lines>" },
       { "cmd": "pnpm lint", "result": "PASS", "stdout": "<last 5 lines>" },
       { "cmd": "pnpm test", "result": "PASS", "stdout": "<last 5 lines + per-package counts>" },
       { "cmd": "pnpm format:check", "result": "PASS", "stdout": "<last 1 line>" },
       { "cmd": "harness validate", "result": "PASS", "stdout": "v validation passed" },
       {
         "cmd": "harness check-docs",
         "result": "PASS",
         "stdout": "v Documentation coverage: 97.0%"
       },
       { "cmd": "harness check-deps", "result": "PASS", "stdout": "v validation passed" },
       {
         "cmd": "harness check-arch",
         "result": "PASS (warnings unchanged from Phase 5 final)",
         "note": "Pre-existing baseline drift carried forward unchanged; zero new violations."
       }
     ],
     "otResults": {
       "SC44 (typecheck)": "PASS — pnpm typecheck exit 0",
       "SC45 (lint)": "PASS — pnpm lint exit 0; no new ESLint suppressions across 32989caf..HEAD",
       "SC46 (test)": "PASS — pnpm test exit 0; aggregate 1349 (orchestrator 826 + intelligence 218 + dashboard 305) byte-identical to Phase 5 baseline",
       "SC47 (harness validate + check-docs)": "PASS — both gates green; check-docs 97.0% (Phase 5 baseline preserved)",
       "OT-Format-Check": "PASS — pnpm format:check exit 0",
       "OT-Smoke-Legacy": "PASS — MIGRATION_GUIDE constant + orchestrator warn-message + config-migration.test.ts all wired",
       "OT-Smoke-Modern": "PASS — multi-backend-dispatch.test.ts + orchestrator-backend-factory.test.ts + multi-resolver-independence.test.ts all reference forUseCase",
       "OT-Smoke-Multi-Local": "PASS — handleLocalModelsRoute + /api/v1/local-models/status + useLocalModelStatuses + Map<string, LocalModelResolver> all wired",
       "OT-Test-Count-Parity": "PASS — 826 / 218 / 305 exact match",
       "OT-No-Code-Change": "PASS — git diff 32989caf..HEAD -- packages/** empty at Task 5 entry",
       "OT-SC-Coverage-Trace": "PASS — SC1–SC47 fully traced (see scTraceability below)"
     },
     "scResults": {
       "SC44": "PASS (Phase 7 closure)",
       "SC45": "PASS (Phase 7 closure)",
       "SC46": "PASS (Phase 7 closure)",
       "SC47": "PASS (re-affirmed; original Phase 5 closure)"
     },
     "invariants": {
       "SC30 (zero hits for backend==='local'|this.runner|this.localRunner)": "PASS — only doc-comment refs at orchestrator.ts:121 and :1435 (intentional historical notes)",
       "SC41 (state-machine.test.ts unchanged across Spec 2)": "PASS — git diff 3c59cd34..HEAD -- packages/orchestrator/tests/core/state-machine.test.ts is empty",
       "phase-0-5-regression-check": "PASS — orchestrator 826/826 + intelligence 218/218 + dashboard 305/305 all green; counts match Phase 5 baseline byte-identical",
       "anti-pattern-skip-scan": "PASS — git diff 3c59cd34..HEAD -- 'packages/**/tests/**' grep '+.*(.skip|xit|xdescribe)' is empty"
     },
     "scTraceability": {
       "SC1-SC15": "Phase 0 (Foundation; types, schema, migration shim)",
       "SC15 (re-affirmed)": "Phase 2 (Orchestrator wiring; ResolverMap-driven validation)",
       "SC16-SC26": "Phase 1 (Router + backend factory)",
       "SC27-SC30": "Phase 2 (Orchestrator wiring; multi-resolver Map + dispatch refactor)",
       "SC31-SC36": "Phase 3 (Intelligence pipeline routing; multi-provider IntelligencePipeline)",
       "SC37, SC41-SC43": "Phase 2 (Orchestrator wiring; SC41 invariant verified Phase 7)",
       "SC38-SC40": "Phase 4 (Dashboard surface multi-local; plural endpoint + N banners)",
       "SC44-SC46": "Phase 7 (this gate; full mechanical-suite closure)",
       "SC47": "Phase 5 (Documentation, ADRs, knowledge; mid-spec docs gate) + re-affirmed Phase 7"
     },
     "carryForwardCheck": {
       "Phase-0-NF-1": "CLOSED in Phase 3 (CASE1_SUPPRESSED split)",
       "Phase-1-PFC-{1,2,3}": "CLOSED in Phase 2 (factory wiring + container-wrap + pi.timeoutMs)",
       "Phase-2-multi-status-server-surface": "CLOSED in Phase 4 (Tasks 5/7/8)",
       "Phase-2-S3-operator-guide-dead-link": "CLOSED in Phase 5 (operator guide now exists at orchestrator's referenced path)",
       "Phase-2-issue-routing-doc": "CLOSED in Phase 5 (Backend Routing section added)",
       "Phase-2-ADR-single-runner": "CLOSED in Phase 5 (ADR 0006)",
       "Phase-3-NF-1": "CLOSED in Phase 3 itself (carry-forward from Phase 0)",
       "Phase-3-P2-DEF-638": "CLOSED in Phase 3 (createAnalysisProvider rewrite)",
       "Phase-3-multi-provider-ADR": "CLOSED in Phase 5 (ADR 0007)",
       "Phase-3-createAnalysisProvider-complexity": "CLOSED in Phase 3 (33 → ≤5)",
       "Phase-4-ADR-0004-URL-refresh": "CLOSED in Phase 5 (in-place URL pluralization + deprecation timeline alignment)",
       "Phase-4-local-model-resolution-doc": "CLOSED in Phase 5 (Lifecycle/Status Surface/Consumers rewritten for multi-resolver Map)",
       "Phase-4-useLocalModelStatuses-error-tier": "CLOSED in Phase 4 fixup (16→15 via mergeLocalModelStatusByName extraction)",
       "Phase-5-CHANGELOG": "CLOSED in Phase 5 (single [Unreleased] entry covering Phases 0-5)",
       "Phase-5-IMP-{1..6}": "CLOSED in Phase 5 fixup pass (citations corrected, claude mapping resolved, deprecation timeline aligned, pi.timeoutMs added, cross-ref grammar aligned)"
     },
     "carryForwardOpen": [
       "Knowledge graph reindex → autopilot DONE (deferred since Phase 2)",
       "docs/roadmap.md:1097 status flip planned → done → autopilot DONE",
       "packages/cli/.harness/arch/baselines.json working-tree drift → autopilot DONE",
       "templates/orchestrator/harness.orchestrator.md + project-root harness.orchestrator.md modern-schema example → alias-removal follow-up spec (Phase 5 P6-C3 deferral)",
       "4th legacy this.config.agent.backend read at orchestrator.ts:~1320 → alias-removal follow-up spec (Phase 3+ carry-forward)",
       "All Phase 0-5 suggestion-tier findings (NF-2/3, P1-S1/2/3/4, P2-S1/2/3/5, P3-SUG-1/3/4/5/7, P4-S2/3/4/5, P5-FIXUP-SUG-1/2) → tracked-only, no fix planned for Spec 2"
     ],
     "antiPatternScan": {
       "TODO/FIXME/XXX/HACK introduced this phase": "PASS — none (no source changes)",
       "skipped-tests-introduced-across-spec-2": "PASS — git diff 3c59cd34..HEAD -- 'packages/**/tests/**' has zero added .skip/xit/xdescribe lines"
     },
     "concerns": {
       "pre-existing-dirty-tree": "OBSERVED (carried from Phase 5) — packages/cli/.harness/arch/baselines.json (modified) + docs/changes/multi-backend-routing/plans/2026-05-05-spec2-phase6-documentation-adrs-knowledge-plan.md (untracked) + this Phase 7 plan (untracked once written) all persist. Autopilot DONE handles commit decisions.",
       "harness-check-arch-baseline-drift": "OBSERVED (carried from Phase 4 final, unchanged in Phase 5) — pre-existing complexity/module-size/dependency-depth deltas. No new violations introduced in Phase 7 (zero packages/** changes). Excluded from Phase 7 gate per spec line 711 task list (which omits check-arch)."
     },
     "findings": [],
     "summary": "Phase 7 (autopilot index 6 = spec Phase 7, validation gate) PASSED at all three verification tiers. All 13 observable truths green. SC44–SC47 closed (full mechanical suite green: pnpm typecheck/lint/test/format:check + harness validate + check-docs at 97.0% baseline). SC30 grep + SC41 diff invariants intact. Phase 0–5 test counts byte-identical (826/218/305). Anti-pattern skip-scan across full Spec 2 range PASS. Structural end-to-end smoke PASS (legacy MIGRATION_GUIDE wiring + modern multi-backend-dispatch test wiring + multi-local plural-endpoint + N-banner wiring all verified). Spec 2 ready for autopilot DONE (KG reindex, roadmap flip, baselines.json decision, final handoff, PR prompt).",
     "recommendation": "Proceed to autopilot DONE (PHASE_COMPLETE → DONE) — Spec 2 (multi-backend-routing) is full-spec ready. All carry-forward open items are autopilot-DONE responsibilities or deliberately deferred to a follow-up alias-removal spec."
   }
   ```

2. Stage and commit the artifact:

   ```bash
   git add .harness/sessions/changes--multi-backend-routing--proposal/phase-6-verification.json
   git commit -m "$(cat <<'EOF'
   chore(spec2): Phase 7 exit gate green (validation gate; SC44-SC47 closed)

   Records the full-spec mechanical-suite verification artifact at
   .harness/sessions/.../phase-6-verification.json.

   Mechanical gate suite all green:
   - pnpm typecheck PASS
   - pnpm lint PASS (no new ESLint suppressions)
   - pnpm test PASS (1349 aggregate; orchestrator 826 + intelligence 218 + dashboard 305 byte-identical to Phase 5 baseline)
   - pnpm format:check PASS
   - harness validate PASS
   - harness check-docs PASS (97.0%)
   - harness check-deps PASS
   - harness check-arch PASS (warnings unchanged from Phase 5 final)

   Invariants intact:
   - SC30 grep zero live hits
   - SC41 git diff empty across full Spec 2 range
   - Anti-pattern skip-scan PASS across full Spec 2 range

   End-to-end smoke (structural inspection) PASS for legacy / modern / multi-local paths.

   SC1-SC47 fully traced; SC44-SC46 closed in this phase, SC47 re-affirmed.

   Spec 2 (multi-backend-routing) ready for autopilot DONE.
   EOF
   )"
   ```

3. Run: `harness validate` to confirm the commit didn't break the in-flight session state.

**Time estimate:** ~7 min (artifact authoring + commit).

---

### Task 6: Phase exit gate confirmation — signal autopilot DONE

**Depends on:** Task 5 (PASS) | **Files:** none (in-process state only) | **Category:** integration

This task is the smallest possible — it produces no commit. Its job is purely to call out the phase-complete state for autopilot's state machine.

1. Confirm the verification artifact landed:

   ```bash
   git log -1 --oneline -- .harness/sessions/changes--multi-backend-routing--proposal/phase-6-verification.json
   # Expected: shows the Task 5 commit
   ```

2. Confirm the working tree is at its expected post-Phase-7 state:

   ```bash
   git status --short
   # Expected output (3 lines):
   #  M packages/cli/.harness/arch/baselines.json
   # ?? docs/changes/multi-backend-routing/plans/2026-05-05-spec2-phase6-documentation-adrs-knowledge-plan.md
   # ?? docs/changes/multi-backend-routing/plans/2026-05-05-spec2-phase7-validation-gate-plan.md
   # All three are autopilot DONE responsibilities (per phase-5-verification.json line 61 + planning brief).
   ```

3. **Decision point — plan-doc tracking commit (default: defer to DONE):** Two options exist for the Phase 7 plan doc and the Phase 5 plan doc that's still untracked:
   - **Option A (defer to DONE; default):** Leave both plan docs untracked. Autopilot DONE bundles them into a single tracking commit alongside the roadmap flip and KG reindex commits, mirroring Phase 5's own deferral pattern.
   - **Option B (commit-tracking-now):** Commit both plan docs as a single chore commit `chore(spec2): track Phase 5 + Phase 7 plan docs in git`, mirroring Phase 4's P4-IMP-2 fixup pattern. Adds a 2nd Phase 7 commit.

   **Default: Option A.** Rationale: Phase 5's own plan doc was deliberately left untracked (per autopilot-state.json `phaseProgress.5.verify.concerns.pre-existing-dirty-tree`), so DONE already has both plan docs in its inventory; bundling all three (Phase 5 plan, Phase 7 plan, Phase 7 verification artifact … wait, that one's already committed) into a single DONE commit is cleaner than splitting it. If reviewer prefers Option B, swap this task's no-op for the equivalent of Phase 4 P4-IMP-2's commit recipe.

4. Run: `harness validate` (final sanity check; expected PASS).

5. **Phase 7 complete.** Hand off to autopilot DONE — it consumes the verification artifact created in Task 5 and the autopilot-state.json `phaseProgress.6` block (which the orchestration layer writes from the artifact, outside this plan's scope).

**Time estimate:** ~2 min.

---

## VALIDATE — Plan author's pre-flight checks

The harness-planning skill's Phase 4 step 4 requires `harness validate` before writing the plan; step 5 requires checking `.harness/failures.md`. Plus the plan author independently pre-verified the SC30 grep, the SC41 diff, the harness gates, and the harness-check-docs coverage figure to derisk Phase 7 execution:

1. **`harness validate`** — PASS (run during planning). Re-run by Task 1 / Task 2 / Task 5 / Task 6 during execution.
2. **`harness check-deps`** — PASS (run during planning).
3. **`harness check-docs`** — 97.0% (baseline confirmed; matches phase-5-verification.json line 20).
4. **SC30 grep pre-verification** — `grep -rEn "backend\s*===\s*'local'|backend\s*==\s*'local'|this\.localRunner\b|this\.runner\b" packages/orchestrator/src/ | grep -v '\.test\.'` returns only doc-comment hits at `orchestrator.ts:121` and `:1435` (zero live code hits). PASS.
5. **SC41 diff pre-verification** — `find packages/orchestrator/tests -name 'state-machine*'` resolves the file to `packages/orchestrator/tests/core/state-machine.test.ts`. The diff against Spec 2 base will be empty during execution.
6. **Spec base commit confirmation** — autopilot-state.json `startingCommit` is `3c59cd34e37ff26a52a4ba3ce0fab77e68d39d77`, matching `git log` against the predecessor spec completion. The Phase 5 final-fixup-pass commit is `32989caf` (Phase 7's `phaseBase`).
7. **Working-tree pre-state observed** — 1 modified (`packages/cli/.harness/arch/baselines.json`), 1 untracked (`docs/changes/multi-backend-routing/plans/2026-05-05-spec2-phase6-documentation-adrs-knowledge-plan.md`); both carry-forward from Phase 5 per the brief.
8. **`.harness/failures.md`** — Not consulted for new patterns since Phase 7 is verification-only and matches the precedent pattern of Phase 5 (which ran the same gate suite as a docs-only phase exit).

## Gates this plan satisfies (per harness-planning skill)

- **Iron Law:** Every task fits in 2-10 minutes (Task 1 is the longest at ~10 min; all others ≤7 min). Each task contains exact commands and exact expected outputs. ✓
- **No vague tasks:** Each task has explicit shell commands, explicit expected stdout, explicit pass/fail criteria, and the verification artifact has a literal JSON template. ✓
- **No tasks larger than one context window:** 6 tasks; none touch more than one file (Task 5 touches one create file; others are read-only). ✓
- **No skipping TDD:** N/A — this is a verification phase, no new code-producing tasks. ✓
- **Observable truths trace to specific tasks:** SC44 → Task 1; SC45 → Task 1; SC46 → Task 1 + Task 3; SC47 → Task 2; SC30 → Task 3; SC41 → Task 3; OT-Smoke-{Legacy,Modern,Multi-Local} → Task 4; OT-Test-Count-Parity → Task 1 + Task 3; OT-No-Code-Change → Task 4 + Task 5 + Task 6; OT-Format-Check → Task 1; OT-SC-Coverage-Trace → Task 5. ✓
- **File map is complete:** 1 file (verification artifact). Zero packages/\*\* changes. ✓
- **Uncertainties surfaced:** Zero blocking; 7 assumptions (all pre-verified or documented); 8 deferrables (all routed to autopilot DONE or follow-up specs). ✓
- **`harness validate` runs in every task that commits:** Task 5 + Task 6. (Tasks 1-4 are read-only, no commit, but Task 1 includes a `harness validate` sanity check; Task 5's commit step is followed by `harness validate`; Task 6 ends with `harness validate`.) ✓
- **Skeleton present:** Yes (groups + per-group task counts + total). Standard rigor + 6 tasks (< 8 threshold) → skeleton optional but included for handoff completeness. ✓

## Open questions for autopilot orchestration

- _(none — Phase 7 has zero blocking uncertainties and the gate commands are deterministic.)_
