# Plan: Design System Phase 6 — Integration

**Date:** 2026-03-19
**Spec:** docs/changes/design-system-skills/proposal.md
**Estimated tasks:** 8
**Estimated time:** 25 minutes

## Goal

Wire the 5 design skills into the existing harness infrastructure so that design checks participate in the standard verification pipeline, impact analysis traces design token changes, and onboarding surfaces design system context.

## Observable Truths (Acceptance Criteria)

1. When a project has `design.strictness` configured in `harness.config.json`, the `harness-verify` SKILL.md documents a design constraint check as part of its EXECUTE phase.
2. The `harness-integrity` SKILL.md includes a `Design` line in its REPORT phase output format (alongside Tests, Lint, Types, Security, Review).
3. The `harness-onboarding` SKILL.md includes a "Design System" section in its MAP phase and SUMMARIZE template.
4. The `harness-impact-analysis` SKILL.md documents DesignToken graph traversal (USES_TOKEN edges) in its ANALYZE phase.
5. The `enforce-architecture` SKILL.md documents a `design` constraint category that surfaces DESIGN-xxx violations.
6. When `harness-verify` gemini-cli copy is updated, it matches the claude-code copy (both platform copies exist and are identical for modified skills that have gemini-cli copies).
7. `pnpm test` passes — all existing skill tests (schema, structure, platform-parity, references) remain green.
8. The 5 design skills are referenced by name in the skills they integrate with (verify references harness-accessibility, integrity references harness-design, etc.).

## File Map

```
MODIFY agents/skills/claude-code/harness-verify/SKILL.md
MODIFY agents/skills/claude-code/harness-integrity/SKILL.md
MODIFY agents/skills/claude-code/harness-onboarding/SKILL.md
MODIFY agents/skills/claude-code/harness-impact-analysis/SKILL.md
MODIFY agents/skills/gemini-cli/harness-impact-analysis/SKILL.md
MODIFY agents/skills/claude-code/enforce-architecture/SKILL.md
```

### Files NOT Modified (rationale)

- `harness-verify/skill.yaml` — No schema changes needed. The design check is documented as a conditional step in SKILL.md, invoked via `run_skill` when design config exists. No new `depends_on` needed (verify is intentionally dependency-free).
- `harness-integrity/skill.yaml` — No schema changes. The design health line is a documentation addition to the report format.
- `harness-onboarding/skill.yaml` — No schema changes. Design detection is an additional step in the existing MAP phase.
- `harness-impact-analysis/skill.yaml` — No schema changes. The USES_TOKEN edge traversal is documented in the existing ANALYZE phase.
- `enforce-architecture/skill.yaml` — No schema changes. The design constraint category is a documentation addition.
- `packages/mcp-server/src/server.ts` — No new MCP tools needed. Design skills are invoked via existing `run_skill` tool.
- `packages/cli/tests/persona/builtins.test.ts` — No new personas added.
- `packages/cli/tests/commands/generate-agent-definitions.test.ts` — No new personas means no count changes.
- `packages/mcp-server/tests/server.test.ts` — No new MCP tools means no count changes.
- Gemini-cli copies of verify/integrity/onboarding — These skills lack gemini-cli copies (pre-existing parity gap for older skills). Creating those copies is out of scope for this integration phase.

## Key Decisions

1. **SKILL.md-only changes.** The integration is entirely through skill documentation updates. The 5 design skills already exist as invokable skills via `run_skill`. The existing infrastructure skills just need to document how they incorporate design checks into their workflow.
2. **Conditional on design config.** All design integrations are gated on the presence of `design` in `harness.config.json`. Projects without design config see zero changes in behavior.
3. **No new dependencies.** We do not add design skills to `depends_on` arrays of infrastructure skills. The infrastructure skills invoke design skills conditionally at runtime via `run_skill`, not as hard dependencies.
4. **Impact-analysis gemini-cli copy.** This is the only modified skill that has a gemini-cli copy. Both copies must be updated identically and staged together (per Phase 3 learning about Prettier parity).

## Tasks

### Task 1: Add design constraint check to harness-verify SKILL.md

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-verify/SKILL.md`

1. Read `agents/skills/claude-code/harness-verify/SKILL.md`
2. In the **Phase 2: EXECUTE** section, after the existing "Run all detected commands in this order: **typecheck -> lint -> test**" paragraph, add a new conditional step:

   ```markdown
   ### Design Constraint Check (conditional)

   When `harness.config.json` contains a `design` block:

   1. **Run design constraint checks** by invoking `harness-accessibility` in scan+evaluate mode against the project.
   2. Apply the `design.strictness` setting to determine severity:
      - `strict`: accessibility violations are FAIL; anti-pattern violations are WARN
      - `standard`: accessibility and anti-pattern violations are WARN; nothing blocks
      - `permissive`: all design violations are INFO
   3. Capture the result as `Design: [PASS/WARN/FAIL/SKIPPED]`.
   4. If no `design` block exists in config, mark Design as `SKIPPED`.

   The design check runs AFTER test/lint/typecheck. It does not short-circuit on earlier failures.
   ```

3. In the **Phase 3: REPORT** section, update the output format to include Design:

   Add after the existing format block a new format block showing the extended output:

   ```markdown
   When design config is present, include the design line:
   ```

   Verification: [PASS/FAIL]
   - Typecheck: [PASS/FAIL/SKIPPED]
   - Lint: [PASS/FAIL/SKIPPED]
   - Test: [PASS/FAIL/SKIPPED]
   - Design: [PASS/WARN/FAIL/SKIPPED]

   ```

   ```

4. In the **Harness Integration** section, add:

   ```markdown
   - Invokes `harness-accessibility` for design constraint checking when `design` config exists
   - Design violations respect `designStrictness` from `harness.config.json`
   ```

5. Run: `pnpm test --filter @harness-engineering/skills` to verify no test breakage.
6. Run: `npx tsc --noEmit`
7. Commit: `feat(skills): add design constraint check to harness-verify`

### Task 2: Add design health to harness-integrity SKILL.md

**Depends on:** none (parallel with Task 1)
**Files:** `agents/skills/claude-code/harness-integrity/SKILL.md`

1. Read `agents/skills/claude-code/harness-integrity/SKILL.md`
2. Add a new phase section after **Phase 1.5: SECURITY SCAN**:

   ```markdown
   ### Phase 1.7: DESIGN HEALTH (conditional)

   When the project has `design` configured in `harness.config.json`:

   1. Run `harness-design` in review mode to check existing components against design intent and anti-patterns.
   2. Run `harness-accessibility` in scan+evaluate mode to check WCAG compliance.
   3. Combine findings into a design health summary:
      - Error count (blocking, based on strictness)
      - Warning count (non-blocking)
      - Info count (advisory)
   4. **Error-severity design findings are blocking** in `strict` mode only. In `standard` and `permissive` modes, design findings do not block.
   5. If no `design` block exists, skip this phase entirely.
   ```

3. In the **Phase 3: REPORT** section, update the unified report format to include Design:

   ```markdown

   ```

   Integrity Check: [PASS/FAIL]
   - Tests: [PASS/FAIL/SKIPPED]
   - Lint: [PASS/FAIL/SKIPPED]
   - Types: [PASS/FAIL/SKIPPED]
   - Security: [PASS/WARN/FAIL] ([count] errors, [count] warnings)
   - Design: [PASS/WARN/FAIL/SKIPPED] ([count] errors, [count] warnings)
   - Review: [PASS/FAIL] ([count] suggestions, [count] blocking)

   Overall: [PASS/FAIL]

   ```

   ```

4. Update the report rules to mention design:

   ```markdown
   - Overall `PASS` requires: all non-skipped mechanical checks pass AND zero blocking review findings AND zero blocking design findings (strict mode only).
   ```

5. Update the examples to show a design line in each example.
6. In the **Harness Integration** section, add:

   ```markdown
   - Invokes `harness-design` and `harness-accessibility` for design health when `design` config exists
   - Design strictness from config controls whether design findings block the overall result
   ```

7. Run: `pnpm test --filter @harness-engineering/skills`
8. Commit: `feat(skills): add design health to harness-integrity`

### Task 3: Add design system context to harness-onboarding SKILL.md

**Depends on:** none (parallel with Tasks 1-2)
**Files:** `agents/skills/claude-code/harness-onboarding/SKILL.md`

1. Read `agents/skills/claude-code/harness-onboarding/SKILL.md`
2. In **Phase 2: MAP**, after the existing "Map the concerns" sub-section, add:

   ```markdown
   6. **Map the design system** (when present). Look for:
      - `design-system/tokens.json` — W3C DTCG design tokens (colors, typography, spacing)
      - `design-system/DESIGN.md` — Aesthetic intent, anti-patterns, platform notes
      - `harness.config.json` `design` block — strictness level, enabled platforms, token path
      - Active design skills — check if `harness-design-system`, `harness-accessibility`, `harness-design`, `harness-design-web`, `harness-design-mobile` are available
      - Design constraint violations — run a quick `harness-accessibility` scan to surface any existing issues
      - Token coverage — how many components reference tokens vs. hardcoded values

      If no design system exists, note this as a potential improvement area.
   ```

3. In **Phase 4: SUMMARIZE**, add a "Design System" section to the orientation template after the "Constraints" section:

   ```markdown
   ## Design System

   - **Tokens:** [present/absent] ([token count] tokens in [group count] groups)
   - **Aesthetic Intent:** [present/absent] (style: [style], strictness: [level])
   - **Platforms:** [web, mobile, or none configured]
   - **Accessibility:** [baseline scan result — e.g., "3 warnings, 0 errors"]
   - **Design Skills:** [list of available design skills]
   ```

4. Run: `pnpm test --filter @harness-engineering/skills`
5. Commit: `feat(skills): add design system context to harness-onboarding`

### Task 4: Add design token graph to harness-impact-analysis SKILL.md (both platforms)

**Depends on:** none (parallel with Tasks 1-3)
**Files:** `agents/skills/claude-code/harness-impact-analysis/SKILL.md`, `agents/skills/gemini-cli/harness-impact-analysis/SKILL.md`

1. Read `agents/skills/claude-code/harness-impact-analysis/SKILL.md`
2. In **Phase 2: ANALYZE**, after the existing "Test coverage" step (step 4), add:

   ```markdown
   5. **Design token impact**: When the graph contains `DesignToken` nodes, use `query_graph` with `USES_TOKEN` edges to find components that consume changed tokens.
   ```

   query_graph(rootNodeIds=["designtoken:color.primary"], maxDepth=2, includeEdges=["uses_token"])
   → components: [Button.tsx, Card.tsx, Header.tsx, ...]

   ```

   If a changed file is `design-system/tokens.json`, identify ALL tokens that changed and trace each to its consuming components. This reveals the full design blast radius of a token change.

   6. **Design constraint impact**: When the graph contains `DesignConstraint` nodes, check if changed code introduces new `VIOLATES_DESIGN` edges.
   ```

3. In **Phase 3: ASSESS**, add design token impact to the impact score calculation:

   ```markdown
   - Whether design tokens are affected (weight: 2x — token changes cascade to all consumers)
   ```

4. Add a new section to the output report template:

   ```markdown
   ### Affected Design Tokens (when tokens change)

   1. color.primary → used by 12 components
   2. typography.body → used by 8 components
   ```

5. **Copy the exact same changes** to `agents/skills/gemini-cli/harness-impact-analysis/SKILL.md`.
6. Stage both files together: `git add agents/skills/claude-code/harness-impact-analysis/SKILL.md agents/skills/gemini-cli/harness-impact-analysis/SKILL.md`
7. Run: `pnpm test --filter @harness-engineering/skills`
8. Commit: `feat(skills): add design token impact to harness-impact-analysis`

### Task 5: Add design constraint category to enforce-architecture SKILL.md

**Depends on:** none (parallel with Tasks 1-4)
**Files:** `agents/skills/claude-code/enforce-architecture/SKILL.md`

1. Read `agents/skills/claude-code/enforce-architecture/SKILL.md`
2. In **Phase 1: Load Constraints**, add after the existing constraint types:

   ```markdown
   - **Design constraints** — when `design` config exists, also load design constraint rules:
     - Token compliance — components must reference design tokens, not hardcoded values
     - Accessibility compliance — color pairs must meet WCAG contrast ratios
     - Anti-pattern enforcement — project-specific anti-patterns from `design-system/DESIGN.md`
     - Platform binding — tokens must have appropriate platform bindings for enabled platforms
   ```

3. In **Phase 3: Analyze Violations**, add a new violation type:

   ```markdown
   - **Design constraint violation** — a component uses hardcoded values instead of design tokens, or violates a declared anti-pattern. Severity depends on `design.strictness` in config. These violations surface as DESIGN-xxx codes:
     - `DESIGN-001` [warn] — Hardcoded color/font/spacing instead of token reference
     - `DESIGN-002` [warn] — Value matches a project anti-pattern
     - `DESIGN-003` [error] — WCAG contrast ratio failure (error in strict mode)
     - `DESIGN-004` [info] — Missing platform binding for enabled platform
   ```

4. In **Phase 4: Guide Resolution**, add:

   ```markdown
   - **Design constraint violation:** Replace hardcoded values with token references from `design-system/tokens.json`. For anti-pattern violations, consult `design-system/DESIGN.md` for the project's aesthetic intent and approved alternatives. For contrast failures, use `harness-accessibility` to find compliant color pairs.
   ```

5. Add a new "Common Violation Patterns" entry:

   ```markdown
   ### Pattern: "Hardcoded colors in components"

   A component uses `#3b82f6` directly instead of referencing `color.primary` from the design token system. Fix: import and reference the token. In Tailwind: use the token-mapped utility class. In CSS: use the custom property `var(--color-primary)`.
   ```

6. In **Harness Integration**, add:

   ```markdown
   - **`harness-design-system`** — Provides the design token source of truth (`tokens.json`) that constraints validate against.
   - **`harness-accessibility`** — Provides WCAG contrast validation used by DESIGN-003 constraints.
   - **Design constraint category** — Controlled by `design.strictness` in `harness.config.json`. Design violations surface alongside architectural violations in the same report.
   ```

7. Run: `pnpm test --filter @harness-engineering/skills`
8. Commit: `feat(skills): add design constraint category to enforce-architecture`

### Task 6: Run full test suite and verify all integration

**Depends on:** Tasks 1-5
**Files:** none (verification only)

1. Run: `pnpm test` (full monorepo test suite)
2. Verify all skill tests pass (should still be 491 — no new skill files were created, only SKILL.md content changes)
3. Verify platform-parity tests pass (the only file modified in both platforms is harness-impact-analysis — parity must hold)
4. Verify: `npx tsc --noEmit` passes
5. Check no unexpected test count changes by comparing output to baseline (491 skill tests, 37 MCP tools, 12 personas)

### Task 7: Stage all changes together and commit

**Depends on:** Task 6
**Files:** all modified SKILL.md files

1. Stage all modified SKILL.md files together:
   ```bash
   git add \
     agents/skills/claude-code/harness-verify/SKILL.md \
     agents/skills/claude-code/harness-integrity/SKILL.md \
     agents/skills/claude-code/harness-onboarding/SKILL.md \
     agents/skills/claude-code/harness-impact-analysis/SKILL.md \
     agents/skills/gemini-cli/harness-impact-analysis/SKILL.md \
     agents/skills/claude-code/enforce-architecture/SKILL.md
   ```
2. Commit: `feat(skills): wire design skills into harness verify, integrity, onboarding, impact-analysis, and enforce-architecture`

**Note:** Tasks 1-5 describe the exact content changes per file. Task 7 can be a single commit for all changes OR individual commits per task (Tasks 1-5 each include a commit instruction). The choice depends on whether the executor prefers atomic commits per skill or a single integration commit. Either approach is valid. If using single commit, skip the individual commit steps in Tasks 1-5 and use Task 7's commit instead.

### Task 8: Verify and update handoff

**Depends on:** Task 7
**Files:** `.harness/handoff.json`

1. Run: `pnpm test` — final verification
2. Write `.harness/handoff.json` with Phase 6 completion status
3. Confirm all 8 observable truths from the acceptance criteria are met

## Parallel Opportunities

Tasks 1-5 are fully independent and can run in parallel. They modify different files with no shared state. Task 6 depends on all of Tasks 1-5. Tasks 7-8 are sequential after Task 6.

```
[Task 1] ──┐
[Task 2] ──┤
[Task 3] ──┼── [Task 6: verify] ── [Task 7: commit] ── [Task 8: handoff]
[Task 4] ──┤
[Task 5] ──┘
```

## Risk Assessment

1. **Prettier reformatting.** SKILL.md files are reformatted by Prettier during pre-commit hooks. Stage both platform copies of harness-impact-analysis together to preserve parity (per Phase 3 learning).
2. **No test count changes expected.** We are modifying SKILL.md content only — no new skill.yaml files, no new personas, no new MCP tools. The 491 skill test count should remain stable. The only risk is if a content change triggers a references test failure (e.g., if a reference to a non-existent skill is added).
3. **Pre-existing parity gaps.** harness-verify, harness-integrity, harness-onboarding, and enforce-architecture lack gemini-cli copies despite declaring `platforms: [claude-code, gemini-cli]`. This is a pre-existing issue. We do NOT create gemini-cli copies in this phase — that is a separate parity cleanup task.
