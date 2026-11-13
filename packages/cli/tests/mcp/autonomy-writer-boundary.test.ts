import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * S4 / D12: agent-callable surfaces (everything under src/mcp) may only LOWER autonomy, so
 * they must reach the store through writeLoweringOverride, never the unrestricted
 * writeSessionOverride. Matches any reference (static import, `core.writeSessionOverride`
 * after a dynamic import, a re-export), not just import statements.
 */
const MCP_DIR = path.resolve(__dirname, '../../src/mcp');
const FORBIDDEN = /\bwriteSessionOverride\b/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(?:[cm]?[jt]s|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe('MCP never references the unrestricted override writer (S4)', () => {
  const files = walk(MCP_DIR);

  it('scans a real denominator (the MCP tree, including state.ts)', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.map((f) => path.basename(f))).toContain('state.ts');
  });

  it('positive control: the pattern catches the forms that matter', () => {
    for (const src of [
      "import { writeSessionOverride } from '@harness-engineering/core';",
      'core.writeSessionOverride(p, s, c, "mcp")',
      "export { writeSessionOverride } from '@harness-engineering/core';",
    ]) {
      expect(FORBIDDEN.test(src), src).toBe(true);
    }
    expect(FORBIDDEN.test('core.writeLoweringOverride(p, s, c)')).toBe(false);
  });

  it('positive control: the MCP set-autonomy path uses writeLoweringOverride', () => {
    const state = fs.readFileSync(path.join(MCP_DIR, 'tools', 'state.ts'), 'utf-8');
    expect(state).toMatch(/\bwriteLoweringOverride\b/);
  });

  it('no file under src/mcp references writeSessionOverride', () => {
    const offenders = files
      .filter((f) => FORBIDDEN.test(fs.readFileSync(f, 'utf-8')))
      .map((f) => path.relative(MCP_DIR, f));
    expect(offenders).toEqual([]);
  });
});

/**
 * S3: the same boundary across every package's src/, not just cli's MCP tree. The only callers
 * allowed are the TTY-gated human CLI (`harness autonomy set`) and core's own autonomy module
 * (the definition, the lower-only wrapper that delegates to it, and the barrel re-export).
 */
describe('only the human CLI and core autonomy reference writeSessionOverride (S3)', () => {
  const REPO = path.resolve(__dirname, '../../../..');
  const ALLOWED = new Set([
    'packages/cli/src/commands/autonomy/set.ts',
    'packages/core/src/autonomy/override-store.ts',
    'packages/core/src/autonomy/lower-only.ts',
    'packages/core/src/autonomy/index.ts',
  ]);
  const srcDirs = fs
    .readdirSync(path.join(REPO, 'packages'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(REPO, 'packages', e.name, 'src'))
    .filter((d) => fs.existsSync(d));
  const files = srcDirs.flatMap(walk);
  const rel = (f: string) => path.relative(REPO, f).replaceAll('\\', '/');

  it('scans a real denominator: several packages, including cli and core', () => {
    expect(srcDirs.length).toBeGreaterThan(5);
    expect(files.length).toBeGreaterThan(500);
    const names = new Set(files.map(rel));
    for (const f of ALLOWED) expect(names.has(f), f).toBe(true);
  });

  it('positive control: the allowlisted human CLI really references it', () => {
    const set = fs.readFileSync(
      path.join(REPO, 'packages/cli/src/commands/autonomy/set.ts'),
      'utf-8'
    );
    expect(FORBIDDEN.test(set)).toBe(true);
  });

  it('no other file under packages/*/src references writeSessionOverride', () => {
    const offenders = files
      .filter((f) => !ALLOWED.has(rel(f)))
      .filter((f) => FORBIDDEN.test(fs.readFileSync(f, 'utf-8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
