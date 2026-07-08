import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EventEmitter } from 'node:events';
import { z } from 'zod';
import {
  getProposal,
  listProposals,
  updateProposal,
  ProposalNotFoundError,
} from '@harness-engineering/core';
import {
  EditProposalInputSchema,
  type Proposal,
  type SkillProposal,
  type ProposalStatus,
} from '@harness-engineering/types';
import { readBody } from '../../utils.js';
import { runGate, GateRunError } from '../../../proposals/gate';
import { promote, GateNotReadyError, PromotionError } from '../../../proposals/promote';
import { emitProposalApproved, emitProposalRejected } from '../../../proposals/events';
import {
  onApproveModelProposal,
  onRejectModelProposal,
  type ModelHandlerDeps,
  type ModelPoolOps,
} from '../../../proposals/model-handlers';

/**
 * Phase 4 gateway routes — list / get / run-gate / approve / reject / edit.
 * The scope policy is enforced upstream in v1-bridge-routes.ts; this module
 * only handles dispatch + business logic.
 *
 * Note: there is no public POST /api/v1/proposals — proposals are emitted via
 * the `emit_skill_proposal` MCP tool, which writes directly to disk. This
 * keeps the queue "low-pressure": agents can't spam the gateway with
 * proposals through a public endpoint, and reviewers always see the same
 * file-backed state the dashboard reads.
 */

const LIST_RE = /^\/api\/v1\/proposals(?:\?.*)?$/;
const SINGLE_RE = /^\/api\/v1\/proposals\/([^/?]+)(?:\?.*)?$/;
const RUN_GATE_RE = /^\/api\/v1\/proposals\/([^/?]+)\/run-gate(?:\?.*)?$/;
const APPROVE_RE = /^\/api\/v1\/proposals\/([^/?]+)\/approve(?:\?.*)?$/;
const REJECT_RE = /^\/api\/v1\/proposals\/([^/?]+)\/reject(?:\?.*)?$/;

const ProposalStatusValues: ProposalStatus[] = [
  'open',
  'gate-running',
  'gate-failed',
  'approved',
  'rejected',
];

const RejectBody = z.object({
  reason: z.string().min(1).max(280),
});

interface Deps {
  projectPath: string;
  bus: EventEmitter;
  decidedByResolver?: (req: IncomingMessage) => string;
  /**
   * Pool seam for `kind: 'model'` approve/reject. `PoolManager` satisfies it.
   * When absent, model approve/reject returns 501 — the skill path is
   * unaffected. Real `/api/v1/local-models/*` routes + WS fan-out are Phase 7.
   */
  modelPool?: ModelPoolOps;
  /**
   * S1 (ADR 0060): in-use probe. When it reports the eviction target might be
   * mid-request, the model approve path DEFERS the evict (marks
   * `pendingEviction`) instead of applying it. Absent → never defers.
   */
  isModelInUse?: (ollamaName: string) => boolean;
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function getDecidedBy(req: IncomingMessage, deps: Deps): string {
  if (deps.decidedByResolver) return deps.decidedByResolver(req);
  const token = (req as unknown as { _authToken?: { id: string } })._authToken;
  return token?.id ?? 'unknown';
}

/** Build the model-handler deps, binding `updateProposal` to the project path. */
function modelHandlerDeps(deps: Deps, req: IncomingMessage): ModelHandlerDeps {
  return {
    pool: deps.modelPool as ModelPoolOps,
    bus: deps.bus,
    // Core's `updateProposal` patch type intersects the skill+model status
    // enums, which statically excludes model-only statuses like
    // `failed_target_missing`. The runtime parses through `ProposalSchema` (the
    // model variant accepts that status), so the cast is sound — only the
    // intersection type is too narrow.
    updateProposal: (id, patch) =>
      updateProposal(deps.projectPath, id, patch as Parameters<typeof updateProposal>[2]),
    decidedBy: getDecidedBy(req, deps),
    ...(deps.isModelInUse ? { isModelInUse: deps.isModelInUse } : {}),
  };
}

function parseStatusFromQuery(url: string): ProposalStatus | 'all' | undefined {
  const queryIdx = url.indexOf('?');
  if (queryIdx === -1) return undefined;
  const params = new URLSearchParams(url.slice(queryIdx + 1));
  const raw = params.get('status');
  if (!raw) return undefined;
  if (raw === 'all') return 'all';
  if ((ProposalStatusValues as string[]).includes(raw)) return raw as ProposalStatus;
  return undefined;
}

async function handleList(req: IncomingMessage, res: ServerResponse, deps: Deps): Promise<void> {
  const url = req.url ?? '';
  const status = parseStatusFromQuery(url);
  const proposals = await listProposals(deps.projectPath, status ? { status } : {});
  sendJSON(res, 200, proposals);
}

async function handleGet(res: ServerResponse, deps: Deps, id: string): Promise<void> {
  const proposal = await getProposal(deps.projectPath, id);
  if (!proposal) {
    sendJSON(res, 404, { error: 'Proposal not found' });
    return;
  }
  sendJSON(res, 200, proposal);
}

async function handleRunGate(res: ServerResponse, deps: Deps, id: string): Promise<void> {
  try {
    const result = await runGate(deps.projectPath, id);
    sendJSON(res, 200, result);
  } catch (err) {
    if (err instanceof ProposalNotFoundError) {
      sendJSON(res, 404, { error: err.message });
      return;
    }
    if (err instanceof GateRunError) {
      sendJSON(res, 409, { error: err.message });
      return;
    }
    sendJSON(res, 500, {
      error: 'gate run failed',
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
}

async function handleApprove(
  req: IncomingMessage,
  res: ServerResponse,
  deps: Deps,
  id: string
): Promise<void> {
  // Kind-aware dispatch: model proposals drive the installer + pool handler;
  // skill proposals keep the promote-to-catalog path.
  const existing = await getProposal(deps.projectPath, id);
  if (!existing) {
    sendJSON(res, 404, { error: 'Proposal not found' });
    return;
  }
  if (existing.kind === 'model') {
    if (!deps.modelPool) {
      sendJSON(res, 501, { error: 'model proposal handlers not configured' });
      return;
    }
    // Terminal-state guard (mirrors handleReject / D13): a model proposal that
    // is already approved, rejected, or failed_target_missing is non-actionable.
    // Re-approving would re-drive install + evict (duplicate ollama pull,
    // duplicate bus events) and, for `failed_target_missing`, would retry the
    // stale target instead of the operator explicitly approving a fresh proposal.
    if (
      existing.status === 'approved' ||
      existing.status === 'rejected' ||
      existing.status === 'failed_target_missing'
    ) {
      sendJSON(res, 409, {
        error: `proposal already ${existing.status}; cannot approve`,
      });
      return;
    }
    const outcome = await onApproveModelProposal(modelHandlerDeps(deps, req), existing);
    sendJSON(res, outcome.status === 'error' ? 422 : 200, outcome);
    return;
  }

  const decidedBy = getDecidedBy(req, deps);
  try {
    const result = await promote(deps.projectPath, id, decidedBy);
    const proposal = await getProposal(deps.projectPath, id);
    if (proposal && proposal.kind === 'skill') emitProposalApproved(deps.bus, proposal);
    sendJSON(res, 200, { promotion: result, proposal });
  } catch (err) {
    if (err instanceof ProposalNotFoundError) {
      sendJSON(res, 404, { error: err.message });
      return;
    }
    if (err instanceof GateNotReadyError) {
      sendJSON(res, 409, { error: err.message });
      return;
    }
    if (err instanceof PromotionError) {
      sendJSON(res, 422, { error: err.message });
      return;
    }
    sendJSON(res, 500, {
      error: 'approve failed',
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
}

async function handleReject(
  req: IncomingMessage,
  res: ServerResponse,
  deps: Deps,
  id: string
): Promise<void> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    sendJSON(res, 413, { error: err instanceof Error ? err.message : 'Body too large' });
    return;
  }
  let json: unknown;
  try {
    json = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    sendJSON(res, 400, { error: 'Invalid JSON body' });
    return;
  }
  const parsed = RejectBody.safeParse(json);
  if (!parsed.success) {
    sendJSON(res, 400, { error: 'Invalid body', issues: parsed.error.issues });
    return;
  }

  const proposal = await getProposal(deps.projectPath, id);
  if (!proposal) {
    sendJSON(res, 404, { error: 'Proposal not found' });
    return;
  }
  if (proposal.status === 'approved' || proposal.status === 'rejected') {
    sendJSON(res, 409, {
      error: `proposal already ${proposal.status}; cannot reject`,
    });
    return;
  }

  // Kind-aware dispatch: model rejection records the decision (feeding the F7
  // dedup) and emits the model bus event via the model handler.
  if (proposal.kind === 'model') {
    if (!deps.modelPool) {
      sendJSON(res, 501, { error: 'model proposal handlers not configured' });
      return;
    }
    const updated = await onRejectModelProposal(
      modelHandlerDeps(deps, req),
      proposal,
      parsed.data.reason
    );
    sendJSON(res, 200, updated);
    return;
  }

  const decidedBy = getDecidedBy(req, deps);
  const updated: Proposal = await updateProposal(deps.projectPath, id, {
    status: 'rejected',
    decision: {
      decidedAt: new Date().toISOString(),
      decidedBy,
      action: 'rejected',
      reason: parsed.data.reason,
    },
  });
  if (updated.kind === 'skill') emitProposalRejected(deps.bus, updated);
  sendJSON(res, 200, updated);
}

async function handleEdit(
  req: IncomingMessage,
  res: ServerResponse,
  deps: Deps,
  id: string
): Promise<void> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    sendJSON(res, 413, { error: err instanceof Error ? err.message : 'Body too large' });
    return;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: 'Invalid JSON body' });
    return;
  }
  const parsed = EditProposalInputSchema.safeParse(json);
  if (!parsed.success) {
    sendJSON(res, 400, { error: 'Invalid body', issues: parsed.error.issues });
    return;
  }

  const existing = await getProposal(deps.projectPath, id);
  if (!existing) {
    sendJSON(res, 404, { error: 'Proposal not found' });
    return;
  }
  if (existing.kind !== 'skill') {
    sendJSON(res, 422, { error: 'edit applies to skill proposals only' });
    return;
  }
  if (existing.status === 'approved' || existing.status === 'rejected') {
    sendJSON(res, 409, {
      error: `proposal already ${existing.status}; cannot edit`,
    });
    return;
  }

  // Edits reset the gate — the reviewer must re-run it before approving.
  // Spread order preserves required `name` + `description` from `existing`
  // even when the patch omits them.
  const mergedContent: SkillProposal['content'] = {
    ...existing.content,
    ...parsed.data.content,
    name: parsed.data.content.name ?? existing.content.name,
    description: parsed.data.content.description ?? existing.content.description,
  };
  try {
    const updated = await updateProposal(deps.projectPath, id, {
      content: mergedContent,
      status: 'open',
      gate: undefined,
    });
    sendJSON(res, 200, updated);
  } catch (err) {
    sendJSON(res, 422, {
      error: 'edit failed',
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/**
 * Dispatch /api/v1/proposals* requests. Returns true when handled, false
 * to let the next handler in http.ts dispatch chain try.
 */
export function handleV1ProposalsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  deps: Deps
): boolean {
  const url = req.url ?? '';
  const method = req.method ?? 'GET';

  if (method === 'GET' && LIST_RE.test(url)) {
    void handleList(req, res, deps);
    return true;
  }

  const runGateMatch = method === 'POST' ? RUN_GATE_RE.exec(url) : null;
  if (runGateMatch) {
    void handleRunGate(res, deps, runGateMatch[1]!);
    return true;
  }

  const approveMatch = method === 'POST' ? APPROVE_RE.exec(url) : null;
  if (approveMatch) {
    void handleApprove(req, res, deps, approveMatch[1]!);
    return true;
  }

  const rejectMatch = method === 'POST' ? REJECT_RE.exec(url) : null;
  if (rejectMatch) {
    void handleReject(req, res, deps, rejectMatch[1]!);
    return true;
  }

  if (method === 'PATCH') {
    const m = SINGLE_RE.exec(url);
    if (m) {
      void handleEdit(req, res, deps, m[1]!);
      return true;
    }
  }

  if (method === 'GET') {
    const m = SINGLE_RE.exec(url);
    if (m) {
      void handleGet(res, deps, m[1]!);
      return true;
    }
  }

  return false;
}
