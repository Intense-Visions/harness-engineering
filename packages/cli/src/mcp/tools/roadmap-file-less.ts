/**
 * Phase 4 / S1: file-less branch of the `manage_roadmap` MCP tool.
 *
 * Translates each `manage_roadmap` action to a `RoadmapTrackerClient` call:
 *
 *   show   → client.fetchAll()  + optional milestone/status filter
 *   query  → client.fetchAll()  + filter parser (status or "milestone:<name>")
 *   add    → client.create(NewFeatureInput)
 *   update → client.fetchAll() to resolve name→externalId + client.update()
 *   remove → client.update(id, { status: 'done' }) (D-P4-A translation)
 *   sync   → no-op: tracker IS the sync target
 *
 * The function returns the same `McpResponse` shape the existing file-backed
 * branch returns so callers do not need to special-case file-less.
 *
 * @see docs/changes/roadmap-tracker-only/plans/2026-05-09-phase-4-wire-consumers-plan.md
 */
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
  FeaturePatch,
  RoadmapPromoteCoreResult,
} from '@harness-engineering/core';
import { ConflictError, decidePromotionForRow } from '@harness-engineering/core';

export interface ManageRoadmapFileLessInput {
  path: string;
  action: 'show' | 'add' | 'update' | 'remove' | 'promote' | 'query' | 'sync';
  feature?: string;
  milestone?: string;
  status?: 'backlog' | 'planned' | 'in-progress' | 'done' | 'blocked';
  summary?: string;
  spec?: string;
  plans?: string[];
  blocked_by?: string[];
  assignee?: string;
  filter?: string;
  apply?: boolean;
  force_sync?: boolean;
}

interface McpTextContent {
  type: 'text';
  text: string;
}
interface McpResponse {
  content: McpTextContent[];
  isError?: boolean;
}

const ok = (text: string): McpResponse => ({ content: [{ type: 'text', text }] });
const err = (text: string): McpResponse => ({ content: [{ type: 'text', text }], isError: true });

export async function handleManageRoadmapFileLess(
  input: ManageRoadmapFileLessInput,
  client: RoadmapTrackerClient
): Promise<McpResponse> {
  switch (input.action) {
    case 'show':
      return handleShow(input, client);
    case 'query':
      return handleQuery(input, client);
    case 'add':
      return handleAdd(input, client);
    case 'update':
      return handleUpdate(input, client);
    case 'remove':
      return handleRemove(input, client);
    case 'promote':
      return handlePromote(input, client);
    case 'sync':
      return handleSync();
    default:
      return err(`Error: unknown action`);
  }
}

async function handleShow(
  input: ManageRoadmapFileLessInput,
  client: RoadmapTrackerClient
): Promise<McpResponse> {
  const r = await client.fetchAll();
  if (!r.ok) return err(`Error: ${r.error.message}`);
  let features = r.value.features;
  if (input.milestone) {
    features = features.filter((f) => f.milestone === input.milestone);
  }
  if (input.status) {
    features = features.filter((f) => f.status === input.status);
  }
  return ok(renderRoadmap(features));
}

async function handleQuery(
  input: ManageRoadmapFileLessInput,
  client: RoadmapTrackerClient
): Promise<McpResponse> {
  const filter = input.filter;
  if (!filter) return err('Error: query requires a filter');
  const r = await client.fetchAll();
  if (!r.ok) return err(`Error: ${r.error.message}`);
  let features = r.value.features;
  if (filter.startsWith('milestone:')) {
    const ms = filter.slice('milestone:'.length);
    features = features.filter((f) => f.milestone === ms);
  } else if (filter === 'blocked') {
    features = features.filter((f) => f.blockedBy.length > 0);
  } else {
    features = features.filter((f) => f.status === filter);
  }
  return ok(renderRoadmap(features));
}

async function handleAdd(
  input: ManageRoadmapFileLessInput,
  client: RoadmapTrackerClient
): Promise<McpResponse> {
  if (!input.feature) return err('Error: add requires feature name');
  const newFeature: NewFeatureInput = {
    name: input.feature,
    summary: input.summary ?? input.feature,
    status: input.status ?? 'planned',
  };
  if (input.spec !== undefined) newFeature.spec = input.spec;
  if (input.plans !== undefined) newFeature.plans = input.plans;
  if (input.blocked_by !== undefined) newFeature.blockedBy = input.blocked_by;
  if (input.milestone !== undefined) newFeature.milestone = input.milestone;
  if (input.assignee !== undefined) newFeature.assignee = input.assignee;
  const r = await client.create(newFeature);
  if (!r.ok) return err(`Error: ${r.error.message}`);
  return ok(`Added feature: ${r.value.name} (${r.value.externalId})`);
}

async function handleUpdate(
  input: ManageRoadmapFileLessInput,
  client: RoadmapTrackerClient
): Promise<McpResponse> {
  if (!input.feature) return err('Error: update requires feature name');
  const found = await resolveFeatureByName(client, input.feature);
  if (!found.ok) return err(found.error);
  const patch: FeaturePatch = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.summary !== undefined) patch.summary = input.summary;
  if (input.spec !== undefined) patch.spec = input.spec;
  if (input.plans !== undefined) patch.plans = input.plans;
  if (input.blocked_by !== undefined) patch.blockedBy = input.blocked_by;
  if (input.assignee !== undefined) patch.assignee = input.assignee;
  const r = await client.update(found.value.externalId, patch);
  if (!r.ok) {
    if (r.error instanceof ConflictError) {
      return err(`Error: conflict on ${r.error.externalId}: ${JSON.stringify(r.error.diff)}`);
    }
    return err(`Error: ${r.error.message}`);
  }
  // REV-P4-3: file-backed mode runs syncRoadmap() to cascade dependent updates
  // (see packages/cli/src/mcp/tools/roadmap.ts). File-less mode has no cascade
  // engine — the tracker is canonical and there is no local dependency graph
  // to walk. Surface that asymmetry as a footnote so an operator who sees a
  // changed status without dependent updates knows it is intentional.
  return ok(
    `Updated feature: ${r.value.name}\n\nNote: cascade dropped — file-less mode does not run syncRoadmap.`
  );
}

async function handleRemove(
  input: ManageRoadmapFileLessInput,
  client: RoadmapTrackerClient
): Promise<McpResponse> {
  if (!input.feature) return err('Error: remove requires feature name');
  const found = await resolveFeatureByName(client, input.feature);
  if (!found.ok) return err(found.error);
  // D-P4-A: file-less has no "delete"; translate to status:done. Audit history
  // is preserved via appendHistory (best-effort).
  const r = await client.update(found.value.externalId, { status: 'done' });
  if (!r.ok) {
    if (r.error instanceof ConflictError) {
      return err(`Error: conflict on ${r.error.externalId}: ${JSON.stringify(r.error.diff)}`);
    }
    return err(`Error: ${r.error.message}`);
  }
  // Best-effort history; swallow errors so the user-visible operation succeeds.
  client
    .appendHistory(found.value.externalId, {
      type: 'completed',
      at: new Date().toISOString(),
      actor: 'manage_roadmap',
      details: {
        note: 'removed via manage_roadmap (file-less translates remove to complete)',
      },
    })
    .catch(() => {});
  return ok(`Removed feature: ${found.value.name} (translated to status:done in file-less mode)`);
}

const EM_DASH = '—';

/** Mirror of promote.ts isEmptySummary — a row with no real summary may receive the spec H1 (D5). */
function isEmptySummaryFileLess(summary: string): boolean {
  const trimmed = summary.trim();
  return trimmed === '' || trimmed === EM_DASH;
}

/**
 * Return the structured RoadmapPromoteResult envelope as JSON text, matching file-backed
 * mode. Refusals are marked `isError` so the caller (and the auto-sync trigger) can skip
 * them without re-parsing the JSON; the full envelope rides in the text either way.
 */
function envelope(result: RoadmapPromoteCoreResult): McpResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    isError: result.ok === false,
  };
}

/**
 * Promote a feature in file-less mode. The per-row state-transition decision is
 * shared with file-backed mode via `decidePromotionForRow` (rules live in core,
 * per ADR — D6), then translated to tracker `create`/`update` calls. Typo-hint
 * refusal (file-backed D1) is intentionally not reproduced here: the tracker has
 * no local Levenshtein corpus and file-less write refinement is out of scope for
 * this sub-project (see proposal non-goals). A missing row creates a new one.
 */
async function handlePromote(
  input: ManageRoadmapFileLessInput,
  client: RoadmapTrackerClient
): Promise<McpResponse> {
  if (!input.feature) return err('Error: promote requires feature name');
  if (!input.spec) return err('Error: promote requires spec path');

  const fetched = await client.fetchAll();
  if (!fetched.ok) return err(`Error: ${fetched.error.message}`);

  const query = input.feature.trim();
  const queryLower = query.toLowerCase();
  const matches = fetched.value.features.filter((f) => f.name.trim().toLowerCase() === queryLower);

  // Ambiguous: same heading across milestones (D1 / S3-001).
  if (matches.length > 1) {
    const qualified = matches.map((f) => `${f.milestone ?? '(no milestone)'} > ${f.name}`);
    return envelope({
      ok: false,
      reason: 'ambiguous',
      feature: query,
      detail: `"${query}" matches ${qualified.length} rows. Re-invoke milestone-qualified: ${qualified.join(', ')}.`,
      matches: qualified,
    });
  }

  // Not found → create a new planned row (D2 not-found → create).
  if (matches.length === 0) {
    const created: NewFeatureInput = {
      name: query,
      summary: input.summary ?? query,
      status: 'planned',
      spec: input.spec,
    };
    if (input.milestone !== undefined) created.milestone = input.milestone;
    const c = await client.create(created);
    if (!c.ok) return err(`Error: ${c.error.message}`);
    return envelope({ ok: true, transitioned: 'created', feature: query });
  }

  const target = matches[0]!;
  const decision = decidePromotionForRow(target.status, target.spec, target.summary, {
    feature: query,
    spec: input.spec,
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
  });

  if (decision.action === 'refuse') {
    const detail =
      decision.reason === 'in-progress'
        ? `"${query}" is in-progress: an agent is dispatched against this row.`
        : `"${query}" is already 'done'. To revise a shipped feature, use a new name.`;
    return envelope({ ok: false, reason: decision.reason, feature: query, detail });
  }

  if (decision.action === 'noop') {
    return envelope({ ok: true, transitioned: 'noop', feature: query });
  }

  const patch: FeaturePatch = { spec: input.spec };
  if (decision.action === 'set-planned') patch.status = 'planned';
  if (
    input.summary !== undefined &&
    input.summary !== '' &&
    isEmptySummaryFileLess(target.summary)
  ) {
    patch.summary = input.summary;
  }

  const updated = await client.update(target.externalId, patch);
  if (!updated.ok) {
    if (updated.error instanceof ConflictError) {
      return err(
        `Error: conflict on ${updated.error.externalId}: ${JSON.stringify(updated.error.diff)}`
      );
    }
    return err(`Error: ${updated.error.message}`);
  }

  return envelope({
    ok: true,
    transitioned: decision.action === 'set-planned' ? 'backlog→planned' : 'spec-updated',
    feature: query,
  });
}

function handleSync(): McpResponse {
  return ok('Roadmap is up to date (file-less mode; tracker is canonical).');
}

async function resolveFeatureByName(
  client: RoadmapTrackerClient,
  name: string
): Promise<{ ok: true; value: TrackedFeature } | { ok: false; error: string }> {
  const r = await client.fetchAll();
  if (!r.ok) return { ok: false, error: `Error: ${r.error.message}` };
  const f = r.value.features.find((x) => x.name === name);
  if (!f) return { ok: false, error: `Error: feature "${name}" not found` };
  return { ok: true, value: f };
}

function renderRoadmap(features: TrackedFeature[]): string {
  if (features.length === 0) return '(no features)';
  const lines: string[] = [];
  for (const f of features) {
    const parts = [
      `- ${f.name}`,
      `status: ${f.status}`,
      f.milestone ? `milestone: ${f.milestone}` : null,
      f.priority ? `priority: ${f.priority}` : null,
      f.assignee ? `assignee: ${f.assignee}` : null,
      f.externalId ? `externalId: ${f.externalId}` : null,
    ].filter((x): x is string => x !== null);
    lines.push(parts.join(' | '));
    if (f.summary) lines.push(`  ${f.summary}`);
  }
  return lines.join('\n');
}
