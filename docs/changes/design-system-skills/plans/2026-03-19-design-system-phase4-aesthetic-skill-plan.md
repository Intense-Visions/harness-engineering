# Plan: Design System Phase 4 — Aesthetic Skill (harness-design)

**Date:** 2026-03-19
**Spec:** docs/changes/design-system-skills/proposal.md
**Estimated tasks:** 4
**Estimated time:** 12 minutes

## Goal

Create the `harness-design` skill (skill.yaml + SKILL.md, both platforms) that provides an aesthetic direction workflow with anti-pattern enforcement, DESIGN.md generation, and configurable strictness — completing the Aesthetic Layer of the design skill family.

## Observable Truths (Acceptance Criteria)

1. The file `agents/skills/claude-code/harness-design/skill.yaml` exists with `name: harness-design`, `cognitive_mode: advisory-guide`, `type: flexible`, phases `[intent, direction, review, enforce]`, `platforms: [claude-code, gemini-cli]`, and `depends_on: [harness-design-system]`.
2. The file `agents/skills/claude-code/harness-design/SKILL.md` exists with sections: When to Use, Process (4 phases: INTENT, DIRECTION, REVIEW, ENFORCE), Harness Integration, Success Criteria, Examples, Gates, Escalation.
3. The SKILL.md references shared design-knowledge data files at `agents/skills/shared/design-knowledge/` (industries, palettes, typography).
4. The SKILL.md references graph schema artifacts: `AestheticIntent` nodes, `DECLARES_INTENT` edges, `DesignConstraint` nodes, `VIOLATES_DESIGN` edges, `DesignConstraintAdapter`.
5. The SKILL.md references `harness-design-system` as a dependency for reading tokens and design intent.
6. The SKILL.md covers DESIGN.md generation with the structure defined in the spec (Aesthetic Direction, Anti-Patterns, Platform Notes, Strictness Override).
7. The SKILL.md covers `designStrictness` configuration (`strict`, `standard`, `permissive`) with behavior differences for each level.
8. `agents/skills/gemini-cli/harness-design/skill.yaml` is byte-identical to the claude-code copy.
9. `agents/skills/gemini-cli/harness-design/SKILL.md` is byte-identical to the claude-code copy.
10. When `pnpm test` runs in `agents/skills/`, the schema tests pass for both new skill.yaml files and the platform-parity tests pass for `harness-design` (the pre-existing `harness-autopilot` parity failure is not caused by this change).

## File Map

```
CREATE agents/skills/claude-code/harness-design/skill.yaml
CREATE agents/skills/claude-code/harness-design/SKILL.md
CREATE agents/skills/gemini-cli/harness-design/skill.yaml    (copy of claude-code)
CREATE agents/skills/gemini-cli/harness-design/SKILL.md      (copy of claude-code)
```

## Tasks

### Task 1: Create harness-design skill.yaml in claude-code

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-design/skill.yaml`

1. Create directory `agents/skills/claude-code/harness-design/`
2. Create `agents/skills/claude-code/harness-design/skill.yaml` with exact content:

```yaml
name: harness-design
version: '1.0.0'
description: Aesthetic direction workflow, anti-pattern enforcement, DESIGN.md generation, and strictness configuration
cognitive_mode: advisory-guide
triggers:
  - manual
  - on_new_feature
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
  command: harness skill run harness-design
  args:
    - name: path
      description: Project root path
      required: false
    - name: strictness
      description: Override strictness level (strict, standard, permissive)
      required: false
    - name: industry
      description: Industry vertical for aesthetic recommendations
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-design
    path: string
type: flexible
phases:
  - name: intent
    description: Capture aesthetic intent, style, tone, and differentiator
    required: true
  - name: direction
    description: Generate DESIGN.md with aesthetic direction, anti-patterns, and platform notes
    required: true
  - name: review
    description: Review existing components against design intent and anti-patterns
    required: false
  - name: enforce
    description: Enforce design constraints via graph, surface violations by strictness level
    required: false
state:
  persistent: false
  files: []
depends_on:
  - harness-design-system
```

3. Verify YAML is valid: `node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('agents/skills/claude-code/harness-design/skill.yaml', 'utf8')); console.log('valid')"`
4. Commit: `feat(skills): add harness-design skill.yaml`

### Task 2: Create harness-design SKILL.md in claude-code

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-design/SKILL.md`

1. Create `agents/skills/claude-code/harness-design/SKILL.md` with the following content. The SKILL.md must contain these sections in order:
   - **Title and tagline** — "Harness Design" with a one-line description of the aesthetic direction workflow.
   - **When to Use** — When to use this skill (manual aesthetic direction, new feature with design scope, reviewing design consistency) and when NOT to use it (not for token generation, not for accessibility, not for platform implementation).
   - **Process** with 4 phases:
     - **Phase 1: INTENT** — Capture aesthetic intent. Read existing `design-system/DESIGN.md` and `design-system/tokens.json` (via harness-design-system output). Load industry profile from `agents/skills/shared/design-knowledge/industries/{industry}.yaml`. Ask user for style, tone, differentiator, anti-patterns. Check `harness.config.json` for `design.strictness`.
     - **Phase 2: DIRECTION** — Generate or update `design-system/DESIGN.md`. Structure: Aesthetic Direction (style, tone, differentiator), Anti-Patterns (project-specific list, loaded from `agents/skills/shared/design-knowledge/` anti-pattern knowledge + user-defined), Platform Notes (web/mobile specifics), Strictness Override. Populate the knowledge graph: create `AestheticIntent` node with style/tone/differentiator/strictness, create `DECLARES_INTENT` edge from project to intent node. Reference `DesignIngestor` from `packages/graph/src/ingest/DesignIngestor.ts`.
     - **Phase 3: REVIEW** — Review existing codebase against design intent. Use Grep to find anti-pattern violations (hardcoded colors not in tokens, fonts flagged as anti-patterns, layout patterns on the forbidden list). Load anti-pattern catalogs from `agents/skills/shared/design-knowledge/` (typography, color, layout anti-pattern files). Cross-reference with graph: query `VIOLATES_DESIGN` edges via `DesignConstraintAdapter` from `packages/graph/src/constraints/DesignConstraintAdapter.ts`. Report findings with severity based on `designStrictness`.
     - **Phase 4: ENFORCE** — Surface violations. Severity controlled by `designStrictness`: `permissive` = all `info`, `standard` = anti-patterns + a11y = `warn`, `strict` = a11y violations = `error` (blocks). Create `DesignConstraint` nodes in graph for each violated rule. Create `VIOLATES_DESIGN` edges from violating components to constraints. Output matches the spec format (DESIGN-001, DESIGN-002, etc.).
   - **Harness Integration** — References to `harness validate`, `DesignIngestor`, `DesignConstraintAdapter`, `harness-design-system` dependency, `harness-impact-analysis` for token change tracing.
   - **Success Criteria** — DESIGN.md exists with all sections, anti-patterns detected, strictness configuration respected, graph nodes created, harness validate passes.
   - **Examples** — One worked example (e.g., SaaS project aesthetic direction).
   - **Gates** — No DESIGN.md generated without user confirming aesthetic intent. No enforcement without reading tokens from harness-design-system. Strictness must be read from config, not assumed.
   - **Escalation** — When user cannot articulate style, suggest industry-based defaults. When anti-patterns conflict with existing code, present migration path.

2. Verify the file is valid markdown and contains all required sections.
3. Commit: `feat(skills): add harness-design SKILL.md`

### Task 3: Copy harness-design to gemini-cli platform

**Depends on:** Task 2
**Files:** `agents/skills/gemini-cli/harness-design/skill.yaml`, `agents/skills/gemini-cli/harness-design/SKILL.md`

1. Create directory `agents/skills/gemini-cli/harness-design/`
2. Copy skill.yaml: `cp agents/skills/claude-code/harness-design/skill.yaml agents/skills/gemini-cli/harness-design/skill.yaml`
3. Copy SKILL.md: `cp agents/skills/claude-code/harness-design/SKILL.md agents/skills/gemini-cli/harness-design/SKILL.md`
4. Verify byte-identical: `diff agents/skills/claude-code/harness-design/skill.yaml agents/skills/gemini-cli/harness-design/skill.yaml` (no output = identical)
5. Verify byte-identical: `diff agents/skills/claude-code/harness-design/SKILL.md agents/skills/gemini-cli/harness-design/SKILL.md` (no output = identical)
6. Commit: `feat(skills): add harness-design gemini-cli platform copy`

### Task 4: Run tests and validate

**Depends on:** Task 3
**Files:** none (validation only)

1. Run skill tests: `cd agents/skills && pnpm test -- --run`
2. Verify:
   - Schema tests pass for `harness-design` skill.yaml (10 schema tests pass)
   - Platform parity tests pass for `harness-design` in both `claude-code` and `gemini-cli`
   - The `harness-design` skill file content parity test passes (both SKILL.md are identical)
   - Total passing tests increased from 444 to at least 447 (3 new: 2 platform existence + 1 parity content check)
   - The only failing test is the pre-existing `harness-autopilot` SKILL.md parity issue (not caused by this change)
3. Run: `harness validate` (if available) or verify via `pnpm test` from project root
4. Commit: no commit needed (validation only)

**Important:** Stage BOTH platform copies of SKILL.md together before committing (learned from Phase 3 — Prettier reformats JSON code blocks in SKILL.md during pre-commit hooks, and staging separately could break parity).

## Risks and Mitigations

1. **Prettier reformatting SKILL.md** — Stage both claude-code and gemini-cli copies together so Prettier formats both identically. (Learned from Phase 3.)
2. **Pre-existing harness-autopilot parity failure** — This is a known issue unrelated to our work. The test suite will show 1 failure from this. Do not attempt to fix it in this phase.
3. **cognitive_mode field not validated** — The `advisory-guide` value in skill.yaml is not validated by SkillMetadataSchema (Zod strips unknown keys). This is intentional — consumed by runtime only. (Learned from Phase 3.)
4. **anti-patterns/ and platform-rules/ directories** — The spec mentions these in shared design-knowledge but they were not created in Phase 1 (only industries/, palettes/, typography/ exist). The SKILL.md should reference the concept of anti-pattern catalogs but note that the shared data files reference the existing knowledge directories. Anti-pattern detection logic lives in the SKILL.md workflow instructions, not in separate data files.

## Traceability

| Observable Truth                               | Delivered By                          |
| ---------------------------------------------- | ------------------------------------- |
| 1. skill.yaml exists with correct fields       | Task 1                                |
| 2. SKILL.md exists with all sections           | Task 2                                |
| 3. References shared design-knowledge          | Task 2                                |
| 4. References graph schema artifacts           | Task 2                                |
| 5. References harness-design-system dependency | Task 1 (depends_on), Task 2 (process) |
| 6. Covers DESIGN.md generation                 | Task 2                                |
| 7. Covers strictness configuration             | Task 2                                |
| 8. gemini-cli skill.yaml identical             | Task 3                                |
| 9. gemini-cli SKILL.md identical               | Task 3                                |
| 10. Tests pass                                 | Task 4                                |
