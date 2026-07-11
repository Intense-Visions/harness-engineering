import type { ComplexitySignals } from './types.js';

/** Flatten signals into the ComplexityVerdict.signals map, dropping undefined fields. */
export function serializeSignals(s: ComplexitySignals): Record<string, number | boolean | string> {
  const out: Record<string, number | boolean | string> = {
    descriptionLength: s.descriptionLength,
    specExists: s.specExists,
    acceptanceMeasurable: s.acceptanceMeasurable,
  };
  if (s.filesTouched !== undefined) out.filesTouched = s.filesTouched;
  if (s.layersTouched !== undefined) out.layersTouched = s.layersTouched;
  if (s.blastRadius !== undefined) out.blastRadius = s.blastRadius;
  if (s.hotspotChurn !== undefined) out.hotspotChurn = s.hotspotChurn;
  return out;
}
