import type { ModelProposalRecord } from '@harness-engineering/types';

/**
 * Model-proposal renderer (Phase 5b).
 *
 * Turns a `kind: 'model'` proposal into the `{ title, body }` display shape the
 * review queue (notifications + dashboard) renders, mirroring the skill
 * renderer's contract. Pure — the justification block was already built by the
 * diff engine, so this only formats it for a human reviewer.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 5b)
 */

/** Rendered display shape shared with the skill renderer path. */
export interface RenderedProposal {
  title: string;
  body: string;
}

const VERB: Record<ModelProposalRecord['model']['action'], string> = {
  add: 'Add',
  swap: 'Swap',
  evict: 'Evict',
};

/** Format a model proposal into the queue's `{ title, body }` display shape. */
export function renderModelProposal(proposal: ModelProposalRecord): RenderedProposal {
  const { model } = proposal;
  const verb = VERB[model.action];
  const title =
    model.action === 'swap' && model.replaces !== undefined
      ? `${verb} ${model.replaces.ollamaName} → ${model.target.ollamaName}`
      : `${verb} ${model.target.ollamaName}`;

  const j = model.justification;
  const delta = `${model.scoreDelta >= 0 ? '+' : ''}${model.scoreDelta}`;
  const body = [
    j.summary,
    '',
    `Benchmarks: ${j.benchmarkBasis.join('; ')}`,
    `Hardware fit: ${j.hardwareFit}`,
    `Evidence: ${j.evidence}`,
    `Freshness: ${j.freshness}`,
    `Score delta: ${delta}`,
    `Disk impact: ${model.diskImpactGb} GB`,
  ].join('\n');

  return { title, body };
}
