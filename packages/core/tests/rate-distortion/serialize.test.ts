import { describe, it, expect } from 'vitest';
import { serializeDistortionModel } from '../../src/rate-distortion/serialize';
import { fitDistortionModel } from '../../src/rate-distortion/distortion-model';
import type { ReplayObservation } from '../../src/rate-distortion/types';

const FIXED_NOW = () => new Date('2026-08-31T00:00:00.000Z');

function build() {
  const observations: ReplayObservation[] = [];
  for (let i = 0; i < 3; i += 1) {
    observations.push({
      runId: `r${i}`,
      taskClass: 'implementation',
      ablation: { kind: 'baseline' },
      outcome: { rework: 1 },
    });
    observations.push({
      runId: `r${i}`,
      taskClass: 'implementation',
      ablation: { kind: 'ablated', informationClass: 'stated-constraints' },
      outcome: { rework: 6 },
    });
  }
  return fitDistortionModel(observations, { now: FIXED_NOW });
}

describe('serializeDistortionModel', () => {
  it('renders the header, matrix, and cell-detail sections', () => {
    const md = serializeDistortionModel(build());
    expect(md).toContain('# Distortion model (rate-distortion context compaction)');
    expect(md).toContain('**Version:** 1.0.0');
    expect(md).toContain('**Fitted at:** 2026-08-31T00:00:00.000Z');
    expect(md).toContain('## Sensitivity matrix');
    expect(md).toContain('## Cell detail');
    expect(md).toContain('Report-only');
  });

  it('marks the load-bearing cell sensitive with a positive delta', () => {
    const md = serializeDistortionModel(build());
    // The implementation × stated-constraints row shows a +5.00 delta and SENS glyph.
    expect(md).toContain('implementation');
    expect(md).toContain('stated-constraints');
    expect(md).toContain('+5.00');
    expect(md).toContain('SENS');
  });
});
