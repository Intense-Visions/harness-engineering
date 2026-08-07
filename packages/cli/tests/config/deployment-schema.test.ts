// packages/cli/tests/config/deployment-schema.test.ts
import { describe, it, expect } from 'vitest';
import { DeploymentGateConfigSchema, HarnessConfigSchema } from '../../src/config/schema';

describe('DeploymentGateConfigSchema', () => {
  it('defaults enabled to true for an empty object', () => {
    const parsed = DeploymentGateConfigSchema.parse({});
    expect(parsed.enabled).toBe(true);
  });

  it('accepts an explicit opt-out', () => {
    const parsed = DeploymentGateConfigSchema.parse({ enabled: false });
    expect(parsed.enabled).toBe(false);
  });

  it('accepts a per-code severity override', () => {
    const result = DeploymentGateConfigSchema.safeParse({
      rules: { 'DEPLOY-ENV001': 'off' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts each supported override value', () => {
    const result = DeploymentGateConfigSchema.safeParse({
      rules: { 'DEPLOY-RB001': 'error', 'DEPLOY-ENV001': 'warn', 'DEPLOY-STAGE001': 'off' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown severity value', () => {
    const result = DeploymentGateConfigSchema.safeParse({
      rules: { 'DEPLOY-ENV001': 'sometimes' },
    });
    expect(result.success).toBe(false);
  });
});

describe('HarnessConfigSchema — deployment wiring', () => {
  it('is optional (config without a deployment block parses)', () => {
    const result = HarnessConfigSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
  });

  it('accepts a deployment block and defaults enabled', () => {
    const result = HarnessConfigSchema.safeParse({ version: 1, deployment: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deployment?.enabled).toBe(true);
    }
  });
});
