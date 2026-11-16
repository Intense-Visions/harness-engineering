/**
 * Issue #2234 — security-craft scanned 0 files on non-monorepo layouts, missed
 * privileged calls reached through NAMED imports, and a run that examined no
 * file at all read exactly like a clean scan.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runSecurityCraft, collectSecurityCraftPrompts } from '../../src/security-craft';
import { discoverSourceFiles } from '../../src/security-craft/extract/discover';
import { detectSignals } from '../../src/security-craft/extract/signals';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';

const SPAWN_NAMED = `import { spawnSync } from 'node:child_process';
export function run(cmd: string): void {
  spawnSync(cmd, { shell: true });
}
`;

describe('#2234 cause 1: discovery outside a packages/ monorepo', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-2234-discover-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  function writeFile(rel: string, content = '// stub'): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('falls back to src/ and app/ when there is no packages/ dir', () => {
    writeFile('src/server.ts');
    writeFile('src/lib/util.ts');
    writeFile('src/lib/util.test.ts');
    writeFile('app/route.tsx');
    writeFile('scripts/build.ts'); // not a conventional source root
    const rel = discoverSourceFiles(tmpDir)
      .map((f) => path.relative(tmpDir, f).split(path.sep).join('/'))
      .sort();
    expect(rel).toEqual(['app/route.tsx', 'src/lib/util.ts', 'src/server.ts']);
  });

  it('runSecurityCraft on a single-package src/ repo scans more than 0 files', async () => {
    writeFile('src/run.ts', SPAWN_NAMED);
    const out = await runSecurityCraft({ path: tmpDir, __testProvider: new MockLlmProvider() });
    expect(out.summary.counts.filesScanned).toBe(1);
  });
});

describe('#2234 cause 2: privileged calls through named / aliased imports', () => {
  it('flags bare spawnSync imported by name from node:child_process', () => {
    const sigs = detectSignals(SPAWN_NAMED, '/tmp/executor.ts');
    expect(sigs).toContainEqual({
      kind: 'privileged-op',
      marker: 'child_process.spawnSync',
      line: 3,
    });
  });

  it('flags a writeFileSync pulled from a multi-line named import list', () => {
    const src = `import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
export function save(p: string, c: string): void {
  if (existsSync(p)) readFileSync(p);
  writeFileSync(p, c, 'utf-8');
}
`;
    const sigs = detectSignals(src, '/tmp/mcp-server.ts');
    expect(sigs).toContainEqual({ kind: 'privileged-op', marker: 'fs.writeFileSync', line: 8 });
    // read-only fs calls are not privileged
    expect(sigs.filter((s) => s.kind === 'privileged-op')).toHaveLength(1);
  });

  it('flags renamed named imports and aliased namespaces', () => {
    const src = `import { execSync as run } from 'child_process';
import * as cp from 'node:child_process';
import nodeFs from 'fs';
run('ls');
cp.spawn('ls');
nodeFs.unlinkSync('/x');
`;
    const markers = detectSignals(src, '/tmp/a.ts').map((s) => `${s.kind}:${s.marker}`);
    expect(markers).toEqual(
      expect.arrayContaining([
        'privileged-op:child_process.execSync',
        'privileged-op:child_process.spawn',
        'privileged-op:fs.unlinkSync',
      ])
    );
  });

  it('flags CommonJS destructured and namespace requires', () => {
    const src = `const { spawn } = require('node:child_process');
const cp = require('child_process');
spawn('ls');
cp.fork('w.js');
`;
    const markers = detectSignals(src, '/tmp/a.js').map((s) => s.marker);
    expect(markers).toEqual(expect.arrayContaining(['child_process.spawn', 'child_process.fork']));
  });

  it('flags writeFile from node:fs/promises', () => {
    const src = `import { writeFile } from 'node:fs/promises';
await writeFile('/x', 'y');
`;
    const markers = detectSignals(src, '/tmp/a.ts').map((s) => s.marker);
    expect(markers).toContain('fs.writeFile');
  });

  it('does not flag a locally-defined function that shares a privileged name', () => {
    const src = `function spawnSync(x: string): string { return x; }
spawnSync('ok');
`;
    expect(detectSignals(src, '/tmp/a.ts')).toEqual([]);
  });

  it('does not flag a named import from an unrelated module', () => {
    const src = `import { spawnSync } from './my-wrapper';
spawnSync('ok');
`;
    expect(detectSignals(src, '/tmp/a.ts')).toEqual([]);
  });
});

describe('#2234 cause 3: zero candidate files is an abstention, not a clean pass', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-2234-abstain-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inline run over a layout with no discoverable source reports an abstention', async () => {
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'lib/run.ts'), SPAWN_NAMED);
    const out = await runSecurityCraft({ path: tmpDir, __testProvider: new MockLlmProvider() });
    expect(out.summary.counts.candidateFiles).toBe(0);
    expect(out.summary.abstention?.reason).toBe('no-candidate-files');
  });

  it('a run that examined files and found nothing does NOT abstain', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src/math.ts'), 'export const add = (a: number) => a;\n');
    const out = await runSecurityCraft({ path: tmpDir, __testProvider: new MockLlmProvider() });
    expect(out.summary.counts.candidateFiles).toBe(1);
    expect(out.summary.counts.filesSkippedNoSignal).toBe(1);
    expect(out.summary.abstention).toBeUndefined();
  });

  it('in-session collect over zero candidates reports the abstention too', async () => {
    const out = await collectSecurityCraftPrompts({ path: tmpDir });
    expect(out.projection.promptCount).toBe(0);
    expect(out.candidateFiles).toBe(0);
    expect(out.abstention?.reason).toBe('no-candidate-files');
  });
});
