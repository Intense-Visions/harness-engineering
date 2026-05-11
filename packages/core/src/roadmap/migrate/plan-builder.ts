import type { Roadmap, RoadmapFeature, RoadmapMilestone } from '@harness-engineering/types';
import type {
  TrackedFeature,
  HistoryEvent,
  HistoryEventType,
  NewFeatureInput,
  FeaturePatch,
} from '../tracker';
import { parseBodyBlock, type BodyMeta } from '../tracker/body-metadata';
import { bodyMetaMatches } from './body-diff';
import { hashHistoryEvent } from './history-hash';
import type { MigrationPlan } from './types';

/**
 * Build a migration plan from a parsed roadmap and the current tracker state.
 *
 * Inputs:
 * - `roadmap` — parsed local `docs/roadmap.md`.
 * - `existingFeatures` — `client.fetchAll().value.features` from the tracker.
 * - `fetchHistoryHashes` — given an externalId, returns the set of `harness-history`
 *   comment hashes already on that issue. Used for history-event dedup (D-P5-C).
 * - `getRawBodyForExternalId` — given an externalId, returns the live raw issue body
 *   (so we can parse the live BodyMeta for diff). Return null when the body is not
 *   available; the feature will be treated as toUpdate to be safe.
 */
export async function buildMigrationPlan(
  roadmap: Roadmap,
  existingFeatures: TrackedFeature[],
  fetchHistoryHashes: (externalId: string) => Promise<Set<string>>,
  getRawBodyForExternalId: (externalId: string) => Promise<string | null>
): Promise<MigrationPlan> {
  const plan: MigrationPlan = {
    toCreate: [],
    toUpdate: [],
    unchanged: [],
    historyToAppend: [],
    ambiguous: [],
  };

  const byExternalId = new Map<string, TrackedFeature>();
  const byNameLower = new Map<string, TrackedFeature>();
  for (const t of existingFeatures) {
    byExternalId.set(t.externalId, t);
    byNameLower.set(t.name.toLowerCase(), t);
  }

  // Build a flat list of [milestone, feature] tuples for iteration + name->externalId map.
  const featureToExternalId = new Map<string, string>();
  for (const ms of roadmap.milestones) {
    for (const f of ms.features) {
      if (f.externalId) featureToExternalId.set(f.name, f.externalId);
    }
  }

  for (const ms of roadmap.milestones) {
    for (const feature of ms.features) {
      if (feature.externalId == null) {
        // New feature OR title collision (D-P5-E).
        const existing = byNameLower.get(feature.name.toLowerCase());
        if (existing) {
          plan.ambiguous.push({ name: feature.name, existingIssueRef: existing.externalId });
        } else {
          plan.toCreate.push({
            name: feature.name,
            input: featureToNewInput(feature, ms),
          });
        }
        continue;
      }

      const tracked = byExternalId.get(feature.externalId);
      if (!tracked) {
        // Dangling external id — recorded in roadmap but not on tracker.
        plan.ambiguous.push({
          name: feature.name,
          existingIssueRef: `${feature.externalId} (recorded external id not found)`,
        });
        continue;
      }

      const expectedMeta = featureToExpectedMeta(feature, ms);
      const rawBody = await getRawBodyForExternalId(feature.externalId);
      const actualMeta: BodyMeta = rawBody == null ? {} : parseBodyBlock(rawBody).meta;

      if (rawBody != null && bodyMetaMatches(actualMeta, expectedMeta)) {
        plan.unchanged.push({ externalId: feature.externalId, name: feature.name });
      } else {
        const diff = formatDiff(actualMeta, expectedMeta);
        const patch = metaToPatch(feature, expectedMeta);
        plan.toUpdate.push({
          externalId: feature.externalId,
          name: feature.name,
          patch,
          diff,
        });
      }
    }
  }

  // Assignment history → HistoryEvents, deduped by per-externalId comment hash set.
  for (const record of roadmap.assignmentHistory) {
    const externalId = featureToExternalId.get(record.feature);
    if (!externalId) {
      // Unresolved feature ref — warn and skip.
      console.warn(
        `harness-migrate: cannot resolve external id for assignment-history feature "${record.feature}"; skipping.`
      );
      continue;
    }
    const type = mapAction(record.action);
    const event: HistoryEvent = {
      type,
      actor: record.assignee,
      at: record.date,
    };
    const hash = hashHistoryEvent(event);
    const existingHashes = await fetchHistoryHashes(externalId);
    if (existingHashes.has(hash)) continue;
    plan.historyToAppend.push({ externalId, event, hash });
  }

  return plan;
}

function featureToExpectedMeta(feature: RoadmapFeature, milestone: RoadmapMilestone): BodyMeta {
  const meta: BodyMeta = {};
  if (feature.spec != null) meta.spec = feature.spec;
  if (feature.plans.length > 0) meta.plan = feature.plans[0] ?? null;
  if (feature.blockedBy.length > 0) meta.blocked_by = feature.blockedBy.slice().sort();
  if (feature.priority != null) meta.priority = feature.priority;
  if (!milestone.isBacklog) meta.milestone = milestone.name;
  return meta;
}

function featureToNewInput(feature: RoadmapFeature, milestone: RoadmapMilestone): NewFeatureInput {
  const input: NewFeatureInput = {
    name: feature.name,
    summary: feature.summary,
    status: feature.status,
    spec: feature.spec,
    plans: feature.plans,
    blockedBy: feature.blockedBy,
    priority: feature.priority,
    milestone: milestone.isBacklog ? null : milestone.name,
    assignee: feature.assignee,
  };
  return input;
}

function metaToPatch(feature: RoadmapFeature, expected: BodyMeta): FeaturePatch {
  const patch: FeaturePatch = {};
  patch.summary = feature.summary;
  if (expected.spec !== undefined) patch.spec = expected.spec ?? null;
  if (expected.plan !== undefined && expected.plan != null) patch.plans = [expected.plan];
  if (expected.blocked_by !== undefined) patch.blockedBy = expected.blocked_by ?? [];
  if (expected.priority !== undefined) patch.priority = expected.priority ?? null;
  if (expected.milestone !== undefined) patch.milestone = expected.milestone ?? null;
  return patch;
}

function formatDiff(actual: BodyMeta, expected: BodyMeta): string {
  const keys = new Set<string>();
  const collect = (m: BodyMeta) => {
    for (const k of Object.keys(m)) {
      const v = (m as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)) keys.add(k);
    }
  };
  collect(actual);
  collect(expected);
  const changed: string[] = [];
  for (const key of [...keys].sort()) {
    const a = (actual as Record<string, unknown>)[key];
    const e = (expected as Record<string, unknown>)[key];
    if (JSON.stringify(a ?? null) !== JSON.stringify(e ?? null)) changed.push(key);
  }
  return changed.join(',');
}

function mapAction(action: 'assigned' | 'completed' | 'unassigned'): HistoryEventType {
  switch (action) {
    case 'assigned':
      return 'claimed';
    case 'completed':
      return 'completed';
    case 'unassigned':
      return 'released';
  }
}
