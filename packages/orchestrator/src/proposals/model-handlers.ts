import type { EventEmitter } from 'node:events';
import type { ModelProposalRecord, Proposal, ProposalDecision } from '@harness-engineering/types';
import type {
  EvictPoolRequest,
  EvictPoolResult,
  InstallPoolRequest,
  InstallPoolResult,
  PoolEntry,
  PoolState,
} from '@harness-engineering/local-models';

/**
 * Model-proposal lifecycle handlers (Phase 5b; D13, F11).
 *
 * The orchestrator's kind-aware approve/reject route (Task 16) dispatches
 * `kind: 'model'` proposals here. Approve drives the installer + pool update
 * through `PoolManager`; reject records the decision so the diff engine's
 * rejected-history input (F7) suppresses the same `(target, replaces)` pair on
 * the next tick.
 *
 * Stale-target cancellation (D13/F11): the Ollama adapter surfaces an upstream
 * HF 404 as `InstallResult { status:'error', code:'failed_target_missing' }`,
 * which `PoolManager.install` propagates *without mutating pool state*. On that
 * code the handler transitions the proposal to `failed_target_missing`, emits a
 * `local-models:proposal` bus event, and leaves the pool untouched — the next
 * diff may raise a fresh proposal requiring explicit approval.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 5b; D13, F11, S6)
 */

/**
 * Structural slice of `PoolManager` the handlers need. `PoolManager` satisfies
 * this shape, and tests inject a fake — so the handler stays decoupled from the
 * concrete manager while still routing every mutation through the single seam
 * that owns the allowlist, disk budget, and atomic persistence.
 */
export interface ModelPoolOps {
  install(request: InstallPoolRequest): Promise<InstallPoolResult>;
  evict(request: EvictPoolRequest): Promise<EvictPoolResult>;
  snapshot(): PoolState;
  /**
   * S1 (no mid-dispatch swap): flag a model whose eviction is DEFERRED because
   * the in-use probe reports it might be serving a request. The flag is a
   * transient runtime overlay (never persisted); the orchestrator's drain path
   * completes the real evict + clears the flag once the model idles.
   * `PoolManager` satisfies this via its `pendingEvictions` Set (Task 8).
   */
  markPendingEviction(ollamaName: string): void;
}

/** Persisted patch applied to a model proposal. */
export type ModelProposalPatch = Partial<ModelProposalRecord>;

/** Dependencies the model handlers close over. */
export interface ModelHandlerDeps {
  /** Pool mutation seam — `PoolManager` in production, a fake in tests. */
  pool: ModelPoolOps;
  /** Persists a proposal patch and returns the updated record. */
  updateProposal: (id: string, patch: ModelProposalPatch) => Promise<Proposal>;
  /** Orchestrator event bus. */
  bus: EventEmitter;
  /** Identity recorded on the decision. Defaults to `'orchestrator'`. */
  decidedBy?: string;
  /** Clock seam for deterministic decision timestamps. */
  now?: () => Date;
  /**
   * S1 in-use probe seam: reports whether `ollamaName` might currently be
   * serving an inference request. When it returns `true`, an approved swap/evict
   * DEFERS the real eviction (marks `pendingEviction`) rather than yanking a
   * model mid-request. Defaults to `() => false` (never defer) so tests and the
   * LMLM-disabled path keep the pre-S1 behavior. The production probe is
   * agent-run-coarse and may over-defer — a safe failure (see ADR 0060).
   */
  isModelInUse?: (ollamaName: string) => boolean;
}

/** True when the probe (if supplied) reports the model might be mid-request. */
function isInUse(deps: ModelHandlerDeps, ollamaName: string): boolean {
  return deps.isModelInUse ? deps.isModelInUse(ollamaName) : false;
}

/** Bus topic for model-proposal lifecycle transitions (reject, stale-target). */
export const MODEL_PROPOSAL_TOPIC = 'local-models:proposal';
/** Bus topic for pool mutations (install / evict applied). */
export const MODEL_POOL_TOPIC = 'local-models:pool';

/** Outcome of {@link onApproveModelProposal}. */
export type ModelApproveOutcome =
  | { status: 'approved'; proposal: ModelProposalRecord; evicted: PoolEntry[] }
  | { status: 'failed_target_missing'; proposal: ModelProposalRecord }
  | { status: 'error'; code: string; message: string };

function decisionOf(
  deps: ModelHandlerDeps,
  action: 'approved' | 'rejected',
  reason?: string
): ProposalDecision {
  return {
    decidedAt: (deps.now?.() ?? new Date()).toISOString(),
    decidedBy: deps.decidedBy ?? 'orchestrator',
    action,
    ...(reason !== undefined ? { reason } : {}),
  };
}

/**
 * Emit the `approved` model-proposal lifecycle event on the proposal topic.
 * Mirrors the created/rejected/failed_target_missing emits so EVERY transition —
 * including a successful approve — surfaces a `local-models:proposal` frame, not
 * just a `local-models:pool` mutation. This closes the two asymmetries the
 * cross-phase review flagged: (1) Phase 7 operators now get an approval
 * notification (envelope's `approved` branch), and (2) Phase 8 non-approving
 * clients refetch their pending-proposals list off this frame instead of waiting
 * for an unrelated proposal event.
 */
function emitApproved(deps: ModelHandlerDeps, proposal: ModelProposalRecord): void {
  deps.bus.emit(MODEL_PROPOSAL_TOPIC, {
    id: proposal.id,
    status: 'approved',
    action: proposal.model.action,
    target: proposal.model.target.ollamaName,
  });
}

/**
 * S1 deferral: the probe reports `deferredName` might be mid-request, so we do
 * NOT evict it now. Flag it `pendingEviction` (transient overlay), record the
 * approval, and emit an `evict_deferred` pool event. The orchestrator's drain
 * path completes the real evict + clears the flag once the model idles. Any
 * `evicted` entries the install already removed (budget auto-eviction) are still
 * surfaced — only the deferred model is withheld.
 */
async function deferEviction(
  deps: ModelHandlerDeps,
  proposal: ModelProposalRecord,
  deferredName: string,
  event: Record<string, unknown>,
  evicted: PoolEntry[]
): Promise<ModelApproveOutcome> {
  deps.pool.markPendingEviction(deferredName);
  const updated = await deps.updateProposal(proposal.id, {
    status: 'approved',
    decision: decisionOf(deps, 'approved'),
  });
  deps.bus.emit(MODEL_POOL_TOPIC, event);
  emitApproved(deps, proposal);
  return { status: 'approved', proposal: updated as ModelProposalRecord, evicted };
}

/**
 * Approve a model proposal: install (or evict) via the pool, record the
 * decision, and broadcast. Stale-target (D13/F11) short-circuits to
 * `failed_target_missing` with the pool left untouched.
 */
export async function onApproveModelProposal(
  deps: ModelHandlerDeps,
  proposal: ModelProposalRecord
): Promise<ModelApproveOutcome> {
  const { model } = proposal;

  if (model.action === 'evict') {
    return applyEvictOnly(deps, proposal);
  }

  // `add` and `swap` both install the target first.
  // The proposal carries only a score *delta*, not an absolute score; the new
  // pool entry starts at 0 and the scheduler's next re-rank sets its real score.
  const installResult = await deps.pool.install({
    hfRepoId: model.target.hfRepoId,
    ollamaName: model.target.ollamaName,
    ...(model.replaces !== undefined ? { replaces: model.replaces.ollamaName } : {}),
    ...(model.diskImpactGb > 0 ? { sizeOnDiskGb: model.diskImpactGb } : {}),
  });

  if (installResult.status === 'error') {
    if (installResult.code === 'failed_target_missing') {
      // D13/F11: stale target. PoolManager.install did not mutate pool state.
      const updated = await deps.updateProposal(proposal.id, {
        status: 'failed_target_missing',
      });
      deps.bus.emit(MODEL_PROPOSAL_TOPIC, {
        id: proposal.id,
        status: 'failed_target_missing',
        action: model.action,
        target: model.target.ollamaName,
      });
      return { status: 'failed_target_missing', proposal: updated as ModelProposalRecord };
    }
    // budget_exceeded / not_allowed / installer_unavailable / install_failed:
    // structured error, pool unchanged, proposal left pending for a retry.
    return { status: 'error', code: installResult.code, message: installResult.message };
  }

  const evicted: PoolEntry[] = [...installResult.evicted];
  if (model.action === 'swap' && model.replaces !== undefined) {
    const replacesName = model.replaces.ollamaName;
    if (isInUse(deps, replacesName)) {
      // S1 (no mid-dispatch swap): the target install already applied — the pool
      // now holds BOTH target and `replaces`. `replaces` may be serving a live
      // request, so DEFER its eviction rather than yanking it. The drain path
      // finishes the evict once the probe reports it idle.
      return deferEviction(
        deps,
        proposal,
        replacesName,
        {
          id: proposal.id,
          action: model.action,
          installed: model.target.ollamaName,
          phase: 'evict_deferred',
          deferred: replacesName,
          ...(installResult.evicted.length > 0
            ? { evicted: installResult.evicted.map((e) => e.ollamaName) }
            : {}),
        },
        evicted
      );
    }
    const evictResult = await deps.pool.evict({ ollamaName: replacesName });
    if (evictResult.status === 'error') {
      // Partial-swap failure: the target install succeeded (pool now holds it),
      // but evicting `replaces` failed (e.g. installer_unavailable / ollama
      // delete error). The swap is therefore incomplete — the pool holds BOTH
      // target and replaces.
      //
      // Recovery (spec S7 best-effort + D13 explicit-approval): do NOT mark the
      // proposal `approved` and do NOT emit a completed-swap event that claims
      // `replaces` was evicted. We deliberately do NOT roll back the installed
      // target: `PoolManager.install` is idempotent (returns `alreadyInstalled`
      // on the target already present), so leaving the proposal pending lets a
      // later re-approve safely retry only the failed evict. Rolling the target
      // back would discard genuine, sanctioned work and risk a compounding
      // second failure on a pool the operator approved adding to.
      //
      // We still emit a `local-models:pool` event because the pool DID change
      // (target added), but it reflects the ACTUAL state: `installed: target`
      // with NO `evicted` field and `phase: 'swap_evict_failed'` so consumers
      // see the truthful partial outcome rather than a phantom completed swap.
      deps.bus.emit(MODEL_POOL_TOPIC, {
        id: proposal.id,
        action: model.action,
        installed: model.target.ollamaName,
        phase: 'swap_evict_failed',
      });
      return { status: 'error', code: evictResult.code, message: evictResult.message };
    }
    if (evictResult.removed !== null) {
      evicted.push(evictResult.removed);
    }
  }

  const updated = await deps.updateProposal(proposal.id, {
    status: 'approved',
    decision: decisionOf(deps, 'approved'),
  });
  // Surface EVERY entry the install removed: the budget-driven auto-evictions
  // the pool reported (P5-SUG-EVICT-c) plus the swap's `replaces` the handler
  // evicted itself. `install` no longer double-counts `replaces` (P5-SUG-EVICT-b).
  const evictedNames = [
    ...installResult.evicted.map((e) => e.ollamaName),
    ...(model.replaces !== undefined ? [model.replaces.ollamaName] : []),
  ];
  deps.bus.emit(MODEL_POOL_TOPIC, {
    id: proposal.id,
    action: model.action,
    installed: model.target.ollamaName,
    ...(evictedNames.length > 0 ? { evicted: evictedNames } : {}),
  });
  emitApproved(deps, proposal);
  return { status: 'approved', proposal: updated as ModelProposalRecord, evicted };
}

/** `action: 'evict'` — remove the target from the pool, record approval. */
async function applyEvictOnly(
  deps: ModelHandlerDeps,
  proposal: ModelProposalRecord
): Promise<ModelApproveOutcome> {
  const targetName = proposal.model.target.ollamaName;
  if (isInUse(deps, targetName)) {
    // S1: the model to evict may be mid-request. Defer; drain completes it.
    return deferEviction(
      deps,
      proposal,
      targetName,
      { id: proposal.id, action: 'evict', phase: 'evict_deferred', deferred: targetName },
      []
    );
  }
  const evictResult = await deps.pool.evict({ ollamaName: targetName });
  if (evictResult.status === 'error') {
    return { status: 'error', code: evictResult.code, message: evictResult.message };
  }
  const updated = await deps.updateProposal(proposal.id, {
    status: 'approved',
    decision: decisionOf(deps, 'approved'),
  });
  deps.bus.emit(MODEL_POOL_TOPIC, {
    id: proposal.id,
    action: 'evict',
    // XP-2: `evicted` is string[] at EVERY local-models:pool emit site (swap/add
    // list multiple removals) — the evict-only path wraps its single removal in
    // an array too, so consumers never branch on string-vs-array.
    evicted: [proposal.model.target.ollamaName],
  });
  emitApproved(deps, proposal);
  return {
    status: 'approved',
    proposal: updated as ModelProposalRecord,
    evicted:
      evictResult.removed !== null && evictResult.removed !== undefined
        ? [evictResult.removed]
        : [],
  };
}

/**
 * Reject a model proposal: record the decision so the diff engine's
 * rejected-history input (F7) suppresses the same `(target, replaces)` pair.
 */
export async function onRejectModelProposal(
  deps: ModelHandlerDeps,
  proposal: ModelProposalRecord,
  reason: string
): Promise<ModelProposalRecord> {
  const updated = await deps.updateProposal(proposal.id, {
    status: 'rejected',
    decision: decisionOf(deps, 'rejected', reason),
  });
  deps.bus.emit(MODEL_PROPOSAL_TOPIC, {
    id: proposal.id,
    status: 'rejected',
    target: proposal.model.target.ollamaName,
    replaces: proposal.model.replaces?.ollamaName,
    reason,
  });
  return updated as ModelProposalRecord;
}
