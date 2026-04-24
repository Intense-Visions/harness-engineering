# Pipeline Skill Advisor

**Keywords:** skill-discovery, content-matching, pipeline-integration, autopilot, brainstorming, planning, execution, design-skills, knowledge-skills, context-enrichment

## Overview

Automatic, content-based skill discovery that runs natively inside the brainstorming-planning-execution pipeline. When a user writes a spec about "responsive dashboard with dark mode," the system proactively surfaces `design-responsive-strategy`, `design-dark-mode`, `a11y-color-contrast`, and other relevant skills without the user needing to know they exist or manually searching for them.

This complements the existing [Skill Recommendation Engine](../skill-recommendation-engine/proposal.md) which is health-based ("your codebase has circular deps, run enforce-architecture"). The Pipeline Skill Advisor is content-based ("your spec is about auth with OAuth2, reference `owasp-auth-patterns`, `security-session-management`, `api-oauth2-flows`").

### Goals

1. **Zero-manual-step skill discovery** -- relevant skills surface automatically during brainstorming (Phase 4) and planning (Phase 2) without the user invoking anything
2. **Content-based matching** -- match spec/plan/task text against skill metadata (`keywords`, `stack_signals`, `description`, `related_skills`) to find domain-relevant skills
3. **Tiered output** -- recommendations classified as Apply (invoke during execution), Reference (load as context), or Consider (edge-case relevance)
4. **When-aware guidance** -- each recommendation includes a "When" column indicating when during the phase the skill should be applied (e.g., "During styling", "After styling", "End of phase", "Testing")
5. **Pipeline-native** -- runs as a sub-step inside existing skills, not a separate pipeline stage users must remember
6. **Orchestrator-transparent** -- autopilot gets advisor output without state machine changes; `--fast` and `--thorough` flags control verbosity
7. **Discoverability by presence** -- always announces what it found (brief summary), so users learn the feature exists through normal use
8. **Nudge when absent** -- downstream skills warn when no skill recommendations exist, directing users to the advisor

### Out of Scope

- Health-based recommendations (covered by [Skill Recommendation Engine](../skill-recommendation-engine/proposal.md))
- Auto-execution of recommended skills (v1 is advisory; execution loads context but does not auto-invoke rigid skills)
- Learning from outcomes / feedback loops (future: track which recommended skills were actually used)
- Changing the skill metadata schema (the existing `keywords`, `stack_signals`, `related_skills`, `addresses` fields are sufficient)

## Decisions

| #   | Decision                                                                                                             | Rationale                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Sub-step inside planning Phase 1 (scope), not a new pipeline stage                                                   | Avoids autopilot state machine changes. Every path that runs planning gets the advisor for free. Users don't need to know it exists as a separate concept.              |
| D2  | Brainstorming Phase 4 does a high-level scan; planning Phase 1 does task-level scan                                  | Two passes at different granularities. Brainstorming surfaces categories ("12 design skills, 4 a11y skills relevant"). Planning maps specific skills to specific tasks. |
| D3  | Output written to `docs/changes/<feature>/SKILLS.md` alongside the spec                                              | Human-readable, version-controlled, reviewable alongside the spec. Machine-consumable by planning and execution.                                                        |
| D4  | Handoff extended with `recommendedSkills` field                                                                      | Enables downstream skills to consume recommendations without re-scanning. Flows through the existing handoff mechanism.                                                 |
| D5  | Matching uses weighted composite of keyword overlap, stack signals, description similarity, and related-skills graph | Multiple signals prevent over-reliance on any single dimension. Weights tunable per tier.                                                                               |
| D6  | `--fast` runs silently (writes file, no summary); `--thorough` shows full list for human review                      | Fast mode avoids interruption. Thorough mode gives explicit approval gate. Normal mode shows brief summary.                                                             |
| D7  | Downstream nudge when SKILLS.md is absent                                                                            | Catches the "unaware" case. Execution/planning emit a one-line note pointing to the advisor. Non-blocking.                                                              |
| D8  | Three recommendation tiers: Apply, Reference, Consider                                                               | Apply = rigid/flexible skills to invoke. Reference = knowledge skills to load as execution context. Consider = tangentially relevant, shown only in `--thorough` mode.  |
| D9  | "When" column inferred heuristically from skill metadata                                                             | Transforms flat list into actionable timing guidance without requiring new schema fields.                                                                               |

## Technical Design

### 1. Content Matching Engine (`packages/cli/src/skill/content-matcher.ts`)

The matching engine scores every skill in the index against extracted content signals.

```typescript
interface ContentSignals {
  specKeywords: string[]; // From spec frontmatter Keywords + contextKeywords from handoff
  specText: string; // Full spec body text for description matching
  taskText?: string; // Individual task description (for task-level matching)
  stackSignals: string[]; // Detected from project (package.json, tsconfig, etc.)
  featureDomain: string[]; // Extracted domain categories (e.g., "design", "auth", "data")
}

interface SkillMatch {
  skillName: string;
  score: number; // 0-1 composite
  tier: 'apply' | 'reference' | 'consider';
  matchReasons: string[]; // Human-readable: "keyword 'dark-mode' matched skill keywords"
  category: string; // Grouping: "design", "framework", "security", "a11y", "perf", "patterns"
  when: string; // Timing: "During implementation", "After styling", "End of phase", etc.
}

interface ContentMatchResult {
  matches: SkillMatch[];
  signalsUsed: ContentSignals;
  scanDuration: number; // ms, for performance monitoring
}
```

**Scoring algorithm:**

```typescript
function scoreSkillByContent(skill: SkillIndexEntry, signals: ContentSignals): number {
  const keywordScore = computeKeywordOverlap(skill.keywords, signals.specKeywords);
  const stackScore = computeStackMatch(skill.stackSignals, signals.stackSignals);
  const descScore = computeTermOverlap(skill.description, signals.specText);
  const domainScore = computeDomainMatch(skill, signals.featureDomain);

  // Weighted composite
  return 0.35 * keywordScore + 0.25 * stackScore + 0.25 * descScore + 0.15 * domainScore;
}
```

**Tier classification:**

| Score Range | Tier      | Criteria                                                             |
| ----------- | --------- | -------------------------------------------------------------------- |
| >= 0.6      | Apply     | High relevance; skill should be invoked or loaded as primary context |
| 0.35 - 0.59 | Reference | Moderate relevance; load as supplementary context during execution   |
| 0.15 - 0.34 | Consider  | Tangential; shown only in `--thorough` mode                          |
| < 0.15      | Excluded  | Below noise threshold; not shown                                     |

**Related-skills expansion:** After initial scoring, for every skill scoring >= 0.35, traverse its `related_skills` graph one level deep. Related skills that aren't already matched get a boosted initial score of `parent_score * 0.6` and are re-evaluated.

### 2. Signal Extraction (`packages/cli/src/skill/signal-extractor.ts`)

Extracts `ContentSignals` from spec content and project context.

```typescript
function extractSignals(
  specText: string,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>,
  contextKeywords?: string[],
  taskText?: string
): ContentSignals;
```

Pure function — no file I/O. Callers provide raw text and parsed deps.

### 3. SKILLS.md Output Format

Written to `docs/changes/<feature>/SKILLS.md` alongside the spec.

```markdown
# Recommended Skills: <Feature Name>

> Auto-generated by Pipeline Skill Advisor. Review and adjust as needed.

## Apply (invoke during execution)

| Skill                        | Purpose                                             | When                  | Relevance |
| ---------------------------- | --------------------------------------------------- | --------------------- | --------- |
| `design-responsive-strategy` | Responsive layout with breakpoints and grid systems | During implementation | 0.82      |
| `design-dark-mode`           | Dark mode theming and color-scheme switching        | During implementation | 0.74      |
| `harness-security-scan`      | Lightweight security scan for auth-related code     | End of phase          | 0.68      |

## Reference (load as context)

| Skill                     | Purpose                                           | When                   | Relevance |
| ------------------------- | ------------------------------------------------- | ---------------------- | --------- |
| `a11y-color-contrast`     | Verify color combinations meet 4.5:1 / 3:1 ratios | After styling          | 0.52      |
| `css-container-queries`   | Component-level responsive patterns               | During styling         | 0.48      |
| `design-elevation-shadow` | Elevation and shadow depth for cards              | During styling         | 0.41      |
| `next-server-components`  | Server component patterns for Next.js             | Architecture decisions | 0.38      |

## Consider

| Skill                          | Purpose                                  | When          | Relevance |
| ------------------------------ | ---------------------------------------- | ------------- | --------- |
| `perf-cumulative-layout-shift` | CLS performance budget for layout shifts | Layout review | 0.28      |
| `design-motion-principles`     | Animation timing and easing principles   | During polish | 0.22      |

---

_Scanned 736 skills in 120ms. Signals: 8 keywords, 4 stack markers, 2 domains._
```

**When column inference:** The "When" value is inferred heuristically from skill metadata:

| Skill Pattern                                           | Inferred When             |
| ------------------------------------------------------- | ------------------------- |
| Name contains `scan`, `audit`, `i18n`                   | End of phase              |
| Keywords match `test`, `tdd`, `coverage`                | Testing                   |
| Keywords match `a11y`, `contrast`, `wcag`               | After styling             |
| Keywords match `color`, `typography`, `css`, `tailwind` | During styling            |
| Keywords match `alignment`, `whitespace`, `spacing`     | Layout review             |
| Keywords match `motion`, `animation`, `transition`      | During polish             |
| Keywords match `architecture`, `pattern`, `api`         | Architecture decisions    |
| Type is `knowledge` + design keywords                   | During implementation     |
| Type is `rigid` (harness-\* workflow skills)            | Each file or End of phase |
| Default                                                 | During implementation     |

### 4. Integration Points

#### 4a. Brainstorming Phase 4 (VALIDATE) Integration

After the spec is written and before sign-off is requested, brainstorming runs a high-level scan:

```
4a. Run skill advisor scan. Extract signals from the spec and scan the skill index.
    Write results to docs/changes/<feature>/SKILLS.md.
    Announce findings in a brief summary:

    "Skill Advisor: Found 12 relevant skills for '<feature>'
      Apply: 3 (design-responsive-strategy, design-dark-mode, harness-security-scan)
      Reference: 4 | Consider: 5
      Full list: docs/changes/<feature>/SKILLS.md"
```

#### 4b. Planning Phase 1 (SCOPE) Integration

When planning starts and loads the spec, it also loads SKILLS.md if it exists:

```
1b. Load skill recommendations. If docs/changes/<feature>/SKILLS.md exists:
    - Parse the Apply and Reference tiers
    - Use these to inform task decomposition (Phase 2):
      for each task, annotate with relevant skills from the list
    - Task annotation format in PLAN.md:

      ### Task 3: Implement dark mode toggle
      **Skills:** `design-dark-mode` (apply), `a11y-color-contrast` (reference)
```

#### 4c. Execution Integration

When execution encounters a task with skill annotations:

```
For each task with a Skills: annotation:
  - For 'apply' skills: note the skill name in the task context
  - For 'reference' skills: if type: knowledge, load SKILL.md as context (cap at 3 per task)
```

#### 4d. Downstream Nudge

When planning starts and finds neither SKILLS.md nor a spec to scan:

```
Note: No skill recommendations found. Run the advisor to discover
relevant design, framework, and knowledge skills:
  harness skill run pipeline-skill-advisor --spec-path <path>
```

### 5. Handoff Extension

Add `recommendedSkills` to the handoff schema:

```typescript
interface HandoffData {
  // ... existing fields
  recommendedSkills?: {
    apply: string[];
    reference: string[];
    consider: string[];
    skillsPath: string;
  };
}
```

### 6. Autopilot Transparency

Autopilot requires **no state machine changes**. The advisor runs inside planning's Phase 1, which autopilot already dispatches.

| Autopilot Flag | Advisor Behavior                                                                 |
| -------------- | -------------------------------------------------------------------------------- |
| (default)      | Runs silently, writes SKILLS.md, announces brief summary                         |
| `--fast`       | Runs silently, writes SKILLS.md, no summary announcement                         |
| `--thorough`   | Runs, writes SKILLS.md including Consider tier, shows full list for human review |

### 7. Standalone Invocation

Available as CLI command and MCP tool for use outside the pipeline.

### 8. File Layout

New files:

```
packages/cli/src/skill/
  content-matcher.ts          # ContentMatchEngine (scoring, tier classification)
  signal-extractor.ts         # Extract ContentSignals from spec + project
  content-matcher-types.ts    # Shared types (SkillMatch, ContentSignals, etc.)
  skills-md-writer.ts         # Generate and parse SKILLS.md format

packages/cli/src/commands/
  advise-skills.ts            # CLI command wrapper

packages/cli/src/mcp/tools/
  advise-skills.ts            # MCP tool wrapper
```

Modified files:

```
agents/skills/claude-code/harness-brainstorming/SKILL.md    # Add Phase 4 step 4a
agents/skills/claude-code/harness-planning/SKILL.md         # Add Phase 1 step 1b
agents/skills/claude-code/harness-execution/SKILL.md        # Add task-level skill context loading
packages/cli/src/skill/handoff-types.ts                     # Add recommendedSkills to HandoffData
```

### 9. Relationship to Skill Recommendation Engine

The [Skill Recommendation Engine](../skill-recommendation-engine/proposal.md) and Pipeline Skill Advisor are complementary:

| Dimension                | Recommendation Engine               | Pipeline Skill Advisor                         |
| ------------------------ | ----------------------------------- | ---------------------------------------------- |
| **Trigger**              | On-demand (`harness recommend`)     | Automatic (inside brainstorming/planning)      |
| **Input**                | Codebase health snapshot            | Spec/plan content + project stack              |
| **Question answered**    | "What's wrong? What skills fix it?" | "What are we building? What skills inform it?" |
| **Output**               | Sequenced workflow with urgency     | Tiered skill list with task annotations        |
| **Skill types targeted** | Rigid/flexible (fix skills)         | Knowledge + rigid (inform + apply skills)      |

Both share the skill index (built by `index-builder.ts`) and the `skill.yaml` metadata fields.

## Success Criteria

1. Brainstorming Phase 4 automatically scans the spec and writes `SKILLS.md` without user invocation
2. Planning Phase 1 loads `SKILLS.md` and annotates tasks with relevant skills in `PLAN.md`
3. If `SKILLS.md` is missing when planning starts with a spec, planning generates it inline
4. Execution loads knowledge-skill context for tasks with skill annotations (capped at 3 per task)
5. Autopilot flows get advisor output with no state machine changes; `--fast`/`--thorough` control verbosity
6. `--thorough` mode shows full recommendation list for human review before planning proceeds
7. Downstream nudge appears when planning starts without SKILLS.md and without a spec to scan
8. Standalone CLI command `harness skill run pipeline-skill-advisor --spec-path <path>` works independently
9. `advise_skills` MCP tool returns structured `ContentMatchResult` JSON
10. Scanning 736 skills completes in under 500ms (text matching, no LLM calls)
11. Related-skills expansion discovers at least 2 additional relevant skills not found by direct matching (validated in test cases)
12. Each recommendation includes a "When" column with timing guidance inferred from skill metadata
13. `harness validate` passes after all changes

## Implementation Order

### Phase 1: Core Engine

<!-- complexity: medium -->

Build the content matching engine and its supporting types.

1. **Types** -- `content-matcher-types.ts` with `ContentSignals`, `SkillMatch`, `ContentMatchResult`
2. **Signal extractor** -- `signal-extractor.ts` with spec parsing, stack detection, domain inference
3. **Content matcher** -- `content-matcher.ts` with scoring algorithm, tier classification, related-skills expansion, when inference
4. **SKILLS.md writer** -- `skills-md-writer.ts` with generation and parsing
5. **Unit tests** -- Tests for signal extraction, scoring, tier classification, related-skills expansion, SKILLS.md generation/parsing

### Phase 2: Pipeline Integration

<!-- complexity: medium -->

Wire the advisor into brainstorming, planning, and execution skill definitions. Extend handoff schema.

1. **Brainstorming integration** -- Modify `harness-brainstorming/SKILL.md` Phase 4 to invoke the advisor after spec is written
2. **Planning integration** -- Modify `harness-planning/SKILL.md` Phase 1 to load/generate SKILLS.md and annotate tasks
3. **Execution integration** -- Modify `harness-execution/SKILL.md` to load skill context for annotated tasks
4. **Handoff extension** -- Add `recommendedSkills` to `HandoffData` type
5. **Downstream nudge** -- Add informational note to planning when no SKILLS.md and no spec to scan
6. **Integration tests** -- End-to-end test: spec -> advisor -> SKILLS.md -> plan with annotations

### Phase 3: CLI & MCP Surfaces

<!-- complexity: low -->

Expose the advisor as a standalone CLI command and MCP tool for use outside the pipeline.

1. **CLI command** -- `advise-skills.ts` command wrapper with `--spec-path`, `--thorough`, `--top` flags
2. **MCP tool** -- `advise-skills.ts` MCP tool definition and handler returning `ContentMatchResult`
3. **Performance benchmark** -- Validate scan completes in under 500ms against full skill index
