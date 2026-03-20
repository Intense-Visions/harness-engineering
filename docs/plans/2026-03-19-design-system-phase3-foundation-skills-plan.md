# Plan: Design System Skills — Phase 3: Foundation Skills

**Date:** 2026-03-19
**Spec:** docs/changes/design-system-skills/proposal.md
**Estimated tasks:** 6
**Estimated time:** 40 minutes

## Goal

Two foundation skills (`harness-design-system` and `harness-accessibility`) exist as complete skill definitions in both platform directories, pass all schema/structure/parity tests, and are discoverable by the slash-command generator.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/harness-design-system/skill.yaml` exists and passes `SkillMetadataSchema` validation.
2. `agents/skills/claude-code/harness-design-system/SKILL.md` exists with all required sections: `## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Gates`, `## Escalation` (Gates/Escalation required because type=rigid).
3. `agents/skills/claude-code/harness-accessibility/skill.yaml` exists and passes `SkillMetadataSchema` validation.
4. `agents/skills/claude-code/harness-accessibility/SKILL.md` exists with all required sections (same as above, also rigid).
5. `agents/skills/gemini-cli/harness-design-system/` contains identical copies of both files.
6. `agents/skills/gemini-cli/harness-accessibility/` contains identical copies of both files.
7. `harness-design-system` skill.yaml has: `depends_on: []`, `cognitive_mode: constructive-architect`, `type: rigid`, phases `discover -> define -> generate -> validate`.
8. `harness-accessibility` skill.yaml has: `depends_on: [harness-design-system]`, `cognitive_mode: meticulous-verifier`, `type: rigid`, phases `scan -> evaluate -> report -> fix`.
9. Both skills declare `platforms: [claude-code, gemini-cli]` and `triggers: [manual, on_new_feature, on_project_init]`.
10. `pnpm --filter ./agents/skills test` passes — schema, structure, references, and platform-parity tests all green.
11. The SKILL.md files reference shared design knowledge data (`agents/skills/shared/design-knowledge/`) and the graph schema (`DesignIngestor`, `DesignConstraintAdapter`) from Phases 1 and 2.

## File Map

```
CREATE  agents/skills/claude-code/harness-design-system/skill.yaml
CREATE  agents/skills/claude-code/harness-design-system/SKILL.md
CREATE  agents/skills/claude-code/harness-accessibility/skill.yaml
CREATE  agents/skills/claude-code/harness-accessibility/SKILL.md
CREATE  agents/skills/gemini-cli/harness-design-system/skill.yaml       (copy of claude-code)
CREATE  agents/skills/gemini-cli/harness-design-system/SKILL.md         (copy of claude-code)
CREATE  agents/skills/gemini-cli/harness-accessibility/skill.yaml       (copy of claude-code)
CREATE  agents/skills/gemini-cli/harness-accessibility/SKILL.md         (copy of claude-code)
```

No files modified — all creates. No existing files touched.

## Dependency Analysis

```
Task 1 (design-system skill.yaml + SKILL.md)  ─── independent
Task 2 (accessibility skill.yaml + SKILL.md)   ─── independent (depends_on in yaml references
                                                     harness-design-system by name, but both
                                                     skills are created in same wave)
Task 3 (platform copies)                       ─── depends on Tasks 1 + 2
Task 4 (test validation)                       ─── depends on Task 3

Wave 1: Tasks 1 + 2 (parallel — no file overlap)
Wave 2: Task 3 (copy to gemini-cli)
Wave 3: Task 4 (run tests)
```

## Tasks

### Task 1: Create `harness-design-system` skill (Wave 1)

**Files:**

- `agents/skills/claude-code/harness-design-system/skill.yaml`
- `agents/skills/claude-code/harness-design-system/SKILL.md`

**Action:**

Create `skill.yaml` following the exact schema pattern from existing skills (harness-tdd, harness-verification):

```yaml
name: harness-design-system
version: '1.0.0'
description: Design token generation, palette selection, typography, spacing, and design intent management
cognitive_mode: constructive-architect
triggers:
  - manual
  - on_new_feature
  - on_project_init
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
cli:
  command: harness skill run harness-design-system
  args:
    - name: path
      description: Project root path
      required: false
    - name: industry
      description: Industry vertical for recommendations (e.g., saas, fintech, healthcare)
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-design-system
    path: string
type: rigid
phases:
  - name: discover
    description: Detect existing design system, tokens, frameworks, and project context
    required: true
  - name: define
    description: Define design intent, select palette, typography, spacing scale
    required: true
  - name: generate
    description: Generate W3C DTCG tokens.json and DESIGN.md
    required: true
  - name: validate
    description: Validate tokens against schema, check contrast pairs, verify completeness
    required: true
state:
  persistent: false
  files: []
depends_on: []
```

Create `SKILL.md` with these sections and content:

1. **H1 heading**: `# Harness Design System` with a blockquote tagline about token-first design management.

2. **## When to Use**: Starting a new project needing design tokens; adding design consistency to existing project; when `on_project_init` or `on_new_feature` triggers fire with design scope; NOT for accessibility auditing (use harness-accessibility); NOT for aesthetic direction (use harness-design, Phase 4); NOT for platform-specific implementation (use harness-design-web/mobile, Phase 5).

3. **## Process** with subsections for each phase:
   - **### Phase 1: DISCOVER**: Read existing design files (`design-system/tokens.json`, `design-system/DESIGN.md`, `tailwind.config.*`, CSS variables). Check `harness.config.json` for `design` block and `designStrictness`. Detect framework (Tailwind, CSS-in-JS, vanilla CSS). Identify existing color/typography patterns via grep. Load industry recommendations from `agents/skills/shared/design-knowledge/industries/{industry}.yaml` if industry specified. Report findings before proceeding.

   - **### Phase 2: DEFINE**: Present palette options from `agents/skills/shared/design-knowledge/palettes/curated.yaml` filtered by industry tags. Present typography pairings from `agents/skills/shared/design-knowledge/typography/pairings.yaml`. Define spacing scale (default: 4px base with standard multipliers). Define design intent (style, tone, differentiator). All decisions require user confirmation before generating.

   - **### Phase 3: GENERATE**: Generate `design-system/tokens.json` in W3C DTCG format (reference the exact schema from the spec — `$value`, `$type`, `$description` for each token). Generate `design-system/DESIGN.md` with aesthetic direction, anti-patterns, platform notes, strictness override. Run `DesignIngestor` to populate graph nodes (if graph exists at `.harness/graph/`). Describe the format with concrete examples showing color, typography, and spacing token structures.

   - **### Phase 4: VALIDATE**: Parse generated `tokens.json` against W3C DTCG structure. Verify all color pairs pass WCAG AA contrast (4.5:1 for normal text, 3:1 for large text). Verify typography has fallback stacks. Verify spacing scale is monotonically increasing. Run `harness validate` to check project health. Report validation results with pass/fail per check.

4. **## Harness Integration**: Reference `harness validate` for project health, `harness scan` for graph refresh after token changes, `DesignIngestor` from `packages/graph/src/ingest/DesignIngestor.ts` for graph population, `DesignConstraintAdapter` from `packages/graph/src/constraints/DesignConstraintAdapter.ts` for enforcement.

5. **## Success Criteria**: `design-system/tokens.json` exists and is valid W3C DTCG; `design-system/DESIGN.md` exists with all required sections; all color contrast pairs pass WCAG AA; graph nodes created for each token (if graph exists); `harness validate` passes.

6. **## Examples**: Show a concrete example of running the skill for a SaaS dashboard project — the discover output, the define choices, the generated tokens.json snippet, and the validation results.

7. **## Gates** (required for rigid type): No tokens generated without user confirming palette and typography choices. No `tokens.json` written without passing DTCG schema validation. No contrast pair allowed below 4.5:1 for normal text. No fonts without fallback stacks.

8. **## Escalation**: After 3 failed contrast validations, suggest alternative palette. When user rejects all curated palettes, accept custom colors but warn about unvalidated contrast. When existing project has conflicting design patterns, surface conflicts and ask user to resolve.

**Verify:** Read both files back. Confirm skill.yaml is valid YAML. Confirm SKILL.md has all 7 required sections (When to Use, Process, Harness Integration, Success Criteria, Examples, Gates, Escalation).

**Done:** Both files exist in `agents/skills/claude-code/harness-design-system/` with correct content.

---

### Task 2: Create `harness-accessibility` skill (Wave 1)

**Files:**

- `agents/skills/claude-code/harness-accessibility/skill.yaml`
- `agents/skills/claude-code/harness-accessibility/SKILL.md`

**Action:**

Create `skill.yaml`:

```yaml
name: harness-accessibility
version: '1.0.0'
description: WCAG accessibility scanning, contrast checking, ARIA validation, and remediation
cognitive_mode: meticulous-verifier
triggers:
  - manual
  - on_new_feature
  - on_project_init
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
cli:
  command: harness skill run harness-accessibility
  args:
    - name: path
      description: Project root path
      required: false
    - name: scope
      description: Scope of scan (full, component, page)
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-accessibility
    path: string
type: rigid
phases:
  - name: scan
    description: Scan codebase for accessibility issues (WCAG AA baseline)
    required: true
  - name: evaluate
    description: Evaluate severity and categorize findings
    required: true
  - name: report
    description: Generate structured accessibility report
    required: true
  - name: fix
    description: Apply automated fixes for mechanical issues
    required: false
state:
  persistent: false
  files: []
depends_on:
  - harness-design-system
```

Create `SKILL.md` with these sections:

1. **H1 heading**: `# Harness Accessibility` with blockquote about WCAG compliance verification and remediation.

2. **## When to Use**: Auditing new or existing UI components for accessibility; before PR merge to catch a11y regressions; when `on_new_feature` triggers with UI components; when design tokens change (contrast may break); NOT for design token generation (use harness-design-system); NOT for visual design review (use harness-design).

3. **## Process** with subsections:
   - **### Phase 1: SCAN**: Load design tokens from `design-system/tokens.json` (if exists) to check declared contrast pairs. Read `designStrictness` from `harness.config.json` to set severity levels (`strict` = errors block, `standard` = warnings, `permissive` = info). Scan all component files (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`) for: missing `alt` attributes on images, missing ARIA labels on interactive elements, missing `role` attributes where needed, hardcoded colors not from token set, non-semantic heading hierarchy (h1 -> h3 skip), missing focus indicators, missing keyboard event handlers alongside click handlers, form inputs without labels. Use the anti-pattern catalogs from `agents/skills/shared/design-knowledge/` as additional detection rules.

   - **### Phase 2: EVALUATE**: For each finding, assign severity based on `designStrictness` config. Calculate contrast ratios for all color pairs found in code (text-on-background). Compare against WCAG AA thresholds: 4.5:1 normal text, 3:1 large text (18px+ or 14px+ bold). Use `DesignConstraintAdapter` to check for `VIOLATES` edges in the graph. Categorize findings: `error` (blocks in strict mode), `warn` (always visible in standard+), `info` (visible in all modes). Cross-reference with design tokens — if a token-based color pair fails contrast, flag the token definition, not just the usage.

   - **### Phase 3: REPORT**: Generate structured report with: summary counts by severity, grouped findings by category (contrast, ARIA, semantics, keyboard, forms), each finding includes: file path, line number (approximate from grep), violation code (e.g., `A11Y-001`), description, WCAG criterion reference (e.g., 1.4.3 Contrast), suggested fix. Report format follows the pattern from the spec: `DESIGN-003 [error] Contrast ratio 2.8:1 fails WCAG AA (requires 4.5:1)`.

   - **### Phase 4: FIX** (optional): Apply automated fixes for mechanical issues only: add missing `alt=""` for decorative images, add `aria-label` to icon-only buttons, add `role="button"` to clickable divs, replace hardcoded colors with token references (if tokens exist). Each fix is a minimal, targeted edit. DO NOT fix subjective issues (color choices, layout decisions). Report what was fixed and what requires human judgment.

4. **## Harness Integration**: `harness validate` — a11y findings surface as design constraint violations. `harness scan` — refresh graph to detect new `VIOLATES` edges. `DesignConstraintAdapter` — reads `designStrictness` to control severity. `DesignIngestor` — provides token data for contrast checking. `harness-impact-analysis` — token changes trigger re-scan of affected components.

5. **## Success Criteria**: All scanned components have findings categorized by severity. Contrast failures detected with correct ratios. Missing ARIA attributes flagged with specific element locations. Report generated with actionable remediation guidance. Automated fixes applied without breaking existing functionality. `harness validate` reflects a11y findings.

6. **## Examples**: Show scanning a React component with known issues: missing alt, low contrast button, missing form label. Show the report output. Show the fix phase correcting the missing alt.

7. **## Gates**: No component marked "accessible" without passing WCAG AA contrast. No automated fix applied without showing the before/after diff. No severity downgrade below what `designStrictness` config specifies. The scan phase must complete before evaluate (no partial evaluations).

8. **## Escalation**: When contrast ratio is borderline (4.5:1 to 5:1), flag for human review rather than auto-passing. When a component has >10 findings, suggest architectural refactoring rather than piecemeal fixes. When design tokens themselves have contrast failures, escalate to harness-design-system rather than fixing at usage site. When automated fix would change visual appearance, require human approval.

**Verify:** Read both files back. Confirm valid YAML. Confirm SKILL.md has all 7 required sections.

**Done:** Both files exist in `agents/skills/claude-code/harness-accessibility/` with correct content.

---

### Task 3: Copy skills to gemini-cli platform (Wave 2)

**Files:**

- `agents/skills/gemini-cli/harness-design-system/skill.yaml`
- `agents/skills/gemini-cli/harness-design-system/SKILL.md`
- `agents/skills/gemini-cli/harness-accessibility/skill.yaml`
- `agents/skills/gemini-cli/harness-accessibility/SKILL.md`

**Action:**

Create the directories and copy files. The platform-parity test requires files to be IDENTICAL across platforms (it does a string comparison), so use `cp` to ensure exact copies:

```bash
mkdir -p agents/skills/gemini-cli/harness-design-system
cp agents/skills/claude-code/harness-design-system/skill.yaml agents/skills/gemini-cli/harness-design-system/skill.yaml
cp agents/skills/claude-code/harness-design-system/SKILL.md agents/skills/gemini-cli/harness-design-system/SKILL.md

mkdir -p agents/skills/gemini-cli/harness-accessibility
cp agents/skills/claude-code/harness-accessibility/skill.yaml agents/skills/gemini-cli/harness-accessibility/skill.yaml
cp agents/skills/claude-code/harness-accessibility/SKILL.md agents/skills/gemini-cli/harness-accessibility/SKILL.md
```

**Verify:** Diff each pair of files — should produce no output:

```bash
diff agents/skills/claude-code/harness-design-system/skill.yaml agents/skills/gemini-cli/harness-design-system/skill.yaml
diff agents/skills/claude-code/harness-design-system/SKILL.md agents/skills/gemini-cli/harness-design-system/SKILL.md
diff agents/skills/claude-code/harness-accessibility/skill.yaml agents/skills/gemini-cli/harness-accessibility/skill.yaml
diff agents/skills/claude-code/harness-accessibility/SKILL.md agents/skills/gemini-cli/harness-accessibility/SKILL.md
```

**Done:** All 4 gemini-cli files are byte-identical copies of their claude-code counterparts.

---

### Task 4: Run test suite and fix any issues (Wave 3)

**Files:** None created (validation only). May need to fix files from Tasks 1-3 if issues found.

**Action:**

Run the skill test suite:

```bash
pnpm --filter ./agents/skills test
```

This runs 4 test files:

- `schema.test.ts` — validates skill.yaml against `SkillMetadataSchema` (Zod)
- `structure.test.ts` — validates SKILL.md has required sections; rigid skills must have Gates + Escalation
- `references.test.ts` — validates `depends_on` references point to existing skill names
- `platform-parity.test.ts` — validates skills exist in all platforms with identical files

**Expected:** All tests pass for the 2 new skills.

**Known issue:** Platform parity test may flag the pre-existing `sensitive-data-compliance` difference (gemini-cli only). This is NOT caused by this phase — do not fix it. If it causes test failure, note it but do not block on it.

**If tests fail for the new skills:** Fix the specific issue (typo in section name, missing field in YAML, file copy mismatch) and re-run.

Also verify the skill.yaml files parse correctly against the schema by checking:

- `name` matches `^[a-z][a-z0-9-]*$`
- `version` matches `^\d+\.\d+\.\d+$`
- `triggers` only contain allowed values: `manual`, `on_new_feature`, `on_project_init`
- `platforms` only contain: `claude-code`, `gemini-cli`
- `type` is `rigid` or `flexible`
- `depends_on` for harness-accessibility references `harness-design-system` which exists

**Verify:** `pnpm --filter ./agents/skills test` exits 0.

**Done:** All skill tests pass. Both new skills are schema-valid, structurally complete, reference-valid, and platform-parity compliant.

## Risk Notes

1. **Pre-existing parity failure**: `sensitive-data-compliance` exists only in gemini-cli (38 vs 37 skills). Adding 2 skills to both platforms makes it 39 vs 40 — still off by 1. The platform-parity count test will still fail for this pre-existing issue. If this blocks the test run, the executor should note it as pre-existing and not attempt to fix it in this phase.

2. **SKILL.md content quality**: The SKILL.md files are instructional documents for AI agents. The content should be specific and actionable (following the patterns in harness-tdd and harness-verification), not generic. Each phase should tell the agent exactly what to look for, what tools to use, and what output to produce.

3. **References to Phase 1 and Phase 2 artifacts**: The SKILL.md content should reference specific paths (`agents/skills/shared/design-knowledge/`, `packages/graph/src/ingest/DesignIngestor.ts`, `packages/graph/src/constraints/DesignConstraintAdapter.ts`) so the agent knows where to find supporting data and code.
