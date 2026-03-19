import { describe, it, expect } from 'vitest';
import { findConfigFile, loadConfig } from '../../src/config/loader';
import * as path from 'path';
import * as os from 'os';

describe('findConfigFile', () => {
  it('finds harness.config.json in current directory', () => {
    const fixtureDir = path.join(__dirname, '../fixtures/valid-project');
    const result = findConfigFile(fixtureDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('harness.config.json');
    }
  });

  it('returns error when no config found', () => {
    const result = findConfigFile(os.tmpdir());
    expect(result.ok).toBe(false);
  });
});

describe('loadConfig', () => {
  it('loads and validates config file', () => {
    const configPath = path.join(__dirname, '../fixtures/valid-project/harness.config.json');
    const result = loadConfig(configPath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe(1);
      expect(result.value.name).toBe('test-project');
    }
  });

  it('returns error for invalid config', () => {
    const configPath = path.join(__dirname, '../fixtures/invalid-project/harness.config.json');
    const result = loadConfig(configPath);
    expect(result.ok).toBe(false);
  });

  it('returns error for missing file', () => {
    const result = loadConfig('/nonexistent/harness.config.json');
    expect(result.ok).toBe(false);
  });

  it('preserves security config through schema validation', () => {
    const configPath = path.join(__dirname, '../fixtures/valid-project/harness.config.json');
    const result = loadConfig(configPath);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const config = result.value as Record<string, unknown>;
    const security = config.security as Record<string, unknown>;
    expect(security).toBeDefined();
    expect(security.enabled).toBe(true);
    expect(security.exclude).toEqual(['**/coverage/**', '**/security/rules/**']);
    expect(security.rules).toEqual({ 'SEC-CRY-001': 'warning' });
  });
});
