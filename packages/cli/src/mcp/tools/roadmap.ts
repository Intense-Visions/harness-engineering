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
    'Manage the project roadmap: show, add, update, remove, sync features, or query by filter. Reads and writes docs/roadmap.md.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      action: {
        type: 'string',
        enum: ['show', 'add', 'update', 'remove', 'query', 'sync'],
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
  action: 'show' | 'add' | 'update' | 'remove' | 'query' | 'sync';
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
  Ok: Awaited<typeof import('@harness-engineering/types')>['Ok'];
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
      if (input.status) feature.status = input.status;
      if (input.summary !== undefined) feature.summary = input.summary;
      if (input.spec !== undefined) feature.spec = input.spec || null;
      if (input.plans !== undefined) feature.plans = input.plans;
      if (input.blocked_by !== undefined) feature.blockedBy = input.blocked_by;
      if (input.assignee !== undefined) {
        deps.assignFeature(roadmap, feature, input.assignee, new Date().toISOString().slice(0, 10));
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
  const cascade = syncRoadmap({ projectPath, roadmap });
  if (cascade.ok && cascade.value.length > 0) {
    applySyncChanges(roadmap, cascade.value);
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
    case 'query':
      return handleQuery(projectPath, input, deps);
    case 'sync':
      return handleSync(projectPath, input, deps);
    default:
      return { content: [{ type: 'text' as const, text: `Error: unknown action` }], isError: true };
  }
}

function shouldTriggerExternalSync(input: ManageRoadmapInput, response: McpResponse): boolean {
  if (response.isError || readOnlyActions.has(input.action)) return false;
  if (input.action === 'sync') return input.apply === true;
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
    const { parseRoadmap, serializeRoadmap, syncRoadmap, applySyncChanges, assignFeature } =
      await import('@harness-engineering/core');
    const { Ok } = await import('@harness-engineering/types');

    const projectPath = projectPathPre;
    const deps: RoadmapDeps = {
      parseRoadmap,
      serializeRoadmap,
      syncRoadmap,
      applySyncChanges,
      assignFeature,
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
