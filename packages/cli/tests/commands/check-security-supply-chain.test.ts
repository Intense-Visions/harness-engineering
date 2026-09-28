import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createCheckSecurityCommand, runCheckSecurity } from '../../src/commands/check-security';

// `check-security --supply-chain-json`: a supplied dependency audit must reach the
// security timeline as a real measurement, and bad input must fail loudly rather
// than degrade to the all-zero supply chain that used to read as a clean audit.

const MEASURED_WITH_HIGH = {
  critical: 0,
  high: 2,
  moderate: 1,
  low: 0,
  info: 0,
  total: 3,
  packagesScanned: 581,
};

let project: string;

/** A scannable, clean project with one commit, so timeline capture can run. */
function makeProject({ commit = true } = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-security-supply-chain-'));
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const answer = 42;\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  if (commit) {
    git('add', '.');
    git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'init');
  }
  return dir;
}

function writeMeasurement(dir: string, body: unknown): string {
  const file = path.join(dir, 'supply-chain.json');
  writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
  return 'supply-chain.json';
}

function timeline(dir: string) {
  const file = path.join(dir, '.harness', 'security', 'timeline.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : undefined;
}

afterEach(() => {
  if (project) rmSync(project, { recursive: true, force: true });
});

describe('runCheckSecurity --supply-chain-json', () => {
  it('records non-zero supplyChain.high in the captured snapshot and lowers the score', async () => {
    project = makeProject();
    const supplyChainJson = writeMeasurement(project, MEASURED_WITH_HIGH);

    const result = await runCheckSecurity(project, { supplyChainJson });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supplyChain).toEqual(MEASURED_WITH_HIGH);
    const snapshot = timeline(project).snapshots.at(-1);
    expect(snapshot.supplyChain.high).toBe(2);
    expect(snapshot.supplyChain.packagesScanned).toBe(581);
    expect(snapshot.securityScore).toBe(93);
  });

  it('leaves behaviour unchanged when the option is absent', async () => {
    project = makeProject();

    const result = await runCheckSecurity(project, {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supplyChain).toBeUndefined();
    const snapshot = timeline(project).snapshots.at(-1);
    expect(snapshot.supplyChain).toEqual({
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      info: 0,
      total: 0,
    });
    expect(snapshot.securityScore).toBe(100);
  });

  it('errors on malformed JSON and records nothing', async () => {
    project = makeProject();
    const supplyChainJson = writeMeasurement(project, '{ "critical": 0,');

    const result = await runCheckSecurity(project, { supplyChainJson });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/is not valid JSON/);
    expect(timeline(project)).toBeUndefined();
  });

  it('rejects a measurement that covered zero packages', async () => {
    project = makeProject();
    const supplyChainJson = writeMeasurement(project, {
      ...MEASURED_WITH_HIGH,
      packagesScanned: 0,
    });

    const result = await runCheckSecurity(project, { supplyChainJson });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/packagesScanned/);
    expect(timeline(project)).toBeUndefined();
  });

  it('errors on a missing file', async () => {
    project = makeProject();

    const result = await runCheckSecurity(project, { supplyChainJson: 'nope.json' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Cannot read supply-chain measurement/);
  });

  it('errors when a supplied measurement cannot be recorded, instead of dropping it', async () => {
    project = makeProject({ commit: false }); // no HEAD → capture cannot run
    const supplyChainJson = writeMeasurement(project, MEASURED_WITH_HIGH);

    const result = await runCheckSecurity(project, { supplyChainJson });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/was not recorded/);
  });

  it('keeps an unrecordable scan best-effort when no measurement was supplied', async () => {
    project = makeProject({ commit: false });

    const result = await runCheckSecurity(project, {});

    expect(result.ok).toBe(true);
  });
});

describe('check-security --supply-chain-json (action)', () => {
  let logOutput: string[];
  let exitCode: number | undefined;
  let originalCwd: string;
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logOutput.push(a.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    logOutput.push(a.map(String).join(' '));
  });
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code;
    throw new Error('exit:' + code);
  }) as never);

  function run(args: string[]): Promise<unknown> {
    const parent = new Command();
    parent.option('--json').option('--verbose').option('--quiet');
    parent.addCommand(createCheckSecurityCommand());
    parent.exitOverride();
    return parent.parseAsync(['check-security', ...args], { from: 'user' });
  }

  beforeEach(() => {
    logOutput = [];
    exitCode = undefined;
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  afterAll(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits ERROR on an invalid measurement', async () => {
    project = makeProject();
    const file = writeMeasurement(project, { ...MEASURED_WITH_HIGH, total: 0 });
    process.chdir(project);

    await expect(run(['--supply-chain-json', file])).rejects.toThrow('exit:2');
    expect(logOutput.join('\n')).toMatch(/total must equal/);
  });

  it('reports the recorded measurement and its denominator in text mode', async () => {
    project = makeProject();
    const file = writeMeasurement(project, MEASURED_WITH_HIGH);
    process.chdir(project);

    await expect(run(['--supply-chain-json', file])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toMatch(/supply chain recorded across 581 package\(s\).*high 2/);
  });

  it('includes the measurement in --json output', async () => {
    project = makeProject();
    const file = writeMeasurement(project, MEASURED_WITH_HIGH);
    process.chdir(project);

    await expect(run(['--json', '--supply-chain-json', file])).rejects.toThrow('exit:0');
    const payload = JSON.parse(logOutput.join('\n'));
    expect(payload.supplyChain).toEqual(MEASURED_WITH_HIGH);
    expect(exitCode).toBe(0);
  });
});
