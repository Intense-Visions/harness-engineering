import type { RoadmapFeature } from '@harness-engineering/types';
import type { Shard, RoadmapMeta } from '../../../src/roadmap/store/roadmap-store';

/**
 * Shared fixtures for the roadmap shard store tests.
 *
 * Byte-stability contract: every `*_MD` string below is authored to be exactly
 * what the corresponding `serialize*` function emits (fixed frontmatter key
 * order; feature bullets in `serializeFeature` order: Status, Spec, Summary,
 * Blockers, Plan, Assignee, Priority, External-ID, Updated-At). This lets the
 * tests assert `serialize(parse(MD)) === MD`.
 */

// --- Task 3: a single canonical shard -------------------------------------

export const SHARD_MD = `---
slug: shard-store-core
milestone: MVP Release
order: 10
---

### Roadmap shard store core foundation

- **Status:** in-progress
- **Spec:** docs/changes/roadmap-shard-store/proposal.md
- **Summary:** Self-contained shard parse/serialize, stores, assembler, regenerator.
- **Blockers:** —
- **Plan:** docs/changes/roadmap-shard-store/plans/2026-06-27-phase1.md
- **Assignee:** Chad Warner
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#566
- **Updated-At:** 2026-06-27T12:00:00.000Z
`;

export const SHARD_FEATURE: RoadmapFeature = {
  name: 'Roadmap shard store core foundation',
  status: 'in-progress',
  spec: 'docs/changes/roadmap-shard-store/proposal.md',
  plans: ['docs/changes/roadmap-shard-store/plans/2026-06-27-phase1.md'],
  blockedBy: [],
  summary: 'Self-contained shard parse/serialize, stores, assembler, regenerator.',
  assignee: 'Chad Warner',
  priority: 'P1',
  externalId: 'github:Intense-Visions/harness-engineering#566',
  updatedAt: '2026-06-27T12:00:00.000Z',
};

export const SHARD: Shard = {
  slug: 'shard-store-core',
  milestone: 'MVP Release',
  order: 10,
  feature: SHARD_FEATURE,
};

/** A shard whose `order` frontmatter is non-numeric (validation negative case). */
export const SHARD_MD_BAD_ORDER = `---
slug: bad-order
milestone: MVP Release
order: not-a-number
---

### Bad order shard

- **Status:** planned
- **Spec:** —
- **Summary:** has a non-numeric order
- **Blockers:** —
- **Plan:** —
`;

/** A shard missing the required `slug` frontmatter key. */
export const SHARD_MD_MISSING_SLUG = `---
milestone: MVP Release
order: 1
---

### Missing slug shard

- **Status:** planned
- **Spec:** —
- **Summary:** has no slug
- **Blockers:** —
- **Plan:** —
`;

// --- Task 4: the _meta.md file (frontmatter-only) -------------------------

export const META_MD = `---
project: harness-engineering
version: 1
created: 2026-06-01
updated: 2026-06-27
last_synced: 2026-06-27T12:00:00.000Z
last_manual_edit: 2026-06-27T11:00:00.000Z
milestones:
  - MVP Release
  - v5.0 Hardening
  - Backlog
---
`;

export const META: RoadmapMeta = {
  frontmatter: {
    project: 'harness-engineering',
    version: 1,
    created: '2026-06-01',
    updated: '2026-06-27',
    lastSynced: '2026-06-27T12:00:00.000Z',
    lastManualEdit: '2026-06-27T11:00:00.000Z',
  },
  milestones: ['MVP Release', 'v5.0 Hardening', 'Backlog'],
};

/** `_meta.md` missing required frontmatter (`last_synced`/`last_manual_edit`). */
export const META_MD_MISSING_REQUIRED = `---
project: harness-engineering
version: 1
milestones:
  - Backlog
---
`;
