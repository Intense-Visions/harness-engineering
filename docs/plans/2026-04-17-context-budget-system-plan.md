# Plan: Context Budget System

**Date:** 2026-04-17 | **Spec:** docs/changes/context-budget-system/proposal.md | **Tasks:** 7 | **Time:** ~28 min

## Goal

When skill count approaches 100, the system loads skill content at reduced fidelity via a 5-level progressive loading hierarchy controlled by explicit `context_budget` fields in skill.yaml.

## Observable Truths (Acceptance Criteria)

1. When a skill.yaml includes `context_budget: { max_tokens: 2000, priority: 1 }`, the Zod schema shall accept it without errors
2. When a skill.yaml omits `context_budget`, the system shall assign default budget `{ max_tokens: 4000, priority: 3 }`
3. When skill count < 80, `computeLoadPlan()` shall return all skills at level 5
4. When skill count >= 80, `computeLoadPlan()` shall downgrade lowest-priority skills first
5. When `extractLevel(content, 1)` is called, the system shall return only rules/gates sections
6. When `extractLevel(content, 5)` is called, the system shall return full content unchanged
7. `SkillIndexEntry` shall include `contextBudget` field populated from skill.yaml
8. When `handleRunSkill` loads a skill and skill count >= threshold, the system shall apply progressive loading
9. All existing 2909 tests shall continue to pass
10. New unit tests shall pass for schema validation, load plan computation, section extraction

## File Map

```
MODIFY packages/types/src/skill.ts (add SkillContextBudget, LoadingLevel)
MODIFY packages/types/src/index.ts (export new types)
CREATE packages/core/src/context/section-parser.ts
CREATE packages/core/tests/context/section-parser.test.ts
MODIFY packages/core/src/context/index.ts (export section-parser)
CREATE packages/core/src/context/progressive-loader.ts
CREATE packages/core/tests/context/progressive-loader.test.ts
MODIFY packages/cli/src/skill/schema.ts (add context_budget field)
MODIFY packages/cli/src/skill/index-builder.ts (add contextBudget to entry)
MODIFY packages/cli/src/mcp/tools/skill.ts (wire progressive loading)
CREATE packages/cli/tests/mcp/tools/skill-progressive-loading.test.ts
```

## Tasks

### Task 1: Add SkillContextBudget and LoadingLevel types

**Depends on:** none | **Files:** packages/types/src/skill.ts, packages/types/src/index.ts

1. Add to `packages/types/src/skill.ts` after the `SkillLifecycleHooks` interface:

```typescript
/**
 * Explicit token budget for a skill, controlling progressive loading behavior.
 */
export interface SkillContextBudget {
  /** Maximum tokens this skill should consume when loaded. Range: 100-50000. */
  max_tokens: number;
  /** Loading priority (1=highest/last to degrade, 5=lowest/first to degrade). */
  priority: number;
}

/**
 * Loading level for progressive skill content loading.
 * Level 1 (rules) through Level 5 (history) — each level includes all prior levels.
 */
export type LoadingLevel = 1 | 2 | 3 | 4 | 5;

/** Default context budget applied when skill.yaml omits context_budget. */
export const DEFAULT_SKILL_CONTEXT_BUDGET: SkillContextBudget = {
  max_tokens: 4000,
  priority: 3,
};
```

2. Add to `packages/types/src/index.ts` in the `// --- Skill & Pipeline ---` section:

```typescript
export type { SkillContextBudget, LoadingLevel } from './skill';
export { DEFAULT_SKILL_CONTEXT_BUDGET } from './skill';
```

3. Run: `npx vitest run packages/types/ 2>&1 | tail -5` (verify no breakage)
4. Commit: `feat(types): add SkillContextBudget and LoadingLevel types`

---

### Task 2: Implement section parser (TDD)

**Depends on:** Task 1 | **Files:** packages/core/tests/context/section-parser.test.ts, packages/core/src/context/section-parser.ts, packages/core/src/context/index.ts

1. Create test file `packages/core/tests/context/section-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSections, extractLevel } from '../../src/context/section-parser';

const SAMPLE_SKILL_MD = `# Test Skill

> Summary line

## When to Use

- Use for testing

## Process

### Iron Law

Do the thing.

1. Step one
2. Step two

## Gates

- No skipping
- No vague tasks

## Success Criteria

- Tests pass
- Code compiles

## Session State

| Section | R | W |
| --- | --- | --- |
| data | Y | N |

## Harness Integration

- Run harness validate

## Examples

### Example 1

Some example content here.

## Evidence Requirements

Cite file:line references.

## Escalation

- If stuck, ask for help.

## Rationalizations to Reject

| Rationalization | Reality |
| --- | --- |
| "It's fine" | It's not |
`;

describe('parseSections', () => {
  it('parses all H2 sections from markdown', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const headings = sections.map((s) => s.heading);
    expect(headings).toContain('When to Use');
    expect(headings).toContain('Process');
    expect(headings).toContain('Gates');
    expect(headings).toContain('Success Criteria');
    expect(headings).toContain('Escalation');
  });

  it('classifies Process as level 1 (rules)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const process = sections.find((s) => s.heading === 'Process');
    expect(process?.level).toBe(1);
  });

  it('classifies Gates as level 1 (rules)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const gates = sections.find((s) => s.heading === 'Gates');
    expect(gates?.level).toBe(1);
  });

  it('classifies Success Criteria as level 2 (spec)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const sc = sections.find((s) => s.heading === 'Success Criteria');
    expect(sc?.level).toBe(2);
  });

  it('classifies Examples as level 3 (source)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const ex = sections.find((s) => s.heading === 'Examples');
    expect(ex?.level).toBe(3);
  });

  it('classifies Escalation as level 4 (errors)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const esc = sections.find((s) => s.heading === 'Escalation');
    expect(esc?.level).toBe(4);
  });

  it('classifies Rationalizations to Reject as level 4 (errors)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const rat = sections.find((s) => s.heading === 'Rationalizations to Reject');
    expect(rat?.level).toBe(4);
  });
});

describe('extractLevel', () => {
  it('returns only rules sections at level 1', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 1);
    expect(result).toContain('## Process');
    expect(result).toContain('## Gates');
    expect(result).not.toContain('## Examples');
    expect(result).not.toContain('## Escalation');
  });

  it('returns rules + spec sections at level 2', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 2);
    expect(result).toContain('## Process');
    expect(result).toContain('## Success Criteria');
    expect(result).not.toContain('## Examples');
  });

  it('returns rules + spec + source sections at level 3', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 3);
    expect(result).toContain('## Process');
    expect(result).toContain('## Success Criteria');
    expect(result).toContain('## Examples');
    expect(result).not.toContain('## Escalation');
  });

  it('returns everything except history at level 4', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 4);
    expect(result).toContain('## Escalation');
    expect(result).toContain('## Rationalizations to Reject');
  });

  it('returns full content unchanged at level 5', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 5);
    expect(result).toBe(SAMPLE_SKILL_MD);
  });

  it('preserves title and summary at all levels', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 1);
    expect(result).toContain('# Test Skill');
  });

  it('appends truncation notice when content is reduced', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 1);
    expect(result).toContain('<!-- context-budget: loaded at level 1/5');
  });

  it('handles empty content', () => {
    const result = extractLevel('', 3);
    expect(result).toBe('');
  });

  it('handles content with no H2 sections', () => {
    const result = extractLevel('# Just a title\n\nSome text.', 1);
    expect(result).toContain('# Just a title');
  });
});
```

2. Run test — observe failure: `npx vitest run packages/core/tests/context/section-parser.test.ts`

3. Create `packages/core/src/context/section-parser.ts`:

```typescript
import type { LoadingLevel } from '@harness-engineering/types';

export interface ParsedSection {
  heading: string;
  content: string;
  level: LoadingLevel;
}

/**
 * Section-to-level classification.
 * Level 1 (rules): Core operational instructions
 * Level 2 (spec): Success criteria and integration specs
 * Level 3 (source): Full reference content (default)
 * Level 4 (errors): Error handling and anti-patterns
 */
const SECTION_LEVEL_MAP: Record<string, LoadingLevel> = {
  Process: 1,
  Gates: 1,
  'Iron Law': 1,
  'Success Criteria': 2,
  'Session State': 2,
  'Harness Integration': 2,
  'When to Use': 2,
  Examples: 3,
  'Evidence Requirements': 3,
  'Party Mode': 3,
  'Rigor Levels': 3,
  'Change Specifications': 3,
  Escalation: 4,
  'Rationalizations to Reject': 4,
};

const DEFAULT_LEVEL: LoadingLevel = 3;

/**
 * Parse SKILL.md content into classified sections by H2 heading.
 */
export function parseSections(markdown: string): ParsedSection[] {
  if (!markdown.trim()) return [];

  const lines = markdown.split('\n');
  const sections: ParsedSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      if (currentHeading !== null) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join('\n'),
          level: SECTION_LEVEL_MAP[currentHeading] ?? DEFAULT_LEVEL,
        });
      }
      currentHeading = h2Match[1]!.trim();
      currentLines = [line];
    } else if (currentHeading !== null) {
      currentLines.push(line);
    }
  }

  // Push final section
  if (currentHeading !== null) {
    sections.push({
      heading: currentHeading,
      content: currentLines.join('\n'),
      level: SECTION_LEVEL_MAP[currentHeading] ?? DEFAULT_LEVEL,
    });
  }

  return sections;
}

/**
 * Extract content from SKILL.md at a specific loading level.
 * Each level includes all content from previous levels (cumulative).
 * Level 5 returns the full content unchanged.
 */
export function extractLevel(content: string, level: LoadingLevel): string {
  if (!content.trim()) return '';
  if (level === 5) return content;

  const lines = content.split('\n');

  // Extract preamble (everything before first ## heading)
  const firstH2Index = lines.findIndex((line) => /^## /.test(line));
  const preamble = firstH2Index === -1 ? content : lines.slice(0, firstH2Index).join('\n');

  if (firstH2Index === -1) {
    return content;
  }

  const sections = parseSections(content);
  const includedSections = sections.filter((s) => s.level <= level);

  if (includedSections.length === 0) {
    return preamble.trimEnd() + '\n';
  }

  const body = includedSections.map((s) => s.content).join('\n\n');
  const result = preamble.trimEnd() + '\n\n' + body.trimEnd();

  return (
    result +
    `\n\n<!-- context-budget: loaded at level ${level}/5 (${includedSections.length}/${sections.length} sections) -->\n`
  );
}
```

4. Add exports to `packages/core/src/context/index.ts`:

```typescript
/**
 * Section parser for progressive skill content loading.
 */
export { parseSections, extractLevel } from './section-parser';
export type { ParsedSection } from './section-parser';
```

5. Run test — observe pass: `npx vitest run packages/core/tests/context/section-parser.test.ts`
6. Commit: `feat(core): implement section parser for progressive skill loading`

---

### Task 3: Implement progressive loader (TDD)

**Depends on:** Task 1 | **Files:** packages/core/tests/context/progressive-loader.test.ts, packages/core/src/context/progressive-loader.ts, packages/core/src/context/index.ts

1. Create test file `packages/core/tests/context/progressive-loader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeLoadPlan, DEFAULT_LOADER_CONFIG } from '../../src/context/progressive-loader';
import type { SkillContextBudget } from '@harness-engineering/types';

function makeSkills(
  count: number,
  budget?: Partial<SkillContextBudget>
): Array<{ name: string; budget?: SkillContextBudget }> {
  return Array.from({ length: count }, (_, i) => ({
    name: `skill-${i}`,
    budget: budget
      ? { max_tokens: budget.max_tokens ?? 4000, priority: budget.priority ?? 3 }
      : undefined,
  }));
}

describe('computeLoadPlan', () => {
  it('returns all skills at level 5 when below threshold', () => {
    const skills = makeSkills(10);
    const plan = computeLoadPlan(skills, { totalBudget: 100000, skillCountThreshold: 80 });
    expect(plan).toHaveLength(10);
    expect(plan.every((p) => p.level === 5)).toBe(true);
  });

  it('downgrades skills when at threshold', () => {
    const skills = makeSkills(80);
    const plan = computeLoadPlan(skills, { totalBudget: 100000, skillCountThreshold: 80 });
    expect(plan).toHaveLength(80);
    // Some skills should be downgraded since 80 * 4000 = 320000 > 100000
    const degraded = plan.filter((p) => p.level < 5);
    expect(degraded.length).toBeGreaterThan(0);
  });

  it('downgrades lowest-priority skills first', () => {
    const skills = [
      { name: 'high-priority', budget: { max_tokens: 4000, priority: 1 } },
      { name: 'low-priority', budget: { max_tokens: 4000, priority: 5 } },
    ];
    // Very tight budget forces degradation
    const plan = computeLoadPlan(skills, { totalBudget: 4000, skillCountThreshold: 1 });
    const high = plan.find((p) => p.skillName === 'high-priority')!;
    const low = plan.find((p) => p.skillName === 'low-priority')!;
    expect(high.level).toBeGreaterThanOrEqual(low.level);
  });

  it('assigns default budget when skill has no context_budget', () => {
    const skills = [{ name: 'no-budget' }];
    const plan = computeLoadPlan(skills, { totalBudget: 100000, skillCountThreshold: 1 });
    expect(plan[0]!.allocatedTokens).toBe(4000);
    expect(plan[0]!.level).toBe(5);
  });

  it('respects explicit max_tokens', () => {
    const skills = [{ name: 'small', budget: { max_tokens: 500, priority: 3 } }];
    const plan = computeLoadPlan(skills, { totalBudget: 100000, skillCountThreshold: 1 });
    expect(plan[0]!.allocatedTokens).toBeLessThanOrEqual(500);
  });

  it('never goes below level 1', () => {
    const skills = makeSkills(200);
    const plan = computeLoadPlan(skills, { totalBudget: 1000, skillCountThreshold: 1 });
    expect(plan.every((p) => p.level >= 1)).toBe(true);
  });

  it('returns empty array for empty input', () => {
    const plan = computeLoadPlan([], { totalBudget: 100000, skillCountThreshold: 80 });
    expect(plan).toEqual([]);
  });

  it('uses default config when not provided', () => {
    const skills = makeSkills(10);
    const plan = computeLoadPlan(skills);
    expect(plan).toHaveLength(10);
    expect(plan.every((p) => p.level === 5)).toBe(true);
  });
});

describe('DEFAULT_LOADER_CONFIG', () => {
  it('has threshold of 80', () => {
    expect(DEFAULT_LOADER_CONFIG.skillCountThreshold).toBe(80);
  });

  it('has totalBudget of 200000', () => {
    expect(DEFAULT_LOADER_CONFIG.totalBudget).toBe(200000);
  });
});
```

2. Run test — observe failure: `npx vitest run packages/core/tests/context/progressive-loader.test.ts`

3. Create `packages/core/src/context/progressive-loader.ts`:

```typescript
import type { SkillContextBudget, LoadingLevel } from '@harness-engineering/types';
import { DEFAULT_SKILL_CONTEXT_BUDGET } from '@harness-engineering/types';

export interface LoaderConfig {
  /** Total token budget across all skills. */
  totalBudget: number;
  /** Skill count at which progressive loading activates. */
  skillCountThreshold: number;
}

export const DEFAULT_LOADER_CONFIG: LoaderConfig = {
  totalBudget: 200_000,
  skillCountThreshold: 80,
};

export interface SkillLoadPlan {
  skillName: string;
  level: LoadingLevel;
  allocatedTokens: number;
}

/** Fraction of max_tokens allocated at each level. */
const LEVEL_FRACTIONS: Record<LoadingLevel, number> = {
  1: 0.2,
  2: 0.4,
  3: 0.7,
  4: 0.9,
  5: 1.0,
};

/**
 * Compute a load plan for a set of skills given a total token budget.
 *
 * When skill count is below the threshold, all skills load at level 5 (full).
 * When at or above threshold, skills are sorted by priority (lowest priority
 * first = first to degrade) and levels are reduced until the total fits
 * within the budget.
 */
export function computeLoadPlan(
  skills: Array<{ name: string; budget?: SkillContextBudget }>,
  config: LoaderConfig = DEFAULT_LOADER_CONFIG
): SkillLoadPlan[] {
  if (skills.length === 0) return [];

  // Resolve effective budgets
  const entries = skills.map((s) => ({
    name: s.name,
    maxTokens: s.budget?.max_tokens ?? DEFAULT_SKILL_CONTEXT_BUDGET.max_tokens,
    priority: s.budget?.priority ?? DEFAULT_SKILL_CONTEXT_BUDGET.priority,
    level: 5 as LoadingLevel,
  }));

  // Below threshold: all at level 5
  if (entries.length < config.skillCountThreshold) {
    return entries.map((e) => ({
      skillName: e.name,
      level: 5 as LoadingLevel,
      allocatedTokens: e.maxTokens,
    }));
  }

  // Sort by priority descending (highest number = lowest priority = degrade first)
  const sorted = [...entries].sort((a, b) => b.priority - a.priority);

  // Iteratively downgrade lowest-priority skills until budget fits
  let totalTokens = sorted.reduce((sum, e) => sum + e.maxTokens * LEVEL_FRACTIONS[e.level], 0);

  for (const entry of sorted) {
    if (totalTokens <= config.totalBudget) break;

    while (entry.level > 1 && totalTokens > config.totalBudget) {
      const oldAlloc = entry.maxTokens * LEVEL_FRACTIONS[entry.level];
      entry.level = (entry.level - 1) as LoadingLevel;
      const newAlloc = entry.maxTokens * LEVEL_FRACTIONS[entry.level];
      totalTokens -= oldAlloc - newAlloc;
    }
  }

  return sorted.map((e) => ({
    skillName: e.name,
    level: e.level,
    allocatedTokens: Math.floor(e.maxTokens * LEVEL_FRACTIONS[e.level]),
  }));
}
```

4. Add exports to `packages/core/src/context/index.ts`:

```typescript
/**
 * Progressive skill loading with token budget management.
 */
export { computeLoadPlan, DEFAULT_LOADER_CONFIG } from './progressive-loader';
export type { LoaderConfig, SkillLoadPlan } from './progressive-loader';
```

5. Run test — observe pass: `npx vitest run packages/core/tests/context/progressive-loader.test.ts`
6. Commit: `feat(core): implement progressive loader for skill context budgets`

---

### Task 4: Add context_budget to skill.yaml Zod schema

**Depends on:** Task 1 | **Files:** packages/cli/src/skill/schema.ts

1. Add `SkillContextBudgetSchema` before `SkillMetadataSchema` in `packages/cli/src/skill/schema.ts`:

```typescript
const SkillContextBudgetSchema = z.object({
  max_tokens: z.number().int().min(100).max(50000).default(4000),
  priority: z.number().int().min(1).max(5).default(3),
});
```

2. Add `context_budget` field to the `SkillMetadataSchema` object (after `addresses`):

```typescript
context_budget: SkillContextBudgetSchema.optional(),
```

3. Add type export at bottom of file:

```typescript
export type SkillContextBudgetParsed = z.infer<typeof SkillContextBudgetSchema>;
```

4. Run: `npx vitest run packages/cli/tests/ 2>&1 | tail -10` (verify no breakage)
5. Commit: `feat(cli): add context_budget field to skill.yaml schema`

---

### Task 5: Extend SkillIndexEntry with contextBudget

**Depends on:** Task 4 | **Files:** packages/cli/src/skill/index-builder.ts

1. Add to `SkillIndexEntry` interface:

```typescript
contextBudget?: { maxTokens: number; priority: number };
```

2. In `parseSkillEntry`, after `dependsOn` assignment, add:

```typescript
...(meta.context_budget && {
  contextBudget: {
    maxTokens: meta.context_budget.max_tokens,
    priority: meta.context_budget.priority,
  },
}),
```

3. Run: `npx vitest run packages/cli/tests/ 2>&1 | tail -10`
4. Commit: `feat(cli): populate contextBudget in skill index entries`

---

### Task 6: Wire progressive loading into handleRunSkill

**Depends on:** Tasks 2, 3, 5 | **Files:** packages/cli/src/mcp/tools/skill.ts

1. Add imports at top of `packages/cli/src/mcp/tools/skill.ts`:

```typescript
import { extractLevel } from '@harness-engineering/core';
import { computeLoadPlan } from '@harness-engineering/core';
import { DEFAULT_SKILL_CONTEXT_BUDGET } from '@harness-engineering/types';
```

2. In `handleRunSkill`, after the existing content loading and before the `resultToMcpResponse(Ok(content))` return, add progressive loading logic:

```typescript
// Progressive loading: when skill count approaches threshold, reduce content depth
try {
  const projectRoot = input.path ? sanitizePath(input.path) : process.cwd();
  const platform = 'claude-code';
  const index = loadOrRebuildIndex(platform, projectRoot);
  const skillCount = Object.keys(index.skills).length;
  const indexEntry = index.skills[input.skill];
  const budget = indexEntry?.contextBudget
    ? {
        max_tokens: indexEntry.contextBudget.maxTokens,
        priority: indexEntry.contextBudget.priority,
      }
    : DEFAULT_SKILL_CONTEXT_BUDGET;

  const plan = computeLoadPlan(
    Object.entries(index.skills).map(([name, entry]) => ({
      name,
      budget: entry.contextBudget
        ? { max_tokens: entry.contextBudget.maxTokens, priority: entry.contextBudget.priority }
        : undefined,
    }))
  );

  const skillPlan = plan.find((p) => p.skillName === input.skill);
  if (skillPlan && skillPlan.level < 5) {
    content = extractLevel(content, skillPlan.level);
  }
} catch {
  // Progressive loading failure must never block skill loading
}
```

3. Run: `npx vitest run packages/cli/tests/ 2>&1 | tail -10`
4. Commit: `feat(cli): wire progressive loading into skill handler`

---

### Task 7: Integration test for progressive loading

**Depends on:** Task 6 | **Files:** packages/cli/tests/mcp/tools/skill-progressive-loading.test.ts

1. Create `packages/cli/tests/mcp/tools/skill-progressive-loading.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractLevel, computeLoadPlan } from '@harness-engineering/core';
import type { LoadingLevel } from '@harness-engineering/types';

describe('progressive loading integration', () => {
  const sampleContent = [
    '# My Skill',
    '',
    '> Brief description',
    '',
    '## Process',
    '',
    '1. Do step one',
    '2. Do step two',
    '',
    '## Gates',
    '',
    '- Must not skip',
    '',
    '## Success Criteria',
    '',
    '- Tests pass',
    '',
    '## Examples',
    '',
    '### Example 1',
    '',
    'Example content.',
    '',
    '## Escalation',
    '',
    '- Ask for help if stuck',
    '',
  ].join('\n');

  it('level 1 returns only rules sections', () => {
    const result = extractLevel(sampleContent, 1);
    expect(result).toContain('## Process');
    expect(result).toContain('## Gates');
    expect(result).not.toContain('## Success Criteria');
    expect(result).not.toContain('## Examples');
    expect(result).not.toContain('## Escalation');
  });

  it('level 3 includes source but not errors', () => {
    const result = extractLevel(sampleContent, 3);
    expect(result).toContain('## Examples');
    expect(result).not.toContain('## Escalation');
  });

  it('level 5 returns everything', () => {
    const result = extractLevel(sampleContent, 5);
    expect(result).toBe(sampleContent);
  });

  it('load plan degrades under pressure', () => {
    const skills = Array.from({ length: 100 }, (_, i) => ({
      name: `skill-${i}`,
      budget: { max_tokens: 4000, priority: i < 10 ? 1 : 5 },
    }));

    const plan = computeLoadPlan(skills, {
      totalBudget: 100000,
      skillCountThreshold: 80,
    });

    const highPriority = plan.filter((p) => p.skillName.match(/skill-[0-9]$/));
    const lowPriority = plan.filter((p) => !p.skillName.match(/skill-[0-9]$/));

    const avgHighLevel = highPriority.reduce((sum, p) => sum + p.level, 0) / highPriority.length;
    const avgLowLevel = lowPriority.reduce((sum, p) => sum + p.level, 0) / lowPriority.length;

    expect(avgHighLevel).toBeGreaterThan(avgLowLevel);
  });
});
```

2. Run: `npx vitest run packages/cli/tests/mcp/tools/skill-progressive-loading.test.ts`
3. Run full test suite: `npx vitest run 2>&1 | tail -10`
4. Commit: `test(cli): add integration tests for progressive loading`
