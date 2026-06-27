import * as fs from 'fs';
import * as path from 'path';
import {
  loadProjectRoadmapMode,
  createTrackerClient,
  loadTrackerClientConfigFromProject,
} from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import { triggerExternalSync } from './roadmap-auto-sync.js';
import { handleManageRoadmapFileLess } from './roadmap-file-less.js';

export const manageRoadmapDefinition = {
  name: 'manage_roadmap',
  description:
    'Manage the project roadmap: show, add, update, remove, promote, sync, groom features, or query by filter. Reads and writes docs/roadmap.md. The "promote" action transitions an existing row toward planned (backlog→planned) and links its spec atomically — creating a new planned row under the "Intake" lane if the feature does not exist — returning a structured RoadmapPromoteResult envelope. The "groom" action tidies the roadmap: it demotes unactionable planned rows (no spec & no plan) to backlog and moves completed features into docs/roadmap-archive.md, returning the list of changes.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      action: {
        type: 'string',
        enum: ['show', 'add', 'update', 'remove', 'promote', 'query', 'sync', 'groom'],
        description: 'Action to perform',
      },
      feature: {
        type: 'string',
        description: 'Feature name (required for add, update, remove, promote)',
      },
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
      spec: {
        type: 'string',
        description: 'Spec file path (optional for add/update; required for promote)',
      },
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
      assignee: {
        type: 'string',
        description: 'Assignee username/email (optional for update). Tracks assignment history.',
      },
      filter: {
        type: 'string',
        description:
          'Query filter: "blocked", "in-progress", "done", "planned", "backlog", or "milestone:<name>" (required for query)',
      },
      apply: {
        type: 'boolean',
        description: 'For sync action: apply proposed changes (default: false, preview only)',
      },
      force_sync: {
        type: 'boolean',
        description: 'For sync action: override human-always-wins rule',
      },
    },
    required: ['path', 'action'],
  },
};

interface ManageRoadmapInput {
  path: string;
  action: 'show' | 'add' | 'update' | 'remove' | 'promote' | 'query' | 'sync' | 'groom';
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

import { type McpResponse } from '../utils.js';

interface RoadmapDeps {
  parseRoadmap: Awaited<typeof import('@harness-engineering/core')>['parseRoadmap'];
  serializeRoadmap: Awaited<typeof import('@harness-engineering/core')>['serializeRoadmap'];
  syncRoadmap: Awaited<typeof import('@harness-engineering/core')>['syncRoadmap'];
  applySyncChanges: Awaited<typeof import('@harness-engineering/core')>['applySyncChanges'];
  assignFeature: Awaited<typeof import('@harness-engineering/core')>['assignFeature'];
  setStatus: Awaited<typeof import('@harness-engineering/core')>['setStatus'];
  claim: Awaited<typeof import('@harness-engineering/core')>['claim'];
  release: Awaited<typeof import('@harness-engineering/core')>['release'];
  promoteFeature: Awaited<typeof import('@harness-engineering/core')>['promoteFeature'];
  groomRoadmap: Awaited<typeof import('@harness-engineering/core')>['groomRoadmap'];
  Ok: Awaited<typeof import('@harness-engineering/types')>['Ok'];
}

function archiveFilePath(projectRoot: string): string {
  return path.join(projectRoot, 'docs', 'roadmap-archive.md');
}

/**
 * Append archived (completed) features to docs/roadmap-archive.md under a
 * "Shipped" milestone, creating the file/milestone on first use. Keeps the
 * live roadmap lean (the orchestrator parses a smaller file) while preserving
 * history. The archive is a standalone, valid roadmap document.
 */
function appendToArchive(
  projectRoot: string,
  archived: import('@harness-engineering/types').RoadmapFeature[],
  project: string,
  deps: RoadmapDeps
): void {
  if (archived.length === 0) return;
  const { parseRoadmap, serializeRoadmap } = deps;
  const filePath = archiveFilePath(projectRoot);
  const nowIso = new Date().toISOString();

  let archive: import('@harness-engineering/types').Roadmap | null = null;
  try {
    const existing = parseRoadmap(fs.readFileSync(filePath, 'utf-8'));
    if (existing.ok) archive = existing.value;
  } catch {
    archive = null;
  }
  if (archive === null) {
    archive = {
      frontmatter: { project, version: 1, lastSynced: nowIso, lastManualEdit: nowIso },
      milestones: [],
      assignmentHistory: [],
    };
  }

  let shipped = archive.milestones.find((m) => m.name === 'Shipped');
  if (!shipped) {
    shipped = { name: 'Shipped', isBacklog: false, features: [] };
    archive.milestones.push(shipped);
  }
  shipped.features.push(...archived);
  archive.frontmatter.lastManualEdit = nowIso;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeRoadmap(archive), 'utf-8');
}

function roadmapNotFoundError(): McpResponse {
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

function handleShow(
  projectPath: string,
  input: ManageRoadmapInput,
  deps: RoadmapDeps
): McpResponse {
  const { parseRoadmap, Ok } = deps;

  const raw = readRoadmapFile(projectPath);
  if (raw === null) return roadmapNotFoundError();

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

function makeAddFieldError(label: string): McpResponse {
  return {
    content: [{ type: 'text' as const, text: `Error: ${label} is required for add action` }],
    isError: true,
  };
}

function validateAddFields(input: ManageRoadmapInput): McpResponse | null {
  const required: Array<[keyof ManageRoadmapInput, string]> = [
    ['feature', 'feature'],
    ['milestone', 'milestone'],
    ['status', 'status'],
    ['summary', 'summary'],
  ];
  for (const [field, label] of required) {
    if (!input[field]) return makeAddFieldError(label);
  }
  return null;
}

function buildFeatureFromInput(input: ManageRoadmapInput) {
  return {
    name: input.feature!,
    status: input.status!,
    spec: input.spec ?? null,
    plans: input.plans ?? [],
    blockedBy: input.blocked_by ?? [],
    summary: input.summary!,
    assignee: null,
    priority: null,
    externalId: null,
    updatedAt: null,
  };
}

function handleAdd(projectPath: string, input: ManageRoadmapInput, deps: RoadmapDeps): McpResponse {
  const { parseRoadmap, serializeRoadmap, Ok } = deps;

  const validationError = validateAddFields(input);
  if (validationError) return validationError;

  const raw = readRoadmapFile(projectPath);
  if (raw === null) return roadmapNotFoundError();

  const result = parseRoadmap(raw);
  if (!result.ok) return resultToMcpResponse(result);

  const roadmap = result.value;
  const milestone = roadmap.milestones.find(
    (m) => m.name.toLowerCase() === input.milestone!.toLowerCase()
  );
  if (!milestone) {
    return {
      content: [{ type: 'text' as const, text: `Error: milestone "${input.milestone}" not found` }],
      isError: true,
    };
  }

  milestone.features.push(buildFeatureFromInput(input));

  // Update last_manual_edit timestamp
  roadmap.frontmatter.lastManualEdit = new Date().toISOString();

  writeRoadmapFile(projectPath, serializeRoadmap(roadmap));
  return resultToMcpResponse(Ok(roadmap));
}

/**
 * Build the response for a refused claim (first-claim-wins lost race).
 *
 * The roadmap is unchanged, so the persisted file is NOT rewritten. The response
 * stays backward-compatible — it still serializes the roadmap object (callers
 * that read `.milestones` / `.assignmentHistory` keep working) — but adds an
 * explicit `claimed: false` flag plus a human-readable `message`, and is marked
 * `isError` so the auto-sync trigger skips the no-op (matching the promote
 * envelope convention).
 */
function claimRefusedResponse(
  featureName: string,
  roadmap: import('@harness-engineering/core').Roadmap,
  currentAssignee: string | null
): McpResponse {
  const message =
    `Claim refused: "${featureName}" is already in-progress under ` +
    `${currentAssignee ?? 'another owner'} (first-claim-wins). ` +
    `Release it first to hand off.`;
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ ...roadmap, claimed: false, message }),
      },
    ],
    isError: true,
  };
}

function handleUpdate(
  projectPath: string,
  input: ManageRoadmapInput,
  deps: RoadmapDeps
): McpResponse {
  const { parseRoadmap, serializeRoadmap, syncRoadmap, applySyncChanges, Ok } = deps;

  if (!input.feature) {
    return {
      content: [{ type: 'text' as const, text: 'Error: feature is required for update action' }],
      isError: true,
    };
  }

  const raw = readRoadmapFile(projectPath);
  if (raw === null) return roadmapNotFoundError();

  const result = parseRoadmap(raw);
  if (!result.ok) return resultToMcpResponse(result);

  const roadmap = result.value;
  let found = false;
  for (const m of roadmap.milestones) {
    const feature = m.features.find((f) => f.name.toLowerCase() === input.feature!.toLowerCase());
    if (feature) {
      const date = new Date().toISOString().slice(0, 10);
      // Route status/assignee through the assignee-lifecycle authority so the
      // `assignee ≠ null ⟺ in-progress` invariant holds on every write:
      // - setStatus auto-clears the assignee on any move away from in-progress
      //   (e.g. mark-done releases the executor);
      // - a non-empty assignee is a claim (forces in-progress, first-claim-wins);
      // - an empty assignee releases the claim.
      // Deliberate deviation from the spec's "reject a bare assignee write on a
      // non-in-progress row": we coerce to in-progress instead (an assignee *is*
      // the claim). Rationale + accepted trade-off in ADR-0045. Either way the
      // invariant cannot be violated by this path.
      if (input.status) deps.setStatus(roadmap, feature, input.status, date);
      if (input.summary !== undefined) feature.summary = input.summary;
      if (input.spec !== undefined) feature.spec = input.spec || null;
      if (input.plans !== undefined) feature.plans = input.plans;
      if (input.blocked_by !== undefined) feature.blockedBy = input.blocked_by;
      if (input.assignee !== undefined) {
        if (input.assignee) {
          deps.claim(roadmap, feature, input.assignee, date);
          // First-claim-wins: claim() no-ops when the row is already in-progress
          // under a different owner. Without an explicit signal the caller would
          // see a "success" with an unchanged assignee and silently lose the race.
          if (feature.assignee !== input.assignee) {
            return claimRefusedResponse(input.feature!, roadmap, feature.assignee);
          }
        } else {
          deps.release(roadmap, feature, date);
        }
      }
      found = true;
      break;
    }
  }

  if (!found) {
    return {
      content: [{ type: 'text' as const, text: `Error: feature "${input.feature}" not found` }],
      isError: true,
    };
  }

  // Cascade: when this update marks a feature done (or otherwise resolves a
  // blocker), flip dependents from blocked → planned in the same write.
  //
  // This is an unblock-only cascade. syncRoadmap also re-derives `blocked` for
  // any planned feature with an unfinished blocker (sync.ts inferStatus); since
  // planned/blocked are lateral in STATUS_RANK that move is not a regression, so
  // applying it verbatim re-blocks unrelated bystanders on every single update
  // (#610). Drop any transition *into* blocked here — re-blocking is the explicit
  // `sync` action's job, not a side-effect of editing one feature.
  const cascade = syncRoadmap({ projectPath, roadmap });
  if (cascade.ok) {
    const unblocking = cascade.value.filter((change) => change.to !== 'blocked');
    if (unblocking.length > 0) {
      applySyncChanges(roadmap, unblocking);
    }
  }

  roadmap.frontmatter.lastManualEdit = new Date().toISOString();

  writeRoadmapFile(projectPath, serializeRoadmap(roadmap));
  return resultToMcpResponse(Ok(roadmap));
}

function handleRemove(
  projectPath: string,
  input: ManageRoadmapInput,
  deps: RoadmapDeps
): McpResponse {
  const { parseRoadmap, serializeRoadmap, Ok } = deps;

  if (!input.feature) {
    return {
      content: [{ type: 'text' as const, text: 'Error: feature is required for remove action' }],
      isError: true,
    };
  }

  const raw = readRoadmapFile(projectPath);
  if (raw === null) return roadmapNotFoundError();

  const result = parseRoadmap(raw);
  if (!result.ok) return resultToMcpResponse(result);

  const roadmap = result.value;
  let found = false;
  for (const m of roadmap.milestones) {
    const idx = m.features.findIndex((f) => f.name.toLowerCase() === input.feature!.toLowerCase());
    if (idx !== -1) {
      m.features.splice(idx, 1);
      found = true;
      break;
    }
  }

  if (!found) {
    return {
      content: [{ type: 'text' as const, text: `Error: feature "${input.feature}" not found` }],
      isError: true,
    };
  }

  roadmap.frontmatter.lastManualEdit = new Date().toISOString();

  writeRoadmapFile(projectPath, serializeRoadmap(roadmap));
  return resultToMcpResponse(Ok(roadmap));
}

// The structured envelope is the contract (consumed by the brainstorming skill, dashboard,
// and autopilot). Refusals/failures are marked isError so the auto-sync trigger skips them
// and no mirror push fires on an unchanged roadmap; the full envelope JSON is carried in the
// text either way.
function promoteEnvelopeResponse(
  envelope: import('@harness-engineering/core').RoadmapPromoteResult
): McpResponse {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(envelope) }],
    isError: envelope.ok === false,
  };
}

function handlePromote(
  projectPath: string,
  input: ManageRoadmapInput,
  deps: RoadmapDeps
): McpResponse {
  const { parseRoadmap, serializeRoadmap, promoteFeature } = deps;

  if (!input.feature) {
    return {
      content: [{ type: 'text' as const, text: 'Error: feature is required for promote action' }],
      isError: true,
    };
  }
  if (!input.spec) {
    return {
      content: [{ type: 'text' as const, text: 'Error: spec is required for promote action' }],
      isError: true,
    };
  }

  const raw = readRoadmapFile(projectPath);
  // D4: no roadmap → silent skip. The skill still commits the spec; no envelope.
  if (raw === null) return roadmapNotFoundError();

  const result = parseRoadmap(raw);
  // A malformed roadmap surfaces as a write-failed envelope (D4): promotion
  // cannot proceed against a broken file and the human must repair it.
  if (!result.ok) {
    return promoteEnvelopeResponse({
      ok: false,
      reason: 'write-failed',
      feature: input.feature,
      detail: result.error.message,
    });
  }

  const { result: envelope, nextRoadmap } = promoteFeature(result.value, {
    feature: input.feature,
    spec: input.spec,
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
  });

  // Only a mutating success touches the file; noop and refusals leave it byte-identical.
  if (envelope.ok && envelope.transitioned !== 'noop') {
    nextRoadmap.frontmatter.lastManualEdit = new Date().toISOString();
    try {
      writeRoadmapFile(projectPath, serializeRoadmap(nextRoadmap));
    } catch (error) {
      return promoteEnvelopeResponse({
        ok: false,
        reason: 'write-failed',
        feature: input.feature,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // The structured envelope is returned verbatim for callers to branch on.
  return promoteEnvelopeResponse(envelope);
}

function handleQuery(
  projectPath: string,
  input: ManageRoadmapInput,
  deps: RoadmapDeps
): McpResponse {
  const { parseRoadmap, Ok } = deps;

  if (!input.filter) {
    return {
      content: [{ type: 'text' as const, text: 'Error: filter is required for query action' }],
      isError: true,
    };
  }

  const raw = readRoadmapFile(projectPath);
  if (raw === null) return roadmapNotFoundError();

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

function handleSync(
  projectPath: string,
  input: ManageRoadmapInput,
  deps: RoadmapDeps
): McpResponse {
  const { parseRoadmap, serializeRoadmap, syncRoadmap, Ok } = deps;

  const raw = readRoadmapFile(projectPath);
  if (raw === null) return roadmapNotFoundError();

  const result = parseRoadmap(raw);
  if (!result.ok) return resultToMcpResponse(result);

  const roadmap = result.value;
  const syncResult = syncRoadmap({
    projectPath,
    roadmap,
    forceSync: input.force_sync ?? false,
  });
  if (!syncResult.ok) return resultToMcpResponse(syncResult);

  const changes = syncResult.value;

  if (changes.length === 0) {
    return resultToMcpResponse(Ok({ changes: [], message: 'Roadmap is up to date.' }));
  }

  if (input.apply) {
    deps.applySyncChanges(roadmap, changes);
    writeRoadmapFile(projectPath, serializeRoadmap(roadmap));
    return resultToMcpResponse(Ok({ changes, applied: true, roadmap }));
  }

  return resultToMcpResponse(Ok({ changes, applied: false }));
}

function handleGroom(
  projectPath: string,
  _input: ManageRoadmapInput,
  deps: RoadmapDeps
): McpResponse {
  const { parseRoadmap, serializeRoadmap, groomRoadmap, Ok } = deps;

  const raw = readRoadmapFile(projectPath);
  if (raw === null) return roadmapNotFoundError();

  const result = parseRoadmap(raw);
  if (!result.ok) return resultToMcpResponse(result);

  const { roadmap: groomed, archived, changes } = groomRoadmap(result.value);

  if (changes.length === 0) {
    return resultToMcpResponse(
      Ok({ changes: [], archived: 0, demoted: 0, message: 'Roadmap is already tidy.' })
    );
  }

  appendToArchive(projectPath, archived, groomed.frontmatter.project, deps);
  groomed.frontmatter.lastManualEdit = new Date().toISOString();
  writeRoadmapFile(projectPath, serializeRoadmap(groomed));

  const demoted = changes.filter((c) => c.kind === 'demoted').length;
  return resultToMcpResponse(
    Ok({
      changes,
      archived: archived.length,
      demoted,
      message: `Groomed: ${demoted} demoted to backlog, ${archived.length} archived to docs/roadmap-archive.md.`,
    })
  );
}

const readOnlyActions = new Set(['show', 'query']);

function dispatchAction(
  action: ManageRoadmapInput['action'],
  projectPath: string,
  input: ManageRoadmapInput,
  deps: RoadmapDeps
): McpResponse {
  switch (action) {
    case 'show':
      return handleShow(projectPath, input, deps);
    case 'add':
      return handleAdd(projectPath, input, deps);
    case 'update':
      return handleUpdate(projectPath, input, deps);
    case 'remove':
      return handleRemove(projectPath, input, deps);
    case 'promote':
      return handlePromote(projectPath, input, deps);
    case 'query':
      return handleQuery(projectPath, input, deps);
    case 'sync':
      return handleSync(projectPath, input, deps);
    case 'groom':
      return handleGroom(projectPath, input, deps);
    default:
      return { content: [{ type: 'text' as const, text: `Error: unknown action` }], isError: true };
  }
}

function shouldTriggerExternalSync(input: ManageRoadmapInput, response: McpResponse): boolean {
  if (response.isError || readOnlyActions.has(input.action)) return false;
  if (input.action === 'sync') return input.apply === true;
  // Groom is a local reorganization (demote/archive). Mirroring it would read
  // archived rows leaving roadmap.md as deletions; run `sync` explicitly instead.
  if (input.action === 'groom') return false;
  return true;
}

export async function handleManageRoadmap(input: ManageRoadmapInput): Promise<McpResponse> {
  const projectPathPre = sanitizePath(input.path);

  // Phase 4 / S1: dispatch on roadmap mode.
  // Note: `sanitizePath(input.path)` runs upstream of the file-less guard,
  // so any externalId resolution downstream (in handleManageRoadmapFileLess)
  // sees a sanitized project path. The externalId itself comes from the
  // tracker client response, not from `input`, and is guarded again by the
  // adapter's confused-deputy check (see github-issues.ts).
  const mode = loadProjectRoadmapMode(projectPathPre);
  if (mode === 'file-less') {
    const trackerCfg = loadTrackerClientConfigFromProject(projectPathPre);
    if (!trackerCfg.ok) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${trackerCfg.error.message}` }],
        isError: true,
      };
    }
    const clientResult = createTrackerClient(trackerCfg.value);
    if (!clientResult.ok) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${clientResult.error.message}` }],
        isError: true,
      };
    }
    return handleManageRoadmapFileLess(input, clientResult.value);
  }

  try {
    const {
      parseRoadmap,
      serializeRoadmap,
      syncRoadmap,
      applySyncChanges,
      assignFeature,
      setStatus,
      claim,
      release,
      promoteFeature,
      groomRoadmap,
    } = await import('@harness-engineering/core');
    const { Ok } = await import('@harness-engineering/types');

    const projectPath = projectPathPre;
    const deps: RoadmapDeps = {
      parseRoadmap,
      serializeRoadmap,
      syncRoadmap,
      applySyncChanges,
      assignFeature,
      setStatus,
      claim,
      release,
      promoteFeature,
      groomRoadmap,
      Ok,
    };
    const response = dispatchAction(input.action, projectPath, input, deps);

    if (shouldTriggerExternalSync(input, response)) {
      await triggerExternalSync(projectPath, roadmapPath(projectPath)).catch(() => {});
    }

    return response;
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
