// tests/utils/config-loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getConfig, clearConfigCache } from '../../src/utils/config-loader';

describe('config-loader', () => {
  const fixturesDir = path.join(__dirname, '../fixtures');
  let tempDir: string;

  beforeEach(() => {
    clearConfigCache();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-plugin-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds config in same directory', () => {
    const filePath = path.join(fixturesDir, 'src/file.ts');
    // Copy fixture to temp and test from there
    const config = getConfig(path.join(fixturesDir, 'harness.config.json'));
    expect(config).not.toBeNull();
    expect(config?.version).toBe(1);
  });

  it('finds config in parent directory', () => {
    // Create nested structure
    const nestedDir = path.join(tempDir, 'src', 'deep', 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.copyFileSync(
      path.join(fixturesDir, 'harness.config.json'),
      path.join(tempDir, 'harness.config.json')
    );

    const config = getConfig(path.join(nestedDir, 'file.ts'));
    expect(config).not.toBeNull();
    expect(config?.layers).toHaveLength(4);
  });

  it('returns null when no config found', () => {
    const config = getConfig(path.join(tempDir, 'no-config', 'file.ts'));
    expect(config).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    fs.writeFileSync(path.join(tempDir, 'harness.config.json'), 'not json');
    const config = getConfig(path.join(tempDir, 'file.ts'));
    expect(config).toBeNull();
  });

  it('returns null for invalid schema', () => {
    fs.writeFileSync(path.join(tempDir, 'harness.config.json'), JSON.stringify({ version: 99 }));
    const config = getConfig(path.join(tempDir, 'file.ts'));
    expect(config).toBeNull();
  });

  it('caches config for same path', () => {
    fs.copyFileSync(
      path.join(fixturesDir, 'harness.config.json'),
      path.join(tempDir, 'harness.config.json')
    );

    const config1 = getConfig(path.join(tempDir, 'file1.ts'));
    const config2 = getConfig(path.join(tempDir, 'file2.ts'));
    expect(config1).toBe(config2); // Same object reference
  });
});
