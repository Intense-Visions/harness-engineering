# Research Roadmap Implementation: Design Spec

**Date:** 2026-03-16
**Goal:** Implement the 20 prioritized recommendations from three rounds of framework research (plus 1 bonus item from the broader adoptable-patterns list), grouped into 5 theme-based phases.
**Source:** `docs/research/framework-research-round-3.md` (Feature Roadmap Addendum + Consolidated Adoptable Patterns #24)

---

## Overview

Three rounds of competitive research (22 frameworks total) produced 20 prioritized recommendations plus additional adoptable patterns. Rather than implementing by priority tier (near/medium/long), we group by theme — each group produces a coherent, independently valuable improvement to harness engineering. This spec covers the 20 roadmap items plus one bonus item (#24 from the Consolidated Adoptable Patterns list: branchless worktree guidance).

### Implementation Order

```
Group B (Principles & Conventions)
  → Group A (Review System Overhaul)
    → Group E (Workflow Gates)
      → Group C (Skill System Evolution)
        → Group D (Context Engineering)
```

**Rationale:** Principles (B) inform everything. Review (A) has the most near-term wins and is the most-used skill surface. Workflow gates (E) add mechanical enforcement. Skill system (C) extends the metadata and tooling. Context engineering (D) is the most architectural and builds on foundations from all prior groups.

### Item-to-Group Mapping

| Item  | Description                               | Source         | Group |
| ----- | ----------------------------------------- | -------------- | ----- |
| #1    | Deterministic-vs-LLM split principle      | GSD v2         | B     |
| #2    | Mechanical "done" criteria (verify skill) | Cursor         | E     |
| #3    | 1:1 context ratio in review               | CodeRabbit     | A     |
| #4    | Cognitive-mode field in skill metadata    | gstack         | C     |
| #5    | Commit history in review context          | Augment        | A     |
| #6    | Review feedback learnings file            | CodeRabbit     | A     |
| #7    | Change-type-aware review workflows        | Qodo           | A     |
| #8    | Checkpoint-based context handoff          | Turbo Flow     | B     |
| #9    | Phase gates (linter rule)                 | Turbo Flow     | E     |
| #10   | EARS requirement syntax                   | Kiro           | E     |
| #11   | Error taxonomy skill                      | GSD v2         | C     |
| #12   | Token budget guidance                     | GSD v2         | D     |
| #13   | Pre-commit review hook                    | CodeRabbit     | A     |
| #14   | Anti-pattern log convention               | Turbo Flow     | B     |
| #15   | Staged context pipeline                   | GSD v2         | D     |
| #16   | Unified integrity gate                    | Qodo           | A     |
| #17   | Workflow orchestration                    | gstack         | E     |
| #18   | Context-as-MCP-service                    | Augment, Goose | D     |
| #19   | Interactive advisor skills                | PM Skills      | C     |
| #20   | JIT context filtering                     | Composio       | D     |
| #24\* | Branchless worktree guidance              | GSD v2         | B     |

\* Bonus item from Consolidated Adoptable Patterns list, not in the top-20 roadmap.

---

## Group B: Principles & Conventions

**Goal:** Establish foundational principles and conventions that the other groups build on.

**Items:** #1, #8, #14, #24 (branchless worktree guidance)

### B1: Formalize Deterministic-vs-LLM Split (Item #1)

**Files:**

- Modify: `docs/standard/principles.md`
- Modify: `docs/standard/index.md`

**Design:**

- Add Principle 7: "Deterministic-vs-LLM Responsibility Split"
- Core rule: if an operation can be expressed as if-else logic, it MUST be enforced mechanically (linter rules, type checks, scripts), not delegated to LLM judgment
- The LLM handles: intent understanding, architectural reasoning, code generation, debugging decisions, ambiguous trade-offs
- Mechanical enforcement handles: formatting, import ordering, naming conventions, file structure validation, test execution, type checking
- Update skill templates to include a `## Deterministic Checks` section listing what the skill enforces before/after LLM invocation

**No code changes** — documentation and convention only.

### B2: Checkpoint-Based Context Handoff Schema (Item #8)

**Files:**

- Modify: `docs/standard/implementation.md`

**Design:**

- Define `.harness/handoff.md` schema:

  ```markdown
  # Handoff: [phase/skill name]

  ## Completed

  - [what was done, with file paths]

  ## Discovered

  - [unexpected findings, edge cases, dependencies found]

  ## Blocked

  - [what couldn't be completed and why]

  ## Test Results

  - [pass/fail summary with command output]

  ## Next Steps

  - [what the next skill/phase should do]
  ```

- Skills write this at phase boundaries; subsequent skills read it as input context
- Convention — not enforced mechanically (yet — Group E's phase gates could enforce later)

### B3: Anti-Pattern Log Convention (Item #14)

**Files:**

- Modify: `docs/standard/implementation.md`

**Design:**

- Define `.harness/anti-patterns.md` convention:

  ```markdown
  ## [YYYY-MM-DD] [skill name]: [brief description]

  **Tried:** [what was attempted]
  **Failed because:** [why it didn't work]
  **What worked instead:** [the successful approach]
  ```

- Append-only log — skills that do exploration (debugging, refactoring) read at start, append at end
- Prevents the same dead-end from being explored repeatedly across sessions

### B4: Branchless Worktree Guidance (Item #24)

**Files:**

- Create: `docs/guides/agent-worktree-patterns.md`

**Design:**

- Document the operational pattern learned from GSD v2's ADR-001
- Recommendation: for agent-driven work, use worktree-per-milestone with sequential commits on a single branch, squash-merge to main
- Anti-pattern: branch-per-task creates merge/conflict complexity that grows super-linearly
- Reference GSD v2's experience: 582+ lines of merge code eliminated by going branchless
- Practical guidance: when to use worktrees, how to set them up, when to squash-merge

---

## Group A: Review System Overhaul

**Goal:** Transform the code review skill into a context-rich, change-aware, feedback-calibrated review system.

**Items:** #3, #5, #6, #7, #13, #16
**Depends on:** Group B (principles inform review behavior)

### A1: 1:1 Context Ratio in Review (Item #3)

**Files:**

- Modify: `agents/skills/claude-code/harness-code-review/SKILL.md`

**Design:**

- Add a `## Context Assembly` section to the review skill
- Rule: for every N lines of diff, gather N lines of surrounding context
- Priority order for context gathering:
  1. Files directly imported/referenced by changed files
  2. Corresponding test files
  3. Spec/design docs mentioning changed components
  4. Type definitions used by changed code
  5. Recent commits touching the same files (connects to A2)
- The 1:1 ratio is a heuristic, not a hard rule — for small diffs (<20 lines), gather more context proportionally

### A2: Commit History in Review Context (Item #5)

**Files:**

- Modify: `agents/skills/claude-code/harness-code-review/SKILL.md`

**Design:**

- Add to the context assembly step: include `git log --oneline -5 -- <affected-files>`
- Gives temporal awareness: was this a hotspot? Recently refactored? Who's been working here?
- Lightweight — adds ~5 lines of context per file

### A3: Review Feedback Learnings File (Item #6)

**Files:**

- Modify: `agents/skills/claude-code/harness-code-review/SKILL.md`
- Modify: `docs/standard/implementation.md`

**Design:**

- Define `.harness/review-learnings.md` convention:

  ```markdown
  ## Useful Findings

  - [category]: [example] — [why this was valuable]

  ## Noise / False Positives

  - [category]: [example] — [why this wasn't helpful]

  ## Calibration Notes

  - [specific guidance for this project, e.g., "don't flag missing error handling in test helpers"]
  ```

- Review skill reads this file if present and adjusts focus
- Related to anti-pattern log (B3) but specific to review quality calibration

### A4: Change-Type-Aware Review (Item #7)

**Files:**

- Modify: `agents/skills/claude-code/harness-code-review/SKILL.md`

**Design:**

- Skill detects or accepts change type: `feature`, `bugfix`, `refactor`, `docs`
- Detection heuristic: parse commit message prefix (`feat:`, `fix:`, `refactor:`, `docs:`) or examine diff patterns
- Each type gets a different checklist:
  - **Feature:** spec alignment, edge cases, test coverage, API surface, backward compatibility
  - **Bugfix:** root cause identified, regression test added, no collateral changes, original issue referenced
  - **Refactor:** behavioral equivalence verified, no functionality changes, performance preserved, tests unchanged
  - **Docs:** accuracy vs. current code, completeness, consistency with other docs
- Depends on A1 (context ratio) being in place

### A5: Pre-Commit Review Hook (Item #13)

**Files:**

- Create: `agents/skills/claude-code/harness-pre-commit-review/skill.yaml`
- Create: `agents/skills/claude-code/harness-pre-commit-review/SKILL.md`

**Design:**

- Lightweight skill for pre-commit quality gate
- Sequence: mechanical checks first (lint, typecheck), then AI review if mechanical checks pass
- Follows the deterministic-first principle from Group B
- Opt-in via git hook or explicit invocation
- Fast path: if only docs/config changed, skip AI review

### A6: Unified Integrity Gate (Item #16)

**Files:**

- Create: `agents/skills/claude-code/harness-integrity/skill.yaml`
- Create: `agents/skills/claude-code/harness-integrity/SKILL.md`

**Design:**

- Meta-skill that chains: test execution → lint → type-check → AI review → unified report
- Single invocation runs the full pipeline
- Report format:
  ```
  Integrity Check: [PASS/FAIL]
  - Tests: PASS (42/42)
  - Lint: PASS (0 warnings)
  - Types: PASS
  - Review: 2 suggestions (0 blocking)
  ```
- Depends on #2 (verify skill from Group E) and #7 (change-type review)
- **Deferred item:** A6 cannot be completed until E1 (harness-verify) exists. During Group A implementation, A6 is stubbed out (skill.yaml + SKILL.md skeleton). The full implementation is completed after Group E delivers E1.

**Implementation order:** A1 → A2 → A3 → A4 → A5 → A6 (stub) → A6 (complete, after E1)

---

## Group E: Workflow Gates

**Goal:** Add mechanical verification gates that enforce workflow discipline.

**Items:** #2, #9, #10, #17
**Depends on:** Group B (conventions), partially on Group A (#16 depends on #2)

### E1: Mechanical "Done" Criteria — Verify Skill (Item #2)

**Files:**

- Create: `agents/skills/claude-code/harness-verify/skill.yaml`
- Create: `agents/skills/claude-code/harness-verify/SKILL.md`

> **Relationship to existing `harness-verification`:** The existing skill is a _deep audit_ (EXISTS → SUBSTANTIVE → WIRED, 3-level evidence-based verification for milestones and PRs). This new `harness-verify` is a _quick gate_ — lightweight binary pass/fail for after every task. They are complementary tiers, not duplicates. The existing `harness-verification` SKILL.md already documents this two-tier model (quick gate vs. deep audit). This skill formalizes the quick gate as a standalone, invocable skill rather than an inline step within `harness-execution`.

**Design:**

- Binary pass/fail gate that runs project test/lint/typecheck commands
- Auto-detects commands from `package.json` scripts, `Makefile`, or common conventions:
  - Test: `pnpm test`, `npm test`, `make test`, `pytest`, `go test`
  - Lint: `pnpm lint`, `npm run lint`, `make lint`
  - Typecheck: `pnpm typecheck`, `tsc --noEmit`, `mypy`
- Returns structured result:
  ```
  Verification: [PASS/FAIL]
  - Tests: [PASS/FAIL] ([output summary])
  - Lint: [PASS/FAIL] ([output summary])
  - Types: [PASS/FAIL] ([output summary])
  ```
- Skills that produce code should invoke this as a final step
- Cognitive mode: `meticulous-verifier`

### E2: EARS Requirement Syntax (Item #10)

**Files:**

- Modify: `agents/skills/claude-code/harness-planning/SKILL.md`
- Modify: `agents/skills/claude-code/harness-brainstorming/SKILL.md` (if exists)

**Design:**

- Add EARS template section to planning/spec skills
- EARS patterns:
  - **Ubiquitous:** "The system shall [behavior]"
  - **Event-driven:** "When [trigger], the system shall [response]"
  - **State-driven:** "While [state], the system shall [behavior]"
  - **Optional feature:** "Where [feature is enabled], the system shall [behavior]"
  - **Unwanted behavior:** "If [condition], then the system shall not [behavior]"
- Include 2-3 worked examples relevant to harness projects
- Not hard enforcement — a recommended template surfaced during spec writing

### E3: Phase Gates (Item #9)

**Files:**

- Modify: `packages/cli/` (new `check-phase-gate` command)

> **Architectural note:** Standard ESLint rules operate on AST nodes within a single file — checking for the existence of a _separate_ spec file is not a natural fit for ESLint. This is better implemented as a CLI command (`harness check-phase-gate`) that can be wired into pre-commit hooks or CI, rather than an ESLint rule.

**Design:**

- CLI command: `harness check-phase-gate` — validates that implementation files have corresponding specs
- Rule logic: when a file in `src/` or equivalent is created/modified, check that a spec file exists in `docs/changes/` matching the feature name
- Configurable mapping: projects define spec-to-implementation path mapping in `.harness/config`
- Opt-in: `phase-gates.enabled: true` in `.harness/config`
- Can be wired as a git pre-commit hook or CI step
- Severity: warning by default, configurable to error

### E4: Workflow Orchestration — Typed Skill Pipelines (Item #17)

**Files:**

- Modify: `packages/types/` (workflow type definitions)
- Modify: `packages/core/` (workflow runner)

**Design:**

- New types in `@harness-engineering/types`:

  ```typescript
  interface WorkflowStep {
    skill: string;
    produces: string; // artifact type
    expects?: string; // artifact type from previous step
    gate?: 'pass-required' | 'advisory';
  }

  interface Workflow {
    name: string;
    steps: WorkflowStep[];
  }
  ```

- Workflow runner in `@harness-engineering/core`:
  - Executes steps in sequence
  - Passes artifacts between steps via handoff schema (from B2)
  - Stops on `pass-required` gate failure
  - Returns unified result with per-step outcomes
- Example workflow: `plan → implement → verify → review`
- Depends on handoff schema (#8 from Group B)
- Longest-term item in this group

**Implementation order:** E1 → E2 → E3 → E4

---

## Group C: Skill System Evolution

**Goal:** Extend the skill system with richer metadata, better scaffolding, and new skill patterns.

**Items:** #4, #11, #13, #19

> **Note:** The types package currently only exports `Result<T,E>` and helpers. Skill schema types referenced in C1 and elsewhere are _new types to create_, not modifications to existing types.
> **Depends on:** Group B (principles), Group E (#2 verify skill used by new skills)

### C1: Cognitive-Mode Field in Skill Metadata (Item #4)

**Files:**

- Modify: `packages/types/` (skill schema types)
- Modify: `packages/cli/` (validate command)

**Design:**

- Add optional `cognitive_mode` field to skill schema:
  ```yaml
  cognitive_mode: adversarial-reviewer
  ```
- **Backward compatibility:** The field is optional. Existing skills without `cognitive_mode` remain valid — `harness validate` does not fail on missing optional fields. New skills created via the scaffolding CLI (C2) will include it by default.
- Standard modes (extensible, not an enum):
  - `adversarial-reviewer` — finds problems, challenges assumptions
  - `constructive-architect` — designs solutions, proposes alternatives
  - `meticulous-implementer` — follows specs precisely, handles edge cases
  - `diagnostic-investigator` — classifies problems, forms hypotheses
  - `advisory-guide` — asks questions, surfaces trade-offs, defers decisions to human
  - `meticulous-verifier` — runs checks, validates completeness
- Update `harness validate` to accept and validate the field
- Backfill existing skills:
  - `harness-code-review` → `adversarial-reviewer`
  - `harness-debugging` → `diagnostic-investigator`
  - `harness-planning` → `constructive-architect`
  - `harness-execution` → `meticulous-implementer`
  - `harness-verification` → `meticulous-verifier`
  - (others as appropriate)

### C2: Skill Scaffolding CLI Command (Item #13)

**Files:**

- Modify: `packages/cli/` (new `create-skill` command)

**Design:**

- `harness create-skill` — interactive questionnaire:
  1. Skill name (kebab-case)
  2. One-line description
  3. Cognitive mode (select from standard list or custom)
  4. What files does it read? (glob patterns)
  5. What does it produce? (artifacts, changes, reports)
  6. What mechanical checks does it run? (pre/post execution)
- Generates:
  - `agents/skills/claude-code/<name>/skill.yaml` with all metadata
  - `agents/skills/claude-code/<name>/SKILL.md` with sections pre-filled:
    - Description, Cognitive Mode, Context Assembly, Deterministic Checks, Execution Steps, Output Format
- Depends on C1 (cognitive_mode field must exist)

### C3: Error Taxonomy Skill (Item #11)

**Files:**

- Create: `agents/skills/claude-code/harness-diagnostics/skill.yaml`
- Create: `agents/skills/claude-code/harness-diagnostics/SKILL.md`

**Design:**

- Cognitive mode: `diagnostic-investigator`
- Step 1 — Classify error:
  - **Syntax/Type:** compilation or type-check failure
  - **Logic:** wrong output, incorrect behavior
  - **Design:** architectural issue, wrong abstraction
  - **Performance:** slow, memory-intensive
  - **Security:** vulnerability, unsafe pattern
  - **Environment:** dependency, config, platform issue
  - **Flaky:** intermittent, timing-dependent
- Step 2 — Route to resolution strategy:
  - Syntax/Type → read error output, locate file, fix mechanically
  - Logic → add failing test first, then investigate
  - Design → escalate to human architect (advisory mode)
  - Performance → profile first, then optimize
  - Security → check OWASP top 10, apply fix, verify
  - Environment → check versions, configs, permissions
  - Flaky → isolate timing dependency, add retry or fix race
- Step 3 — Record in anti-pattern log (B3) if first approach failed
- Builds on existing `harness-debugging` but adds the classification/routing layer

### C4: Interactive Advisor Skills (Item #19)

**Files:**

- Create: `agents/skills/claude-code/harness-architecture-advisor/skill.yaml`
- Create: `agents/skills/claude-code/harness-architecture-advisor/SKILL.md`

**Design:**

- Cognitive mode: `advisory-guide`
- Different pattern from executor skills — asks questions, doesn't execute
- Covers: technology choices, component decomposition, API design, data modeling
- Flow:
  1. Ask about the problem space (what are you building? who consumes it?)
  2. Ask about constraints (performance, compatibility, team expertise)
  3. Present 2-3 architectural options with trade-offs
  4. Help the human architect choose, then document the decision
- Output: an Architecture Decision Record (ADR) or spec section
- Does NOT make decisions — surfaces options with pros/cons
- Extends the human-architect model

**Implementation order:** C1 → C2 → C3 → C4

---

## Group D: Context Engineering

**Goal:** Formalize context engineering from a principle into concrete tools.

**Items:** #12 (token budget), #15, #18, #20
**Depends on:** All prior groups (most architectural, builds on foundations)

### D1: Token Budget Guidance (Item #12)

**Files:**

- Modify: `docs/standard/principles.md`
- Optionally modify: `packages/core/`

**Design:**

- Add "Token Budget Allocation" subsection to Context Engineering principle
- Recommended allocation (adapted from GSD v2):
  | Category | Budget | Purpose |
  |----------|--------|---------|
  | System prompt / skill instructions | 15% | Behavioral guidance |
  | Project manifest (AGENTS.md, config) | 5% | Project context |
  | Task specification | 20% | What to do |
  | Active code (under review/edit) | 40% | Primary work material |
  | Interfaces and type definitions | 10% | Structural context |
  | Reserve (agent reasoning) | 10% | Working memory |
- Optional: `contextBudget(totalTokens: number)` utility in `@harness-engineering/core` returning per-category limits
- Heuristic, not enforcement — skills reference during context assembly

### D2: Staged Context Pipeline (Item #15)

**Files:**

- Modify: `packages/types/` (lifecycle hook types)
- Modify: `packages/core/` (SkillPipeline)

**Design:**

- Typed lifecycle hooks for skill execution:
  ```typescript
  interface SkillLifecycleHooks {
    preExecution: (context: SkillContext) => Result<SkillContext, SkillError>;
    perTurn: (context: TurnContext) => Result<TurnContext, SkillError>;
    postExecution: (context: SkillContext, result: SkillResult) => Result<void, SkillError>;
  }
  ```
- `preExecution`: validate preconditions, assemble initial context within budget
- `perTurn`: inject or filter context during multi-turn execution
- `postExecution`: write handoff artifacts, update learnings, record anti-patterns
- `SkillPipeline` in core orchestrates hook execution around skill invocation
- Largest architectural change — requires updating how skills are invoked
- Foundation for JIT filtering (D4)

### D3: Context-as-MCP-Service (Item #18)

**Files:**

- Modify: `packages/mcp-server/`

**Design:**

- Extend MCP server with resource endpoints:
  - `harness://skills` — list available skills with metadata (name, description, cognitive_mode)
  - `harness://rules` — active linter rules and constraints from eslint-plugin
  - `harness://project` — project structure, config, conventions from AGENTS.md
  - `harness://learnings` — review learnings (A3), anti-pattern log (B3)
- Makes harness context consumable by any MCP-compatible agent
- Read-only resources — agents consume but don't modify
- Builds on existing MCP server package

### D4: JIT Context Filtering (Item #20)

**Files:**

- Modify: `packages/core/` (context filtering utility)

**Design:**

- `contextFilter(phase: WorkflowPhase, budget: TokenBudget)` utility in core
- Phase-aware filtering:
  - **Implement:** source files, type definitions, test examples, spec
  - **Review:** diff, specs, review learnings, lint results, commit history
  - **Debug:** error output, recent changes, anti-pattern log, related tests
  - **Plan:** requirements, existing architecture, constraints, prior handoffs
- Consumes token budget from D1 and pipeline hooks from D2
- Depends on both D1 and D2 being in place

**Implementation order:** D1 → D2 → D3 → D4

---

## Cross-Group Dependencies

```
Arrows read as "is consumed by" (→).

Group B (Principles & Conventions)
  ├── B1 (deterministic/LLM principle) → informs all skill designs
  ├── B2 (handoff schema) → E4 (workflow orchestration)
  ├── B3 (anti-pattern log) → A3 (review learnings), C3 (error taxonomy)
  └── B4 (worktree guidance) → standalone

Group A (Review System)
  ├── A1 (context ratio) → A4 (change-type review)
  ├── A5 (pre-commit hook) → standalone after A1-A4
  └── A6 (integrity gate) → DEFERRED: requires E1 (verify skill) + A4 (change-type review)

Group E (Workflow Gates)
  ├── E1 (verify skill) → completes deferred A6 (integrity gate)
  ├── E3 (phase gates) → CLI command (standalone)
  └── E4 (workflow orchestration) → B2 (handoff schema)

Group C (Skill System)
  ├── C1 (cognitive-mode) → C2 (scaffolding CLI)
  └── C3 (error taxonomy) → B3 (anti-pattern log)

Group D (Context Engineering)
  ├── D1 (token budget) → D4 (JIT filtering)
  ├── D2 (context pipeline) → D4 (JIT filtering)
  └── D3 (MCP resources) → C1 (cognitive-mode for skill metadata)
```

---

## Success Criteria

**Group B:** All 4 conventions documented, principles.md updated, referenced by at least one skill.

**Group A:** Review skill has context assembly, change-type detection, and learnings integration. Pre-commit hook and integrity gate are new functional skills.

**Group E:** Verify skill runs as binary gate. EARS syntax available in planning. Phase gate linter rule implemented. Workflow types defined.

**Group C:** Cognitive-mode field in schema, validated by CLI. Scaffolding command generates complete skill. Diagnostics and advisor are new functional skills.

**Group D:** Token budget documented. Context pipeline types and runner implemented. MCP resources exposed. JIT filtering utility functional.

---

## What This Spec Does NOT Cover

- Runtime performance benchmarks for context pipeline
- Migration path for existing projects using older harness versions
- UI/UX for the scaffolding CLI (will be designed during planning)
- Specific test cases (will be designed per-group during planning)
