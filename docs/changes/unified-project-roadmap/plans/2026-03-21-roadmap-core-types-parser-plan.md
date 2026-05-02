# Plan: Roadmap Core Types and Parser

**Date:** 2026-03-21
**Spec:** docs/changes/unified-project-roadmap/proposal.md (Phase 1)
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

The system can parse a `docs/roadmap.md` file into structured `Roadmap` types and serialize those types back to identical markdown, with round-trip fidelity.

## Observable Truths (Acceptance Criteria)

1. `packages/types/src/index.ts` exports `FeatureStatus`, `RoadmapFeature`, `RoadmapMilestone`, `RoadmapFrontmatter`, and `Roadmap` types.
2. `packages/core/src/roadmap/parse.ts` exports `parseRoadmap(markdown: string): Result<Roadmap>` that parses valid roadmap markdown into a `Roadmap` object.
3. When `parseRoadmap` receives markdown with YAML frontmatter, milestones, features, and a backlog section, the returned `Roadmap` object contains all data with correct types.
4. When `parseRoadmap` receives invalid markdown (missing frontmatter, malformed feature), it returns `Err` with a descriptive message.
5. `packages/core/src/roadmap/serialize.ts` exports `serializeRoadmap(roadmap: Roadmap): string` that produces valid roadmap markdown.
6. When a valid roadmap markdown string is parsed and then serialized, the output is byte-identical to the input (round-trip fidelity).
7. `cd packages/core && pnpm exec vitest run tests/roadmap/parse.test.ts` passes with 8+ tests.
8. `cd packages/core && pnpm exec vitest run tests/roadmap/serialize.test.ts` passes with 5+ tests.
9. `harness validate` passes.

## File Map

- MODIFY `packages/types/src/index.ts` (add roadmap types inline)
- CREATE `packages/core/src/roadmap/parse.ts`
- CREATE `packages/core/src/roadmap/serialize.ts`
- CREATE `packages/core/src/roadmap/index.ts`
- MODIFY `packages/core/src/index.ts` (add roadmap barrel export)
- CREATE `packages/core/tests/roadmap/parse.test.ts`
- CREATE `packages/core/tests/roadmap/serialize.test.ts`
- CREATE `packages/core/tests/roadmap/fixtures.ts` (shared test data)

## Tasks

### Task 1: Define roadmap types in packages/types

**Depends on:** none
**Files:** `packages/types/src/index.ts`

1. Open `packages/types/src/index.ts`.
2. Append the following types at the end of the file (after the `SkillLifecycleHooks` interface):

```typescript
// --- Roadmap Types ---

/**
 * Valid statuses for a roadmap feature.
 */
export type FeatureStatus = 'backlog' | 'planned' | 'in-progress' | 'done' | 'blocked';

/**
 * A feature entry in the project roadmap.
 */
export interface RoadmapFeature {
  /** Feature name (from the H3 heading, without "Feature:" prefix) */
  name: string;
  /** Current status */
  status: FeatureStatus;
  /** Relative path to the spec file, or null if none */
  spec: string | null;
  /** Relative paths to plan files */
  plans: string[];
  /** Names of blocking features (textual references) */
  blockedBy: string[];
  /** One-line summary */
  summary: string;
}

/**
 * A milestone grouping in the roadmap. The special "Backlog" milestone
 * has `isBacklog: true` and appears as `## Backlog` instead of `## Milestone: <name>`.
 */
export interface RoadmapMilestone {
  /** Milestone name (e.g., "MVP Release") or "Backlog" */
  name: string;
  /** True for the special Backlog section */
  isBacklog: boolean;
  /** Features in this milestone, in document order */
  features: RoadmapFeature[];
}

/**
 * YAML frontmatter of the roadmap file.
 */
export interface RoadmapFrontmatter {
  /** Project name */
  project: string;
  /** Schema version (currently 1) */
  version: number;
  /** ISO timestamp of last automated sync */
  lastSynced: string;
  /** ISO timestamp of last manual edit */
  lastManualEdit: string;
}

/**
 * Parsed roadmap document.
 */
export interface Roadmap {
  /** Parsed frontmatter */
  frontmatter: RoadmapFrontmatter;
  /** Milestones in document order (including Backlog) */
  milestones: RoadmapMilestone[];
}
```

3. Run: `cd packages/types && pnpm exec tsc --noEmit`
4. Run: `harness validate`
5. Commit: `feat(types): add Roadmap, Milestone, Feature, FeatureStatus types`

---

### Task 2: Create shared test fixtures

**Depends on:** Task 1
**Files:** `packages/core/tests/roadmap/fixtures.ts`

1. Create directory: `mkdir -p packages/core/tests/roadmap`
2. Create `packages/core/tests/roadmap/fixtures.ts`:

```typescript
import type { Roadmap } from '@harness-engineering/types';

/**
 * A complete valid roadmap markdown string matching the spec example.
 * Used by both parse and serialize tests. Any change here must keep
 * parse and serialize tests in sync.
 */
export const VALID_ROADMAP_MD = `---
project: harness-engineering
version: 1
last_synced: 2026-03-21T14:30:00Z
last_manual_edit: 2026-03-21T15:00:00Z
---

# Project Roadmap

## Milestone: MVP Release

### Feature: Notification System
- **Status:** in-progress
- **Spec:** docs/changes/notification-system/proposal.md
- **Plans:** docs/plans/2026-03-14-notification-phase-1-plan.md, docs/plans/2026-03-15-notification-phase-2-plan.md
- **Blocked by:** \u2014
- **Summary:** Email and in-app notifications with polling

### Feature: User Auth Revamp
- **Status:** planned
- **Spec:** docs/changes/auth-revamp/proposal.md
- **Plans:** \u2014
- **Blocked by:** Notification System
- **Summary:** OAuth2 migration for compliance requirements

## Milestone: Q3 Hardening

### Feature: Performance Baselines
- **Status:** planned
- **Spec:** \u2014
- **Plans:** \u2014
- **Blocked by:** \u2014
- **Summary:** Establish and enforce perf budgets across critical paths

## Backlog

### Feature: Push Notifications
- **Status:** backlog
- **Spec:** \u2014
- **Plans:** \u2014
- **Blocked by:** \u2014
- **Summary:** Extend notification system with WebSocket push
`;

/**
 * The expected parsed Roadmap object for VALID_ROADMAP_MD.
 */
export const VALID_ROADMAP: Roadmap = {
  frontmatter: {
    project: 'harness-engineering',
    version: 1,
    lastSynced: '2026-03-21T14:30:00Z',
    lastManualEdit: '2026-03-21T15:00:00Z',
  },
  milestones: [
    {
      name: 'MVP Release',
      isBacklog: false,
      features: [
        {
          name: 'Notification System',
          status: 'in-progress',
          spec: 'docs/changes/notification-system/proposal.md',
          plans: [
            'docs/plans/2026-03-14-notification-phase-1-plan.md',
            'docs/plans/2026-03-15-notification-phase-2-plan.md',
          ],
          blockedBy: [],
          summary: 'Email and in-app notifications with polling',
        },
        {
          name: 'User Auth Revamp',
          status: 'planned',
          spec: 'docs/changes/auth-revamp/proposal.md',
          plans: [],
          blockedBy: ['Notification System'],
          summary: 'OAuth2 migration for compliance requirements',
        },
      ],
    },
    {
      name: 'Q3 Hardening',
      isBacklog: false,
      features: [
        {
          name: 'Performance Baselines',
          status: 'planned',
          spec: null,
          plans: [],
          blockedBy: [],
          summary: 'Establish and enforce perf budgets across critical paths',
        },
      ],
    },
    {
      name: 'Backlog',
      isBacklog: true,
      features: [
        {
          name: 'Push Notifications',
          status: 'backlog',
          spec: null,
          plans: [],
          blockedBy: [],
          summary: 'Extend notification system with WebSocket push',
        },
      ],
    },
  ],
};

/**
 * Roadmap markdown with missing frontmatter.
 */
export const NO_FRONTMATTER_MD = `# Project Roadmap

## Milestone: MVP Release

### Feature: Something
- **Status:** planned
- **Spec:** \u2014
- **Plans:** \u2014
- **Blocked by:** \u2014
- **Summary:** A feature
`;

/**
 * Roadmap markdown with an invalid status value.
 */
export const INVALID_STATUS_MD = `---
project: test
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Project Roadmap

## Milestone: M1

### Feature: Bad Status
- **Status:** cancelled
- **Spec:** \u2014
- **Plans:** \u2014
- **Blocked by:** \u2014
- **Summary:** Has an invalid status
`;

/**
 * Minimal valid roadmap with only a backlog section and no features.
 */
export const EMPTY_BACKLOG_MD = `---
project: empty-project
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Project Roadmap

## Backlog
`;

export const EMPTY_BACKLOG: Roadmap = {
  frontmatter: {
    project: 'empty-project',
    version: 1,
    lastSynced: '2026-01-01T00:00:00Z',
    lastManualEdit: '2026-01-01T00:00:00Z',
  },
  milestones: [
    {
      name: 'Backlog',
      isBacklog: true,
      features: [],
    },
  ],
};
```

3. Run: `cd packages/core && pnpm exec tsc --noEmit` (verify types resolve)
4. Run: `harness validate`
5. Commit: `test(roadmap): add shared test fixtures for parse and serialize`

---

### Task 3: Write parse tests (red phase)

**Depends on:** Task 2
**Files:** `packages/core/tests/roadmap/parse.test.ts`

1. Create `packages/core/tests/roadmap/parse.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseRoadmap } from '../../src/roadmap/parse';
import {
  VALID_ROADMAP_MD,
  VALID_ROADMAP,
  NO_FRONTMATTER_MD,
  INVALID_STATUS_MD,
  EMPTY_BACKLOG_MD,
  EMPTY_BACKLOG,
} from './fixtures';

describe('parseRoadmap()', () => {
  describe('valid input', () => {
    it('parses frontmatter correctly', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.frontmatter).toEqual(VALID_ROADMAP.frontmatter);
    });

    it('parses milestones in document order', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.milestones).toHaveLength(3);
      expect(result.value.milestones.map((m) => m.name)).toEqual([
        'MVP Release',
        'Q3 Hardening',
        'Backlog',
      ]);
    });

    it('marks Backlog milestone with isBacklog: true', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const backlog = result.value.milestones[2];
      expect(backlog?.isBacklog).toBe(true);
      expect(backlog?.name).toBe('Backlog');
    });

    it('parses feature fields correctly', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const notif = result.value.milestones[0]?.features[0];
      expect(notif?.name).toBe('Notification System');
      expect(notif?.status).toBe('in-progress');
      expect(notif?.spec).toBe('docs/changes/notification-system/proposal.md');
      expect(notif?.plans).toHaveLength(2);
      expect(notif?.blockedBy).toEqual([]);
      expect(notif?.summary).toBe('Email and in-app notifications with polling');
    });

    it('parses blocked-by references', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const auth = result.value.milestones[0]?.features[1];
      expect(auth?.blockedBy).toEqual(['Notification System']);
    });

    it('treats em-dash as null/empty for spec, plans, blockedBy', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const perf = result.value.milestones[1]?.features[0];
      expect(perf?.spec).toBeNull();
      expect(perf?.plans).toEqual([]);
      expect(perf?.blockedBy).toEqual([]);
    });

    it('parses the full example to match expected object', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(VALID_ROADMAP);
    });

    it('parses an empty backlog-only roadmap', () => {
      const result = parseRoadmap(EMPTY_BACKLOG_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(EMPTY_BACKLOG);
    });
  });

  describe('invalid input', () => {
    it('returns Err when frontmatter is missing', () => {
      const result = parseRoadmap(NO_FRONTMATTER_MD);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/frontmatter/i);
    });

    it('returns Err when a feature has an invalid status', () => {
      const result = parseRoadmap(INVALID_STATUS_MD);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/status/i);
    });
  });
});
```

2. Run: `cd packages/core && pnpm exec vitest run tests/roadmap/parse.test.ts`
3. Observe: failure (module `../../src/roadmap/parse` does not exist)
4. Run: `harness validate`
5. Commit: `test(roadmap): add parse tests (red phase)`

---

### Task 4: Implement parseRoadmap (green phase)

**Depends on:** Task 3
**Files:** `packages/core/src/roadmap/parse.ts`

1. Create directory: `mkdir -p packages/core/src/roadmap`
2. Create `packages/core/src/roadmap/parse.ts`:

```typescript
import type {
  Roadmap,
  RoadmapFrontmatter,
  RoadmapMilestone,
  RoadmapFeature,
  FeatureStatus,
  Result,
} from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'backlog',
  'planned',
  'in-progress',
  'done',
  'blocked',
]);

const EM_DASH = '\u2014';

/**
 * Parse a roadmap markdown string into a structured Roadmap object.
 * Returns Result<Roadmap> — Err on invalid input.
 */
export function parseRoadmap(markdown: string): Result<Roadmap> {
  // --- Frontmatter ---
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return Err(new Error('Missing or malformed YAML frontmatter'));
  }

  const fmResult = parseFrontmatter(fmMatch[1]!);
  if (!fmResult.ok) return fmResult;

  // --- Body (after frontmatter) ---
  const body = markdown.slice(fmMatch[0].length);
  const milestonesResult = parseMilestones(body);
  if (!milestonesResult.ok) return milestonesResult;

  return Ok({
    frontmatter: fmResult.value,
    milestones: milestonesResult.value,
  });
}

function parseFrontmatter(raw: string): Result<RoadmapFrontmatter> {
  const lines = raw.split('\n');
  const map = new Map<string, string>();
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    map.set(key, val);
  }

  const project = map.get('project');
  const versionStr = map.get('version');
  const lastSynced = map.get('last_synced');
  const lastManualEdit = map.get('last_manual_edit');

  if (!project || !versionStr || !lastSynced || !lastManualEdit) {
    return Err(
      new Error(
        'Frontmatter missing required fields: project, version, last_synced, last_manual_edit'
      )
    );
  }

  const version = parseInt(versionStr, 10);
  if (isNaN(version)) {
    return Err(new Error('Frontmatter version must be a number'));
  }

  return Ok({ project, version, lastSynced, lastManualEdit });
}

function parseMilestones(body: string): Result<RoadmapMilestone[]> {
  const milestones: RoadmapMilestone[] = [];
  // Split on H2 headings
  const h2Pattern = /^## (.+)$/gm;
  const h2Matches: Array<{ heading: string; startIndex: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = h2Pattern.exec(body)) !== null) {
    h2Matches.push({ heading: match[1]!, startIndex: match.index });
  }

  for (let i = 0; i < h2Matches.length; i++) {
    const h2 = h2Matches[i]!;
    const nextStart = i + 1 < h2Matches.length ? h2Matches[i + 1]!.startIndex : body.length;
    const sectionBody = body.slice(h2.startIndex + h2.heading.length + 4, nextStart);

    const isBacklog = h2.heading === 'Backlog';
    const milestoneName = isBacklog ? 'Backlog' : h2.heading.replace(/^Milestone:\s*/, '');

    const featuresResult = parseFeatures(sectionBody);
    if (!featuresResult.ok) return featuresResult;

    milestones.push({
      name: milestoneName,
      isBacklog,
      features: featuresResult.value,
    });
  }

  return Ok(milestones);
}

function parseFeatures(sectionBody: string): Result<RoadmapFeature[]> {
  const features: RoadmapFeature[] = [];
  // Split on H3 headings
  const h3Pattern = /^### Feature: (.+)$/gm;
  const h3Matches: Array<{ name: string; startIndex: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = h3Pattern.exec(sectionBody)) !== null) {
    h3Matches.push({ name: match[1]!, startIndex: match.index });
  }

  for (let i = 0; i < h3Matches.length; i++) {
    const h3 = h3Matches[i]!;
    const nextStart = i + 1 < h3Matches.length ? h3Matches[i + 1]!.startIndex : sectionBody.length;
    const featureBody = sectionBody.slice(
      h3.startIndex + `### Feature: ${h3.name}`.length,
      nextStart
    );

    const featureResult = parseFeatureFields(h3.name, featureBody);
    if (!featureResult.ok) return featureResult;
    features.push(featureResult.value);
  }

  return Ok(features);
}

function parseFeatureFields(name: string, body: string): Result<RoadmapFeature> {
  const fieldMap = new Map<string, string>();
  const fieldPattern = /^- \*\*(.+?):\*\* (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = fieldPattern.exec(body)) !== null) {
    fieldMap.set(match[1]!, match[2]!);
  }

  const statusRaw = fieldMap.get('Status');
  if (!statusRaw || !VALID_STATUSES.has(statusRaw)) {
    return Err(
      new Error(
        `Feature "${name}" has invalid status: "${statusRaw ?? '(missing)'}". ` +
          `Valid statuses: ${[...VALID_STATUSES].join(', ')}`
      )
    );
  }
  const status = statusRaw as FeatureStatus;

  const specRaw = fieldMap.get('Spec') ?? EM_DASH;
  const spec = specRaw === EM_DASH ? null : specRaw;

  const plansRaw = fieldMap.get('Plans') ?? EM_DASH;
  const plans = plansRaw === EM_DASH ? [] : plansRaw.split(',').map((p) => p.trim());

  const blockedByRaw = fieldMap.get('Blocked by') ?? EM_DASH;
  const blockedBy = blockedByRaw === EM_DASH ? [] : blockedByRaw.split(',').map((b) => b.trim());

  const summary = fieldMap.get('Summary') ?? '';

  return Ok({ name, status, spec, plans, blockedBy, summary });
}
```

3. Run: `cd packages/core && pnpm exec vitest run tests/roadmap/parse.test.ts`
4. Observe: all tests pass
5. Run: `harness validate`
6. Commit: `feat(roadmap): implement parseRoadmap with frontmatter and feature parsing`

---

### Task 5: Write serialize tests and implement serializeRoadmap (TDD)

**Depends on:** Task 4
**Files:** `packages/core/tests/roadmap/serialize.test.ts`, `packages/core/src/roadmap/serialize.ts`

1. Create `packages/core/tests/roadmap/serialize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import { VALID_ROADMAP, VALID_ROADMAP_MD, EMPTY_BACKLOG, EMPTY_BACKLOG_MD } from './fixtures';

describe('serializeRoadmap()', () => {
  it('serializes a full roadmap to expected markdown', () => {
    const result = serializeRoadmap(VALID_ROADMAP);
    expect(result).toBe(VALID_ROADMAP_MD);
  });

  it('serializes an empty backlog roadmap', () => {
    const result = serializeRoadmap(EMPTY_BACKLOG);
    expect(result).toBe(EMPTY_BACKLOG_MD);
  });

  it('uses em-dash for null spec', () => {
    const result = serializeRoadmap(VALID_ROADMAP);
    // Performance Baselines has null spec
    expect(result).toContain('- **Spec:** \u2014');
  });

  it('uses em-dash for empty plans array', () => {
    const result = serializeRoadmap(VALID_ROADMAP);
    // User Auth Revamp has empty plans
    expect(result).toContain('- **Plans:** \u2014');
  });

  it('round-trips: parse then serialize produces identical output', () => {
    const parseResult = parseRoadmap(VALID_ROADMAP_MD);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    const serialized = serializeRoadmap(parseResult.value);
    expect(serialized).toBe(VALID_ROADMAP_MD);
  });

  it('round-trips the empty backlog case', () => {
    const parseResult = parseRoadmap(EMPTY_BACKLOG_MD);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    const serialized = serializeRoadmap(parseResult.value);
    expect(serialized).toBe(EMPTY_BACKLOG_MD);
  });
});
```

2. Run: `cd packages/core && pnpm exec vitest run tests/roadmap/serialize.test.ts`
3. Observe: failure (module `../../src/roadmap/serialize` does not exist)
4. Create `packages/core/src/roadmap/serialize.ts`:

```typescript
import type { Roadmap, RoadmapMilestone, RoadmapFeature } from '@harness-engineering/types';

const EM_DASH = '\u2014';

/**
 * Serialize a Roadmap object to markdown string.
 * Produces output that round-trips with parseRoadmap.
 */
export function serializeRoadmap(roadmap: Roadmap): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`project: ${roadmap.frontmatter.project}`);
  lines.push(`version: ${roadmap.frontmatter.version}`);
  lines.push(`last_synced: ${roadmap.frontmatter.lastSynced}`);
  lines.push(`last_manual_edit: ${roadmap.frontmatter.lastManualEdit}`);
  lines.push('---');
  lines.push('');
  lines.push('# Project Roadmap');

  for (const milestone of roadmap.milestones) {
    lines.push('');
    lines.push(serializeMilestoneHeading(milestone));
    for (const feature of milestone.features) {
      lines.push('');
      lines.push(...serializeFeature(feature));
    }
  }

  lines.push('');
  return lines.join('\n');
}

function serializeMilestoneHeading(milestone: RoadmapMilestone): string {
  return milestone.isBacklog ? '## Backlog' : `## Milestone: ${milestone.name}`;
}

function serializeFeature(feature: RoadmapFeature): string[] {
  const spec = feature.spec ?? EM_DASH;
  const plans = feature.plans.length > 0 ? feature.plans.join(', ') : EM_DASH;
  const blockedBy = feature.blockedBy.length > 0 ? feature.blockedBy.join(', ') : EM_DASH;

  return [
    `### Feature: ${feature.name}`,
    `- **Status:** ${feature.status}`,
    `- **Spec:** ${spec}`,
    `- **Plans:** ${plans}`,
    `- **Blocked by:** ${blockedBy}`,
    `- **Summary:** ${feature.summary}`,
  ];
}
```

5. Run: `cd packages/core && pnpm exec vitest run tests/roadmap/serialize.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(roadmap): implement serializeRoadmap with round-trip fidelity`

---

### Task 6: Wire barrel exports and verify full integration

**Depends on:** Task 5
**Files:** `packages/core/src/roadmap/index.ts`, `packages/core/src/index.ts`

1. Create `packages/core/src/roadmap/index.ts`:

```typescript
export { parseRoadmap } from './parse';
export { serializeRoadmap } from './serialize';
```

2. Open `packages/core/src/index.ts`. Add the following after the `// Review pipeline module` export block:

```typescript
// Roadmap module
export * from './roadmap';
```

3. Run: `cd packages/core && pnpm exec tsc --noEmit`
4. Run: `cd packages/core && pnpm exec vitest run tests/roadmap/`
5. Observe: all tests pass (parse: 10, serialize: 6)
6. Run: `harness validate`
7. Run: `harness check-deps`
8. Commit: `feat(roadmap): wire barrel exports for roadmap module`

[checkpoint:human-verify] -- Verify all tests pass and the module is properly exported before proceeding to Phase 2.
