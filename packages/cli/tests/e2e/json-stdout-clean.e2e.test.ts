// Tier C — machine-readable stdout must stay parseable (#2519).
//
// `harness --json <cmd>` is meant to be piped into `jq` / `JSON.parse`. A
// diagnostic (`logger.warn`) used to be written to STDOUT ahead of the JSON
// document, so `harness --json check-docs | jq` failed to parse whenever the
// knowledge-map check warned (e.g. a project with no AGENTS.md).
//
// stdout is captured to a FILE rather than a pipe so this test is independent
// of pipe-truncation behaviour (#2254): it observes exactly the bytes a
// redirect (`> out.json`) would get.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HARNESS_BIN, scaffoldProject, cleanup, skipUnlessBin } from './support';

// No AGENTS.md => validateKnowledgeMap fails => check-docs warns.
const PROJECT = {
  'harness.config.json': JSON.stringify({ version: 1, rootDir: './src', docsDir: './docs' }),
  'src/a.ts': 'export const a = 1;\n',
  'docs/.gitkeep': '',
};

function runToFiles(
  args: string[],
  cwd: string
): { status: number; stdout: string; stderr: string } {
  const outDir = mkdtempSync(path.join(tmpdir(), 'e2e-json-stdout-io-'));
  const outPath = path.join(outDir, 'stdout.txt');
  const errPath = path.join(outDir, 'stderr.txt');
  const outFd = openSync(outPath, 'w');
  const errFd = openSync(errPath, 'w');
  try {
    const res = spawnSync(process.execPath, [HARNESS_BIN, ...args], {
      cwd,
      stdio: ['ignore', outFd, errFd],
      timeout: 60_000,
    });
    closeSync(outFd);
    closeSync(errFd);
    return {
      status: res.status ?? -1,
      stdout: readFileSync(outPath, 'utf8'),
      stderr: readFileSync(errPath, 'utf8'),
    };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

describe.skipIf(skipUnlessBin)('harness --json keeps stdout machine-readable (#2519)', () => {
  let proj: string;

  beforeAll(() => {
    proj = scaffoldProject(PROJECT, 'e2e-json-stdout-');
  });

  afterAll(() => cleanup(proj));

  it('check-docs: the knowledge-map warning goes to stderr and stdout parses as JSON', () => {
    const r = runToFiles(['--json', 'check-docs'], proj);
    // The warning still reaches the operator...
    expect(r.stderr).toContain('Knowledge map validation failed');
    // ...but never the JSON channel.
    expect(r.stdout).not.toContain('Knowledge map validation failed');
    const parsed = JSON.parse(r.stdout) as { valid: boolean; scanned: number };
    expect(typeof parsed.valid).toBe('boolean');
    expect(parsed.scanned).toBe(1);
  });
});
