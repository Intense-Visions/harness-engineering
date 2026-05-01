import { describe, it, expect } from 'vitest';
import { migrateAgentConfig } from '../../src/agent/config-migration';
import type { AgentConfig } from '@harness-engineering/types';

/**
 * Build a minimal AgentConfig with only the fields a test cares about.
 * Required fields on AgentConfig that the shim does not touch are filled
 * with placeholder values.
 */
function makeAgentConfig(overrides: Partial<AgentConfig>): AgentConfig {
  return {
    backend: 'mock',
    maxConcurrentAgents: 1,
    maxTurns: 10,
    maxRetryBackoffMs: 5000,
    maxRetries: 5,
    maxConcurrentAgentsByState: {},
    turnTimeoutMs: 300000,
    readTimeoutMs: 30000,
    stallTimeoutMs: 60000,
    ...overrides,
  };
}

describe('migrateAgentConfig', () => {
  describe('OT9 — minimal legacy config (backend only)', () => {
    it('produces backends.primary and routing.default for `claude`', () => {
      const input = makeAgentConfig({ backend: 'claude' });
      const result = migrateAgentConfig(input);
      expect(result.config.backends).toEqual({ primary: { type: 'claude' } });
      expect(result.config.routing).toEqual({ default: 'primary' });
      // Primary has no `command` because input.command is undefined.
      expect(result.config.backends!.primary).not.toHaveProperty('command');
    });

    it('preserves legacy fields on the returned config', () => {
      const input = makeAgentConfig({ backend: 'claude' });
      const result = migrateAgentConfig(input);
      expect(result.config.backend).toBe('claude');
    });

    it('passes agent.command into backends.primary.command for type claude', () => {
      const input = makeAgentConfig({ backend: 'claude', command: '/usr/local/bin/claude' });
      const result = migrateAgentConfig(input);
      expect(result.config.backends).toEqual({
        primary: { type: 'claude', command: '/usr/local/bin/claude' },
      });
    });

    it('synthesizes anthropic primary with model + apiKey', () => {
      const input = makeAgentConfig({
        backend: 'anthropic',
        model: 'claude-sonnet-4',
        apiKey: 'sk-ant-xxx',
      });
      const result = migrateAgentConfig(input);
      expect(result.config.backends).toEqual({
        primary: { type: 'anthropic', model: 'claude-sonnet-4', apiKey: 'sk-ant-xxx' },
      });
    });

    it('synthesizes mock primary with no extra fields', () => {
      const input = makeAgentConfig({ backend: 'mock' });
      const result = migrateAgentConfig(input);
      expect(result.config.backends).toEqual({ primary: { type: 'mock' } });
    });
  });

  describe('OT10 — full legacy config with autoExecute', () => {
    it('produces primary + local + routing entries from autoExecute tiers', () => {
      const input = makeAgentConfig({
        backend: 'pi',
        localBackend: 'pi',
        localEndpoint: 'http://localhost:1234/v1',
        localModel: 'gemma-4-e4b',
        escalation: {
          autoExecute: ['quick-fix', 'diagnostic'],
          alwaysHuman: ['full-exploration'],
          primaryExecute: [],
          signalGated: ['guided-change'],
          diagnosticRetryBudget: 1,
        },
      });
      const result = migrateAgentConfig(input);
      expect(result.config.backends).toEqual({
        primary: { type: 'pi', endpoint: 'http://localhost:1234/v1', model: 'gemma-4-e4b' },
        local: { type: 'pi', endpoint: 'http://localhost:1234/v1', model: 'gemma-4-e4b' },
      });
      expect(result.config.routing).toEqual({
        default: 'primary',
        'quick-fix': 'local',
        diagnostic: 'local',
      });
    });

    it('does not generate routing entries for primaryExecute, signalGated, or alwaysHuman', () => {
      const input = makeAgentConfig({
        backend: 'claude',
        localBackend: 'pi',
        localEndpoint: 'http://localhost:1234/v1',
        localModel: 'a',
        escalation: {
          autoExecute: [],
          alwaysHuman: ['full-exploration'],
          primaryExecute: ['guided-change'],
          signalGated: ['quick-fix'],
          diagnosticRetryBudget: 1,
        },
      });
      const result = migrateAgentConfig(input);
      expect(result.config.routing).toEqual({ default: 'primary' });
    });
  });

  describe('OT11 — array localModel preserved', () => {
    it('preserves an array localModel on backends.local.model', () => {
      const input = makeAgentConfig({
        backend: 'claude',
        localBackend: 'openai-compatible',
        localEndpoint: 'http://localhost:1234/v1',
        localModel: ['a', 'b', 'c'],
      });
      const result = migrateAgentConfig(input);
      expect(result.config.backends!.local).toEqual({
        type: 'local',
        endpoint: 'http://localhost:1234/v1',
        model: ['a', 'b', 'c'],
      });
    });
  });

  describe('OT12 — warnings: one per legacy field, doc link present', () => {
    it('emits one warning per present legacy field', () => {
      const input = makeAgentConfig({
        backend: 'claude',
        command: 'claude',
        localBackend: 'pi',
        localEndpoint: 'http://localhost:1234/v1',
        localModel: 'a',
        localProbeIntervalMs: 5000,
      });
      const result = migrateAgentConfig(input);
      // Expected fields: agent.backend, agent.command, agent.localBackend,
      // agent.localEndpoint, agent.localModel, agent.localProbeIntervalMs
      expect(result.warnings.length).toBe(6);
      for (const w of result.warnings) {
        expect(w).toContain('docs/guides/multi-backend-routing.md');
      }
      const joined = result.warnings.join('\n');
      expect(joined).toContain('agent.backend');
      expect(joined).toContain('agent.command');
      expect(joined).toContain('agent.localBackend');
      expect(joined).toContain('agent.localEndpoint');
      expect(joined).toContain('agent.localModel');
      expect(joined).toContain('agent.localProbeIntervalMs');
    });

    it('warnings are unique (no duplicates)', () => {
      const input = makeAgentConfig({
        backend: 'claude',
        localBackend: 'pi',
        localEndpoint: 'http://localhost:1234/v1',
        localModel: 'a',
      });
      const result = migrateAgentConfig(input);
      const unique = new Set(result.warnings);
      expect(unique.size).toBe(result.warnings.length);
    });

    it('emits warnings naming localApiKey and localTimeoutMs and carries them through (openai-compatible)', () => {
      const input = makeAgentConfig({
        backend: 'claude',
        localBackend: 'openai-compatible',
        localEndpoint: 'http://localhost:1234/v1',
        localModel: 'a',
        localApiKey: 'sk-local-test',
        localTimeoutMs: 120000,
        localProbeIntervalMs: 5000,
      });
      const result = migrateAgentConfig(input);
      // Warnings should name every legacy field present.
      const joined = result.warnings.join('\n');
      expect(joined).toContain('agent.localApiKey');
      expect(joined).toContain('agent.localTimeoutMs');
      // Synthesized local backend (openai-compatible -> 'local' type) carries
      // apiKey AND timeoutMs through.
      expect(result.config.backends!.local).toEqual({
        type: 'local',
        endpoint: 'http://localhost:1234/v1',
        model: 'a',
        apiKey: 'sk-local-test',
        timeoutMs: 120000,
        probeIntervalMs: 5000,
      });
    });

    it('emits warnings naming localApiKey and localTimeoutMs and carries them through (pi)', () => {
      // Pins FU1 behavior: localTimeoutMs must propagate to the pi
      // synthesized backend, not be silently dropped.
      const input = makeAgentConfig({
        backend: 'claude',
        localBackend: 'pi',
        localEndpoint: 'http://localhost:1234/v1',
        localModel: 'a',
        localApiKey: 'sk-pi-test',
        localTimeoutMs: 60000,
      });
      const result = migrateAgentConfig(input);
      const joined = result.warnings.join('\n');
      expect(joined).toContain('agent.localApiKey');
      expect(joined).toContain('agent.localTimeoutMs');
      expect(result.config.backends!.local).toEqual({
        type: 'pi',
        endpoint: 'http://localhost:1234/v1',
        model: 'a',
        apiKey: 'sk-pi-test',
        timeoutMs: 60000,
      });
    });
  });

  describe('OT13 — both legacy and new: new wins, warn each ignored', () => {
    it('returns input config unchanged and warns naming each ignored legacy field', () => {
      const input = makeAgentConfig({
        backend: 'claude',
        localBackend: 'pi',
        localEndpoint: 'http://localhost:1234/v1',
        localModel: 'a',
        backends: {
          cloud: { type: 'claude' },
          local: { type: 'pi', endpoint: 'http://localhost:1234/v1', model: 'a' },
        },
        routing: { default: 'cloud' },
      });
      const result = migrateAgentConfig(input);
      // Config returned unchanged.
      expect(result.config).toBe(input);
      expect(result.config.backends).toEqual(input.backends);
      expect(result.config.routing).toEqual(input.routing);
      // Warnings name each ignored legacy field.
      const joined = result.warnings.join('\n');
      expect(joined).toContain('agent.backend');
      expect(joined).toContain('agent.localBackend');
      expect(joined).toContain('agent.localEndpoint');
      expect(joined).toContain('agent.localModel');
      expect(joined).toContain('agent.backends');
      expect(joined).toContain('precedence');
    });
  });

  describe('OT14 — no-op when only `backends` is set', () => {
    it('returns input reference-equal with no warnings', () => {
      // Build a config where the only present legacy field is `agent.backend`,
      // which the helper sets to a placeholder value. Override it to '' so
      // the legacy detector skips it.
      const input: AgentConfig = {
        ...makeAgentConfig({}),
        backend: '',
        backends: { cloud: { type: 'claude' } },
        routing: { default: 'cloud' },
      };
      const result = migrateAgentConfig(input);
      expect(result.config).toBe(input);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Edge cases — error paths', () => {
    it('throws when agent.backend is unknown', () => {
      const input = makeAgentConfig({ backend: 'martian' });
      expect(() => migrateAgentConfig(input)).toThrow(/unknown legacy backend/);
    });

    it('throws when agent.backend=anthropic but no model', () => {
      const input = makeAgentConfig({ backend: 'anthropic' });
      expect(() => migrateAgentConfig(input)).toThrow(/requires agent\.model/);
    });

    it('throws when agent.backend=pi but no localEndpoint', () => {
      const input = makeAgentConfig({ backend: 'pi', localModel: 'a' });
      expect(() => migrateAgentConfig(input)).toThrow(/requires agent\.localEndpoint/);
    });

    it('throws when agent.localBackend set but localEndpoint missing', () => {
      const input = makeAgentConfig({
        backend: 'claude',
        localBackend: 'pi',
        localModel: 'a',
      });
      expect(() => migrateAgentConfig(input)).toThrow(/requires agent\.localEndpoint/);
    });
  });

  describe('No-op when neither path is set', () => {
    it('returns input config with empty warnings when there are no legacy fields and no backends', () => {
      const input: AgentConfig = { ...makeAgentConfig({}), backend: '' };
      const result = migrateAgentConfig(input);
      expect(result.config).toBe(input);
      expect(result.warnings).toEqual([]);
    });
  });
});
