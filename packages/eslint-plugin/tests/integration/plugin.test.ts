// tests/integration/plugin.test.ts
import { describe, it, expect } from 'vitest';
import plugin from '../../src/index';

describe('plugin exports', () => {
  it('exports all 5 rules', () => {
    expect(Object.keys(plugin.rules)).toHaveLength(5);
    expect(plugin.rules['no-layer-violation']).toBeDefined();
    expect(plugin.rules['no-circular-deps']).toBeDefined();
    expect(plugin.rules['no-forbidden-imports']).toBeDefined();
    expect(plugin.rules['require-boundary-schema']).toBeDefined();
    expect(plugin.rules['enforce-doc-exports']).toBeDefined();
  });

  it('exports recommended config', () => {
    expect(plugin.configs.recommended).toBeDefined();
    expect(plugin.configs.recommended.rules).toBeDefined();
  });

  it('exports strict config', () => {
    expect(plugin.configs.strict).toBeDefined();
    expect(plugin.configs.strict.rules).toBeDefined();
  });

  it('configs reference the plugin', () => {
    const recommended = plugin.configs.recommended;
    expect(recommended.plugins?.['@harness-engineering']).toBe(plugin);
  });
});
