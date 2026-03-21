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
