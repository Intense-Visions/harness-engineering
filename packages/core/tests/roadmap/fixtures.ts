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

# Roadmap

## MVP Release

### Notification System

- **Status:** in-progress
- **Spec:** docs/changes/notification-system/proposal.md
- **Summary:** Email and in-app notifications with polling
- **Blockers:** \u2014
- **Plan:** docs/plans/2026-03-14-notification-phase-1-plan.md, docs/plans/2026-03-15-notification-phase-2-plan.md

### User Auth Revamp

- **Status:** planned
- **Spec:** docs/changes/auth-revamp/proposal.md
- **Summary:** OAuth2 migration for compliance requirements
- **Blockers:** Notification System
- **Plan:** \u2014

## Q3 Hardening

### Performance Baselines

- **Status:** planned
- **Spec:** \u2014
- **Summary:** Establish and enforce perf budgets across critical paths
- **Blockers:** \u2014
- **Plan:** \u2014

## Backlog

### Push Notifications

- **Status:** backlog
- **Spec:** \u2014
- **Summary:** Extend notification system with WebSocket push
- **Blockers:** \u2014
- **Plan:** \u2014
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
          assignee: null,
          priority: null,
          externalId: null,
        },
        {
          name: 'User Auth Revamp',
          status: 'planned',
          spec: 'docs/changes/auth-revamp/proposal.md',
          plans: [],
          blockedBy: ['Notification System'],
          summary: 'OAuth2 migration for compliance requirements',
          assignee: null,
          priority: null,
          externalId: null,
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
          assignee: null,
          priority: null,
          externalId: null,
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
          assignee: null,
          priority: null,
          externalId: null,
        },
      ],
    },
  ],
  assignmentHistory: [],
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

# Roadmap

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
  assignmentHistory: [],
};
