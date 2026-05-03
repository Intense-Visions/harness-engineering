# Plan: Intelligence Pipeline Phase 4 -- Multi-Adapter Intake

**Date:** 2026-04-14 | **Spec:** docs/changes/intelligence-pipeline/proposal.md | **Tasks:** 6 | **Time:** ~20 min

## Goal

The intelligence pipeline accepts work items from JIRA, GitHub, Linear, and manual text sources via pure adapter functions that map external data formats to `RawWorkItem`.

## Observable Truths (Acceptance Criteria)

1. When a JIRA issue object is passed to `jiraToRawWorkItem()`, the system shall return a `RawWorkItem` with `source: 'jira'`, all fields populated, and no data loss from the input.
2. When a GitHub issue/PR object is passed to `githubToRawWorkItem()`, the system shall return a `RawWorkItem` with `source: 'github'`, all fields populated, and no data loss from the input.
3. When a Linear issue object is passed to `linearToRawWorkItem()`, the system shall return a `RawWorkItem` with `source: 'linear'`, all fields populated, and no data loss from the input.
4. When free text and an optional title are passed to `manualToRawWorkItem()`, the system shall return a `RawWorkItem` with `source: 'manual'`, a generated ID, and the text as the description.
5. If any adapter input has null/undefined optional fields, the system shall not throw -- it shall map them to appropriate defaults (`null`, `[]`, `{}`).
6. `npx vitest run` in `packages/intelligence/` passes with all existing 69 tests plus new adapter tests (zero regressions).
7. `harness validate` passes.

## File Map

```
CREATE packages/intelligence/src/adapters/jira.ts
CREATE packages/intelligence/src/adapters/github.ts
CREATE packages/intelligence/src/adapters/linear.ts
CREATE packages/intelligence/src/adapters/manual.ts
CREATE packages/intelligence/src/adapters/index.ts
CREATE packages/intelligence/tests/adapters/jira.test.ts
CREATE packages/intelligence/tests/adapters/github.test.ts
CREATE packages/intelligence/tests/adapters/linear.test.ts
CREATE packages/intelligence/tests/adapters/manual.test.ts
MODIFY packages/intelligence/src/index.ts (add adapter exports)
```

## Tasks

### Task 1: JIRA adapter -- input type and mapping function (TDD)

**Depends on:** none | **Files:** `packages/intelligence/tests/adapters/jira.test.ts`, `packages/intelligence/src/adapters/jira.ts`

1. Create `packages/intelligence/tests/adapters/jira.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { jiraToRawWorkItem, type JiraIssue } from '../../src/adapters/jira.js';

function makeJiraIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    id: '10042',
    key: 'PROJ-42',
    fields: {
      summary: 'Fix authentication timeout',
      description: 'Users are experiencing session timeouts after 5 minutes.',
      labels: ['bug', 'auth'],
      priority: { id: '2', name: 'High' },
      status: { id: '3', name: 'In Progress' },
      issuetype: { id: '1', name: 'Bug' },
      created: '2026-04-10T10:00:00.000+0000',
      updated: '2026-04-14T12:00:00.000+0000',
      issuelinks: [
        { type: { name: 'Blocks' }, inwardIssue: { id: '10001', key: 'PROJ-10' } },
        { type: { name: 'Relates' }, outwardIssue: { id: '10002', key: 'PROJ-11' } },
      ],
      comment: {
        comments: [
          { body: 'Reproduced on staging', author: { displayName: 'Alice' } },
          { body: 'Investigating root cause', author: { displayName: 'Bob' } },
        ],
      },
    },
    ...overrides,
  };
}

describe('jiraToRawWorkItem', () => {
  it('maps all JIRA fields correctly', () => {
    const jira = makeJiraIssue();
    const raw = jiraToRawWorkItem(jira);

    expect(raw.id).toBe('10042');
    expect(raw.title).toBe('Fix authentication timeout');
    expect(raw.description).toBe('Users are experiencing session timeouts after 5 minutes.');
    expect(raw.labels).toEqual(['bug', 'auth']);
    expect(raw.source).toBe('jira');
    expect(raw.comments).toEqual(['Reproduced on staging', 'Investigating root cause']);
    expect(raw.linkedItems).toEqual(['10001', '10002']);
    expect(raw.metadata).toEqual({
      key: 'PROJ-42',
      priority: { id: '2', name: 'High' },
      status: { id: '3', name: 'In Progress' },
      issuetype: { id: '1', name: 'Bug' },
      created: '2026-04-10T10:00:00.000+0000',
      updated: '2026-04-14T12:00:00.000+0000',
    });
  });

  it('handles null description', () => {
    const jira = makeJiraIssue();
    jira.fields.description = null;
    const raw = jiraToRawWorkItem(jira);
    expect(raw.description).toBeNull();
  });

  it('handles empty labels', () => {
    const jira = makeJiraIssue();
    jira.fields.labels = [];
    const raw = jiraToRawWorkItem(jira);
    expect(raw.labels).toEqual([]);
  });

  it('handles missing issuelinks', () => {
    const jira = makeJiraIssue();
    jira.fields.issuelinks = [];
    const raw = jiraToRawWorkItem(jira);
    expect(raw.linkedItems).toEqual([]);
  });

  it('handles missing comments', () => {
    const jira = makeJiraIssue();
    jira.fields.comment = { comments: [] };
    const raw = jiraToRawWorkItem(jira);
    expect(raw.comments).toEqual([]);
  });

  it('extracts linked issue IDs from both inward and outward links', () => {
    const jira = makeJiraIssue({
      fields: {
        ...makeJiraIssue().fields,
        issuelinks: [
          { type: { name: 'Blocks' }, inwardIssue: { id: '10001', key: 'PROJ-10' } },
          { type: { name: 'Blocks' }, outwardIssue: { id: '10002', key: 'PROJ-11' } },
          { type: { name: 'Duplicate' }, inwardIssue: { id: '10003', key: 'PROJ-12' } },
        ],
      },
    });
    const raw = jiraToRawWorkItem(jira);
    expect(raw.linkedItems).toEqual(['10001', '10002', '10003']);
  });
});
```

2. Run test -- observe failure:

   ```
   cd packages/intelligence && npx vitest run tests/adapters/jira.test.ts
   ```

3. Create `packages/intelligence/src/adapters/jira.ts`:

```typescript
import type { RawWorkItem } from '../types.js';

/**
 * JIRA issue link reference.
 */
export interface JiraIssueLink {
  type: { name: string };
  inwardIssue?: { id: string; key: string };
  outwardIssue?: { id: string; key: string };
}

/**
 * JIRA comment entry.
 */
export interface JiraComment {
  body: string;
  author: { displayName: string };
}

/**
 * Minimal JIRA issue shape accepted by the adapter.
 * Represents pre-fetched data from the JIRA REST API.
 */
export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string | null;
    labels: string[];
    priority: { id: string; name: string } | null;
    status: { id: string; name: string };
    issuetype: { id: string; name: string };
    created: string;
    updated: string;
    issuelinks: JiraIssueLink[];
    comment: { comments: JiraComment[] };
  };
}

/**
 * Convert a pre-fetched JIRA issue into a generic RawWorkItem.
 */
export function jiraToRawWorkItem(issue: JiraIssue): RawWorkItem {
  const linkedItems: string[] = [];
  for (const link of issue.fields.issuelinks) {
    if (link.inwardIssue) linkedItems.push(link.inwardIssue.id);
    if (link.outwardIssue) linkedItems.push(link.outwardIssue.id);
  }

  return {
    id: issue.id,
    title: issue.fields.summary,
    description: issue.fields.description,
    labels: issue.fields.labels,
    metadata: {
      key: issue.key,
      priority: issue.fields.priority,
      status: issue.fields.status,
      issuetype: issue.fields.issuetype,
      created: issue.fields.created,
      updated: issue.fields.updated,
    },
    linkedItems,
    comments: issue.fields.comment.comments.map((c) => c.body),
    source: 'jira',
  };
}
```

4. Run test -- observe pass:
   ```
   cd packages/intelligence && npx vitest run tests/adapters/jira.test.ts
   ```
5. Run: `harness validate`
6. Commit: `feat(intelligence): add JIRA adapter for RawWorkItem conversion`

---

### Task 2: GitHub adapter -- input type and mapping function (TDD)

**Depends on:** none (parallel with Task 1) | **Files:** `packages/intelligence/tests/adapters/github.test.ts`, `packages/intelligence/src/adapters/github.ts`

1. Create `packages/intelligence/tests/adapters/github.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { githubToRawWorkItem, type GitHubIssue } from '../../src/adapters/github.js';

function makeGitHubIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    id: 123456,
    number: 42,
    title: 'Add dark mode support',
    body: 'Users have requested a dark mode option in the settings panel.',
    labels: [
      { id: 1, name: 'enhancement' },
      { id: 2, name: 'ui' },
    ],
    state: 'open',
    html_url: 'https://github.com/org/repo/issues/42',
    created_at: '2026-04-10T10:00:00Z',
    updated_at: '2026-04-14T12:00:00Z',
    pull_request: null,
    milestone: { id: 1, title: 'v2.0' },
    assignees: [{ login: 'alice' }, { login: 'bob' }],
    comments_data: [
      { body: 'Would love this feature!', user: { login: 'charlie' } },
      { body: 'I can work on this.', user: { login: 'alice' } },
    ],
    linked_issues: [101, 102],
    ...overrides,
  };
}

describe('githubToRawWorkItem', () => {
  it('maps all GitHub issue fields correctly', () => {
    const gh = makeGitHubIssue();
    const raw = githubToRawWorkItem(gh);

    expect(raw.id).toBe('123456');
    expect(raw.title).toBe('Add dark mode support');
    expect(raw.description).toBe('Users have requested a dark mode option in the settings panel.');
    expect(raw.labels).toEqual(['enhancement', 'ui']);
    expect(raw.source).toBe('github');
    expect(raw.comments).toEqual(['Would love this feature!', 'I can work on this.']);
    expect(raw.linkedItems).toEqual(['101', '102']);
    expect(raw.metadata).toEqual({
      number: 42,
      state: 'open',
      html_url: 'https://github.com/org/repo/issues/42',
      created_at: '2026-04-10T10:00:00Z',
      updated_at: '2026-04-14T12:00:00Z',
      isPullRequest: false,
      milestone: { id: 1, title: 'v2.0' },
      assignees: ['alice', 'bob'],
    });
  });

  it('handles null body', () => {
    const gh = makeGitHubIssue({ body: null });
    const raw = githubToRawWorkItem(gh);
    expect(raw.description).toBeNull();
  });

  it('handles empty labels', () => {
    const gh = makeGitHubIssue({ labels: [] });
    const raw = githubToRawWorkItem(gh);
    expect(raw.labels).toEqual([]);
  });

  it('handles empty comments', () => {
    const gh = makeGitHubIssue({ comments_data: [] });
    const raw = githubToRawWorkItem(gh);
    expect(raw.comments).toEqual([]);
  });

  it('handles empty linked issues', () => {
    const gh = makeGitHubIssue({ linked_issues: [] });
    const raw = githubToRawWorkItem(gh);
    expect(raw.linkedItems).toEqual([]);
  });

  it('detects pull requests via pull_request field', () => {
    const gh = makeGitHubIssue({
      pull_request: { url: 'https://api.github.com/repos/org/repo/pulls/42' },
    });
    const raw = githubToRawWorkItem(gh);
    expect(raw.metadata.isPullRequest).toBe(true);
  });

  it('handles null milestone', () => {
    const gh = makeGitHubIssue({ milestone: null });
    const raw = githubToRawWorkItem(gh);
    expect(raw.metadata.milestone).toBeNull();
  });
});
```

2. Run test -- observe failure:

   ```
   cd packages/intelligence && npx vitest run tests/adapters/github.test.ts
   ```

3. Create `packages/intelligence/src/adapters/github.ts`:

```typescript
import type { RawWorkItem } from '../types.js';

/**
 * GitHub label shape.
 */
export interface GitHubLabel {
  id: number;
  name: string;
}

/**
 * GitHub comment shape.
 */
export interface GitHubComment {
  body: string;
  user: { login: string };
}

/**
 * Minimal GitHub issue/PR shape accepted by the adapter.
 * Represents pre-fetched data from the GitHub REST or GraphQL API.
 */
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  labels: GitHubLabel[];
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  pull_request: { url: string } | null;
  milestone: { id: number; title: string } | null;
  assignees: { login: string }[];
  comments_data: GitHubComment[];
  linked_issues: number[];
}

/**
 * Convert a pre-fetched GitHub issue or PR into a generic RawWorkItem.
 */
export function githubToRawWorkItem(issue: GitHubIssue): RawWorkItem {
  return {
    id: String(issue.id),
    title: issue.title,
    description: issue.body,
    labels: issue.labels.map((l) => l.name),
    metadata: {
      number: issue.number,
      state: issue.state,
      html_url: issue.html_url,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      isPullRequest: issue.pull_request != null,
      milestone: issue.milestone,
      assignees: issue.assignees.map((a) => a.login),
    },
    linkedItems: issue.linked_issues.map(String),
    comments: issue.comments_data.map((c) => c.body),
    source: 'github',
  };
}
```

4. Run test -- observe pass:
   ```
   cd packages/intelligence && npx vitest run tests/adapters/github.test.ts
   ```
5. Run: `harness validate`
6. Commit: `feat(intelligence): add GitHub adapter for RawWorkItem conversion`

---

### Task 3: Linear adapter -- input type and mapping function (TDD)

**Depends on:** none (parallel with Tasks 1-2) | **Files:** `packages/intelligence/tests/adapters/linear.test.ts`, `packages/intelligence/src/adapters/linear.ts`

1. Create `packages/intelligence/tests/adapters/linear.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { linearToRawWorkItem, type LinearIssue } from '../../src/adapters/linear.js';

function makeLinearIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'lin-uuid-001',
    identifier: 'ENG-123',
    title: 'Refactor payment module',
    description: 'Extract payment logic into a dedicated service.',
    priority: 2,
    state: { id: 's1', name: 'In Progress' },
    labels: {
      nodes: [
        { id: 'l1', name: 'refactor' },
        { id: 'l2', name: 'payments' },
      ],
    },
    assignee: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
    team: { id: 't1', name: 'Backend', key: 'BE' },
    url: 'https://linear.app/org/issue/ENG-123',
    createdAt: '2026-04-10T10:00:00.000Z',
    updatedAt: '2026-04-14T12:00:00.000Z',
    relations: {
      nodes: [
        { type: 'blocks', relatedIssue: { id: 'lin-uuid-010', identifier: 'ENG-10' } },
        { type: 'related', relatedIssue: { id: 'lin-uuid-011', identifier: 'ENG-11' } },
      ],
    },
    comments: {
      nodes: [{ body: 'This is critical for Q2.', user: { name: 'Bob' } }],
    },
    ...overrides,
  };
}

describe('linearToRawWorkItem', () => {
  it('maps all Linear fields correctly', () => {
    const lin = makeLinearIssue();
    const raw = linearToRawWorkItem(lin);

    expect(raw.id).toBe('lin-uuid-001');
    expect(raw.title).toBe('Refactor payment module');
    expect(raw.description).toBe('Extract payment logic into a dedicated service.');
    expect(raw.labels).toEqual(['refactor', 'payments']);
    expect(raw.source).toBe('linear');
    expect(raw.comments).toEqual(['This is critical for Q2.']);
    expect(raw.linkedItems).toEqual(['lin-uuid-010', 'lin-uuid-011']);
    expect(raw.metadata).toEqual({
      identifier: 'ENG-123',
      priority: 2,
      state: { id: 's1', name: 'In Progress' },
      assignee: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
      team: { id: 't1', name: 'Backend', key: 'BE' },
      url: 'https://linear.app/org/issue/ENG-123',
      createdAt: '2026-04-10T10:00:00.000Z',
      updatedAt: '2026-04-14T12:00:00.000Z',
    });
  });

  it('handles null description', () => {
    const lin = makeLinearIssue({ description: null });
    const raw = linearToRawWorkItem(lin);
    expect(raw.description).toBeNull();
  });

  it('handles empty labels', () => {
    const lin = makeLinearIssue({ labels: { nodes: [] } });
    const raw = linearToRawWorkItem(lin);
    expect(raw.labels).toEqual([]);
  });

  it('handles empty relations', () => {
    const lin = makeLinearIssue({ relations: { nodes: [] } });
    const raw = linearToRawWorkItem(lin);
    expect(raw.linkedItems).toEqual([]);
  });

  it('handles empty comments', () => {
    const lin = makeLinearIssue({ comments: { nodes: [] } });
    const raw = linearToRawWorkItem(lin);
    expect(raw.comments).toEqual([]);
  });

  it('handles null assignee', () => {
    const lin = makeLinearIssue({ assignee: null });
    const raw = linearToRawWorkItem(lin);
    expect(raw.metadata.assignee).toBeNull();
  });
});
```

2. Run test -- observe failure:

   ```
   cd packages/intelligence && npx vitest run tests/adapters/linear.test.ts
   ```

3. Create `packages/intelligence/src/adapters/linear.ts`:

```typescript
import type { RawWorkItem } from '../types.js';

/**
 * Linear issue relation.
 */
export interface LinearRelation {
  type: string;
  relatedIssue: { id: string; identifier: string };
}

/**
 * Linear comment.
 */
export interface LinearComment {
  body: string;
  user: { name: string };
}

/**
 * Minimal Linear issue shape accepted by the adapter.
 * Represents pre-fetched data from the Linear GraphQL API.
 */
export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  state: { id: string; name: string };
  labels: { nodes: { id: string; name: string }[] };
  assignee: { id: string; name: string; email: string } | null;
  team: { id: string; name: string; key: string };
  url: string;
  createdAt: string;
  updatedAt: string;
  relations: { nodes: LinearRelation[] };
  comments: { nodes: LinearComment[] };
}

/**
 * Convert a pre-fetched Linear issue into a generic RawWorkItem.
 */
export function linearToRawWorkItem(issue: LinearIssue): RawWorkItem {
  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    labels: issue.labels.nodes.map((l) => l.name),
    metadata: {
      identifier: issue.identifier,
      priority: issue.priority,
      state: issue.state,
      assignee: issue.assignee,
      team: issue.team,
      url: issue.url,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    },
    linkedItems: issue.relations.nodes.map((r) => r.relatedIssue.id),
    comments: issue.comments.nodes.map((c) => c.body),
    source: 'linear',
  };
}
```

4. Run test -- observe pass:
   ```
   cd packages/intelligence && npx vitest run tests/adapters/linear.test.ts
   ```
5. Run: `harness validate`
6. Commit: `feat(intelligence): add Linear adapter for RawWorkItem conversion`

---

### Task 4: Manual text adapter -- input type and mapping function (TDD)

**Depends on:** none (parallel with Tasks 1-3) | **Files:** `packages/intelligence/tests/adapters/manual.test.ts`, `packages/intelligence/src/adapters/manual.ts`

1. Create `packages/intelligence/tests/adapters/manual.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { manualToRawWorkItem, type ManualInput } from '../../src/adapters/manual.js';

describe('manualToRawWorkItem', () => {
  it('wraps text input as RawWorkItem with generated ID', () => {
    const input: ManualInput = {
      text: 'Fix the login page CSS on mobile Safari.',
    };
    const raw = manualToRawWorkItem(input);

    expect(raw.id).toMatch(/^manual-/);
    expect(raw.title).toBe('Manual work item');
    expect(raw.description).toBe('Fix the login page CSS on mobile Safari.');
    expect(raw.labels).toEqual([]);
    expect(raw.source).toBe('manual');
    expect(raw.comments).toEqual([]);
    expect(raw.linkedItems).toEqual([]);
    expect(raw.metadata).toEqual({});
  });

  it('uses provided title when given', () => {
    const input: ManualInput = {
      text: 'Detailed description of the work.',
      title: 'Custom Title',
    };
    const raw = manualToRawWorkItem(input);
    expect(raw.title).toBe('Custom Title');
  });

  it('uses provided labels when given', () => {
    const input: ManualInput = {
      text: 'Some work.',
      labels: ['urgent', 'frontend'],
    };
    const raw = manualToRawWorkItem(input);
    expect(raw.labels).toEqual(['urgent', 'frontend']);
  });

  it('generates unique IDs for each call', () => {
    const input: ManualInput = { text: 'Some work.' };
    const raw1 = manualToRawWorkItem(input);
    const raw2 = manualToRawWorkItem(input);
    expect(raw1.id).not.toBe(raw2.id);
  });

  it('preserves metadata when provided', () => {
    const input: ManualInput = {
      text: 'Some work.',
      metadata: { submittedBy: 'alice', channel: 'cli' },
    };
    const raw = manualToRawWorkItem(input);
    expect(raw.metadata).toEqual({ submittedBy: 'alice', channel: 'cli' });
  });
});
```

2. Run test -- observe failure:

   ```
   cd packages/intelligence && npx vitest run tests/adapters/manual.test.ts
   ```

3. Create `packages/intelligence/src/adapters/manual.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import type { RawWorkItem } from '../types.js';

/**
 * Manual text input for creating a RawWorkItem from free-form text.
 */
export interface ManualInput {
  /** The free-text description of the work item. */
  text: string;
  /** Optional title. Defaults to 'Manual work item'. */
  title?: string;
  /** Optional labels to tag the work item. */
  labels?: string[];
  /** Optional metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Convert free-text input into a generic RawWorkItem.
 */
export function manualToRawWorkItem(input: ManualInput): RawWorkItem {
  return {
    id: `manual-${randomUUID()}`,
    title: input.title ?? 'Manual work item',
    description: input.text,
    labels: input.labels ?? [],
    metadata: input.metadata ?? {},
    linkedItems: [],
    comments: [],
    source: 'manual',
  };
}
```

4. Run test -- observe pass:
   ```
   cd packages/intelligence && npx vitest run tests/adapters/manual.test.ts
   ```
5. Run: `harness validate`
6. Commit: `feat(intelligence): add manual text adapter for RawWorkItem conversion`

---

### Task 5: Adapter barrel export and index.ts integration

**Depends on:** Tasks 1-4 | **Files:** `packages/intelligence/src/adapters/index.ts`, `packages/intelligence/src/index.ts`

1. Create `packages/intelligence/src/adapters/index.ts`:

```typescript
// Multi-adapter exports
export { jiraToRawWorkItem } from './jira.js';
export type { JiraIssue, JiraIssueLink, JiraComment } from './jira.js';

export { githubToRawWorkItem } from './github.js';
export type { GitHubIssue, GitHubLabel, GitHubComment } from './github.js';

export { linearToRawWorkItem } from './linear.js';
export type { LinearIssue, LinearRelation, LinearComment } from './linear.js';

export { manualToRawWorkItem } from './manual.js';
export type { ManualInput } from './manual.js';
```

2. Modify `packages/intelligence/src/index.ts` -- add the following block after the existing `// Adapter` line:

Replace:

```typescript
// Adapter
export { toRawWorkItem } from './adapter.js';
```

With:

```typescript
// Adapter (roadmap)
export { toRawWorkItem } from './adapter.js';

// Adapters (multi-source)
export {
  jiraToRawWorkItem,
  githubToRawWorkItem,
  linearToRawWorkItem,
  manualToRawWorkItem,
} from './adapters/index.js';
export type {
  JiraIssue,
  JiraIssueLink,
  JiraComment,
  GitHubIssue,
  GitHubLabel,
  GitHubComment,
  LinearIssue,
  LinearRelation,
  LinearComment,
  ManualInput,
} from './adapters/index.js';
```

3. Run: `harness validate`
4. Commit: `feat(intelligence): export multi-source adapters from package index`

---

### Task 6: Full regression verification

**Depends on:** Task 5 | **Files:** none (verification only)

1. Run all intelligence tests:

   ```
   cd packages/intelligence && npx vitest run
   ```

   Expected: 69 existing tests + ~24 new adapter tests = ~93 tests, all passing.

2. Run full project tests:

   ```
   cd /path/to/project && npx vitest run
   ```

   Expected: zero new failures (pre-existing `impact-lab.test.ts` failure is known).

3. Run: `harness validate`
4. Commit: no commit needed (verification only). If any test fails, fix and commit the fix.

## Traceability

| Observable Truth                      | Task(s)                              |
| ------------------------------------- | ------------------------------------ |
| OT1: JIRA adapter maps correctly      | Task 1                               |
| OT2: GitHub adapter maps correctly    | Task 2                               |
| OT3: Linear adapter maps correctly    | Task 3                               |
| OT4: Manual adapter maps correctly    | Task 4                               |
| OT5: Null/edge case handling          | Tasks 1-4 (each has edge case tests) |
| OT6: All tests pass, zero regressions | Task 6                               |
| OT7: harness validate passes          | Tasks 1-6 (each runs validate)       |
