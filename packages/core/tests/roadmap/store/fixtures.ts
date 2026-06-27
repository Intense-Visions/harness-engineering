import type { FeatureStatus, RoadmapFeature, Roadmap } from '@harness-engineering/types';
import type { Shard, RoadmapMeta } from '../../../src/roadmap/store/roadmap-store';
import { serializeRoadmap } from '../../../src/roadmap/serialize';

/** Compact factory for a fully-specified RoadmapFeature (all optionals null/empty). */
export function feat(
  name: string,
  status: FeatureStatus,
  extra: Partial<RoadmapFeature> = {}
): RoadmapFeature {
  return {
    name,
    status,
    spec: null,
    plans: [],
    blockedBy: [],
    summary: `Summary for ${name}`,
    assignee: null,
    priority: null,
    externalId: null,
    updatedAt: null,
    ...extra,
  };
}

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

// --- Task 5: assembler ordering across milestones -------------------------

export const ASSEMBLER_META: RoadmapMeta = {
  frontmatter: META.frontmatter,
  milestones: ['MVP Release', 'v5.0 Hardening', 'Backlog'],
};

// Named features so they can be referenced from both shards and the expected roadmap.
const A_FEATURE = feat('A feature', 'in-progress'); // MVP, order 10
const TIE_A = feat('Tie A', 'planned'); // MVP, order 10 (status/slug tiebreak)
const TIE_Z = feat('Tie Z', 'planned'); // MVP, order 10 (slug tiebreak)
const B_FEATURE = feat('B feature', 'planned'); // MVP, order 20
const HARDENING_X = feat('Hardening X', 'done'); // v5.0 Hardening, order 15
const BACKLOG_ITEM = feat('Backlog item', 'backlog'); // Backlog, order 5
const ORPHAN = feat('Orphan feature', 'planned'); // milestone NOT in meta.milestones

/** Intentionally out of milestone- and order-sequence to exercise sorting. */
export const ASSEMBLER_SHARDS: Shard[] = [
  { slug: 'b-feature', milestone: 'MVP Release', order: 20, feature: B_FEATURE },
  { slug: 'backlog-item', milestone: 'Backlog', order: 5, feature: BACKLOG_ITEM },
  { slug: 'tie-z', milestone: 'MVP Release', order: 10, feature: TIE_Z },
  { slug: 'orphan', milestone: 'Unlisted Milestone', order: 1, feature: ORPHAN },
  { slug: 'a-feature', milestone: 'MVP Release', order: 10, feature: A_FEATURE },
  { slug: 'hardening-x', milestone: 'v5.0 Hardening', order: 15, feature: HARDENING_X },
  { slug: 'tie-a', milestone: 'MVP Release', order: 10, feature: TIE_A },
];

export const EXPECTED_ROADMAP: Roadmap = {
  frontmatter: ASSEMBLER_META.frontmatter,
  milestones: [
    {
      name: 'MVP Release',
      isBacklog: false,
      // order 10 group: A_FEATURE (in-progress, rank 2) before the planned ties;
      // ties broken by slug asc: tie-a (Tie A) before tie-z (Tie Z); then order 20.
      features: [A_FEATURE, TIE_A, TIE_Z, B_FEATURE],
    },
    { name: 'v5.0 Hardening', isBacklog: false, features: [HARDENING_X] },
    { name: 'Backlog', isBacklog: true, features: [BACKLOG_ITEM] },
    // Unlisted milestone appended after ordered milestones (documented fallback).
    { name: 'Unlisted Milestone', isBacklog: false, features: [ORPHAN] },
  ],
  assignmentHistory: [],
};

// --- Task 6: monolith store -----------------------------------------------

export const MONOLITH_ROADMAP: Roadmap = {
  frontmatter: META.frontmatter,
  milestones: [
    {
      name: 'MVP Release',
      isBacklog: false,
      features: [feat('A feature', 'planned'), feat('B feature', 'planned')],
    },
    { name: 'Backlog', isBacklog: true, features: [feat('Backlog item', 'backlog')] },
  ],
  assignmentHistory: [],
};

export const MONOLITH_ROADMAP_MD = serializeRoadmap(MONOLITH_ROADMAP);
