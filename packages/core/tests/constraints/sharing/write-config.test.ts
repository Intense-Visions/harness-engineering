import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { writeConfig } from '../../../src/constraints/sharing/write-config';

describe('writeConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-write-config-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write formatted JSON to the target path', async () => {
    const targetPath = path.join(tempDir, 'config.json');
    const config = { version: 1, name: 'test' };

    await writeConfig(targetPath, config);

    const content = await fs.readFile(targetPath, 'utf-8');
    expect(content).toBe(JSON.stringify(config, null, 2) + '\n');
  });

  it('should overwrite an existing file', async () => {
    const targetPath = path.join(tempDir, 'config.json');
    await fs.writeFile(targetPath, '{"old": true}', 'utf-8');

    const newConfig = { version: 1, updated: true };
    await writeConfig(targetPath, newConfig);

    const content = await fs.readFile(targetPath, 'utf-8');
    expect(JSON.parse(content)).toEqual(newConfig);
  });

  it('should produce valid JSON output', async () => {
    const targetPath = path.join(tempDir, 'config.json');
    const config = {
      version: 1,
      layers: [{ name: 'types', pattern: 'src/**' }],
      security: { rules: { 'SEC-001': 'error' } },
    };

    await writeConfig(targetPath, config);

    const content = await fs.readFile(targetPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(config);
  });

  it('should not leave temp files on success', async () => {
    const targetPath = path.join(tempDir, 'config.json');
    await writeConfig(targetPath, { test: true });

    const files = await fs.readdir(tempDir);
    expect(files).toEqual(['config.json']);
  });

  it('should return error result if target directory does not exist', async () => {
    const targetPath = path.join(tempDir, 'nonexistent', 'config.json');

    const result = await writeConfig(targetPath, {});
    expect(result.ok).toBe(false);
  });

  it('should handle nested objects and arrays', async () => {
    const targetPath = path.join(tempDir, 'config.json');
    const config = {
      version: 1,
      packages: {
        'strict-api': {
          version: '1.0.0',
          contributions: { layers: ['a', 'b'] },
        },
      },
    };

    await writeConfig(targetPath, config);

    const content = await fs.readFile(targetPath, 'utf-8');
    expect(JSON.parse(content)).toEqual(config);
  });
});
