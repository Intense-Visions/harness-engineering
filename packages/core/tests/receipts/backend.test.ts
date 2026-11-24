import { describe, it, expect } from 'vitest';
import { resolveReviewBackend } from '../../src/receipts/backend';

/**
 * Input partition (SC15, D8): configured {unset, agent, pipeline} x runner {yes, no} x tier
 * {light, full}. Twelve rows; the rule "light always runs on agent" lives here, in core.
 */
describe('resolveReviewBackend', () => {
  const agent = { backend: 'agent', degraded: false };
  const lightOnly = { ...agent, reason: 'review.backend "pipeline" applies to the full tier only' };
  it.each([
    [undefined, true, 'light', agent],
    [undefined, true, 'full', agent],
    [undefined, false, 'light', agent],
    [undefined, false, 'full', agent],
    ['agent', true, 'light', agent],
    ['agent', true, 'full', agent],
    ['agent', false, 'light', agent],
    ['agent', false, 'full', agent],
    ['pipeline', true, 'light', lightOnly],
    ['pipeline', false, 'light', lightOnly],
    ['pipeline', true, 'full', { backend: 'pipeline', degraded: false }],
  ] as const)('configured %s, runner %s, tier %s', (configured, runner, tier, expected) => {
    expect(resolveReviewBackend({ configured, pipelineRunnerAvailable: runner, tier })).toEqual(
      expected
    );
  });
  it('configured pipeline, no runner, tier full: agent, flagged degraded, with the reason', () => {
    const r = resolveReviewBackend({
      configured: 'pipeline',
      pipelineRunnerAvailable: false,
      tier: 'full',
    });
    expect(r).toMatchObject({ backend: 'agent', degraded: true });
    expect(r.reason).toMatch(/no pipeline runner/);
  });
});
