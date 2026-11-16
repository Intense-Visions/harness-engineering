import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCheckDeps } from '../../src/commands/check-deps';

/**
 * `deps.resolveWorkspacePackages` reaches the layer engine (#2216).
 *
 * The bottom layer imports the top one through a bare workspace specifier.
 * Before #2216 that import was never an edge, so check-deps reported clean.
 * The flag is opt-in: off, the result is unchanged; on, the violation is found.
 */
describe('check-deps workspace package specifiers (#2216)', () => {
  let root: string;

  function write(rel: string, content: string): void {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  function writeConfig(deps: Record<string, unknown> | undefined): void {
    write(
      'harness.config.json',
      JSON.stringify({
        version: 1,
        rootDir: '.',
        name: 'ws-fixture',
        layers: [
          { name: 'low', pattern: 'packages/low/src/**', allowedDependencies: [] },
          { name: 'high', pattern: 'packages/high/src/**', allowedDependencies: ['low'] },
        ],
        ...(deps ? { deps } : {}),
      })
    );
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-deps-2216-'));
    write('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
    write('packages/low/package.json', JSON.stringify({ name: '@fx/low' }));
    write('packages/high/package.json', JSON.stringify({ name: '@fx/high' }));
    write('packages/high/src/index.ts', 'export const h = 1;\n');
    write('packages/low/src/index.ts', "import { h } from '@fx/high';\nexport const base = h;\n");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function run() {
    const result = await runCheckDeps({
      configPath: path.join(root, 'harness.config.json'),
      cwd: root,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    return result.value;
  }

  it('reports the cross-package violation when deps.resolveWorkspacePackages is true', async () => {
    writeConfig({ resolveWorkspacePackages: true });
    const value = await run();
    expect(value.valid).toBe(false);
    expect(value.layerViolations).toHaveLength(1);
    expect(value.layerViolations[0]).toMatchObject({ fromLayer: 'low', toLayer: 'high' });
  });

  it('keeps the previous result when the flag is absent (opt-in)', async () => {
    writeConfig(undefined);
    const value = await run();
    expect(value.layerViolations).toHaveLength(0);
    expect(value.valid).toBe(true);
  });
});
