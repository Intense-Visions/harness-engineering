# Plan: harness-strength Phase 2 — Rule Registry (STRENGTH-001..007 + Auditor)

**Date:** 2026-06-23 | **Spec:** docs/changes/audit-harness-strength/proposal.md (§"Rule detection notes", D5) | **Tasks:** 14 | **Time:** ~58 min | **Integration Tier:** medium | **Rigor:** standard

## Goal

Implement the seven `StrengthRule` modules (STRENGTH-001..007) and the `HarnessStrengthAuditor` that builds context once, runs applicable rules, applies config severity overrides, scores, and returns `Result<AuditResult>` — each rule fixture-tested (passing + failing) with explicit "not evaluable" handling. (Phase 2 only: NO CLI command, NO skill.)

## Observable Truths (Acceptance Criteria)

1. `packages/core/src/harness-strength/rules/strength-001-nonblocking-hooks.ts` .. `strength-007-snapshot-signal-mismatch.ts` each export a `StrengthRule` whose `detect(ctx)` returns `Omit<StrengthFinding,'severity'>[]` (no `severity` key), and whose `appliesIn(mode)` matches the spec.
2. `ALL_RULES` in `rules/index.ts` contains all 7 rules in ascending id order; `ALL_RULES.length === 7`.
3. **When** a rule's required input is absent, **then** the rule emits no finding for that pattern AND the auditor excludes it from `rulesPassing` (not a false pass). Represented via an optional `evaluable?(ctx): boolean` predicate on `StrengthRule` (see Task 1 decision).
4. `HarnessStrengthAuditor.audit(root, opts)` returns `Ok<AuditResult>` for any directory (even a bare temp dir — never throws), with `mode`, `score`, `tier`, `findings`, and `summary` populated; `summary.rulesRun` counts rules where `appliesIn(mode) && evaluable(ctx)`, `summary.rulesPassing` counts those that ran and produced zero findings.
5. The auditor applies `ctx.config.audit.harnessStrength.severities[id]` overrides to each finding's severity before scoring; absent override → rule's `defaultSeverity`.
6. Each rule has a unit test asserting (a) a failing fixture yields exactly the expected finding(s) with `file`/`message`/`remediation` set, and (b) a passing fixture yields `[]`, and (c) absent-input → `evaluable===false` and `detect===[]`.
7. An integration test over a synthetic fixture project runs `audit()` end-to-end and asserts the full `AuditResult` (mode, finding ids, score, tier, summary counts) is deterministic across two runs.
8. `npx vitest run` (core package, `src/harness-strength/`) passes; `npx tsc -p packages/core/tsconfig.json --noEmit` exits 0; `harness validate` passes.

## Uncertainties

- [ASSUMPTION→RESOLVED] Extending the frozen Phase 1 `StrengthRule` interface with an **optional** `evaluable?(ctx): boolean` is safe: grep confirms `StrengthRule`/`ALL_RULES` are consumed only by `rules/index.ts` today (no CLI/external consumer). Optional + additive, so Phase 1's shipped `detect`/`appliesIn` contract is unbroken. Settled in Task 1; surfaced as `[checkpoint:decision]` for sign-off.
- [ASSUMPTION] STRENGTH-007 check→signal mapping: this repo's live `.harness/health-snapshot.json` uses `signals: ["security-findings"]` against `checks.security.passed`. The mapping table (Task 9) is `{ security: 'security-findings', entropy: 'entropy-drift', deps: 'dependency-violations', perf: 'perf-regression', docs: 'doc-coverage', lint: 'lint-issues' }`. If a snapshot uses signal names outside this table, that signal is ignored (no finding) — documented as a known limitation, not a false pass (the rule still flags the mapped-and-present cases).
- [ASSUMPTION] Regex (not a YAML parser) suffices for STRENGTH-006. Workflows are read as raw text in `ctx.workflows`; a line/window regex for auto-approve/auto-merge + PAT-gating is consistent with the SecurityScanner regex-rule precedent. Adding a YAML dependency is YAGNI for v1. Documented in concerns.
- [ASSUMPTION] STRENGTH-002/003 parse `ctx.preCommit` (raw `.husky/pre-commit` text) line-by-line with regex; false-positive risk is mitigated by requiring the `--update-baseline`/`--skip` token to co-occur with the failure-branch / skip-flag pattern. Documented in concerns.
- [DEFERRABLE] Exact `message`/`remediation` wording — finalized per-rule during implementation; tests assert substrings + presence, not full strings.

## Knowledge Baseline

Skipped: no new PRD/business-domain docs for Phase 2; domain knowledge is the spec's §"Rule detection notes" and the v5.0 dogfood patterns, already captured in the proposal. The seven STRENGTH patterns are the documented domain facts; tasks reference the spec section per rule.

## File Map

```
CREATE  packages/core/src/harness-strength/rules/strength-001-nonblocking-hooks.ts
CREATE  packages/core/src/harness-strength/rules/strength-001-nonblocking-hooks.test.ts
CREATE  packages/core/src/harness-strength/rules/strength-002-autobaseline.ts
CREATE  packages/core/src/harness-strength/rules/strength-002-autobaseline.test.ts
CREATE  packages/core/src/harness-strength/rules/strength-003-skip-list.ts
CREATE  packages/core/src/harness-strength/rules/strength-003-skip-list.test.ts
CREATE  packages/core/src/harness-strength/rules/strength-004-empty-thresholds.ts
CREATE  packages/core/src/harness-strength/rules/strength-004-empty-thresholds.test.ts
CREATE  packages/core/src/harness-strength/rules/strength-005-lowest-tier.ts
CREATE  packages/core/src/harness-strength/rules/strength-005-lowest-tier.test.ts
CREATE  packages/core/src/harness-strength/rules/strength-006-autoapprove-baseline.ts
CREATE  packages/core/src/harness-strength/rules/strength-006-autoapprove-baseline.test.ts
CREATE  packages/core/src/harness-strength/rules/strength-007-snapshot-signal-mismatch.ts
CREATE  packages/core/src/harness-strength/rules/strength-007-snapshot-signal-mismatch.test.ts
CREATE  packages/core/src/harness-strength/auditor.ts
CREATE  packages/core/src/harness-strength/auditor.test.ts
MODIFY  packages/core/src/harness-strength/types.ts            (add optional evaluable? to StrengthRule)
MODIFY  packages/core/src/harness-strength/types.test.ts       (assert evaluable optionality)
MODIFY  packages/core/src/harness-strength/rules/index.ts      (populate ALL_RULES)
MODIFY  packages/core/src/harness-strength/index.ts            (export HarnessStrengthAuditor + types)
```

Existing (READ ONLY, do not modify): `types.ts` schemas, `context.ts` (`buildProjectContext`/`resolveMode`), `scoring.ts` (`rollupScore`/`tierFor`/`SEVERITY_WEIGHTS`). Result type from `../shared/result` (`Ok`, `Err`, `type Result`).

## Conventions (mirror these)

- **Result type:** `import { Ok, Err, type Result } from '../shared/result';` (re-exports `@harness-engineering/types`). `Ok(value)` / `Err(error)`. Auditor returns `Result<AuditResult, Error>`.
- **Rule shape:** mirror `packages/core/src/security/rules/network.ts` — a plain object literal typed `StrengthRule`, default-exported or named-exported, `id` ascending, `message`/`remediation` strings.
- **Tests:** vitest (`import { describe, it, expect } from 'vitest';`). Fixture style: build inputs inline (no on-disk fixture dirs needed for rules — `detect(ctx)` takes a `ProjectContext`, so construct minimal `ProjectContext` literals). The auditor test uses `mkdtempSync` + `writeFileSync` like `context.test.ts`.
- **Line numbers:** when locatable, compute via `text.split('\n').findIndex(...) + 1` (1-based), matching `scanner.ts:89`. Omit `line` when not locatable.
- **Run tests:** `source ~/.nvm/nvm.sh && nvm use 22 && pnpm --filter @harness-engineering/core exec vitest run src/harness-strength/<file>.test.ts`

## Skeleton

1. Interface extension + shared rule test helper (~1 task, ~4 min)
2. The 7 rule modules, each TDD with fixture pair (~7 tasks, ~35 min)
3. Registry wiring (~1 task, ~3 min)
4. Auditor (TDD) + barrel export (~2 tasks, ~10 min)
5. Integration test + validate (~2 tasks, ~6 min)

**Estimated total:** 14 tasks, ~58 min.
_Skeleton approved: pending (see Phase 4 checkpoint)._

## Tasks

> Every code-producing task is TDD: write test → run → observe RED → implement → run → observe GREEN. All shell prefixed `source ~/.nvm/nvm.sh && nvm use 22 &&`. Rule `detect()` returns findings **without** `severity`.

### Task 1: Extend StrengthRule with optional `evaluable?` predicate

**Depends on:** none | **Files:** `packages/core/src/harness-strength/types.ts`, `packages/core/src/harness-strength/types.test.ts`
**Skills:** none
**Decision** `[checkpoint:decision]`: "not evaluable" representation. Recommended (and implemented here): add `evaluable?(ctx: ProjectContext): boolean` to the `StrengthRule` interface — optional, additive, backward-compatible (Phase 1's frozen `detect`/`appliesIn` unchanged; grep confirms no external consumer). A rule that cannot assess its pattern (required input absent) returns `evaluable: () => false`; the auditor then excludes it from `rulesRun`/`rulesPassing`. Rejected alternatives: (a) emit an `info` "not evaluable" finding — pollutes findings and dents score; (b) sentinel finding id — overloads the findings array. Present this choice; on approval proceed.

1. Edit `types.ts` — add to the `StrengthRule` interface, after `appliesIn`:
   ```ts
   /**
    * Optional. Returns false when the rule's required input is absent, so the
    * auditor excludes it from rulesRun/rulesPassing (a "not evaluable" pattern
    * must never count as a pass — success criterion #7). Omitted => always evaluable.
    */
   evaluable?(ctx: ProjectContext): boolean;
   ```
2. Edit `types.test.ts` — add a test that a rule object with `evaluable: () => false` and one without `evaluable` both satisfy `StrengthRule` (compile-time + a runtime assertion `expect(typeof rule.evaluable).toBe('function')` / `toBe('undefined')`).
3. Run: `source ~/.nvm/nvm.sh && nvm use 22 && pnpm --filter @harness-engineering/core exec vitest run src/harness-strength/types.test.ts` — observe GREEN.
4. Run: `npx tsc -p packages/core/tsconfig.json --noEmit` — exit 0.
5. Commit: `feat(harness-strength): add optional evaluable predicate to StrengthRule`

### Task 2: STRENGTH-001 — non-blocking hooks

**Depends on:** Task 1 | **Files:** `rules/strength-001-nonblocking-hooks.ts`, `rules/strength-001-nonblocking-hooks.test.ts`
**Spec:** §"Rule detection notes" #001, severity-defaults table (default `error`).

1. Write test first. Construct minimal `ProjectContext` literals (import `ProjectContext` from `../types`). Cases:
   - FAILING: `hookFiles: [{ name: 'pre-commit', path: '/r/.husky/pre-commit', text: '#!/bin/sh\n# this hook never blocks\nexit 0\n' }]` → `detect` returns 1 finding with `id: 'STRENGTH-001'`, `file` = the hook path, `line` pointing at the offending line, `message`/`remediation` non-empty, and **no `severity` key**.
   - PASSING: a hook whose text is `#!/bin/sh\nnode check.js || exit 1\n` → `detect` returns `[]`.
   - NOT EVALUABLE: `hookFiles: []` → `evaluable(ctx) === false` and `detect(ctx) === []`.
2. Run test — observe RED.
3. Implement `strength-001-nonblocking-hooks.ts`: export `const strength001NonblockingHooks: StrengthRule`. `gearPiece: 'blocking-gate'`, `defaultSeverity: 'error'`, `appliesIn: () => true`. `evaluable: (ctx) => ctx.hookFiles.length > 0`. `detect`: for each hook file, test its text against patterns `/never\s+blocks/i`, `/always\s+exits?\s+0/i`, and "guaranteed sole `exit 0`" — a line matching `/^\s*exit\s+0\s*$/m` where the hook has no other non-zero exit / conditional. Push one finding per matched hook (compute `line` via `split('\n').findIndex` on the first matching line). Assert returned objects omit `severity`.
4. Run test — observe GREEN.
5. Commit: `feat(harness-strength): STRENGTH-001 non-blocking hook detection`

### Task 3: STRENGTH-002 — auto-baseline on regression

**Depends on:** Task 1 | **Files:** `rules/strength-002-autobaseline.ts`, `rules/strength-002-autobaseline.test.ts`
**Spec:** §"Rule detection notes" #002 (default `error`). **Reference fixture:** this repo's real `.husky/pre-commit` (auto-updates arch baselines on REGRESSION) — use a trimmed copy as the FAILING fixture text.

1. Write test first. Cases over `ProjectContext.preCommit`:
   - FAILING: preCommit text containing a failure branch that invokes `--update-baseline` (trimmed real example: `if ! node ... ci check ...; then ... npx harness check-arch --update-baseline ... git add .harness/arch/baselines.json ... fi`) → 1 finding `id: 'STRENGTH-002'`, `file: '.husky/pre-commit'`, line at the `--update-baseline` invocation, no `severity`.
   - PASSING: a pre-commit that runs checks and `exit 1` on failure with no `--update-baseline`/threshold rewrite → `[]`.
   - NOT EVALUABLE: `preCommit: null` → `evaluable === false`, `detect === []`.
2. Run test — observe RED.
3. Implement: `gearPiece: 'regression-baseline'`, `defaultSeverity: 'error'`, `appliesIn: () => true`, `evaluable: (ctx) => ctx.preCommit !== null`. `detect`: split `preCommit` into lines; flag when a line matches `/--update-baseline/` OR a threshold-rewrite (`/(check-arch|baselines?\.json).*(--update-baseline|>\s*.*baselines?\.json)/`) AND it is reachable from a failure branch (heuristic: the text contains an `if !` / `|| ` / `then` block above the match — to limit false positives, only flag `--update-baseline` lines that appear inside an `if ! ... then ... fi` block; detect by scanning for a preceding `then` after an `if !` without an intervening `fi`). Emit one finding (dedup: first match). Document the heuristic in a comment.
4. Run test — observe GREEN.
5. Commit: `feat(harness-strength): STRENGTH-002 auto-baseline-on-regression detection`

### Task 4: STRENGTH-003 — oversized --skip list

**Depends on:** Task 1 | **Files:** `rules/strength-003-skip-list.ts`, `rules/strength-003-skip-list.test.ts`
**Spec:** §"Rule detection notes" #003 (default `warning`; `> 2` categories without inline `#` justification). **Reference:** this repo's `--skip entropy,docs,perf,security,deps,phase-gate` (6 categories) is a live FAILING case.

1. Write test first. Cases over `ProjectContext.preCommit`:
   - FAILING: line `... ci check --skip entropy,docs,perf,security,deps,phase-gate 2>&1 ...` with no `#` justification → 1 finding `id: 'STRENGTH-003'`, `file: '.husky/pre-commit'`, line set, message naming the count, no `severity`.
   - PASSING (count ≤ 2): `--skip entropy,docs` → `[]`.
   - PASSING (justified): `--skip a,b,c,d # justified: these run in CI` (inline `#` on the same line) → `[]`.
   - NOT EVALUABLE: `preCommit: null` → `evaluable === false`, `detect === []`.
2. Run test — observe RED.
3. Implement: `gearPiece: 'skip-discipline'`, `defaultSeverity: 'warning'`, `appliesIn: () => true`, `evaluable: (ctx) => ctx.preCommit !== null && /--skip\b/.test(ctx.preCommit)` (no `--skip` at all = nothing to assess → not evaluable, not a pass — but if `--skip` absent the pattern simply doesn't apply; treat absent `--skip` as evaluable-pass `[]` since the discipline holds. **Decision:** `evaluable` returns `ctx.preCommit !== null`; absent `--skip` → evaluable, `detect` returns `[]`). `detect`: extract `--skip <value>` via `/--skip[= ]+([\w,-]+)/`, split on `,`, count; if `count > 2` and the matched line has no inline `#` comment after the value → one finding (line located).
4. Run test — observe GREEN.
5. Commit: `feat(harness-strength): STRENGTH-003 oversized skip-list detection`

### Task 5: STRENGTH-004 — empty architecture.thresholds (incl. toolkit .hbs)

**Depends on:** Task 1 | **Files:** `rules/strength-004-empty-thresholds.ts`, `rules/strength-004-empty-thresholds.test.ts`
**Spec:** §"Rule detection notes" #004 (default `error`; toolkit ALSO checks each template). Note types.ts comment: `thresholds` undefined (never set) vs `{}` (present, empty) are both meaningful (both = no thresholds).

1. Write test first. Cases:
   - FAILING (adopter): `config: { layers: [{}], architecture: { thresholds: {} } }` → 1 finding `id: 'STRENGTH-004'`, `file: 'harness.config.json'`, no `severity`. Also `config: { layers: [{}] }` (thresholds undefined) → 1 finding.
   - PASSING (adopter): `config: { layers: [{}], architecture: { thresholds: { maxFanOut: 10 } } }` → `[]`. Also `config: { layers: [] }` (no layers) → `[]`.
   - TOOLKIT extra: `mode: 'toolkit'`, `templates: [{ path: '.../basic/harness.config.json.hbs', text: '{"layers":[{}],"architecture":{"thresholds":{}}}' }]` → an additional finding with `file` = the template path.
   - NOT EVALUABLE: `config: null` AND (adopter, no templates) → `evaluable === false`, `detect === []`.
2. Run test — observe RED.
3. Implement: `gearPiece: 'architecture-thresholds'`, `defaultSeverity: 'error'`, `appliesIn: () => true`, `evaluable: (ctx) => ctx.config !== null || (ctx.mode === 'toolkit' && (ctx.templates?.length ?? 0) > 0)`. `detect`: helper `thresholdsEmpty(cfg)` → `(cfg?.layers?.length ?? 0) > 0 && (!cfg?.architecture?.thresholds || Object.keys(cfg.architecture.thresholds).length === 0)`. Check `ctx.config` (file `harness.config.json`). In toolkit mode, for each `templates` entry whose path ends `harness.config.json.hbs`, parse text as JSON (best-effort; on parse failure skip — Handlebars tokens may break JSON, so `try/catch` and only flag cleanly-parseable templates), run `thresholdsEmpty`, push finding with the template path.
4. Run test — observe GREEN.
5. Commit: `feat(harness-strength): STRENGTH-004 empty-thresholds detection (adopter + toolkit templates)`

### Task 6: STRENGTH-005 — lowest-tier default

**Depends on:** Task 1 | **Files:** `rules/strength-005-lowest-tier.ts`, `rules/strength-005-lowest-tier.test.ts`
**Spec:** §"Rule detection notes" #005 (default `warning`; adopter: `config.template.level === 'basic'`; toolkit: scan `initSkill` for default `basic` recommendation). Source forks by mode.

1. Write test first. Cases:
   - FAILING (adopter): `mode: 'adopter', config: { template: { level: 'basic' } }` → 1 finding `id: 'STRENGTH-005'`, `file: 'harness.config.json'`, no `severity`.
   - PASSING (adopter): `level: 'standard'` → `[]`.
   - FAILING (toolkit): `mode: 'toolkit', initSkill: '... recommends basic by default ...'` (text matching the default-basic pattern) → 1 finding, `file` referencing the init skill path.
   - PASSING (toolkit): `initSkill` recommending `standard` → `[]`.
   - NOT EVALUABLE: adopter + `config: null` → `evaluable === false`. toolkit + `initSkill: null` → `evaluable === false`.
2. Run test — observe RED.
3. Implement: `gearPiece: 'tier-default'`, `defaultSeverity: 'warning'`, `appliesIn: () => true`. `evaluable: (ctx) => ctx.mode === 'adopter' ? ctx.config !== null : (ctx.initSkill ?? null) !== null`. `detect`: adopter → flag iff `ctx.config?.template?.level === 'basic'` (file `harness.config.json`); toolkit → scan `ctx.initSkill` for a default-`basic` recommendation via `/default(?:s| recommendation)?[^\n]*\bbasic\b/i` OR `/\bbasic\b[^\n]*\b(default|recommend)/i`; if matched, one finding with `file` = `agents/skills/claude-code/initialize-harness-project/SKILL.md` (line located in initSkill text).
4. Run test — observe GREEN.
5. Commit: `feat(harness-strength): STRENGTH-005 lowest-tier-default detection`

### Task 7: STRENGTH-006 — auto-approved baseline PR

**Depends on:** Task 1 | **Files:** `rules/strength-006-autoapprove-baseline.ts`, `rules/strength-006-autoapprove-baseline.test.ts`
**Spec:** §"Rule detection notes" #006 (default `error`; auto-approve/auto-merge gated only on a PAT without independent-review). **Concern:** regex vs YAML — regex on raw text is the chosen v1 approach (see concerns).

1. Write test first. Cases over `ProjectContext.workflows`:
   - FAILING: a workflow text containing an auto-approve/auto-merge step using a PAT secret (e.g. `gh pr merge --auto` or `peter-evans/enable-pull-request-automerge` / `hmarr/auto-approve-action` with `token: ${{ secrets.BASELINE_AUTOAPPROVE_PAT }}`) and NO independent-review condition (no `required_reviewers`, no second human approval gate) → 1 finding `id: 'STRENGTH-006'`, `file` = workflow path, no `severity`.
   - PASSING: a workflow with auto-merge but gated on `if: github.event.review.state == 'approved'` / a reviewers requirement → `[]`.
   - PASSING: workflow with no auto-approve at all → `[]`.
   - NOT EVALUABLE: `workflows: []` → `evaluable === false`, `detect === []`.
2. Run test — observe RED.
3. Implement: `gearPiece: 'review-gate'`, `defaultSeverity: 'error'`, `appliesIn: () => true`, `evaluable: (ctx) => ctx.workflows.length > 0`. `detect`: for each workflow, detect an auto step via `/auto-?approve|auto-?merge|--auto\b|enable-pull-request-automerge/i`; detect PAT-gating via `/secrets\.\w*(PAT|TOKEN)\w*/`; detect an independent-review signal via `/required_reviewers|review.*approved|approvals?\s*:\s*[1-9]|CODEOWNERS/i`. Flag when (auto-step matched AND PAT matched AND review-signal NOT matched). One finding per offending workflow; line at the auto-step line. Document the regex-not-YAML choice and false-positive caveat in a comment.
4. Run test — observe GREEN.
5. Commit: `feat(harness-strength): STRENGTH-006 auto-approve-baseline detection`

### Task 8: STRENGTH-007 check→signal mapping table

**Depends on:** Task 1 | **Files:** `rules/strength-007-snapshot-signal-mismatch.ts` (mapping constant + skeleton only), `rules/strength-007-snapshot-signal-mismatch.test.ts` (mapping test only)
**Spec:** §"Rule detection notes" #007. Isolating the mapping into its own task keeps Task 9 atomic and makes the table explicit (uncertainty resolution).

1. Write test first: import `CHECK_SIGNAL_MAP` from the rule module; assert it equals:
   ```ts
   {
     security: 'security-findings',
     entropy: 'entropy-drift',
     deps: 'dependency-violations',
     perf: 'perf-regression',
     docs: 'doc-coverage',
     lint: 'lint-issues',
   }
   ```
   (Derived from this repo's live snapshot: `checks.security` ↔ `signals: ["security-findings"]`.)
2. Run test — observe RED (module/constant absent).
3. Create `strength-007-snapshot-signal-mismatch.ts` exporting `export const CHECK_SIGNAL_MAP: Record<string, string> = { ... }` (above) with a comment citing the snapshot source, plus a placeholder `StrengthRule` export stub (filled in Task 9). Keep `detect` returning `[]` for now if needed to compile, OR defer the full export to Task 9 and export only the map here — choose so the file compiles. (Recommended: export the map AND a complete rule whose `detect` is implemented in this task's step — but to keep the task atomic, implement only the map + a typed rule object that uses it; the `detect` body is finished in Task 9. If that splits awkwardly, fold Task 9 logic here.)
4. Run: `npx tsc -p packages/core/tsconfig.json --noEmit` — exit 0.
5. Commit: `feat(harness-strength): STRENGTH-007 check→signal mapping table`

### Task 9: STRENGTH-007 — snapshot/signal mismatch detect()

**Depends on:** Task 8 | **Files:** `rules/strength-007-snapshot-signal-mismatch.ts`, `rules/strength-007-snapshot-signal-mismatch.test.ts`
**Spec:** §"Rule detection notes" #007 (default `error`). **Reference:** live snapshot has `checks.security.passed: false`... but the mismatch fires when `passed === true` AND the mapped signal IS listed.

1. Extend test. Cases over `ProjectContext.healthSnapshot` (typed `unknown`; narrow defensively):
   - FAILING: `healthSnapshot: { checks: { security: { passed: true } }, signals: ['security-findings'] }` → 1 finding `id: 'STRENGTH-007'`, `file: '.harness/health-snapshot.json'`, message naming `security` / `security-findings`, no `severity`.
   - PASSING: `{ checks: { security: { passed: true } }, signals: [] }` → `[]` (passed but no contradicting signal).
   - PASSING: `{ checks: { security: { passed: false } }, signals: ['security-findings'] }` → `[]` (honest failure).
   - MULTI: two contradicting checks → 2 findings.
   - NOT EVALUABLE: `healthSnapshot: null` → `evaluable === false`, `detect === []`. Also `healthSnapshot` present but malformed (no `checks`) → `evaluable === false` (or evaluable-pass `[]`; choose `evaluable === false` since the input can't be assessed). Assert the chosen behavior.
2. Run test — observe RED.
3. Implement the full rule: `gearPiece: 'snapshot-honesty'`, `defaultSeverity: 'error'`, `appliesIn: () => true`. `evaluable: (ctx) => isSnapshot(ctx.healthSnapshot)` where `isSnapshot` narrows to `{ checks: Record<string,{passed?:boolean}>, signals?: string[] }`. `detect`: for each `[k, v]` in `checks`, if `v.passed === true` and `signals.includes(CHECK_SIGNAL_MAP[k])` → push a finding. (Signals outside the map are ignored — documented limitation.)
4. Run test — observe GREEN.
5. Commit: `feat(harness-strength): STRENGTH-007 snapshot-signal-mismatch detection`

### Task 10: Populate ALL_RULES registry

**Depends on:** Tasks 2-9 | **Files:** `rules/index.ts`
**Category:** integration

1. Edit `rules/index.ts`: import all 7 rule exports and set `export const ALL_RULES: StrengthRule[] = [ strength001NonblockingHooks, strength002Autobaseline, strength003SkipList, strength004EmptyThresholds, strength005LowestTier, strength006AutoapproveBaseline, strength007SnapshotSignalMismatch ];` (ascending id order). Remove the Phase 1 "empty" comment.
2. Add a colocated assertion in a new/extended test (or in `auditor.test.ts`, Task 12): `expect(ALL_RULES.map(r => r.id)).toEqual(['STRENGTH-001',...,'STRENGTH-007'])`. (If adding here, create `rules/index.test.ts`.)
3. Run: `source ~/.nvm/nvm.sh && nvm use 22 && pnpm --filter @harness-engineering/core exec vitest run src/harness-strength/rules` — GREEN.
4. Run: `npx tsc -p packages/core/tsconfig.json --noEmit` — exit 0.
5. Commit: `feat(harness-strength): register all seven STRENGTH rules in ALL_RULES`

### Task 11: Auditor — failing/passing unit cases (TDD, core logic)

**Depends on:** Task 10 | **Files:** `auditor.ts`, `auditor.test.ts`
**Spec:** §"Auditor flow". Returns `Result<AuditResult>`.

1. Write test first (unit-level, synthetic `ProjectContext` via a test-only injection OR via temp dir; prefer temp dir for realism but a smaller unit test may stub `buildProjectContext` — **decision:** test through the public `audit(root, opts)` using `mkdtempSync` so we exercise context-building too). Cases:
   - Bare temp dir → `audit(root, {})` returns `Ok`; `result.value.summary.rulesRun` counts only evaluable rules (likely 0 on a bare dir), `rulesPassing === rulesRun`, `findings: []`, `score: 100`, `tier: 'solid'`, `mode: 'adopter'`.
   - A temp dir with a `.husky/pre-commit` containing `# never blocks\nexit 0` → findings include `STRENGTH-001` at severity `error` (default), `summary.errors >= 1`, score reduced, tier reflects scoring.
   - Severity override: write `harness.config.json` with `{ audit: { harnessStrength: { severities: { 'STRENGTH-001': 'warning' } } } }` + the same hook → the STRENGTH-001 finding has `severity: 'warning'`, and `summary.warnings` counts it.
2. Run test — observe RED.
3. Implement `auditor.ts`:

   ```ts
   import { Ok, type Result } from '../shared/result';
   import { buildProjectContext, resolveMode, type ModeOptions } from './context';
   import { ALL_RULES } from './rules/index';
   import { rollupScore } from './scoring';
   import type {
     AuditResult,
     ProjectContext,
     Severity,
     StrengthFinding,
     StrengthRule,
   } from './types';

   export interface AuditOptions extends ModeOptions {}

   export class HarnessStrengthAuditor {
     audit(root: string, opts: AuditOptions = {}): Result<AuditResult, Error> {
       const mode = resolveMode(opts, root);
       const ctx = buildProjectContext(root, mode);
       const applicable = ALL_RULES.filter((r) => r.appliesIn(mode));
       const evaluable = applicable.filter((r) => (r.evaluable ? r.evaluable(ctx) : true));
       const findings: StrengthFinding[] = [];
       let rulesPassing = 0;
       for (const rule of evaluable) {
         const raw = rule.detect(ctx);
         if (raw.length === 0) {
           rulesPassing++;
           continue;
         }
         const severity = severityFor(rule, ctx);
         for (const f of raw) findings.push({ ...f, severity });
       }
       const { score, tier } = rollupScore(findings);
       const summary = {
         errors: findings.filter((f) => f.severity === 'error').length,
         warnings: findings.filter((f) => f.severity === 'warning').length,
         info: findings.filter((f) => f.severity === 'info').length,
         rulesRun: evaluable.length,
         rulesPassing,
       };
       return Ok({ mode, score, tier, findings, summary });
     }
   }

   function severityFor(rule: StrengthRule, ctx: ProjectContext): Severity {
     const override = ctx.config?.audit?.harnessStrength?.severities?.[rule.id];
     return override ?? rule.defaultSeverity;
   }
   ```

   (Auditor is total/non-throwing because `buildProjectContext` never throws; wrap in try/catch returning `Err` defensively for unforeseen rule errors.)

4. Run test — observe GREEN.
5. Run: `npx tsc -p packages/core/tsconfig.json --noEmit` — exit 0.
6. Commit: `feat(harness-strength): HarnessStrengthAuditor.audit with severity overrides and scoring`

### Task 12: Auditor integration test over a synthetic fixture project (determinism + not-evaluable)

**Depends on:** Task 11 | **Files:** `auditor.test.ts`

1. Add an integration test: `mkdtempSync` a project that triggers a known subset of rules deterministically — e.g. `.husky/pre-commit` (STRENGTH-001 + 002 + 003 via the trimmed real example), `harness.config.json` with `layers` + empty `thresholds` + `template.level: 'basic'` (STRENGTH-004 + 005). Assert:
   - `result.value.findings.map(f => f.id).sort()` equals the expected id set.
   - The score/tier are exact (compute by hand from `SEVERITY_WEIGHTS`).
   - `summary.rulesRun` = count of evaluable rules; `summary.rulesPassing` = evaluable minus those that fired. Explicitly assert STRENGTH-006 (no workflows) and STRENGTH-007 (no snapshot) are **NOT** in `rulesRun` (not-evaluable, not false passes).
   - Determinism: call `audit()` twice on the same dir; `expect(run1).toEqual(run2)`.
2. Run test — observe GREEN (implementation already exists from Task 11).
3. Run: `source ~/.nvm/nvm.sh && nvm use 22 && pnpm --filter @harness-engineering/core exec vitest run src/harness-strength` — full suite GREEN.
4. Commit: `test(harness-strength): auditor integration test (determinism + not-evaluable exclusion)`

### Task 13: Barrel export — HarnessStrengthAuditor

**Depends on:** Task 11 | **Files:** `packages/core/src/harness-strength/index.ts`
**Category:** integration

1. Edit `index.ts`: add `export { HarnessStrengthAuditor } from './auditor';` and `export type { AuditOptions } from './auditor';`. (`harness-strength` is already re-exported from `packages/core/src/index.ts:213` via `export * from './harness-strength'`, so the auditor reaches `@harness-engineering/core` automatically.)
2. Run: `npx tsc -p packages/core/tsconfig.json --noEmit` — exit 0.
3. Run: `source ~/.nvm/nvm.sh && nvm use 22 && pnpm --filter @harness-engineering/core run build` (or the core build script) to confirm the barrel compiles cleanly.
4. Commit: `feat(harness-strength): export HarnessStrengthAuditor from core barrel`

### Task 14: Validate

**Depends on:** Task 13 | **Files:** none
**Category:** integration `[checkpoint:human-verify]`

1. Run: `source ~/.nvm/nvm.sh && nvm use 22 && pnpm --filter @harness-engineering/core exec vitest run src/harness-strength` — all tests GREEN (rules + auditor + context + scoring + types).
2. Run: `npx tsc -p packages/core/tsconfig.json --noEmit` — exit 0.
3. Run: `harness validate` — passes.
4. Run: `harness check-deps` — confirm no new circular/layer violations from the auditor imports.
5. `[checkpoint:human-verify]` — show the test summary + a sample `AuditResult` (optionally run a one-off `node -e` against this repo's root in toolkit mode to eyeball that STRENGTH-002/003/007 fire on the live config). Confirm Phase 2 scope only (no CLI, no skill).
6. Commit: `chore(harness-strength): Phase 2 validation pass` (only if any working-tree fixups were needed; otherwise skip).

## Sequencing & Parallelism

- Task 1 unblocks everything. Tasks 2-7 and 8 are mutually independent (different rule files) and **parallelizable**. Task 9 depends on Task 8. Task 10 depends on 2-9. Tasks 11→12 and 11→13 are sequential; 13→14 last.
- Tasks 2-9 are the high-complexity core (regex/parse logic). Tasks 1, 10, 13, 14 are small wiring/validate tasks.

## Concerns (carry to handoff)

1. **False-positive risk in shell/text parsing (STRENGTH-002, 003).** `.husky/pre-commit` is shell; regex heuristics for "failure branch → --update-baseline" (002) and "--skip count + inline justification" (003) can mis-fire on unusual scripts. Mitigation: require co-occurrence (token + branch/skip-flag) and document heuristics inline; fixture pairs lock expected behavior. This repo's real pre-commit is the canonical FAILING fixture for both.
2. **STRENGTH-006: regex vs YAML parser.** Chosen v1 = regex over raw `ctx.workflows` text (no YAML dep — consistent with SecurityScanner regex rules, YAGNI per spec non-goals). Risk: complex multi-job workflows with review gates in a separate job may yield false positives/negatives. Documented as a known limitation; revisit if dogfood (Phase 5) shows noise.
3. **"Not evaluable" representation.** Resolved via optional `evaluable?(ctx)` on `StrengthRule` (additive; no external consumer). Auditor excludes not-evaluable rules from `rulesRun` AND `rulesPassing` so absent input never masks a weakness (success criterion #7). Surfaced as `[checkpoint:decision]` in Task 1.
4. **STRENGTH-007 check→signal mapping.** Hardcoded table derived from this repo's live snapshot (`security`↔`security-findings`). Signals outside the table are ignored (documented limitation, not a false pass). Isolated in Task 8 so the table is explicit and independently testable.
5. **Interface extension safety.** `evaluable?` is optional/additive; grep confirms `StrengthRule`/`ALL_RULES` have no consumers beyond `rules/index.ts`, so Phase 1's frozen contract is preserved.

## Checkpoints

- Task 1 — `[checkpoint:decision]` "not evaluable" representation (recommend optional `evaluable?`).
- Task 14 — `[checkpoint:human-verify]` final test/validate + optional live dogfood eyeball.

## Out of Scope (later phases)

- Phase 3: `packages/cli/src/commands/check-harness-strength.ts`, `_registry.ts` regen, OutputFormatter, exit codes, `--json`/`--report-only`/`--severity`.
- Phase 4: `SKILL.md`, `skill.yaml`, slash-command/agent-definition regen, AGENTS.md/CLI docs, the D1 ADR, graph knowledge enrichment.
- Phase 5: dogfood verification against this repo; fixture locking.
