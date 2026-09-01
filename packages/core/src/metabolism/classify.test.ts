import { describe, it, expect } from 'vitest';
import {
  classifySpend,
  DEFAULT_METABOLISM_CONFIG,
  DEFAULT_MAINTENANCE_CLASSES,
  SPEND_CLASSES,
  type SpendEvent,
} from './classify';

function ev(partial: Partial<SpendEvent>): SpendEvent {
  return { workflowClass: 'harness-autopilot', tokens: 100, ...partial };
}

describe('classifySpend', () => {
  it('exposes the three-way taxonomy in report order', () => {
    expect(SPEND_CLASSES).toEqual(['basal', 'anabolic', 'unattributable']);
  });

  it('honors explicit producedArtifact linkage above everything else', () => {
    // producedArtifact wins even against a maintenance class + failed outcome.
    expect(
      classifySpend(
        ev({ workflowClass: 'graph-refresh', outcome: 'failed', producedArtifact: true })
      )
    ).toBe('anabolic');
    expect(
      classifySpend(
        ev({ workflowClass: 'harness-autopilot', outcome: 'completed', producedArtifact: false })
      )
    ).toBe('basal');
  });

  it('classifies inherently-basal maintenance classes as basal even when completed', () => {
    for (const cls of DEFAULT_MAINTENANCE_CLASSES) {
      expect(classifySpend(ev({ workflowClass: cls, outcome: 'completed' }))).toBe('basal');
    }
  });

  it('matches maintenance classes case-insensitively', () => {
    expect(classifySpend(ev({ workflowClass: 'Graph-Refresh', outcome: 'completed' }))).toBe(
      'basal'
    );
  });

  it('derives from outcome when no explicit linkage or maintenance class', () => {
    expect(classifySpend(ev({ outcome: 'completed' }))).toBe('anabolic');
    expect(classifySpend(ev({ outcome: 'failed' }))).toBe('basal');
    expect(classifySpend(ev({ outcome: 'abandoned' }))).toBe('basal');
  });

  it('returns unattributable when no usable signal exists', () => {
    expect(classifySpend(ev({}))).toBe('unattributable');
    expect(classifySpend({ workflowClass: 'x', tokens: 10 })).toBe('unattributable');
  });

  it('respects a custom maintenanceClasses config', () => {
    const config = { maintenanceClasses: ['my-custom-loop'] };
    expect(
      classifySpend(ev({ workflowClass: 'my-custom-loop', outcome: 'completed' }), config)
    ).toBe('basal');
    // A default maintenance class is NOT basal under a custom config that omits it.
    expect(
      classifySpend(ev({ workflowClass: 'graph-refresh', outcome: 'completed' }), config)
    ).toBe('anabolic');
  });

  it('uses DEFAULT_METABOLISM_CONFIG by default', () => {
    expect(DEFAULT_METABOLISM_CONFIG.maintenanceClasses).toBe(DEFAULT_MAINTENANCE_CLASSES);
  });
});
