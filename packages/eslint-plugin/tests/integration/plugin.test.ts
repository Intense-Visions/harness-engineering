// tests/integration/plugin.test.ts
import { describe, it, expect } from 'vitest';
import plugin from '../../src/index';

describe('plugin exports', () => {
  it('exports all 19 rules', () => {
    expect(Object.keys(plugin.rules)).toHaveLength(19);
    expect(plugin.rules['no-undefined-optional-assignment']).toBeDefined();
    expect(plugin.rules['no-layer-violation']).toBeDefined();
    expect(plugin.rules['no-circular-deps']).toBeDefined();
    expect(plugin.rules['no-forbidden-imports']).toBeDefined();
    expect(plugin.rules['require-boundary-schema']).toBeDefined();
    expect(plugin.rules['enforce-doc-exports']).toBeDefined();
    expect(plugin.rules['no-sync-io-in-async']).toBeDefined();
    expect(plugin.rules['no-nested-loops-in-critical']).toBeDefined();
    expect(plugin.rules['no-process-env-in-spawn']).toBeDefined();
    expect(plugin.rules['no-unbounded-array-chains']).toBeDefined();
    expect(plugin.rules['no-unix-shell-command']).toBeDefined();
    expect(plugin.rules['no-hardcoded-path-separator']).toBeDefined();
    expect(plugin.rules['require-path-normalization']).toBeDefined();
    expect(plugin.rules['no-focused-tests']).toBeDefined();
    expect(plugin.rules['no-skipped-tests']).toBeDefined();
    expect(plugin.rules['no-disabled-tests']).toBeDefined();
    expect(plugin.rules['no-hardcoded-test-count']).toBeDefined();
    expect(plugin.rules['no-empty-describe']).toBeDefined();
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
