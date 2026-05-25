import { describe, it, expect } from 'vitest';
import { validateWorkflowConfig, getDefaultConfig } from '../../src/workflow/config.js';

describe('validateWorkflowConfig — backend requirement (Spec 2 SC15)', () => {
  it('rejects a config with neither agent.backend nor agent.backends set', () => {
    const cfg = getDefaultConfig();
    // strip the default mock backend so neither path is set
    (cfg.agent as Record<string, unknown>).backend = undefined;
    delete (cfg.agent as Record<string, unknown>).backends;
    const result = validateWorkflowConfig(cfg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/must define agent\.backend or agent\.backends/i);
    }
  });

  it('accepts a config with only legacy agent.backend set', () => {
    const cfg = getDefaultConfig();
    const result = validateWorkflowConfig(cfg);
    expect(result.ok).toBe(true);
  });

  it('accepts a config with only modern agent.backends set', () => {
    const cfg = getDefaultConfig();
    (cfg.agent as Record<string, unknown>).backend = undefined;
    (cfg.agent as Record<string, unknown>).backends = { primary: { type: 'mock' } };
    (cfg.agent as Record<string, unknown>).routing = { default: 'primary' };
    const result = validateWorkflowConfig(cfg);
    expect(result.ok).toBe(true);
  });

  it('rejects modern shape when backends Zod validation fails', () => {
    const cfg = getDefaultConfig();
    (cfg.agent as Record<string, unknown>).backend = undefined;
    // 'pi' requires endpoint + model — provide neither
    (cfg.agent as Record<string, unknown>).backends = { primary: { type: 'pi' } };
    (cfg.agent as Record<string, unknown>).routing = { default: 'primary' };
    const result = validateWorkflowConfig(cfg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/agent\.backends/);
    }
  });

  it('rejects modern shape when routing references an unknown backend (cross-field)', () => {
    const cfg = getDefaultConfig();
    (cfg.agent as Record<string, unknown>).backend = undefined;
    (cfg.agent as Record<string, unknown>).backends = { primary: { type: 'mock' } };
    (cfg.agent as Record<string, unknown>).routing = {
      default: 'primary',
      'quick-fix': 'ghost',
    };
    const result = validateWorkflowConfig(cfg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/ghost|unknown backend/i);
    }
  });

  describe('Spec B Phase 2 — warnings on the validation result', () => {
    const baseConfig = {
      tracker: {
        kind: 'roadmap',
        filePath: 'docs/roadmap.md',
        activeStates: [],
        terminalStates: [],
      },
      polling: { intervalMs: 1000, jitterMs: 0 },
      workspace: { root: '.harness/workspaces' },
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1000,
      },
      server: { port: 8080 },
    };

    it('returns warnings:[] when no skills/modes are configured', () => {
      const result = validateWorkflowConfig({
        ...baseConfig,
        agent: {
          backends: { 'claude-opus': { type: 'claude' } },
          routing: { default: 'claude-opus' },
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.warnings).toEqual([]);
    });

    it('carries a skill-name warning when knownSkillNames is supplied via options', () => {
      const result = validateWorkflowConfig(
        {
          ...baseConfig,
          agent: {
            backends: { 'claude-opus': { type: 'claude' } },
            routing: {
              default: 'claude-opus',
              skills: { 'typo-skill': 'claude-opus' },
            },
          },
        },
        { knownSkillNames: ['harness-debugging'] }
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0]).toContain('routing.skills.typo-skill');
    });

    it('carries a mode warning even without a skill catalog', () => {
      const result = validateWorkflowConfig({
        ...baseConfig,
        agent: {
          backends: { 'claude-opus': { type: 'claude' } },
          routing: {
            default: 'claude-opus',
            modes: { 'gut-reactor': 'claude-opus' },
          },
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.warnings).toHaveLength(1);
      expect(result.value.warnings[0]).toContain('routing.modes.gut-reactor');
    });

    it('preserves Err(...) semantics for hard errors (unknown backend in skills chain)', () => {
      const result = validateWorkflowConfig({
        ...baseConfig,
        agent: {
          backends: { 'claude-opus': { type: 'claude' } },
          routing: {
            default: 'claude-opus',
            skills: { 'harness-debugging': ['claude-opus', 'typo-backend'] },
          },
        },
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('routing.skills.harness-debugging.1');
      expect(result.error.message).toContain('typo-backend');
    });
  });
});
