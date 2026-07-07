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
    const evictResult = await deps.pool.evict({ ollamaName: model.replaces.ollamaName });
    if (evictResult.status === 'success' && evictResult.removed !== null) {
      evicted.push(evictResult.removed);
    }
  }

  const updated = await deps.updateProposal(proposal.id, {
    status: 'approved',
    decision: decisionOf(deps, 'approved'),
  });
  deps.bus.emit(MODEL_POOL_TOPIC, {
    id: proposal.id,
    action: model.action,
    installed: model.target.ollamaName,
    ...(model.replaces !== undefined ? { evicted: model.replaces.ollamaName } : {}),
  });
  return { status: 'approved', proposal: updated as ModelProposalRecord, evicted };
}

/** `action: 'evict'` — remove the target from the pool, record approval. */
async function applyEvictOnly(
  deps: ModelHandlerDeps,
  proposal: ModelProposalRecord
): Promise<ModelApproveOutcome> {
  const evictResult = await deps.pool.evict({ ollamaName: proposal.model.target.ollamaName });
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
    evicted: proposal.model.target.ollamaName,
  });
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
