import type { IncomingMessage, ServerResponse } from 'node:http';
import { isTickHardFailure, type TickResult } from '@harness-engineering/local-models';
import type { Proposal } from '@harness-engineering/types';

/**
 * Phase 6 — `POST /api/v1/local-models/refresh` (force-refresh).
 *
 * Runs a single {@link RefreshScheduler.forceRefresh} tick out of band and
 * returns the proposals it emitted plus any warnings. This is the HTTP twin of
 * the `harness models refresh` CLI and carries the same O4 exit signal:
 *
 *  - `getRefreshScheduler()` null → LMLM is disabled → `503`.
 *  - Tick is an O4 hard failure (HF unreachable **and** no frozen snapshot) →
 *    `503`, so the CLI maps it to a non-zero exit.
 *  - Otherwise `200 { emitted, proposals, warnings }` — a tick that merely lost
 *    HF but kept the snapshot is a soft success (warnings, exit 0).
 *
 * Scope enforcement lives upstream in `v1-bridge-routes.ts`; this dispatcher is
 * business logic only. The remaining `/api/v1/local-models/{hardware,pool,
 * recommendations,proposals}` routes + WS fan-out stay Phase 7.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 6; O4)
 */

const REFRESH_RE = /^\/api\/v1\/local-models\/refresh(?:\?.*)?$/;

/** The force-refresh seam — `RefreshScheduler` satisfies it. */
export interface RefreshSchedulerOps {
  forceRefresh(): Promise<TickResult>;
}

export interface V1LocalModelsDeps {
  /** Returns the live scheduler, or null when LMLM is disabled. */
  getRefreshScheduler: () => RefreshSchedulerOps | null;
  /** Reads the current model-proposal queue (open proposals) for the response body. */
  listModelProposals?: () => Promise<Proposal[]>;
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Dispatch `POST /api/v1/local-models/refresh`. Returns `true` when this module
 * owns the request (so the route table stops), `false` otherwise (fall-through
 * to the chat-proxy fallback).
 */
export function handleV1LocalModelsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  deps: V1LocalModelsDeps
): boolean {
  const url = req.url ?? '';
  const method = req.method ?? 'GET';

  if (method !== 'POST' || !REFRESH_RE.test(url)) return false;

  const scheduler = deps.getRefreshScheduler();
  if (scheduler === null) {
    sendJSON(res, 503, { error: 'LMLM disabled' });
    return true;
  }

  void runForceRefresh(res, scheduler, deps);
  return true;
}

async function runForceRefresh(
  res: ServerResponse,
  scheduler: RefreshSchedulerOps,
  deps: V1LocalModelsDeps
): Promise<void> {
  let result: TickResult;
  try {
    result = await scheduler.forceRefresh();
  } catch (err) {
    sendJSON(res, 500, {
      error: 'refresh tick failed',
      detail: err instanceof Error ? err.message : 'unknown',
    });
    return;
  }

  // O4 hard failure → 503 so the CLI exits non-zero.
  if (isTickHardFailure(result)) {
    sendJSON(res, 503, {
      error: 'refresh hard failure: HuggingFace unreachable and no benchmark snapshot loaded',
      emitted: result.proposalsEmitted,
      warnings: result.warnings,
      errors: result.errors,
    });
    return;
  }

  const proposals = deps.listModelProposals ? await deps.listModelProposals() : [];
  sendJSON(res, 200, {
    emitted: result.proposalsEmitted,
    reconciledRemoved: result.reconciledRemoved,
    proposals,
    warnings: result.warnings,
  });
}
