/**
 * On-disk footprint estimator.
 *
 * A GGUF file on disk is dominated by its quantized weight tensors; metadata,
 * tokenizer, and alignment padding add only a small fixed overhead. Rather than
 * invent a second sizing model, we reuse `estimateVram`'s weight math (billion
 * params × bits/weight ÷ 8 ÷ 2^30) — the `weightsGb` slice is precisely the
 * on-disk weight footprint. The KV cache, activations, and framework overhead
 * that `estimateVram` also reports are *runtime* memory, not disk, so they are
 * intentionally excluded here.
 *
 * Used by the Phase 5b/6 proposal engine to populate `ModelProposalContent.diskImpactGb`
 * and by the pool budget accounting, both of which care about bytes-on-disk.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (P5-SUG-EVICT-a)
 */

import { estimateVram, type VramEstimateInput } from './vram.js';

/** On-disk footprint in GiB ≈ quantized weight tensors (GGUF overhead is small). */
export function estimateDiskGb(
  input: Pick<VramEstimateInput, 'sizeB' | 'quant' | 'activeB'>
): number {
  return estimateVram({
    sizeB: input.sizeB,
    quant: input.quant,
    ...(input.activeB !== undefined ? { activeB: input.activeB } : {}),
  }).weightsGb;
}
