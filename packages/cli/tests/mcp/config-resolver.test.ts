import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { resolveProjectConfig } from '../../src/mcp/utils/config-resolver';

describe('resolveProjectConfig', () => {
  it('finds harness.config.json in given path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'test' })
    );
    const result = resolveProjectConfig(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('test');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns error when config not found', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    const result = resolveProjectConfig(tmpDir);
    expect(result.ok).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
