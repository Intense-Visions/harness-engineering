/**
 * LMLM operator-initiated pool mutation routes (spec: lmlm-dashboard-pool-mutation).
 *
 *   POST /api/v1/local-models/pool/install  { hfRepoId, quant? }
 *   POST /api/v1/local-models/pool/remove   { ollamaName }
 *
 * Both are modeled as **user-initiated, auto-approved model proposals** (D1):
 * the handler builds a `kind:'model'` proposal (`add` for install, `evict` for
 * remove), persists it via `createModelProposal`, then runs the exact same
 * `onApproveModelProposal` core the approve route uses. This reuses the pool
 * guards (`canInstall` → `not_allowed`/`budget_exceeded`), the `isModelInUse`
 * evict-deferral, audit persistence, and the `local-models:pool` WS emit — so
 * these routes add no parallel mutation logic and keep proposals the single
 * pool-mutation channel (D-P8-2).
 *
 * Auth is enforced upstream by the bridge-route scope table (`manage-proposals`,
 * identical to approve/reject). Install awaits the streamed `ollama pull`
 * synchronously, matching the existing approve-an-add flow; byte-level progress
 * over WS is a deferred enhancement (D3 note).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EventEmitter } from 'node:events';
import { createModelProposal, updateProposal } from '@harness-engineering/core';
import type { ModelProposalContent, PoolMutationResult } from '@harness-engineering/types';
import { estimateDiskGb, type RankedModel } from '@harness-engineering/local-models';
import {
  onApproveModelProposal,
  type ModelHandlerDeps,
  type ModelPoolOps,
} from '../../../proposals/model-handlers.js';
import { readBody } from '../../utils.js';

const INSTALL_RE = /^\/api\/v1\/local-models\/pool\/install(?:\?.*)?$/;
const REMOVE_RE = /^\/api\/v1\/local-models\/pool\/remove(?:\?.*)?$/;

/** How many ranked candidates to scan when resolving an install target. */
const RESOLVE_TOP = 50;

export interface V1LocalModelsMutationDeps {
  /** Project root where `.harness/proposals/` lives. */
  projectPath: string;
  /** Orchestrator event bus for `local-models:pool` emits. */
  bus: EventEmitter;
  /** Full mutation pool; null when LMLM is disabled → routes 503. */
  getModelPool: () => ModelPoolOps | null;
  /** Ranked candidates, used to resolve install-target `ollamaName` from `hfRepoId`. */
  getRecommendations?: (opts: {
    top: number;
    profile: 'general' | 'coding' | 'reasoning';
  }) => Promise<RankedModel[]>;
  /** In-use probe: an approved evict of an in-use model is deferred, not applied. */
  isModelInUse?: (ollamaName: string) => boolean;
  /** Resolves the decision identity; defaults to the auth token id. */
  getDecidedBy?: (req: IncomingMessage) => string;
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function decidedByOf(deps: V1LocalModelsMutationDeps, req: IncomingMessage): string {
  if (deps.getDecidedBy) return deps.getDecidedBy(req);
  const token = (req as unknown as { _authToken?: { id: string } })._authToken;
  return token?.id ?? 'operator';
}

function handlerDeps(
  deps: V1LocalModelsMutationDeps,
  req: IncomingMessage,
  pool: ModelPoolOps
): ModelHandlerDeps {
  return {
    pool,
    bus: deps.bus,
    updateProposal: (id, patch) =>
      updateProposal(deps.projectPath, id, patch as Parameters<typeof updateProposal>[2]),
    decidedBy: decidedByOf(deps, req),
    ...(deps.isModelInUse ? { isModelInUse: deps.isModelInUse } : {}),
  };
}

/** Parse a JSON body, returning `undefined` on malformed input (caller sends 400). */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readBody(req);
    if (raw.length === 0) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

async function handleInstall(
  req: IncomingMessage,
  res: ServerResponse,
  deps: V1LocalModelsMutationDeps
): Promise<void> {
  const pool = deps.getModelPool();
  if (pool === null) return sendJSON(res, 503, { error: 'LMLM disabled' });

  const body = await readJsonBody(req);
  if (body === undefined) return sendJSON(res, 400, { error: 'invalid JSON body' });
  const hfRepoId = typeof body.hfRepoId === 'string' ? body.hfRepoId : '';
  if (hfRepoId.length === 0) return sendJSON(res, 400, { error: 'hfRepoId is required' });
  const quant = typeof body.quant === 'string' ? body.quant : undefined;

  if (!deps.getRecommendations) {
    return sendJSON(res, 503, { error: 'recommendations unavailable' });
  }
  const ranked = await deps.getRecommendations({ top: RESOLVE_TOP, profile: 'general' });
  const match = ranked.find(
    (r) => r.hfRepoId === hfRepoId && (quant === undefined || r.quant === quant)
  );
  if (!match) {
    return sendJSON(res, 404, {
      error: `no recommendation for ${hfRepoId}${quant ? ` @ ${quant}` : ''}`,
    });
  }
  if (!match.ollamaName) {
    return sendJSON(res, 422, { error: `${hfRepoId} has no known Ollama mirror to install` });
  }

  const content: ModelProposalContent = {
    action: 'add',
    target: { hfRepoId: match.hfRepoId, ollamaName: match.ollamaName },
    scoreDelta: match.score,
    justification: {
      summary: `Operator-initiated install of ${match.ollamaName} (${match.quant}).`,
      benchmarkBasis: [],
      hardwareFit: match.fitsHardware ? 'fits detected hardware' : 'may not fit detected hardware',
      evidence: match.evidence,
      freshness: `snapshot ${match.benchmarkSnapshot}`,
    },
    // Estimate the on-disk size from the candidate's params + quant (the same
    // `estimateDiskGb` the automated proposal engine uses). The pool needs a
    // size for its pre-commit budget check *before* the pull; it cannot inspect
    // the target first, because ollama `/api/show` 404s for a model that is not
    // yet pulled locally — which would surface as a spurious "no longer
    // available on HuggingFace" 404 on every operator install.
    diskImpactGb: estimateDiskGb({
      sizeB: match.sizeB,
      quant: match.quant,
      ...(match.activeB !== undefined ? { activeB: match.activeB } : {}),
    }),
  };

  const record = await createModelProposal(deps.projectPath, content, {
    proposedBy: decidedByOf(deps, req),
  });
  const outcome = await onApproveModelProposal(handlerDeps(deps, req, pool), record);

  if (outcome.status === 'approved') {
    const result: PoolMutationResult = {
      disposition: 'installed',
      proposalId: record.id,
      evicted: outcome.evicted.map((e) => e.ollamaName),
    };
    return sendJSON(res, 200, result);
  }
  if (outcome.status === 'failed_target_missing') {
    return sendJSON(res, 404, {
      error: `${hfRepoId} is no longer available on HuggingFace`,
      proposalId: record.id,
    });
  }
  // `not_allowed` (org allowlist) / `budget_exceeded` (disk) are operator-fixable → 409.
  const status = outcome.code === 'not_allowed' || outcome.code === 'budget_exceeded' ? 409 : 502;
  return sendJSON(res, status, {
    error: outcome.message,
    code: outcome.code,
    proposalId: record.id,
  });
}

async function handleRemove(
  req: IncomingMessage,
  res: ServerResponse,
  deps: V1LocalModelsMutationDeps
): Promise<void> {
  const pool = deps.getModelPool();
  if (pool === null) return sendJSON(res, 503, { error: 'LMLM disabled' });

  const body = await readJsonBody(req);
  if (body === undefined) return sendJSON(res, 400, { error: 'invalid JSON body' });
  const ollamaName = typeof body.ollamaName === 'string' ? body.ollamaName : '';
  if (ollamaName.length === 0) return sendJSON(res, 400, { error: 'ollamaName is required' });

  const entry = pool.snapshot().entries.find((e) => e.ollamaName === ollamaName);
  if (!entry) return sendJSON(res, 404, { error: `${ollamaName} is not in the pool` });

  const content: ModelProposalContent = {
    action: 'evict',
    target: { hfRepoId: entry.hfRepoId, ollamaName },
    scoreDelta: 0,
    justification: {
      summary: `Operator-initiated removal of ${ollamaName}.`,
      benchmarkBasis: [],
      hardwareFit: '',
      evidence: 'operator',
      freshness: '',
    },
    diskImpactGb: entry.sizeOnDiskGb,
  };

  const record = await createModelProposal(deps.projectPath, content, {
    proposedBy: decidedByOf(deps, req),
  });
  const outcome = await onApproveModelProposal(handlerDeps(deps, req, pool), record);

  if (outcome.status === 'error') {
    return sendJSON(res, 502, {
      error: outcome.message,
      code: outcome.code,
      proposalId: record.id,
    });
  }
  if (outcome.status === 'failed_target_missing') {
    // An evict never produces this (only add/swap install can); stay exhaustive.
    return sendJSON(res, 500, {
      error: 'unexpected failed_target_missing on evict',
      proposalId: record.id,
    });
  }
  if (outcome.evicted.length > 0) {
    const result: PoolMutationResult = {
      disposition: 'removed',
      proposalId: record.id,
      evicted: outcome.evicted.map((e) => e.ollamaName),
    };
    return sendJSON(res, 200, result);
  }
  // No eviction recorded: either deferred (in use — still present, pendingEviction)
  // or already absent (idempotent). Distinguish via the live snapshot.
  const stillPresent = pool.snapshot().entries.some((e) => e.ollamaName === ollamaName);
  if (stillPresent) {
    const result: PoolMutationResult = {
      disposition: 'deferred',
      proposalId: record.id,
      evicted: [],
      message: 'model is in use; it will be removed after the current run',
    };
    return sendJSON(res, 202, result);
  }
  const result: PoolMutationResult = { disposition: 'removed', proposalId: record.id, evicted: [] };
  return sendJSON(res, 200, result);
}

/**
 * Dispatch the two POST mutation routes. Returns `true` when this module owns
 * the request (halting the dispatch chain), `false` for pass-through.
 */
export function handleV1LocalModelsMutationRoute(
  req: IncomingMessage,
  res: ServerResponse,
  deps: V1LocalModelsMutationDeps
): boolean {
  const url = req.url ?? '';
  if ((req.method ?? 'GET') !== 'POST') return false;
  if (INSTALL_RE.test(url)) {
    void handleInstall(req, res, deps);
    return true;
  }
  if (REMOVE_RE.test(url)) {
    void handleRemove(req, res, deps);
    return true;
  }
  return false;
}
