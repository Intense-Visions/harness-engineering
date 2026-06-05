# Init Design + Roadmap Polish Follow-ups

**Keywords:** init-skill, design-system-config, roadmap-skill, depends-on-symmetry, test-fixture-helper, vocabulary-canon, regression-guard

## Overview

`init-design-roadmap-config` (proposal #256) shipped Phases 1–5 with eight carry-forward concerns acknowledged but deliberately deferred. Five of those — two doc-fixes that the Phase 4 plan explicitly punted (`DEFER-S2`, `DEFER-S3`) and three Phase 4 review-feedback items (`FINAL-S1`, `FINAL-S2`, `FINAL-S3`) — remain on the carry-forward list with no follow-up commit landed.

This spec bundles those five items into a single polish change. None require new design; all five trace to specific reviewer feedback recorded in the Phase 5 verification report (`docs/changes/init-design-roadmap-config/verification/2026-05-03-phase5-report.md:55-57`) and the Phase 4 plan (`docs/changes/init-design-roadmap-config/plans/2026-05-02-phase4-docs-catalog-plan.md:16`).

### Goal

Close the five remaining carry-forward items so `init-design-roadmap-config` can be marked as fully resolved, and lock the canonical "not sure" vocabulary with a regression guard so the homogenization does not drift on the next edit.

### In Scope

- **S2** — Rewrite `docs/changes/init-design-roadmap-config/proposal.md:146` Registrations bullet so it reflects the final design (post-create `manage_roadmap.add` + the new `harness-roadmap` invocation), not the obsolete "manage_roadmap creates the roadmap" model.
- **S3** — Add `harness-roadmap` to `agents/skills/claude-code/initialize-harness-project/skill.yaml` `depends_on`, symmetric with `harness-design-system` already in the list.
- **FINAL-S1** — Extract the test fixture scaffold (mkdtemp + write `harness.config.json` + write `docs/roadmap.md`) currently inlined across `init-design-roadmap-matrix.test.ts` (6 scenarios) and `init-design-roadmap-yes-yes-e2e.test.ts` into `packages/cli/tests/integration/_helpers/init-fixture.ts`; rewire both tests.
- **FINAL-S2** — Normalize "not sure" vocabulary to lowercase, no "yet", no hyphen across `init-design-roadmap-config/proposal.md` narrative + decision table and `initialize-harness-project/SKILL.md` narrative prose. Preserve `Not sure yet` exclusively inside `label:` button strings.
- **FINAL-S3** — Rewrite the `// Three asserts:` docstring at the top of `packages/cli/tests/integration/skill-catalog-consistency.test.ts` to cite the regression motivation for each assert (so a future reader knows WHY the `created via manage_roadmap` string is forbidden).
- **Regression guard** — Extend `skill-catalog-consistency.test.ts` with two new assertions: (a) `Not sure yet` outside `label: "..."` whitelist fails, (b) `not-sure` (hyphenated) appears nowhere in user-facing SKILL.md / proposal.md.

### Out of Scope

- The 7 manual-verification items deferred from Phase 5 (#1, #2, #3, #12, #13, #14, #15) — those require live LLM-driven init sessions and remain owner of separate manual verification, not this polish bundle.
- Regenerating `docs/reference/cli-commands.md` or `docs/reference/mcp-tools.md` (`CARRY-FORWARD-NEW-PHASE4` drift) — unrelated to the five carry-forward items here.
- Pre-existing DTS typecheck failures (`CARRY-FORWARD-DTS`) or arch baseline drift (`CARRY-FORWARD-ARCH`) — out of scope; pre-date this change set.
- Adding helper tests for `init-fixture.ts` itself — YAGNI; transitively covered by 7 existing scenarios.

### Non-Goals

- No new init-skill behavior. Every edit is doc/test polish or vocabulary normalization.
- No changes to the design or roadmap question flows themselves.

## Decisions

| #   | Decision                                                                                                                                                                                            | Rationale                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Bundle all five items (S2, S3, FINAL-S1/S2/S3) into a single spec and a single PR                                                                                                                   | All five trace to the same parent change set (`init-design-roadmap-config`) and the same Phase 5 carry-forward list. Splitting them doubles planning + sign-off overhead for items collectively well under a day's work, with no parallelism benefit.                                         |
| D2  | Canonical "not sure" form is lowercase, two words, no hyphen (`not sure`) for all user-facing prose; `Not sure yet` survives **only** as a verbatim button-label string                             | `(yes / no / not sure)` was already locked in `harness-design-system/SKILL.md:31` by phase3-rev-001. Treating "Not sure yet" as a button-label affix (where it carries the "you can decide later" UX affordance) and stripping it from narrative copy matches what users actually read.       |
| D3  | Hyphenated `not-sure` is forbidden in user-facing copy; survives only as a config key or technical identifier                                                                                       | The hyphen reads as an identifier shape (e.g. `design.enabled`), not prose. Keeping it out of prose stops the third drift vector that motivated FINAL-S2.                                                                                                                                     |
| D4  | The vocabulary canon is enforced by extending `skill-catalog-consistency.test.ts`, not by a new test file                                                                                           | That test already serves as the canonical vocabulary regression lock (it guards the `created via manage_roadmap` string from returning). Co-locating the new `Not sure yet` / `not-sure` guards keeps the regression-lock concept in one place. The Phase 5 plan established the precedent.   |
| D5  | The `Not sure yet` whitelist pattern matches only the literal substring inside an `emit_interaction` option `label:` field; narrative prose with the same words fails the assert                    | Tight enough to catch the regression vector (button labels were the only legitimate occurrence). A wider rule would let narrative prose drift back to "Not sure yet" — which is exactly what FINAL-S2 is filed against.                                                                       |
| D6  | The test-fixture scaffold helper lives at `packages/cli/tests/integration/_helpers/init-fixture.ts`, not inlined or in a shared `_test-utils/` root                                                 | `_helpers/` co-locates with the integration tests that consume it. A shared `_test-utils/` location is speculative — no third consumer exists today. Inline-only (Approach A in EVALUATE) leaves the e2e test still duplicating the same setup, partially defeating FINAL-S1's motivation.    |
| D7  | The helper exposes a single function `scaffoldInitFixture({ design, roadmap }): { tmpDir, configPath, roadmapPath, cleanup }`; matrix + e2e tests call it with their respective scenario parameters | One entry point, scenario-as-data. The 6 matrix scenarios become a parameterized loop over 6 input shapes; the e2e test becomes a single call with the yes/yes scenario. No conditionals leak into the helper — it just writes the requested config + roadmap and hands back paths.           |
| D8  | The S2 rewrite preserves the **section heading** (`### Registrations Required`) and **bullet count** structure of the surrounding section; only the affected bullet's body changes                  | Minimizes diff noise so reviewers can verify only the corrected claim, not re-read the whole Integration Points block. The four other bullets in that section remain accurate.                                                                                                                |
| D9  | S3's `depends_on` edit lands as a literal yaml insertion under the existing `harness-design-system` line, no resort                                                                                 | Alphabetical sort would churn unrelated entries; insertion-order yaml lists are stable. The skill loader does not depend on order.                                                                                                                                                            |
| D10 | The FINAL-S3 docstring rewrite explains **why** each assert exists (the regression it guards) rather than just **what** it asserts                                                                  | The `// Three asserts:` block today restates the assertion code. FINAL-S3's motivation is that the next reader needs the regression context (e.g., "`created via manage_roadmap` was the pre-Phase-4 wording — Phase 4 rewrote it; this assert prevents the old wording from sneaking back"). |

## Technical Design

### Files Modified

| File                                                                     | Change                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/changes/init-design-roadmap-config/proposal.md`                    | Rewrite the line-146 Registrations bullet (S2); normalize "Not sure" / "not-sure" / "not sure" to canonical `not sure` in narrative prose and the D3 decision row, preserving exact button-label strings (FINAL-S2)                                                   |
| `agents/skills/claude-code/initialize-harness-project/skill.yaml`        | Add `- harness-roadmap` to `depends_on`, inserted after the existing `harness-design-system` line (S3)                                                                                                                                                                |
| `agents/skills/claude-code/initialize-harness-project/SKILL.md`          | Normalize narrative "Not sure yet" / "not-sure" → `not sure` in non-button contexts (lines 343, 359, 550, etc.); preserve verbatim `label: "Not sure yet"` button strings at lines 124, 169, 186 (FINAL-S2)                                                           |
| `packages/cli/tests/integration/_helpers/init-fixture.ts` (NEW)          | Exports `scaffoldInitFixture({ design, roadmap }) → { tmpDir, configPath, roadmapPath, cleanup }`. Wraps `mkdtempSync` + `writeFileSync(harness.config.json)` + `writeFileSync(docs/roadmap.md)`. Returns a `cleanup()` callback for `afterEach` (FINAL-S1)           |
| `packages/cli/tests/integration/init-design-roadmap-matrix.test.ts`      | Replace inline scaffold (lines ~90–146) with `scaffoldInitFixture(scenario)` call; preserve all 6 scenarios verbatim as data (FINAL-S1)                                                                                                                               |
| `packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts` | Replace inline scaffold with `scaffoldInitFixture({ design: 'yes', roadmap: 'yes' })` call (FINAL-S1)                                                                                                                                                                 |
| `packages/cli/tests/integration/skill-catalog-consistency.test.ts`       | Rewrite top-of-file docstring to cite the regression motivation behind each assert (FINAL-S3); add two new assertions: forbid `Not sure yet` outside `label:` whitelist, forbid `not-sure` anywhere in user-facing SKILL.md / proposal.md (FINAL-S2 regression guard) |

No new directories beyond `packages/cli/tests/integration/_helpers/`. No deletions.

### Helper Signature

```ts
// packages/cli/tests/integration/_helpers/init-fixture.ts
export interface InitFixtureScenario {
  design: 'yes' | 'no' | 'not-sure';
  roadmap: 'yes' | 'no';
}

export interface InitFixtureHandle {
  tmpDir: string;
  configPath: string; // <tmpDir>/harness.config.json
  roadmapPath: string; // <tmpDir>/docs/roadmap.md
  cleanup: () => void; // rm -rf tmpDir
}

export async function scaffoldInitFixture(
  scenario: InitFixtureScenario
): Promise<InitFixtureHandle>;
```

The helper produces post-step-5b config state and post-step-4 roadmap state given the scenario, matching what the matrix test inlines today. The function is async because the Phase 3 implementation awaits `runInit({ cwd, name, level })` to scaffold the base project before mutating `harness.config.json` / `docs/roadmap.md`; callers must `await scaffoldInitFixture(...)`. No mutation logic moves into the helper — it only writes the requested fixture.

### Vocabulary Regression Assertions

Added to `skill-catalog-consistency.test.ts`:

```ts
it('forbids "Not sure yet" outside emit_interaction button labels', () => {
  const skillMd = fs.readFileSync(SKILL_MD, 'utf-8');
  const occurrences = [...skillMd.matchAll(/Not sure yet/g)];
  for (const m of occurrences) {
    const window = skillMd.slice(Math.max(0, m.index! - 32), m.index! + 16);
    expect(window).toMatch(/label:\s*["']Not sure yet/);
  }
});

it('forbids hyphenated "not-sure" in user-facing copy', () => {
  for (const filePath of [SKILL_MD, PROPOSAL_MD]) {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).not.toMatch(/not-sure/);
  }
});
```

## Integration Points

### Entry Points

- No new CLI commands, MCP tools, skills, or API routes. All changes touch existing surfaces: one yaml file, two markdown specs, one SKILL.md, three test files, plus one new test helper file.

### Registrations Required

- `harness-roadmap` skill is already registered; the `depends_on` addition in `initialize-harness-project/skill.yaml` (S3) is purely declarative — no skill loader re-registration needed.
- The new `_helpers/init-fixture.ts` file requires no test runner registration; vitest picks it up via direct import from the existing tests.

### Documentation Updates

- `docs/changes/init-design-roadmap-config/proposal.md` line-146 bullet (S2) and narrative vocabulary (FINAL-S2 carry-forward).
- `agents/skills/claude-code/initialize-harness-project/SKILL.md` narrative vocabulary (FINAL-S2).
- `docs/reference/skills-catalog.md` — re-run `pnpm run generate-docs` after S3 to pick up any catalog drift from the `depends_on` change; commit only if the catalog diff is non-empty.
- `AGENTS.md` — no update needed.

### Architectural Decisions

- None. The five items are doc, vocabulary, and test-fixture polish; no project-level architecture is affected. The parent spec (`init-design-roadmap-config`) explicitly declined to ADR its own decisions for the same reason, and this polish bundle inherits that posture.

### Knowledge Impact

- Minor. The vocabulary canon (`not sure` lowercase, button-label `Not sure yet` whitelisted, hyphenated `not-sure` forbidden) is a small documented convention. If the knowledge graph ingests skill prose, the normalization reduces token-shape noise but does not introduce new domain concepts.

## Success Criteria

### Mechanical

1. `docs/changes/init-design-roadmap-config/proposal.md:146` bullet no longer claims `manage_roadmap` is the roadmap creator; new text reflects `harness-roadmap` skill invocation plus post-create `manage_roadmap.add`.
2. `agents/skills/claude-code/initialize-harness-project/skill.yaml` `depends_on` array contains `harness-roadmap` in addition to `initialize-test-suite-project` and `harness-design-system`.
3. `packages/cli/tests/integration/_helpers/init-fixture.ts` exists and exports `scaffoldInitFixture` with the documented signature.
4. `init-design-roadmap-matrix.test.ts` and `init-design-roadmap-yes-yes-e2e.test.ts` call `scaffoldInitFixture` and contain no inline `mkdtempSync` / `writeFileSync('harness.config.json' | 'docs/roadmap.md')` calls.

### Vocabulary

5. Grep for `Not sure yet` across `agents/skills/claude-code/initialize-harness-project/` returns only matches inside `label: "..."` strings.
6. Grep for `not-sure` (hyphenated) across `docs/changes/init-design-roadmap-config/` and `agents/skills/claude-code/initialize-harness-project/SKILL.md` returns zero matches.
7. Lowercase `not sure` appears as the canonical narrative form in all user-facing copy.

### Regression Guards

8. `skill-catalog-consistency.test.ts` contains the two new assertions (D4/D5); both pass.
9. The existing `created via manage_roadmap` regression assertion still passes unmodified.
10. The top-of-file docstring in `skill-catalog-consistency.test.ts` cites the regression source for each assert.

### Behavioral

11. All 10 existing tests in the three integration test files (`init-design-roadmap-matrix.test.ts`, `init-design-roadmap-yes-yes-e2e.test.ts`, `skill-catalog-consistency.test.ts`) still pass without modification of their assertions.
12. `harness validate` exits 0 after all changes.
13. `pnpm run generate-docs --check` reports no new drift introduced by the `depends_on` change beyond the pre-existing `CARRY-FORWARD-NEW-PHASE4` baseline.

## Implementation Order

**Phase 1 — Doc & yaml fixes (S2 + S3).** Edit proposal.md:146; edit skill.yaml `depends_on`. Cheapest, lowest-risk changes. Run `harness validate`. Single commit.

**Phase 2 — Vocabulary normalization (FINAL-S2).** Sweep `initialize-harness-project/SKILL.md` and `init-design-roadmap-config/proposal.md` for "Not sure yet" / "not-sure" in narrative contexts; replace with `not sure`. Preserve exact button-label strings. Single commit.

**Phase 3 — Helper extraction (FINAL-S1).** Create `_helpers/init-fixture.ts`; rewire matrix test (6 scenarios) and e2e test. Run the three integration tests; assertions must still pass unchanged. Single commit.

**Phase 4 — Docstring + regression guard (FINAL-S3 + D4/D5 assertions).** Rewrite the top-of-file docstring in `skill-catalog-consistency.test.ts` per D10; add the two new assertions. Run the integration tests. Single commit.

**Phase 5 — Final validation.** Run `harness validate`, `pnpm run generate-docs --check`, and the full `@harness-engineering/cli` integration test suite. Open PR. No new commits unless a check fails.
