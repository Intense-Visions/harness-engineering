// packages/cli/tests/integration/cleanup-findings-enumerable.e2e.test.ts
//
// #2133: `harness cleanup` findings could not be enumerated. The human output
// printed 10 rows and elided the rest behind `... and N more`, and the only
// machine-readable channel, `--findings-json`, published a COUNT. So a
// `harness cleanup | grep X | wc -l` of 0 was indistinguishable from "X was
// among the elided rows", and a consumer could threshold but never triage.
//
// #2076 (first half): the dead-code `reason` was dropped on every output path,
// so a non-deletable PUBLIC_API_UNUSED / UNREFERENCED_ENTRY_POINT finding
// rendered byte-identically to a deletable NO_IMPORTERS one.
//
// A real spawned CLI over a real project. stdout goes to a FILE, not a pipe:
// with hundreds of findings the contract line alone exceeds 64 KiB, the size at
// which a piped read is known to truncate in this repo's tooling.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HARNESS_BIN, skipUnlessBin, scaffoldProject, cleanup } from '../e2e/support';

/** Enough dead files that the contract line is well past 64 KiB. */
const DEAD_FILES = 400;
const KNOWN_REASONS = [
  'NO_IMPORTERS',
  'UNREFERENCED_ENTRY_POINT',
  'NOT_ENTRY_POINT',
  'ALL_EXPORTS_DEAD',
  'IMPORTERS_ALSO_DEAD',
  'PUBLIC_API_UNUSED',
];

function deadName(i: number): string {
  // Long names so each item is large; zero-padded so the order is stable.
  return `src/orphans/an-unreferenced-module-with-a-deliberately-long-name-${String(i).padStart(4, '0')}.ts`;
}

/** Run the built CLI with stdout redirected to a file; return its contents. */
function runToFile(args: string[], cwd: string, outFile: string) {
  const fd = fs.openSync(outFile, 'w');
  try {
    const res = spawnSync(process.execPath, [HARNESS_BIN, ...args], {
      cwd,
      stdio: ['ignore', fd, 'pipe'],
      encoding: 'utf8',
      timeout: 120_000,
    });
    return { status: res.status ?? -1, stdout: fs.readFileSync(outFile, 'utf-8') };
  } finally {
    fs.closeSync(fd);
  }
}

function lastLine(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  return lines[lines.length - 1] ?? '';
}

describe.skipIf(skipUnlessBin)('harness cleanup findings are enumerable (#2133)', () => {
  let projectDir: string;
  let outDir: string;

  beforeAll(() => {
    const files: Record<string, string> = {
      'harness.config.json': JSON.stringify({
        version: 1,
        rootDir: '.',
        docsDir: './docs',
        entropy: { entryPoints: ['src/index.ts'], excludePatterns: ['**/node_modules/**'] },
      }),
      'src/index.ts': "import { used } from './used';\nconsole.log(used());\n",
      'src/used.ts':
        'export function used(): number {\n  return 1;\n}\n\nexport function neverImported(): number {\n  return 2;\n}\n',
    };
    for (let i = 0; i < DEAD_FILES; i++) {
      files[deadName(i)] = `export const orphan${i} = ${i};\n`;
    }
    projectDir = scaffoldProject(files, 'harness-cleanup-2133-');
    outDir = fs.mkdtempSync(path.join(projectDir, '..', 'harness-cleanup-2133-out-'));
  });

  afterAll(() => {
    cleanup(projectDir);
    cleanup(outDir);
  });

  it('--findings-json publishes every finding, with file, kind and the dead-code reason', () => {
    const { stdout } = runToFile(
      ['cleanup', '-t', 'dead-code', '--findings-json'],
      projectDir,
      path.join(outDir, 'findings.txt')
    );
    const line = lastLine(stdout);
    // The precondition the file redirect exists for: a pipe-sized read would
    // not have held this line.
    expect(line.length).toBeGreaterThan(64 * 1024);

    const contract = JSON.parse(line) as {
      findings: number;
      check: string;
      v: number;
      items?: Array<Record<string, unknown>>;
    };
    // Existing fields unchanged — additive only.
    expect(contract.check).toBe('cleanup');
    expect(contract.v).toBe(1);
    expect(contract.findings).toBeGreaterThanOrEqual(DEAD_FILES + 1);

    // The full list, never a sample: one item per counted finding.
    expect(contract.items).toBeDefined();
    expect(contract.items).toHaveLength(contract.findings);

    const files = new Set(contract.items!.map((i) => String(i.file).replace(/\\/g, '/')));
    for (let i = 0; i < DEAD_FILES; i++) {
      expect([...files].some((f) => f.endsWith(deadName(i)))).toBe(true);
    }

    for (const item of contract.items!) {
      expect(item.kind).toBe('dead-code');
      expect(KNOWN_REASONS).toContain(item.reason);
    }

    // A dead export carries its symbol and line, not just the file.
    const exportItem = contract.items!.find((i) => i.symbol === 'neverImported');
    expect(exportItem).toBeDefined();
    expect(exportItem!.line).toBe(5);
  });

  it('human output names the reason and says where the elided rows are', () => {
    const { stdout } = runToFile(
      ['cleanup', '-t', 'dead-code'],
      projectDir,
      path.join(outDir, 'human.txt')
    );
    const rows = stdout.split('\n').filter((l) => l.startsWith('  - '));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(KNOWN_REASONS.some((r) => row.includes(`[${r}]`))).toBe(true);
    }
    // Truncation is announced with the way to get the rest, not silent.
    expect(stdout).toMatch(/\.\.\. and \d+ more \(full list: --findings-json or --json\)/);
  });
});
