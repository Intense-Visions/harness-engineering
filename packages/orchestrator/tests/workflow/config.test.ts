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
});
