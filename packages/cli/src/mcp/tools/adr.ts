import { resultToMcpResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import { Ok } from '@harness-engineering/types';
import { type McpResponse } from '../utils.js';
import {
  AdrStoreError,
  createAdr,
  listAdrs,
  readAdr,
  resolveWorktreeRoot,
  updateAdr,
  type CreateAdrInput,
  type UpdateAdrInput,
} from './adr-store.js';

/**
 * `manage_adr` — structured CRUD over Architecture Decision Records.
 *
 * Symmetric to `manage_roadmap`: a single action-dispatch tool over a
 * filesystem store (`docs/knowledge/decisions/NNNN-<slug>.md`). It exposes the
 * ADR substrate — until now only reachable through skill-mediated prose
 * (`adr-fleet`, `architecture-advisor`) — to any MCP caller, so an agent can
 * create or amend a decision record programmatically. `create` allocates the
 * next number as `max(existing) + 1`, the collision-free scheme required by the
 * known ADR-number-collision defect (#1323).
 */
export const manageAdrDefinition = {
  name: 'manage_adr',
  description:
    'Manage Architecture Decision Records (ADRs) in docs/knowledge/decisions/: create, read, update, or list decision records. "create" allocates the next collision-free ADR number (max(existing)+1, zero-padded) and writes a well-formed record with Context/Decision/Consequences sections at status "proposed" by default. "read" resolves an ADR by number ("92"/"0092"), slug, or filename. "update" patches frontmatter fields (status, title, tier, source, supersedes) and/or individual body sections without ever reusing a number. "list" returns every record as a number-sorted summary. Structured counterpart to the prose-only adr-fleet / architecture-advisor skill surface.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      action: {
        type: 'string',
        enum: ['create', 'read', 'update', 'list'],
        description: 'Action to perform',
      },
      ref: {
        type: 'string',
        description:
          'ADR reference for read/update: an ADR number ("92" or "0092"), a slug, or a filename',
      },
      title: {
        type: 'string',
        description: 'ADR title (required for create; optional for update)',
      },
      status: {
        type: 'string',
        enum: ['proposed', 'accepted', 'superseded', 'deprecated'],
        description: 'ADR status (optional; defaults to "proposed" on create)',
      },
      tier: {
        type: 'string',
        description: 'Decision tier: small | medium | large (optional)',
      },
      source: {
        type: 'string',
        description: 'Source spec path or session slug that motivated the decision (optional)',
      },
      supersedes: {
        type: 'string',
        description: 'Prior ADR number this decision supersedes (optional)',
      },
      date: {
        type: 'string',
        description: 'Decision date YYYY-MM-DD (optional; defaults to today on create)',
      },
      slug: {
        type: 'string',
        description:
          'Explicit filename slug for create (optional; derived from the title if omitted)',
      },
      context: {
        type: 'string',
        description: 'Context section body (required for create; replaces the section on update)',
      },
      decision: {
        type: 'string',
        description: 'Decision section body (required for create; replaces the section on update)',
      },
      consequences: {
        type: 'string',
        description:
          'Consequences section body (required for create; replaces the section on update)',
      },
      body: {
        type: 'string',
        description:
          'For update only: replace the entire markdown body verbatim (mutually exclusive with section edits)',
      },
    },
    required: ['path', 'action'],
  },
};

interface ManageAdrInput {
  path: string;
  action: 'create' | 'read' | 'update' | 'list';
  ref?: string;
  title?: string;
  status?: 'proposed' | 'accepted' | 'superseded' | 'deprecated';
  tier?: string;
  source?: string;
  supersedes?: string;
  date?: string;
  slug?: string;
  context?: string;
  decision?: string;
  consequences?: string;
  body?: string;
}

function errorResponse(message: string): McpResponse {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function handleCreate(projectPath: string, input: ManageAdrInput): McpResponse {
  if (!input.title) return errorResponse('title is required for create action');
  const missing = (['context', 'decision', 'consequences'] as const).filter((f) => !input[f]);
  if (missing.length > 0) {
    return errorResponse(`${missing.join(', ')} required for create action`);
  }
  const createInput: CreateAdrInput = {
    title: input.title,
    context: input.context!,
    decision: input.decision!,
    consequences: input.consequences!,
    ...(input.status ? { status: input.status } : {}),
    ...(input.tier ? { tier: input.tier } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.supersedes ? { supersedes: input.supersedes } : {}),
    ...(input.date ? { date: input.date } : {}),
    ...(input.slug ? { slug: input.slug } : {}),
  };
  const record = createAdr(projectPath, createInput);
  return resultToMcpResponse(Ok(record));
}

function handleRead(projectPath: string, input: ManageAdrInput): McpResponse {
  if (!input.ref) return errorResponse('ref is required for read action');
  return resultToMcpResponse(Ok(readAdr(projectPath, input.ref)));
}

function handleList(projectPath: string): McpResponse {
  return resultToMcpResponse(Ok(listAdrs(projectPath)));
}

/** Fields carried verbatim from the tool input into an ADR update patch. */
const UPDATE_FIELDS = [
  'title',
  'status',
  'tier',
  'source',
  'supersedes',
  'date',
  'context',
  'decision',
  'consequences',
  'body',
] as const;

/** Copy every provided (non-undefined) update field into a patch object. */
function buildUpdatePatch(input: ManageAdrInput): UpdateAdrInput {
  const patch: Record<string, unknown> = {};
  for (const field of UPDATE_FIELDS) {
    if (input[field] !== undefined) patch[field] = input[field];
  }
  return patch as UpdateAdrInput;
}

function handleUpdate(projectPath: string, input: ManageAdrInput): McpResponse {
  if (!input.ref) return errorResponse('ref is required for update action');
  const patch = buildUpdatePatch(input);
  if (Object.keys(patch).length === 0) {
    return errorResponse('update action requires at least one field to change');
  }
  return resultToMcpResponse(Ok(updateAdr(projectPath, input.ref, patch)));
}

export async function handleManageAdr(
  input: ManageAdrInput,
  cwd: string = process.cwd()
): Promise<McpResponse> {
  // Prefer the active git worktree resolved from the caller's cwd over the
  // server-threaded `path` (the launch root), so ADRs authored inside a
  // `git worktree` land in that worktree rather than the wrong checkout (#1507).
  const projectPath = resolveWorktreeRoot(cwd, sanitizePath(input.path));
  try {
    switch (input.action) {
      case 'create':
        return handleCreate(projectPath, input);
      case 'read':
        return handleRead(projectPath, input);
      case 'update':
        return handleUpdate(projectPath, input);
      case 'list':
        return handleList(projectPath);
      default:
        return errorResponse(`unknown action "${(input as { action: string }).action}"`);
    }
  } catch (error) {
    if (error instanceof AdrStoreError) return errorResponse(error.message);
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
}
