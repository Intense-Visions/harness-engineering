# Plan: Roadmap MCP Tool -- CRUD Operations

**Date:** 2026-03-21
**Spec:** docs/changes/unified-project-roadmap/proposal.md (Phase 2)
**Estimated tasks:** 7
**Estimated time:** 25 minutes

## Goal

Add a `manage_roadmap` MCP tool to `packages/mcp-server/` with `show`, `add`, `update`, `remove`, and `query` actions that read and write `docs/roadmap.md` through the core parser/serializer.

## Observable Truths (Acceptance Criteria)

1. When the `manage_roadmap` tool is invoked with `action: "show"`, the system shall read `docs/roadmap.md`, parse it via `parseRoadmap`, and return the full `Roadmap` object as JSON.
2. When the `manage_roadmap` tool is invoked with `action: "show"` and a `milestone` filter, the system shall return only milestones matching the filter name.
3. When the `manage_roadmap` tool is invoked with `action: "show"` and a `status` filter, the system shall return only features matching that status, within their parent milestones.
4. When the `manage_roadmap` tool is invoked with `action: "add"` and required fields (`feature`, `milestone`, `status`, `summary`), the system shall append the feature to the named milestone, serialize the roadmap back to markdown, write the file, and return the updated roadmap.
5. When the `manage_roadmap` tool is invoked with `action: "add"` and the target milestone does not exist, the system shall return an error with `isError: true`.
6. When the `manage_roadmap` tool is invoked with `action: "update"` with a `feature` name and fields to change, the system shall find the feature, apply the updates, serialize, write, and return the updated roadmap.
7. When the `manage_roadmap` tool is invoked with `action: "update"` for a feature that does not exist, the system shall return an error with `isError: true`.
8. When the `manage_roadmap` tool is invoked with `action: "remove"` and a `feature` name, the system shall remove the feature from its milestone, serialize, write, and return the updated roadmap.
9. When the `manage_roadmap` tool is invoked with `action: "remove"` for a feature that does not exist, the system shall return an error with `isError: true`.
10. When the `manage_roadmap` tool is invoked with `action: "query"` and a `filter` string, the system shall return matching features: `"blocked"` returns features with status `blocked`, `"in-progress"` returns features with status `in-progress`, and `"milestone:NAME"` returns features in that milestone.
11. When `docs/roadmap.md` does not exist and a mutating action is called, the system shall return an error directing the user to create a roadmap first.
12. The tool is registered in `server.ts` with name `manage_roadmap` and the tool count test in `server.test.ts` is updated from 37 to 38.
13. `npx vitest run` in `packages/mcp-server/` passes with all new tests.
14. `harness validate` passes.

## File Map

- CREATE `packages/mcp-server/src/tools/roadmap.ts`
- CREATE `packages/mcp-server/tests/tools/roadmap.test.ts`
- MODIFY `packages/mcp-server/src/server.ts` (import + register definition/handler)
- MODIFY `packages/mcp-server/tests/server.test.ts` (update tool count from 37 to 38)

## Tasks

### Task 1: Create tool definition and handler skeleton with `show` action

**Depends on:** none
**Files:** `packages/mcp-server/src/tools/roadmap.ts`

1. Create `packages/mcp-server/src/tools/roadmap.ts` with the following content:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';

export const manageRoadmapDefinition = {
  name: 'manage_roadmap',
  description:
    'Manage the project roadmap: show, add, update, remove features, or query by filter. Reads and writes docs/roadmap.md.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      action: {
        type: 'string',
        enum: ['show', 'add', 'update', 'remove', 'query'],
        description: 'Action to perform',
      },
      feature: { type: 'string', description: 'Feature name (required for add, update, remove)' },
      milestone: {
        type: 'string',
        description: 'Milestone name (required for add; optional filter for show)',
      },
      status: {
        type: 'string',
        enum: ['backlog', 'planned', 'in-progress', 'done', 'blocked'],
        description:
          'Feature status (required for add; optional for update; optional filter for show)',
      },
      summary: {
        type: 'string',
        description: 'Feature summary (required for add; optional for update)',
      },
      spec: { type: 'string', description: 'Spec file path (optional for add/update)' },
      plans: {
        type: 'array',
        items: { type: 'string' },
        description: 'Plan file paths (optional for add/update)',
      },
      blocked_by: {
        type: 'array',
        items: { type: 'string' },
        description: 'Blocking feature names (optional for add/update)',
      },
      filter: {
        type: 'string',
        description:
          'Query filter: "blocked", "in-progress", "done", "planned", "backlog", or "milestone:<name>" (required for query)',
      },
    },
    required: ['path', 'action'],
  },
};

interface ManageRoadmapInput {
  path: string;
  action: 'show' | 'add' | 'update' | 'remove' | 'query';
  feature?: string;
  milestone?: string;
  status?: 'backlog' | 'planned' | 'in-progress' | 'done' | 'blocked';
  summary?: string;
  spec?: string;
  plans?: string[];
  blocked_by?: string[];
  filter?: string;
}

function roadmapPath(projectRoot: string): string {
  return path.join(projectRoot, 'docs', 'roadmap.md');
}

function readRoadmapFile(projectRoot: string): string | null {
  const filePath = roadmapPath(projectRoot);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function writeRoadmapFile(projectRoot: string, content: string): void {
  const filePath = roadmapPath(projectRoot);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

export async function handleManageRoadmap(input: ManageRoadmapInput) {
  try {
    const { parseRoadmap, serializeRoadmap } = await import('@harness-engineering/core');
    const { Ok, Err } = await import('@harness-engineering/types');

    const projectPath = sanitizePath(input.path);

    switch (input.action) {
      case 'show': {
        const raw = readRoadmapFile(projectPath);
        if (raw === null) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: docs/roadmap.md not found. Create a roadmap first.',
              },
            ],
            isError: true,
          };
        }
        const result = parseRoadmap(raw);
        if (!result.ok) return resultToMcpResponse(result);

        let roadmap = result.value;

        // Apply milestone filter
        if (input.milestone) {
          const milestoneFilter = input.milestone;
          roadmap = {
            ...roadmap,
            milestones: roadmap.milestones.filter(
              (m) => m.name.toLowerCase() === milestoneFilter.toLowerCase()
            ),
          };
        }

        // Apply status filter
        if (input.status) {
          const statusFilter = input.status;
          roadmap = {
            ...roadmap,
            milestones: roadmap.milestones
              .map((m) => ({
                ...m,
                features: m.features.filter((f) => f.status === statusFilter),
              }))
              .filter((m) => m.features.length > 0),
          };
        }

        return resultToMcpResponse(Ok(roadmap));
      }

      case 'add': {
        if (!input.feature) {
          return {
            content: [{ type: 'text' as const, text: 'Error: feature is required for add action' }],
            isError: true,
          };
        }
        if (!input.milestone) {
          return {
            content: [
              { type: 'text' as const, text: 'Error: milestone is required for add action' },
            ],
            isError: true,
          };
        }
        if (!input.status) {
          return {
            content: [{ type: 'text' as const, text: 'Error: status is required for add action' }],
            isError: true,
          };
        }
        if (!input.summary) {
          return {
            content: [{ type: 'text' as const, text: 'Error: summary is required for add action' }],
            isError: true,
          };
        }

        const raw = readRoadmapFile(projectPath);
        if (raw === null) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: docs/roadmap.md not found. Create a roadmap first.',
              },
            ],
            isError: true,
          };
        }
        const result = parseRoadmap(raw);
        if (!result.ok) return resultToMcpResponse(result);

        const roadmap = result.value;
        const milestone = roadmap.milestones.find(
          (m) => m.name.toLowerCase() === input.milestone!.toLowerCase()
        );
        if (!milestone) {
          return {
            content: [
              { type: 'text' as const, text: `Error: milestone "${input.milestone}" not found` },
            ],
            isError: true,
          };
        }

        milestone.features.push({
          name: input.feature,
          status: input.status,
          spec: input.spec ?? null,
          plans: input.plans ?? [],
          blockedBy: input.blocked_by ?? [],
          summary: input.summary,
        });

        // Update last_manual_edit timestamp
        roadmap.frontmatter.lastManualEdit = new Date().toISOString();

        writeRoadmapFile(projectPath, serializeRoadmap(roadmap));
        return resultToMcpResponse(Ok(roadmap));
      }

      case 'update': {
        if (!input.feature) {
          return {
            content: [
              { type: 'text' as const, text: 'Error: feature is required for update action' },
            ],
            isError: true,
          };
        }

        const raw = readRoadmapFile(projectPath);
        if (raw === null) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: docs/roadmap.md not found. Create a roadmap first.',
              },
            ],
            isError: true,
          };
        }
        const result = parseRoadmap(raw);
        if (!result.ok) return resultToMcpResponse(result);

        const roadmap = result.value;
        let found = false;
        for (const m of roadmap.milestones) {
          const feature = m.features.find(
            (f) => f.name.toLowerCase() === input.feature!.toLowerCase()
          );
          if (feature) {
            if (input.status) feature.status = input.status;
            if (input.summary !== undefined) feature.summary = input.summary;
            if (input.spec !== undefined) feature.spec = input.spec || null;
            if (input.plans !== undefined) feature.plans = input.plans;
            if (input.blocked_by !== undefined) feature.blockedBy = input.blocked_by;
            found = true;
            break;
          }
        }

        if (!found) {
          return {
            content: [
              { type: 'text' as const, text: `Error: feature "${input.feature}" not found` },
            ],
            isError: true,
          };
        }

        roadmap.frontmatter.lastManualEdit = new Date().toISOString();

        writeRoadmapFile(projectPath, serializeRoadmap(roadmap));
        return resultToMcpResponse(Ok(roadmap));
      }

      case 'remove': {
        if (!input.feature) {
          return {
            content: [
              { type: 'text' as const, text: 'Error: feature is required for remove action' },
            ],
            isError: true,
          };
        }

        const raw = readRoadmapFile(projectPath);
        if (raw === null) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: docs/roadmap.md not found. Create a roadmap first.',
              },
            ],
            isError: true,
          };
        }
        const result = parseRoadmap(raw);
        if (!result.ok) return resultToMcpResponse(result);

        const roadmap = result.value;
        let found = false;
        for (const m of roadmap.milestones) {
          const idx = m.features.findIndex(
            (f) => f.name.toLowerCase() === input.feature!.toLowerCase()
          );
          if (idx !== -1) {
            m.features.splice(idx, 1);
            found = true;
            break;
          }
        }

        if (!found) {
          return {
            content: [
              { type: 'text' as const, text: `Error: feature "${input.feature}" not found` },
            ],
            isError: true,
          };
        }

        roadmap.frontmatter.lastManualEdit = new Date().toISOString();

        writeRoadmapFile(projectPath, serializeRoadmap(roadmap));
        return resultToMcpResponse(Ok(roadmap));
      }

      case 'query': {
        if (!input.filter) {
          return {
            content: [
              { type: 'text' as const, text: 'Error: filter is required for query action' },
            ],
            isError: true,
          };
        }

        const raw = readRoadmapFile(projectPath);
        if (raw === null) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Error: docs/roadmap.md not found. Create a roadmap first.',
              },
            ],
            isError: true,
          };
        }
        const result = parseRoadmap(raw);
        if (!result.ok) return resultToMcpResponse(result);

        const roadmap = result.value;
        const allFeatures = roadmap.milestones.flatMap((m) =>
          m.features.map((f) => ({ ...f, milestone: m.name }))
        );

        const filter = input.filter.toLowerCase();
        let filtered: typeof allFeatures;

        if (filter.startsWith('milestone:')) {
          const milestoneName = filter.slice('milestone:'.length).trim();
          filtered = allFeatures.filter((f) => f.milestone.toLowerCase().includes(milestoneName));
        } else {
          // Treat filter as a status value
          filtered = allFeatures.filter((f) => f.status === filter);
        }

        return resultToMcpResponse(Ok(filtered));
      }

      default: {
        return {
          content: [{ type: 'text' as const, text: `Error: unknown action` }],
          isError: true,
        };
      }
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

2. Run: `harness validate`
3. Commit: `feat(mcp-server): add manage_roadmap tool with CRUD and query actions`

---

### Task 2: Create test file -- definition tests and show action tests

**Depends on:** Task 1
**Files:** `packages/mcp-server/tests/tools/roadmap.test.ts`

1. Create `packages/mcp-server/tests/tools/roadmap.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { manageRoadmapDefinition, handleManageRoadmap } from '../../src/tools/roadmap';

// Minimal valid roadmap for testing
const TEST_ROADMAP = `---
project: test-project
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Project Roadmap

## Milestone: MVP Release

### Feature: Auth System
- **Status:** in-progress
- **Spec:** docs/specs/auth.md
- **Plans:** docs/plans/auth-plan.md
- **Blocked by:** \u2014
- **Summary:** Authentication and authorization

### Feature: User Dashboard
- **Status:** planned
- **Spec:** \u2014
- **Plans:** \u2014
- **Blocked by:** Auth System
- **Summary:** Main user dashboard

## Milestone: Q2 Polish

### Feature: Dark Mode
- **Status:** planned
- **Spec:** \u2014
- **Plans:** \u2014
- **Blocked by:** \u2014
- **Summary:** Dark mode theme support

## Backlog

### Feature: Mobile App
- **Status:** backlog
- **Spec:** \u2014
- **Plans:** \u2014
- **Blocked by:** \u2014
- **Summary:** Native mobile application
`;

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-test-'));
  const docsDir = path.join(tmpDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'roadmap.md'), TEST_ROADMAP, 'utf-8');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('manage_roadmap tool definition', () => {
  it('has correct name', () => {
    expect(manageRoadmapDefinition.name).toBe('manage_roadmap');
  });

  it('requires path and action', () => {
    expect(manageRoadmapDefinition.inputSchema.required).toContain('path');
    expect(manageRoadmapDefinition.inputSchema.required).toContain('action');
  });

  it('has all expected actions in enum', () => {
    const actionProp = manageRoadmapDefinition.inputSchema.properties.action as {
      type: string;
      enum: string[];
    };
    expect(actionProp.enum).toEqual(['show', 'add', 'update', 'remove', 'query']);
  });

  it('has feature, milestone, status, summary, spec, plans, blocked_by, filter properties', () => {
    const props = manageRoadmapDefinition.inputSchema.properties;
    expect(props.feature).toBeDefined();
    expect(props.milestone).toBeDefined();
    expect(props.status).toBeDefined();
    expect(props.summary).toBeDefined();
    expect(props.spec).toBeDefined();
    expect(props.plans).toBeDefined();
    expect(props.blocked_by).toBeDefined();
    expect(props.filter).toBeDefined();
  });
});

describe('manage_roadmap show action', () => {
  it('returns parsed roadmap data', async () => {
    const response = await handleManageRoadmap({ path: tmpDir, action: 'show' });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.frontmatter.project).toBe('test-project');
    expect(parsed.milestones).toHaveLength(3);
  });

  it('filters by milestone name', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'show',
      milestone: 'MVP Release',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.milestones).toHaveLength(1);
    expect(parsed.milestones[0].name).toBe('MVP Release');
  });

  it('filters by status', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'show',
      status: 'planned',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    // Two milestones have planned features: MVP Release (User Dashboard) and Q2 Polish (Dark Mode)
    expect(parsed.milestones).toHaveLength(2);
    for (const m of parsed.milestones) {
      for (const f of m.features) {
        expect(f.status).toBe('planned');
      }
    }
  });

  it('returns error when roadmap file does not exist', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-empty-'));
    try {
      const response = await handleManageRoadmap({ path: emptyDir, action: 'show' });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
```

2. Run test: `cd packages/mcp-server && npx vitest run tests/tools/roadmap.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(mcp-server): add definition and show action tests for manage_roadmap`

---

### Task 3: Add tests for `add` action

**Depends on:** Task 2
**Files:** `packages/mcp-server/tests/tools/roadmap.test.ts`

1. Append the following `describe` block to `packages/mcp-server/tests/tools/roadmap.test.ts` (after the `show` describe block, before the file-closing):

```typescript
describe('manage_roadmap add action', () => {
  it('adds a feature to an existing milestone', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'add',
      feature: 'API Gateway',
      milestone: 'MVP Release',
      status: 'planned',
      summary: 'Central API gateway',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    const mvp = parsed.milestones.find((m: { name: string }) => m.name === 'MVP Release');
    expect(mvp.features).toHaveLength(3);
    expect(mvp.features[2].name).toBe('API Gateway');
    expect(mvp.features[2].status).toBe('planned');
  });

  it('adds a feature with optional fields', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'add',
      feature: 'Logging',
      milestone: 'Q2 Polish',
      status: 'in-progress',
      summary: 'Structured logging',
      spec: 'docs/specs/logging.md',
      plans: ['docs/plans/logging-plan.md'],
      blocked_by: ['Auth System'],
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    const q2 = parsed.milestones.find((m: { name: string }) => m.name === 'Q2 Polish');
    const logging = q2.features.find((f: { name: string }) => f.name === 'Logging');
    expect(logging.spec).toBe('docs/specs/logging.md');
    expect(logging.plans).toEqual(['docs/plans/logging-plan.md']);
    expect(logging.blockedBy).toEqual(['Auth System']);
  });

  it('persists changes to disk', async () => {
    await handleManageRoadmap({
      path: tmpDir,
      action: 'add',
      feature: 'Webhooks',
      milestone: 'Backlog',
      status: 'backlog',
      summary: 'Webhook support',
    });
    // Re-read and verify
    const response = await handleManageRoadmap({ path: tmpDir, action: 'show' });
    const parsed = JSON.parse(response.content[0].text);
    const backlog = parsed.milestones.find((m: { name: string }) => m.name === 'Backlog');
    expect(backlog.features).toHaveLength(2);
    expect(backlog.features[1].name).toBe('Webhooks');
  });

  it('returns error when milestone does not exist', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'add',
      feature: 'Ghost Feature',
      milestone: 'Nonexistent',
      status: 'planned',
      summary: 'Should fail',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('not found');
  });

  it('returns error when required fields are missing', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'add',
    } as Parameters<typeof handleManageRoadmap>[0]);
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('feature is required');
  });

  it('updates last_manual_edit timestamp', async () => {
    const before = new Date().toISOString();
    await handleManageRoadmap({
      path: tmpDir,
      action: 'add',
      feature: 'Timestamp Test',
      milestone: 'Backlog',
      status: 'backlog',
      summary: 'Test timestamp',
    });
    const response = await handleManageRoadmap({ path: tmpDir, action: 'show' });
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.frontmatter.lastManualEdit >= before).toBe(true);
  });
});
```

2. Run test: `cd packages/mcp-server && npx vitest run tests/tools/roadmap.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(mcp-server): add tests for manage_roadmap add action`

---

### Task 4: Add tests for `update` and `remove` actions

**Depends on:** Task 3
**Files:** `packages/mcp-server/tests/tools/roadmap.test.ts`

1. Append the following describe blocks to `packages/mcp-server/tests/tools/roadmap.test.ts`:

```typescript
describe('manage_roadmap update action', () => {
  it('updates feature status', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'update',
      feature: 'Auth System',
      status: 'done',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    const mvp = parsed.milestones.find((m: { name: string }) => m.name === 'MVP Release');
    const auth = mvp.features.find((f: { name: string }) => f.name === 'Auth System');
    expect(auth.status).toBe('done');
  });

  it('updates feature summary and spec', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'update',
      feature: 'Dark Mode',
      summary: 'Updated dark mode support',
      spec: 'docs/specs/dark-mode.md',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    const q2 = parsed.milestones.find((m: { name: string }) => m.name === 'Q2 Polish');
    const dark = q2.features.find((f: { name: string }) => f.name === 'Dark Mode');
    expect(dark.summary).toBe('Updated dark mode support');
    expect(dark.spec).toBe('docs/specs/dark-mode.md');
  });

  it('updates blocked_by and plans', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'update',
      feature: 'User Dashboard',
      plans: ['docs/plans/dashboard-plan.md'],
      blocked_by: ['Auth System', 'Dark Mode'],
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    const mvp = parsed.milestones.find((m: { name: string }) => m.name === 'MVP Release');
    const dash = mvp.features.find((f: { name: string }) => f.name === 'User Dashboard');
    expect(dash.plans).toEqual(['docs/plans/dashboard-plan.md']);
    expect(dash.blockedBy).toEqual(['Auth System', 'Dark Mode']);
  });

  it('performs case-insensitive feature lookup', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'update',
      feature: 'auth system',
      status: 'done',
    });
    expect(response.isError).toBeFalsy();
  });

  it('returns error when feature not found', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'update',
      feature: 'Nonexistent',
      status: 'done',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('not found');
  });

  it('returns error when feature name is missing', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'update',
    } as Parameters<typeof handleManageRoadmap>[0]);
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('feature is required');
  });
});

describe('manage_roadmap remove action', () => {
  it('removes a feature from its milestone', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'remove',
      feature: 'Mobile App',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    const backlog = parsed.milestones.find((m: { name: string }) => m.name === 'Backlog');
    expect(backlog.features).toHaveLength(0);
  });

  it('persists removal to disk', async () => {
    await handleManageRoadmap({
      path: tmpDir,
      action: 'remove',
      feature: 'Dark Mode',
    });
    const response = await handleManageRoadmap({ path: tmpDir, action: 'show' });
    const parsed = JSON.parse(response.content[0].text);
    const q2 = parsed.milestones.find((m: { name: string }) => m.name === 'Q2 Polish');
    expect(q2.features).toHaveLength(0);
  });

  it('returns error when feature not found', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'remove',
      feature: 'Nonexistent',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('not found');
  });

  it('returns error when feature name is missing', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'remove',
    } as Parameters<typeof handleManageRoadmap>[0]);
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('feature is required');
  });
});
```

2. Run test: `cd packages/mcp-server && npx vitest run tests/tools/roadmap.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(mcp-server): add update and remove action tests for manage_roadmap`

---

### Task 5: Add tests for `query` action and error cases

**Depends on:** Task 4
**Files:** `packages/mcp-server/tests/tools/roadmap.test.ts`

1. Append the following describe block to `packages/mcp-server/tests/tools/roadmap.test.ts`:

```typescript
describe('manage_roadmap query action', () => {
  it('queries by status "in-progress"', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'query',
      filter: 'in-progress',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Auth System');
    expect(parsed[0].milestone).toBe('MVP Release');
  });

  it('queries by status "planned"', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'query',
      filter: 'planned',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toHaveLength(2);
    const names = parsed.map((f: { name: string }) => f.name);
    expect(names).toContain('User Dashboard');
    expect(names).toContain('Dark Mode');
  });

  it('queries by milestone prefix', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'query',
      filter: 'milestone:MVP',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toHaveLength(2);
    for (const f of parsed) {
      expect(f.milestone).toBe('MVP Release');
    }
  });

  it('queries by status "backlog"', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'query',
      filter: 'backlog',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Mobile App');
  });

  it('returns empty array when no features match', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'query',
      filter: 'done',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toEqual([]);
  });

  it('returns error when filter is missing', async () => {
    const response = await handleManageRoadmap({
      path: tmpDir,
      action: 'query',
    } as Parameters<typeof handleManageRoadmap>[0]);
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('filter is required');
  });

  it('returns error when roadmap file does not exist', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-empty-'));
    try {
      const response = await handleManageRoadmap({
        path: emptyDir,
        action: 'query',
        filter: 'blocked',
      });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not found');
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
```

2. Run test: `cd packages/mcp-server && npx vitest run tests/tools/roadmap.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(mcp-server): add query action and error case tests for manage_roadmap`

---

### Task 6: Register tool in server.ts

**Depends on:** Task 1
**Files:** `packages/mcp-server/src/server.ts`

1. Add import at the end of the import block in `server.ts` (after the security import on line 111):

```typescript
import { manageRoadmapDefinition, handleManageRoadmap } from './tools/roadmap.js';
```

2. Add `manageRoadmapDefinition` to the `TOOL_DEFINITIONS` array (after `listStreamsDefinition` on line 155, before the closing `]`):

```typescript
  manageRoadmapDefinition,
```

3. Add handler to `TOOL_HANDLERS` (after `list_streams: handleListStreams as ToolHandler,` on line 194, before the closing `}`):

```typescript
  manage_roadmap: handleManageRoadmap as ToolHandler,
```

4. Run: `cd packages/mcp-server && npx vitest run tests/server.test.ts` -- expect failure due to tool count
5. Run: `harness validate`
6. Commit: `feat(mcp-server): register manage_roadmap tool in server`

---

### Task 7: Update server.test.ts tool count and add registration test

**Depends on:** Task 6
**Files:** `packages/mcp-server/tests/server.test.ts`

1. In `server.test.ts`, change the tool count assertion from `37` to `38`:

```typescript
it('registers all 38 tools', () => {
  const tools = getToolDefinitions();
  expect(tools).toHaveLength(38);
});
```

2. Add a new test after the existing `registers new CLI-wrapped tools` test:

```typescript
it('registers manage_roadmap tool', () => {
  const names = getToolDefinitions().map((t) => t.name);
  expect(names).toContain('manage_roadmap');
});
```

3. Run: `cd packages/mcp-server && npx vitest run`
4. Observe: all tests pass (both existing and new)
5. Run: `harness validate`
6. Commit: `test(mcp-server): update tool count and add manage_roadmap registration test`

[checkpoint:human-verify] -- Verify all MCP server tests pass and the tool is properly registered.
