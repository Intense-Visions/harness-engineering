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
    expect(actionProp.enum).toEqual(['show', 'add', 'update', 'remove', 'query', 'sync']);
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
