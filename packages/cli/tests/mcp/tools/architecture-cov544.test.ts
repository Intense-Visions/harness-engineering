import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleCheckDependencies } from '../../../src/mcp/tools/architecture';

describe('handleCheckDependencies branch coverage (cov544)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-cov-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sanitizePath throw (filesystem root) → isError', async () => {
    const r = await handleCheckDependencies({ path: '/' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('filesystem root');
  });

  it('missing harness.config.json → config-resolver Err surfaced', async () => {
    const r = await handleCheckDependencies({ path: dir });
    // resolveProjectConfig returns Err → resultToMcpResponse(error)
    expect(r.content[0].text).toContain('No harness.config.json');
  });

  it('invalid config JSON → parse error surfaced', async () => {
    fs.writeFileSync(path.join(dir, 'harness.config.json'), '{ not valid json');
    const r = await handleCheckDependencies({ path: dir });
    expect(r.content[0].text).toContain('Failed to parse config');
  });

  it('valid config with layers runs validateDependencies (no graph store)', async () => {
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        name: 'p',
        layers: [
          { name: 'app', pattern: 'src/app/**', allowedDependencies: ['core'] },
          { name: 'core', pattern: 'src/core/**', allowedDependencies: [] },
        ],
      })
    );
    fs.mkdirSync(path.join(dir, 'src', 'core'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'core', 'index.ts'), 'export const x = 1;\n');
    const r = await handleCheckDependencies({ path: dir });
    // Success path: a JSON payload (not an error string) is returned.
    expect(r.content).toHaveLength(1);
    const text = r.content[0].text;
    // Should be parseable JSON from validateDependencies (violations/summary/etc.)
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('valid config with empty layers array still resolves', async () => {
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'p' })
    );
    const r = await handleCheckDependencies({ path: dir });
    expect(r.content).toHaveLength(1);
  });
});
