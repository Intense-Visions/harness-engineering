import { describe, it, expect } from 'vitest';
import { AgentConfigSchema } from './schema';

/**
 * `harness validate` (harness.config.json) front door: the project-config agent
 * schema must accept backend `capabilities` + `routing.policy` — the exact keys it
 * used to reject ("Unrecognized key(s)"), silently blocking config-file AMR. It
 * reuses the orchestrator's BackendDefSchema/RoutingConfigSchema, so this guards
 * that the shared fix flows through to the CLI validate path too.
 */
describe('AgentConfigSchema — AMR config-file surface', () => {
  it('accepts backend capabilities and a routing policy', () => {
    const r = AgentConfigSchema.safeParse({
      backends: {
        primary: {
          type: 'claude',
          command: 'claude',
          capabilities: {
            tier: 'strong',
            costPer1kTokens: 15,
            privacyClass: 'shared-cloud',
            contextWindow: 200000,
          },
        },
        local: {
          type: 'pi',
          endpoint: 'http://localhost:1234/v1',
          model: 'gemma3n:e4b',
          capabilities: {
            tier: 'fast',
            costPer1kTokens: 0,
            privacyClass: 'on-device',
            contextWindow: 32768,
          },
        },
      },
      routing: {
        default: 'primary',
        policy: {
          complexityTierMatrix: { trivial: 'fast', complex: 'strong' },
          escalationThreshold: 2,
          acceptanceEval: { enabled: true },
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it('still accepts an agent WITHOUT capabilities/policy (backward-compatible)', () => {
    const r = AgentConfigSchema.safeParse({
      backends: { primary: { type: 'claude', command: 'claude' } },
      routing: { default: 'primary' },
    });
    expect(r.success).toBe(true);
  });
});
