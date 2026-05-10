/**
 * Phase 4 / S3 + S5: file-less branches of the dashboard claim and
 * roadmap-status endpoints.
 *
 * Translates each endpoint's mutator to a `RoadmapTrackerClient` call:
 *
 *   claim         → client.claim(externalId, assignee) → 200 / 404 / 409 / 502
 *   roadmapStatus → client.update(externalId, { status }) → 200 / 404 / 409 / 502
 *
 * 409 responses use the standard server contract from D-P4-B:
 *
 *   {
 *     error: string,
 *     code: 'TRACKER_CONFLICT',
 *     externalId: string,
 *     conflictedWith?: unknown,
 *     refreshHint: 'reload-roadmap'
 *   }
 *
 * @see docs/changes/roadmap-tracker-only/plans/2026-05-09-phase-4-wire-consumers-plan.md
 */
import type { RoadmapTrackerClient, TrackedFeature, FeaturePatch } from '@harness-engineering/core';
import { ConflictError } from '@harness-engineering/core';
import type { FeatureStatus } from '@harness-engineering/types';

/**
 * Minimal subset of the Hono Context we use. The dashboard production code
 * uses `Context` from 'hono' but accepting a structural type here keeps the
 * helper testable without a full Hono context fixture.
 */
export interface JsonResponder {
  json(body: unknown, status?: number): unknown;
}

export interface ClaimFileLessBody {
  feature: string;
  assignee: string;
}

export interface RoadmapStatusFileLessBody {
  feature: string;
  status: string;
}

const VALID_STATUSES = new Set<string>([
  'done',
  'in-progress',
  'planned',
  'blocked',
  'backlog',
  'needs-human',
]);

async function resolveFeatureByName(
  client: RoadmapTrackerClient,
  name: string
): Promise<{ ok: true; value: TrackedFeature } | { ok: false; status: number; body: unknown }> {
  const r = await client.fetchAll();
  if (!r.ok) {
    return { ok: false, status: 502, body: { error: r.error.message } };
  }
  const found = r.value.features.find((x) => x.name === name);
  if (!found) {
    return { ok: false, status: 404, body: { error: `Feature '${name}' not found` } };
  }
  return { ok: true, value: found };
}

function makeConflictBody(err: ConflictError): Record<string, unknown> {
  return {
    error: err.message,
    code: 'TRACKER_CONFLICT' as const,
    externalId: err.externalId,
    conflictedWith: err.diff,
    refreshHint: 'reload-roadmap' as const,
  };
}

export async function handleClaimFileLess(
  c: JsonResponder,
  client: RoadmapTrackerClient,
  body: ClaimFileLessBody
): Promise<unknown> {
  const found = await resolveFeatureByName(client, body.feature);
  if (!found.ok) return c.json(found.body, found.status);
  const r = await client.claim(found.value.externalId, body.assignee);
  if (!r.ok) {
    if (r.error instanceof ConflictError) {
      return c.json(makeConflictBody(r.error), 409);
    }
    return c.json({ error: r.error.message }, 502);
  }
  return c.json(
    {
      ok: true,
      feature: r.value.name,
      status: r.value.status,
      assignee: r.value.assignee,
      externalId: r.value.externalId,
      workflow: 'brainstorming',
      githubSynced: true,
    },
    200
  );
}

export async function handleRoadmapStatusFileLess(
  c: JsonResponder,
  client: RoadmapTrackerClient,
  body: RoadmapStatusFileLessBody
): Promise<unknown> {
  if (!body.feature || !body.status) {
    return c.json({ error: 'feature and status are required' }, 400);
  }
  if (!VALID_STATUSES.has(body.status)) {
    return c.json({ error: `invalid status: ${body.status}` }, 400);
  }
  const found = await resolveFeatureByName(client, body.feature);
  if (!found.ok) return c.json(found.body, found.status);
  const patch: FeaturePatch = { status: body.status as FeatureStatus };
  const r = await client.update(found.value.externalId, patch);
  if (!r.ok) {
    if (r.error instanceof ConflictError) {
      return c.json(makeConflictBody(r.error), 409);
    }
    return c.json({ error: r.error.message }, 502);
  }
  return c.json({ ok: true, feature: r.value.name, status: r.value.status }, 200);
}
