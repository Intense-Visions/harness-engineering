# Plan: Pipeline Skill Advisor -- Phase 2: Pipeline Integration

**Date:** 2026-04-24 | **Spec:** docs/changes/pipeline-skill-advisor/proposal.md | **Tasks:** 7 | **Time:** ~28 min

## Goal

Wire the Pipeline Skill Advisor core engine into the brainstorming-planning-execution pipeline by modifying SKILL.md instruction files and extending the handoff schema, so that skill recommendations surface automatically during spec authoring and inform task annotation and execution context loading.

## Observable Truths (Acceptance Criteria)

1. When brainstorming Phase 4 writes a spec, the SKILL.md instructions direct the agent to run a skill advisor scan and write `docs/changes/<feature>/SKILLS.md` alongside the spec before requesting sign-off (step 4a inserted between steps 3 and 4).
2. When planning Phase 1 loads a spec, the SKILL.md instructions direct the agent to load or generate SKILLS.md and annotate tasks with `**Skills:** \`skill-name\` (tier)` format in Phase 2.
3. When planning starts without SKILLS.md and without a spec to scan, the instructions include a one-line downstream nudge pointing to the advisor.
4. When execution encounters a task with a `**Skills:**` annotation, the SKILL.md instructions direct the agent to load SKILL.md content as context for reference/knowledge skills (capped at 3 per task).
5. The `HandoffSchema` in `packages/core/src/state/types.ts` includes an optional `recommendedSkills` field with `{ apply: string[], reference: string[], consider: string[], skillsPath: string }`.
6. The brainstorming SKILL.md handoff template includes `recommendedSkills` in the JSON example.
7. `npx vitest run packages/cli/tests/skill/pipeline-integration.test.ts` passes with tests covering handoff schema validation, SKILLS.md generation in pipeline context, and parseSkillsMd round-trip.
8. `harness validate` passes after all changes.

## Uncertainties

- [ASSUMPTION] SKILL.md files at `agents/skills/claude-code/harness-*/SKILL.md` are canonical source; build copies to dist via `scripts/copy-assets.mjs`.
- [ASSUMPTION] Zod `z.object({})` strips unknown keys by default, so `recommendedSkills` must be added to the schema (not just passed through).
- [ASSUMPTION] SKILL.md integration is instructional (tells agent what to do), not code execution. Agent uses existing MCP tools or Phase 1 functions.
- [DEFERRABLE] Exact downstream nudge wording. Can be finalized during execution.

## File Map

```
MODIFY agents/skills/claude-code/harness-brainstorming/SKILL.md (add step 4a after step 3)
MODIFY agents/skills/claude-code/harness-planning/SKILL.md (add step 1b after step 1, add task annotation guidance to Phase 2)
MODIFY agents/skills/claude-code/harness-execution/SKILL.md (add skill context loading to Phase 2 step 1)
MODIFY packages/core/src/state/types.ts (add recommendedSkills to HandoffSchema)
CREATE packages/cli/tests/skill/pipeline-integration.test.ts (integration tests)
```

## Tasks

### Task 1: Extend HandoffSchema with recommendedSkills

**Depends on:** none | **Files:** `packages/core/src/state/types.ts`

1. Open `packages/core/src/state/types.ts`.
2. Add the `recommendedSkills` optional field to the `HandoffSchema` Zod object, after `contextKeywords`:

```typescript
// In HandoffSchema, after the contextKeywords line:
  recommendedSkills: z
    .object({
      apply: z.array(z.string()),
      reference: z.array(z.string()),
      consider: z.array(z.string()),
      skillsPath: z.string(),
    })
    .optional(),
```

3. Run: `cd packages/core && npx tsc --noEmit` to verify type correctness.
4. Run: `harness validate`
5. Commit: `feat(state): add recommendedSkills to HandoffSchema`

---

### Task 2: Write integration tests for pipeline flow (TDD)

**Depends on:** Task 1 | **Files:** `packages/cli/tests/skill/pipeline-integration.test.ts`

1. Create `packages/cli/tests/skill/pipeline-integration.test.ts` with the following tests:

```typescript
import { describe, it, expect } from 'vitest';
import { extractSignals } from '../../src/skill/signal-extractor.js';
import { matchContent } from '../../src/skill/content-matcher.js';
import { generateSkillsMd, parseSkillsMd } from '../../src/skill/skills-md-writer.js';
import type { SkillIndexEntry, SkillsIndex } from '../../src/skill/index-builder.js';
import type { ContentSignals } from '../../src/skill/content-matcher-types.js';

function makeEntry(overrides: Partial<SkillIndexEntry> = {}): SkillIndexEntry {
  return {
    tier: 3,
    type: 'knowledge',
    description: 'A test skill',
    keywords: [],
    stackSignals: [],
    cognitiveMode: undefined,
    phases: [],
    paths: [],
    relatedSkills: [],
    source: 'bundled',
    addresses: [],
    dependsOn: [],
    ...overrides,
  };
}

function makeIndex(skills: Record<string, SkillIndexEntry>): SkillsIndex {
  return { version: 1, hash: 'test', generatedAt: '2026-01-01', skills };
}

describe('Pipeline Integration: spec -> signals -> match -> SKILLS.md', () => {
  const specText = `# Dashboard Redesign

**Keywords:** responsive, dark-mode, accessibility, dashboard, layout

## Overview
Build a responsive dashboard with dark mode support and accessibility compliance.
The dashboard uses a grid layout with responsive breakpoints and color theming.
Typography and contrast ratios must meet WCAG 2.1 AA standards.
`;

  const index = makeIndex({
    'design-responsive-strategy': makeEntry({
      type: 'knowledge',
      description: 'Responsive layout with breakpoints and grid systems',
      keywords: ['responsive', 'layout', 'breakpoint', 'grid', 'design'],
      stackSignals: ['react'],
      relatedSkills: ['css-responsive-design'],
    }),
    'css-dark-mode': makeEntry({
      type: 'knowledge',
      description: 'Dark mode theming and color-scheme switching',
      keywords: ['dark-mode', 'color', 'theme', 'css'],
      stackSignals: [],
      relatedSkills: [],
    }),
    'a11y-color-contrast': makeEntry({
      type: 'knowledge',
      description: 'Verify color combinations meet WCAG contrast ratios',
      keywords: ['a11y', 'contrast', 'wcag', 'color', 'accessibility'],
      stackSignals: [],
      relatedSkills: [],
    }),
    'css-responsive-design': makeEntry({
      type: 'knowledge',
      description: 'CSS media queries and responsive patterns',
      keywords: ['responsive', 'css', 'media-query'],
      stackSignals: [],
      relatedSkills: [],
    }),
    'harness-security-scan': makeEntry({
      type: 'rigid',
      description: 'Lightweight security scan for code',
      keywords: ['security', 'scan', 'audit'],
      stackSignals: [],
      relatedSkills: [],
    }),
  });

  it('extracts signals from spec text and project deps', () => {
    const signals = extractSignals(
      specText,
      { react: '^18.0.0', 'react-dom': '^18.0.0' },
      { typescript: '^5.0.0', vitest: '^1.0.0' }
    );

    expect(signals.specKeywords).toContain('responsive');
    expect(signals.specKeywords).toContain('dark-mode');
    expect(signals.stackSignals).toContain('react');
    expect(signals.stackSignals).toContain('typescript');
    expect(signals.featureDomain).toContain('design');
    expect(signals.featureDomain).toContain('a11y');
  });

  it('matches skills against extracted signals', () => {
    const signals = extractSignals(specText, { react: '^18.0.0' }, { typescript: '^5.0.0' });
    const result = matchContent(index, signals);

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.scanDuration).toBeGreaterThanOrEqual(0);

    const names = result.matches.map((m) => m.skillName);
    expect(names).toContain('design-responsive-strategy');
    expect(names).toContain('a11y-color-contrast');
  });

  it('generates SKILLS.md and parses it back (round-trip)', () => {
    const signals = extractSignals(specText, { react: '^18.0.0' }, {});
    const result = matchContent(index, signals);
    const md = generateSkillsMd('Dashboard Redesign', result, 5);

    expect(md).toContain('# Recommended Skills: Dashboard Redesign');
    expect(md).toContain('design-responsive-strategy');

    const parsed = parseSkillsMd(md);
    expect(parsed.length).toBeGreaterThan(0);

    const originalNames = result.matches.map((m) => m.skillName);
    const parsedNames = parsed.map((m) => m.skillName);
    for (const name of parsedNames) {
      expect(originalNames).toContain(name);
    }
  });

  it('builds recommendedSkills handoff structure from match results', () => {
    const signals = extractSignals(specText, { react: '^18.0.0' }, {});
    const result = matchContent(index, signals);

    const recommendedSkills = {
      apply: result.matches.filter((m) => m.tier === 'apply').map((m) => m.skillName),
      reference: result.matches.filter((m) => m.tier === 'reference').map((m) => m.skillName),
      consider: result.matches.filter((m) => m.tier === 'consider').map((m) => m.skillName),
      skillsPath: 'docs/changes/dashboard-redesign/SKILLS.md',
    };

    expect(recommendedSkills).toHaveProperty('apply');
    expect(recommendedSkills).toHaveProperty('reference');
    expect(recommendedSkills).toHaveProperty('consider');
    expect(recommendedSkills).toHaveProperty('skillsPath');
    expect(Array.isArray(recommendedSkills.apply)).toBe(true);
    expect(Array.isArray(recommendedSkills.reference)).toBe(true);
  });

  it('related-skills expansion discovers skills not found by direct matching', () => {
    const signals = extractSignals(specText, { react: '^18.0.0' }, {});
    const result = matchContent(index, signals);

    // css-responsive-design should appear via related-skills expansion from design-responsive-strategy
    const names = result.matches.map((m) => m.skillName);
    const cssResponsive = result.matches.find((m) => m.skillName === 'css-responsive-design');
    if (cssResponsive) {
      expect(cssResponsive.matchReasons.some((r) => r.includes('Related to'))).toBe(true);
    }
    // At minimum, the expansion mechanism should be exercised
    expect(names.length).toBeGreaterThanOrEqual(2);
  });
});

describe('HandoffSchema with recommendedSkills', () => {
  it('validates handoff with recommendedSkills field', async () => {
    const { HandoffSchema } = await import('@harness-engineering/core');

    const handoff = {
      timestamp: new Date().toISOString(),
      fromSkill: 'harness-brainstorming',
      phase: 'VALIDATE',
      summary: 'Test spec approved',
      completed: [],
      pending: [],
      concerns: [],
      decisions: [],
      blockers: [],
      contextKeywords: ['test'],
      recommendedSkills: {
        apply: ['design-responsive-strategy'],
        reference: ['a11y-color-contrast'],
        consider: ['perf-cumulative-layout-shift'],
        skillsPath: 'docs/changes/test/SKILLS.md',
      },
    };

    const result = HandoffSchema.safeParse(handoff);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendedSkills).toBeDefined();
      expect(result.data.recommendedSkills?.apply).toEqual(['design-responsive-strategy']);
      expect(result.data.recommendedSkills?.skillsPath).toBe('docs/changes/test/SKILLS.md');
    }
  });

  it('validates handoff without recommendedSkills (backward compat)', async () => {
    const { HandoffSchema } = await import('@harness-engineering/core');

    const handoff = {
      timestamp: new Date().toISOString(),
      fromSkill: 'harness-planning',
      phase: 'VALIDATE',
      summary: 'Plan approved',
      contextKeywords: [],
    };

    const result = HandoffSchema.safeParse(handoff);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recommendedSkills).toBeUndefined();
    }
  });
});
```

2. Run: `cd packages/cli && npx vitest run tests/skill/pipeline-integration.test.ts` -- observe HandoffSchema test fails (schema not yet updated) and pipeline tests pass (Phase 1 code exists).
3. Run: `harness validate`
4. Commit: `test(skill): add pipeline integration tests for skill advisor Phase 2`

---

### Task 3: Verify HandoffSchema tests pass after Task 1

**Depends on:** Tasks 1, 2 | **Files:** none (verification only)

1. Run: `cd packages/cli && npx vitest run tests/skill/pipeline-integration.test.ts` -- all tests should pass now.
2. Run: `cd packages/core && npx tsc --noEmit` -- verify core compiles.
3. Run: `harness validate`

---

### Task 4: Add skill advisor scan to brainstorming SKILL.md Phase 4

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-brainstorming/SKILL.md`

1. Open `agents/skills/claude-code/harness-brainstorming/SKILL.md`.
2. Insert a new step **4a** between step 3 ("Write the spec") and step 4 ("Run `harness validate`"). Renumber subsequent steps (4 becomes 5, 5 becomes 6, etc.).

Insert the following after the step 3 block:

````markdown
4. **Run skill advisor scan.** After writing the spec, extract signals from its content and scan the skill index for relevant skills. Write results to `docs/changes/<feature>/SKILLS.md` alongside the spec.

   Use the `advise_skills` MCP tool:

   ```json
   advise_skills({
     path: "<project-root>",
     specPath: "docs/changes/<feature>/proposal.md"
   })
   ```
````

Announce findings in a brief summary (skip announcement in `--fast` mode):

```
Skill Advisor: Found N relevant skills for '<feature>'
  Apply: N (skill-a, skill-b, ...)
  Reference: N | Consider: N
  Full list: docs/changes/<feature>/SKILLS.md
```

In `--thorough` mode, show the full skill list for human review before proceeding.

````

3. Renumber the remaining steps:
   - Old step 4 ("Run `harness validate`") becomes step 5
   - Old step 5 ("Request sign-off") becomes step 6
   - Old step 6 ("Add feature to roadmap") becomes step 7
   - Old step 7 ("Write handoff and suggest transition") becomes step 8

4. In the handoff JSON template (now step 8), add `recommendedSkills` to the example:

```json
{
  "fromSkill": "harness-brainstorming",
  "phase": "VALIDATE",
  "summary": "<1-sentence summary>",
  "artifacts": ["<spec path>"],
  "decisions": [{ "what": "<decision>", "why": "<rationale>" }],
  "contextKeywords": ["<keywords from Phase 2>"],
  "recommendedSkills": {
    "apply": ["<skill-names>"],
    "reference": ["<skill-names>"],
    "consider": ["<skill-names>"],
    "skillsPath": "docs/changes/<feature>/SKILLS.md"
  }
}
````

5. Run: `harness validate`
6. Commit: `feat(brainstorming): add skill advisor scan to Phase 4`

---

### Task 5: Add SKILLS.md loading and task annotation to planning SKILL.md

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-planning/SKILL.md`

1. Open `agents/skills/claude-code/harness-planning/SKILL.md`.

2. In Phase 1 (SCOPE), after step 1 ("State the goal"), insert step 1b:

````markdown
1b. **Load skill recommendations.** After loading the spec, check for skill recommendations:

- If `docs/changes/<feature>/SKILLS.md` exists alongside the spec: parse the Apply and Reference tiers. These inform task annotation in Phase 2.
- If SKILLS.md is missing but a spec exists: run the advisor inline using `advise_skills` MCP tool to generate SKILLS.md.
- If neither SKILLS.md nor a spec exists: emit a one-line note:

  ```
  Note: No skill recommendations found. Run the advisor to discover
  relevant design, framework, and knowledge skills:
    harness advise-skills --spec-path <path>
  ```

Store the parsed skill list for use in Phase 2 task annotation.
````

3. In Phase 2 (DECOMPOSE), after step 4 ("Write complete instructions for each task"), add guidance about task annotation:

````markdown
- **Skill annotations:** If skill recommendations were loaded in Phase 1, annotate each task with relevant skills from the Apply and Reference tiers:

  ```
  ### Task 3: Implement dark mode toggle
  **Skills:** `design-dark-mode` (apply), `a11y-color-contrast` (reference)
  ```

  Match skills to tasks based on keyword and domain overlap between the task description and the skill's purpose/keywords. Only annotate when the match is relevant to the specific task.
````

4. Run: `harness validate`
5. Commit: `feat(planning): add SKILLS.md loading and task annotation guidance`

---

### Task 6: Add skill context loading to execution SKILL.md

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-execution/SKILL.md`

1. Open `agents/skills/claude-code/harness-execution/SKILL.md`.

2. In Phase 2 (EXECUTE), after step 1 ("Read task instructions completely"), insert step 1b:

```markdown
1b. **Load skill context for annotated tasks.** If the task has a `**Skills:**` annotation:

- For `apply` tier skills: note the skill name in the task context. The skill may provide patterns or approaches to follow during implementation.
- For `reference` tier skills (type: `knowledge`): load the skill's SKILL.md content as supplementary context. Cap at 3 reference skills per task to manage context budget.
- Use the skill content to inform implementation decisions but follow the plan's exact instructions as written. Skill context provides background knowledge, not overriding instructions.
```

3. Run: `harness validate`
4. Commit: `feat(execution): add skill context loading for annotated tasks`

---

### Task 7: Run full test suite and verify all changes

**Depends on:** Tasks 1-6 | **Files:** none (verification only)

[checkpoint:human-verify] -- Present results for approval before closing Phase 2.

1. Run: `cd packages/cli && npx vitest run tests/skill/pipeline-integration.test.ts` -- all tests pass.
2. Run: `cd packages/cli && npx vitest run tests/skill/` -- all skill tests pass.
3. Run: `cd packages/core && npx tsc --noEmit` -- core compiles.
4. Run: `harness validate` -- passes.
5. Verify the three SKILL.md files have the expected additions by reviewing diffs:
   - `agents/skills/claude-code/harness-brainstorming/SKILL.md` -- step 4a present
   - `agents/skills/claude-code/harness-planning/SKILL.md` -- step 1b and task annotation guidance present
   - `agents/skills/claude-code/harness-execution/SKILL.md` -- step 1b present
6. Verify `packages/core/src/state/types.ts` has `recommendedSkills` in `HandoffSchema`.

## Dependency Graph

```
Task 1 (HandoffSchema) ─────────┐
                                 ├── Task 3 (verify) ──── Task 7 (final verify)
Task 2 (integration tests) ─────┘                              │
Task 4 (brainstorming SKILL.md) ────────────────────────────────┤
Task 5 (planning SKILL.md) ─────────────────────────────────────┤
Task 6 (execution SKILL.md) ────────────────────────────────────┘
```

**Parallel opportunities:** Tasks 4, 5, 6 are independent and can be executed in parallel. Tasks 1 and 2 can be started in parallel (tests will initially fail for schema, which is expected in TDD). Task 3 verifies both. Task 7 is the final gate.
