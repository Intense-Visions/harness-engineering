// Tier C — the `--json` output contract, per command that broke it in the
// published cli@14.1.0 post-release smoke.
//
// Contract: under `--json`, stdout carries exactly ONE parseable JSON document
// (a success OR an error), and the process exit code agrees with it. Each case
// spawns the REAL built binary and JSON.parses stdout — the only observation a
// shell consumer (`harness … --json | jq`) actually makes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HARNESS_BIN, runHarness, scaffoldProject, cleanup, skipUnlessBin } from './support';

const PROJECT = {
  'harness.config.json': JSON.stringify({ version: 1, rootDir: './src' }),
  'src/a.ts': 'export const a = 1;\n',
};

/** An orchestrator URL nothing listens on, so every routing call fails fast. */
const DEAD_ORCHESTRATOR = 'http://127.0.0.1:9';

function parseStdout(stdout: string): Record<string, unknown> {
  // Exactly one document: JSON.parse rejects trailing/leading non-JSON text.
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe.skipIf(skipUnlessBin)('--json output contract (spawned CLI)', () => {
  let proj: string;

  beforeAll(() => {
    proj = scaffoldProject(PROJECT, 'e2e-json-contract-');
  });

  afterAll(() => cleanup(proj));

  it('G: comprehend --check --json emits the verdict document, exit agrees', () => {
    const r = runHarness(['comprehend', '--check', '--json'], { cwd: proj });
    const doc = parseStdout(r.stdout);
    expect(doc['ok']).toBe(true);
    expect(doc['stale']).toEqual([]);
    expect(doc['orphans']).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('H: black-box list --json with no runs emits an empty run list, exit 0', () => {
    const r = runHarness(['black-box', 'list', '--json'], { cwd: proj });
    const doc = parseStdout(r.stdout);
    expect(doc['runs']).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('I: routing config --json with no orchestrator emits a JSON error, exit 2', () => {
    const r = runHarness(['routing', 'config', '--json'], {
      cwd: proj,
      env: { ...process.env, HARNESS_ORCHESTRATOR_URL: DEAD_ORCHESTRATOR },
    });
    const doc = parseStdout(r.stdout);
    expect(String(doc['error'])).toContain('Failed to reach orchestrator');
    expect(doc['status']).toBe(0);
    expect(r.status).toBe(2);
    // The human diagnostic still reaches stderr.
    expect(r.stderr).toContain('Failed to reach orchestrator');
  });

  it.each([
    ['usage', 'daily'],
    ['adoption', 'skills'],
  ])('J: %s --json with no subcommand emits a JSON error naming subcommands', (group, sub) => {
    const r = runHarness([group, '--json'], { cwd: proj });
    const doc = parseStdout(r.stdout);
    expect(String(doc['error'])).toContain('Missing subcommand');
    expect(doc['command']).toBe(group);
    expect(doc['subcommands']).toContain(sub);
    expect(r.status).toBe(1);
  });

  it('K: linter validate --json without config carries the error message', () => {
    const r = runHarness(['linter', 'validate', '--json'], { cwd: proj });
    const doc = parseStdout(r.stdout) as { success: boolean; error: Record<string, unknown> };
    expect(doc.success).toBe(false);
    expect(doc.error['code']).toBe('FILE_NOT_FOUND');
    expect(String(doc.error['message'])).toContain('Config file not found');
    expect(r.status).toBe(1);
  });

  it('L: MCP serverInfo.version is the CLI package version', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    };
    const init = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'e2e', version: '0' },
      },
    });
    const res = spawnSync(process.execPath, [HARNESS_BIN, 'mcp'], {
      cwd: proj,
      input: `${init}\n`,
      encoding: 'utf8',
      timeout: 60_000,
      killSignal: 'SIGKILL',
      env: { ...process.env, HARNESS_NO_UPDATE_CHECK: '1' },
    });
    const line = res.stdout.split('\n').find((l) => l.includes('"serverInfo"'));
    expect(line, `no initialize response; stderr: ${res.stderr}`).toBeDefined();
    const msg = JSON.parse(line!) as { result: { serverInfo: { version: string } } };
    expect(msg.result.serverInfo.version).toBe(pkg.version);
  });

  // Positive controls: human mode is unchanged — no JSON document on stdout.
  it('control: usage with no subcommand and no --json keeps commander help-on-stderr, exit 1', () => {
    const r = runHarness(['usage'], { cwd: proj });
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('Usage: harness usage');
    expect(r.status).toBe(1);
  });

  it('control: black-box list without --json prints no JSON document', () => {
    const r = runHarness(['black-box', 'list'], { cwd: proj });
    expect(() => JSON.parse(r.stdout)).toThrow();
    expect(r.status).toBe(0);
  });
});
