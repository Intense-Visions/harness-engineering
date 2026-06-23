# Plan: audit-harness-strength — Phase 5 Dogfood Verification

**Date:** 2026-06-23 | **Spec:** docs/changes/audit-harness-strength/proposal.md (Implementation Order Phase 5) | **Tasks:** 6 | **Time:** ~24 min | **Integration Tier:** small

## Goal

Lock the dogfood verification of `harness check-harness-strength` as a set of repeatable, deterministic tests against stable synthetic fixtures — a "weak harness" fixture that scores low/theatre and a genuinely clean fixture that scores 100/solid with 0 findings (exit 0) — plus a loose, future-proof live-repo smoke assertion, so the feature's behavior is regression-protected without breaking as the repo's own weaknesses get fixed by sibling v5.0 items.

## Observable Truths (Acceptance Criteria)

1. A stable on-disk **weak-harness** fixture (CLI tests) drives an asserted audit producing a known finding set, a score below 100, and tier `at-risk` or `theatre`. (Locks "flags the live patterns" behavior without depending on the live repo.)
2. A stable on-disk **clean-harness** fixture (`layers` defined + populated `architecture.thresholds`, no other triggers) produces **score 100, tier `solid`, 0 findings**, `valid: true`, and the CLI passing-gate path returns exit 0. (Folds in carried review item **CHS-S1**.)
3. The clean-fixture passing path is asserted at both the **auditor level** (`HarnessStrengthAuditor.audit` → score 100 / solid / 0 findings) and the **CLI command level** (`runCheckHarnessStrength` → `valid: true`, `filtered.length === 0`).
4. **Determinism** is asserted on the stable on-disk fixtures: two runs of `audit()` on the same fixture path yield deeply-equal `AuditResult`s. (Extends existing temp-dir determinism coverage to the locked fixtures.)
5. A **live-repo toolkit** test exists as a loose, future-proof assertion: score `< 100` and at least STRENGTH-002 and STRENGTH-003 fire on `.husky/pre-commit`. It does NOT assert the exact 9-finding set or score 0. (Per spec: brittle whole-repo assertions break as sibling v5.0 items fix the repo.)
6. `npx vitest run` passes for all touched test files; `harness validate` passes.

## File Map

```
CREATE packages/cli/tests/fixtures/harness-strength-clean/harness.config.json
CREATE packages/core/tests/fixtures/harness-strength/clean/harness.config.json   (if core asserts via on-disk fixture; see Task 2)
CREATE packages/core/tests/fixtures/harness-strength/weak/harness.config.json
CREATE packages/core/tests/fixtures/harness-strength/weak/.husky/pre-commit
MODIFY packages/cli/tests/commands/check-harness-strength.test.ts      (add clean-pass + live-smoke + determinism assertions)
MODIFY packages/core/src/harness-strength/auditor.test.ts              (add on-disk clean-fixture solid/100/0-findings + determinism)
```

> Note on the existing `valid-project` fixture: it has `layers` defined but **no `architecture.thresholds`**, which triggers STRENGTH-004. It is NOT a clean harness fixture. Do not repurpose it; the current CLI test at line 44 only asserts mode, not a clean pass — that is the CHS-S1 gap. Leave `valid-project` untouched (other suites depend on it) and add a purpose-built `harness-strength-clean` fixture instead.

## Skeleton

1. Clean-harness fixture + auditor-level passing-path assertion (~2 tasks, ~8 min)
2. CLI-level clean-pass + determinism lock on stable fixtures (~2 tasks, ~8 min)
3. Loose live-repo toolkit smoke test (~1 task, ~4 min)
4. Validate + integration wiring (~1 task, ~4 min)

**Estimated total:** 6 tasks, ~24 minutes
_Skeleton approved: pending (standard rigor, 6 tasks < 8 threshold — skeleton optional; presented for the checkpoint below)._

## Uncertainties

- [ASSUMPTION] The clean fixture only needs `harness.config.json` with `layers` + populated `architecture.thresholds` to score 100 in **adopter** mode. Verified by the bare-dir test (score 100, rulesRun 0) plus STRENGTH-004's "layers + non-empty thresholds = no finding" logic. If 004 requires a specific thresholds shape, Task 1 fixture content needs adjustment (covered by running the test).
- [ASSUMPTION] `runCheckHarnessStrength(cleanDir, {})` auto-detects **adopter** mode (no `templates/` + `agents/skills/` under the fixture dir), so toolkit-only rules (004 on `.hbs`, 005 on init skill) do not fire. Confirmed by D2 mode-resolution logic.
- [DEFERRABLE] Exact wording of the clean fixture's `architecture.thresholds` values — any non-empty map satisfies STRENGTH-004; pick minimal realistic values.
- [ASSUMPTION] The core package resolves test fixtures relative to the test file via `__dirname`/`import.meta`. Task 2 chooses between an on-disk core fixture vs. reusing the existing inline temp-dir style; either satisfies Truth 3. Default: keep core auditor assertions inline-temp-dir (matches existing `auditor.test.ts` style) to avoid a new core fixtures dir unless a stable on-disk path is explicitly wanted.

## Tasks

### Task 1: Add the clean-harness CLI fixture

**Depends on:** none | **Files:** `packages/cli/tests/fixtures/harness-strength-clean/harness.config.json`

1. Create `packages/cli/tests/fixtures/harness-strength-clean/harness.config.json` with `layers` defined AND a populated `architecture.thresholds`, and nothing else that trips a rule (no `template.level: basic`, no husky dir, no workflows, no health snapshot):

   ```json
   {
     "version": 1,
     "name": "clean-harness-fixture",
     "layers": [
       { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
       { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] }
     ],
     "architecture": {
       "thresholds": {
         "maxFanIn": 12,
         "maxFanOut": 8,
         "maxCycles": 0
       }
     }
   }
   ```

2. Run: `harness validate`
3. Commit: `test(harness-strength): add clean-harness CLI fixture (layers + populated thresholds)`

### Task 2: Assert the auditor passing path (solid/100/0-findings) on a clean config

**Depends on:** Task 1 | **Files:** `packages/core/src/harness-strength/auditor.test.ts`

> Keeps the core assertion inline-temp-dir style (matches existing tests). This covers Truth 3 (auditor level) and Truth 4 (determinism on a clean config) without introducing a new core fixtures dir.

1. In `packages/core/src/harness-strength/auditor.test.ts`, add a new `describe` block. Add the clean-config constant and tests:

   ```ts
   describe('HarnessStrengthAuditor clean harness (passing gate path)', () => {
     // layers defined + populated thresholds, nothing else => no rule fires.
     const CLEAN = JSON.stringify({
       version: 1,
       layers: [{ name: 'a' }],
       architecture: { thresholds: { maxFanIn: 12 } },
     });

     function buildClean(): string {
       const dir = mkdtempSync(join(tmpdir(), 'hs-clean-'));
       writeFileSync(join(dir, 'harness.config.json'), CLEAN);
       return dir;
     }

     it('scores 100/solid with zero findings when layers have populated thresholds', () => {
       const dir = buildClean();
       try {
         const result = new HarnessStrengthAuditor().audit(dir, {});
         expect(isOk(result)).toBe(true);
         if (!isOk(result)) return;
         const v = result.value;
         expect(v.findings).toEqual([]);
         expect(v.score).toBe(100);
         expect(v.tier).toBe('solid');
         expect(v.summary.errors).toBe(0);
         expect(v.summary.warnings).toBe(0);
         // STRENGTH-004 evaluable (config present) and passes; others not evaluable.
         expect(v.summary.rulesPassing).toBeGreaterThanOrEqual(1);
       } finally {
         rmSync(dir, { recursive: true, force: true });
       }
     });

     it('is deterministic across two runs on the clean fixture', () => {
       const dir = buildClean();
       try {
         const auditor = new HarnessStrengthAuditor();
         expect(auditor.audit(dir, {})).toEqual(auditor.audit(dir, {}));
       } finally {
         rmSync(dir, { recursive: true, force: true });
       }
     });
   });
   ```

2. Run: `npx vitest run packages/core/src/harness-strength/auditor.test.ts` — observe pass. (If STRENGTH-004 fires unexpectedly, the thresholds map is being read as empty — inspect `strength-004-empty-thresholds.ts` and adjust the fixture/test accordingly.)
3. Run: `harness validate`
4. Commit: `test(harness-strength): assert auditor passing path (solid/100/0 findings) on clean config`

### Task 3: Assert the CLI clean-pass gate path (CHS-S1) on the stable fixture

**Depends on:** Task 1 | **Files:** `packages/cli/tests/commands/check-harness-strength.test.ts`

1. In `packages/cli/tests/commands/check-harness-strength.test.ts`, add a `CLEAN_HARNESS` path constant and a clean-pass test. Add near the existing constants:

   ```ts
   const CLEAN_HARNESS = path.join(__dirname, '../fixtures/harness-strength-clean');
   ```

2. Add inside the `describe('runCheckHarnessStrength', ...)` block:

   ```ts
   it('passes the gate (valid, exit-0 path) on a genuinely clean harness fixture (CHS-S1)', () => {
     const r = runCheckHarnessStrength(CLEAN_HARNESS, {});
     expect(r.ok).toBe(true);
     if (!r.ok) return;
     expect(r.value.audit.mode).toBe('adopter');
     expect(r.value.audit.findings).toEqual([]);
     expect(r.value.audit.score).toBe(100);
     expect(r.value.audit.tier).toBe('solid');
     expect(r.value.valid).toBe(true);
     expect(r.value.filtered.length).toBe(0);
   });

   it('is deterministic across two runs on the clean fixture', () => {
     const a = runCheckHarnessStrength(CLEAN_HARNESS, {});
     const b = runCheckHarnessStrength(CLEAN_HARNESS, {});
     expect(a).toEqual(b);
   });
   ```

3. Run: `npx vitest run packages/cli/tests/commands/check-harness-strength.test.ts` — observe pass.
4. Run: `harness validate`
5. Commit: `test(harness-strength): assert CLI clean-pass gate path and determinism (CHS-S1)`

### Task 4: Strengthen the weak-fixture CLI assertion into a locked behavior

**Depends on:** none (uses existing `harness-strength-weak` fixture) | **Files:** `packages/cli/tests/commands/check-harness-strength.test.ts`

> The existing `harness-strength-weak/harness.config.json` (layers + empty thresholds) only trips STRENGTH-004. The current first test asserts a generic shape. Tighten it into an explicit locked-behavior assertion so the "flags the pattern" contract is regression-protected on a stable fixture.

1. In `packages/cli/tests/commands/check-harness-strength.test.ts`, add inside the `describe('runCheckHarnessStrength', ...)` block:

   ```ts
   it('flags the weak fixture: STRENGTH-004 fires, score < 100, gate trips at error', () => {
     const r = runCheckHarnessStrength(WEAK, { severity: 'error' });
     expect(r.ok).toBe(true);
     if (!r.ok) return;
     expect(r.value.audit.findings.map((f) => f.id)).toContain('STRENGTH-004');
     expect(r.value.audit.score).toBeLessThan(100);
     expect(['at-risk', 'theatre']).toContain(r.value.audit.tier);
     expect(r.value.valid).toBe(false);
   });
   ```

2. Run: `npx vitest run packages/cli/tests/commands/check-harness-strength.test.ts` — observe pass.
3. Run: `harness validate`
4. Commit: `test(harness-strength): lock weak-fixture flagging behavior (STRENGTH-004, score<100, gate trips)`

### Task 5: Add the loose live-repo toolkit smoke test

**Depends on:** none | **Files:** `packages/cli/tests/commands/check-harness-strength.test.ts`

> Per spec and concerns: do NOT assert the exact 9-finding set or score 0 — that breaks as sibling v5.0 items fix the repo's own weaknesses. Assert only the durable invariants: toolkit mode auto-detects on this repo, score < 100, and STRENGTH-002 + STRENGTH-003 fire (both anchored to `.husky/pre-commit`, the repo's own pre-commit, the most stable live trigger). Resolve the repo root from the test file location.

1. In `packages/cli/tests/commands/check-harness-strength.test.ts`, add a separate `describe` block:

   ```ts
   describe('runCheckHarnessStrength live-repo dogfood (loose smoke)', () => {
     // Repo root from this test file: packages/cli/tests/commands -> up 4.
     const REPO_ROOT = path.resolve(__dirname, '../../../..');

     it('flags the live harness in toolkit mode without asserting the exact finding set', () => {
       const r = runCheckHarnessStrength(REPO_ROOT, { mode: 'toolkit' });
       expect(r.ok).toBe(true);
       if (!r.ok) return;
       expect(r.value.audit.mode).toBe('toolkit');
       // Loose: the repo is not yet fully hardened, so it must not score a clean 100.
       expect(r.value.audit.score).toBeLessThan(100);
       const ids = r.value.audit.findings.map((f) => f.id);
       // Durable anchors: both fire on .husky/pre-commit (002 auto-baseline, 003 skip-list).
       expect(ids).toContain('STRENGTH-002');
       expect(ids).toContain('STRENGTH-003');
     });
   });
   ```

2. Run: `npx vitest run packages/cli/tests/commands/check-harness-strength.test.ts` — observe pass. (If `REPO_ROOT` resolves wrong, confirm depth from `packages/cli/tests/commands` to repo root is 4 levels; adjust the `../` count.)
3. Run: `harness validate`
4. Commit: `test(harness-strength): add loose live-repo toolkit dogfood smoke test`

### Task 6: Final validation and verify the full suite is green

**Depends on:** Tasks 1-5 | **Files:** none | **Category:** integration

1. Run the full touched test set:
   - `npx vitest run packages/core/src/harness-strength/auditor.test.ts`
   - `npx vitest run packages/cli/tests/commands/check-harness-strength.test.ts`
2. Confirm all assertions pass (clean-pass, weak-flag, determinism, live-smoke).
3. Run: `harness validate`
4. Sanity-check the live command still behaves (non-asserting): `source ~/.nvm/nvm.sh && nvm use 22 && node packages/cli/dist/bin/harness.js check-harness-strength --toolkit --report-only` — confirm it emits a report (score/tier/findings) and exits 0 under `--report-only`.
5. Commit (only if any incidental changes): `test(harness-strength): finalize Phase 5 dogfood verification`

## Concerns

- **Keeping the clean-harness fixture genuinely clean as rules evolve.** The clean fixture (Task 1) asserts 0 findings. When STRENGTH-008+ rules land in future milestones, a new rule could fire on this minimal config and silently flip the fixture from "passing-gate proof" to "accidentally-failing." Mitigation built into the plan: the clean fixture contains ONLY `layers` + `architecture.thresholds` (the minimal shape STRENGTH-004 needs), no husky/workflows/snapshot/template-level, so it is inert to all current rules and most plausible future ones. Recommend (deferrable) a comment in the fixture or test noting "must remain 0-finding; new rules that fire here mean either the rule or this fixture needs review." Not adding a guard task now (YAGNI for low-complexity Phase 5).

- **Whether the live-repo dogfood should assert anything or stay a pure smoke step.** Chose a LOOSE assertion (score < 100 + STRENGTH-002/003 present) over both extremes. A pure non-asserting smoke step gives no regression protection (the command could silently stop detecting anything and the test would still pass). A tight 9-finding/score-0 assertion is brittle — sibling v5.0 items (auto-baseline fix, skip-list justification, empty-thresholds templates, init-tier default) will resolve those exact findings and break the test. STRENGTH-002 and STRENGTH-003 both anchor to `.husky/pre-commit`, the repo's own commit gate, which is the least likely to be "fixed away" and the most representative dogfood signal. If a v5.0 sibling does harden `.husky/pre-commit`, this test will fail loudly and intentionally — that is the correct signal to update the live assertion (and is a feature, not a flake).

- **`valid-project` fixture is mislabeled relative to this skill.** It has `layers` without `architecture.thresholds`, so it triggers STRENGTH-004 — it is NOT a clean harness. This plan deliberately does not touch it (other suites depend on its current shape) and instead adds a purpose-built `harness-strength-clean` fixture. Flagging in case a future cleanup wants to populate `valid-project`'s thresholds for cross-suite consistency.

- **Pre-existing repo health noise (not introduced here).** `harness validate` currently reports design-token false positives in graph/orchestrator test files, and `harness check-deps` reports two circular deps (`drift/findings/finding.ts` ↔ `drift/catalog/index.ts`; `shared/craft/llm/*`). These are unrelated to Phase 5 and predate this work. The Task-level `harness validate` steps should confirm no NEW issues are introduced, not that the repo is globally clean.
