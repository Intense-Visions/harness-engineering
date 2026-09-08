import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

const loadCatalog = vi.fn();
const findFixture = vi.fn();
const scoreRecovery = vi.fn();

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    loadCatalog: (...a: unknown[]) => loadCatalog(...a),
    findFixture: (...a: unknown[]) => findFixture(...a),
    scoreRecovery: (...a: unknown[]) => scoreRecovery(...a),
  };
});

import { createRehearseCommand } from '../../src/commands/rehearse';

const MANIFEST = {
  id: 'demo',
  title: 'A demo fixture',
  failureMode: 'leaked-secret',
  difficulty: 'easy',
  summary: 'a planted secret',
  plantedFile: 'src/x.ts',
  plantedDescription: 'an API key',
  expectedCheck: 'harness check-security',
  expectedFix: 'remove the key',
  rubric: { detected: 'd', correctCheck: 'c', fixed: 'f', noCollateral: 'n' },
};

const VALID_RECOVERY = {
  fixtureId: 'demo',
  detected: true,
  identifiedFailureMode: 'leaked-secret',
  checkCited: 'harness check-security',
  fixed: true,
  collateralDamage: false,
};

function makeScore(tier: string) {
  return {
    fixtureId: 'demo',
    failureMode: 'leaked-secret',
    score: tier === 'pass' ? 100 : tier === 'fail' ? 10 : 60,
    tier,
    dimensions: [
      { name: 'detected', weight: 30, credited: true, reason: 'saw it' },
      { name: 'fixed', weight: 40, credited: false, reason: 'not fixed' },
    ],
  };
}

let logOutput: string[];
let exitCode: number | undefined;
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

let dir: string;
function recoveryFile(obj: unknown, raw?: string): string {
  const p = path.join(dir, 'recovery.json');
  writeFileSync(p, raw ?? JSON.stringify(obj), 'utf-8');
  return p;
}

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.option('--json').option('--verbose').option('--quiet');
  parent.addCommand(createRehearseCommand());
  parent.exitOverride();
  return parent.parseAsync(['rehearse', ...args], { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  exitCode = undefined;
  dir = mkdtempSync(path.join(tmpdir(), 'rehearse-cov-'));
  loadCatalog.mockReturnValue([MANIFEST]);
  findFixture.mockReturnValue({ ok: true, value: MANIFEST });
  scoreRecovery.mockReturnValue(makeScore('pass'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

afterAll(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('rehearse list (cov544)', () => {
  it('prints fixtures and exits 0', async () => {
    await expect(run(['list'])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('Rehearsal fixtures (1)');
    expect(out).toContain('demo');
  });

  it('warns and exits 0 when the catalog is empty', async () => {
    loadCatalog.mockReturnValue([]);
    await expect(run(['list'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });

  it('json mode prints the catalog array', async () => {
    await expect(run(['--json', 'list'])).rejects.toThrow('exit:0');
    const parsed = JSON.parse(logOutput[0]);
    expect(parsed[0].id).toBe('demo');
  });
});

describe('rehearse show (cov544)', () => {
  it('prints the manifest and rubric, exits 0', async () => {
    await expect(run(['show', 'demo'])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('demo — A demo fixture');
    expect(out).toContain('rubric:');
  });

  it('json mode prints the manifest', async () => {
    await expect(run(['--json', 'show', 'demo'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).id).toBe('demo');
  });

  it('unknown fixture errors (text) and exits ERROR (2)', async () => {
    findFixture.mockReturnValue({ ok: false, error: new Error('no such fixture') });
    await expect(run(['show', 'missing'])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(logOutput.join('\n')).toContain('no such fixture');
  });

  it('unknown fixture errors (json) prints {error}', async () => {
    findFixture.mockReturnValue({ ok: false, error: new Error('no such fixture') });
    await expect(run(['--json', 'show', 'missing'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('no such fixture');
  });
});

describe('rehearse score (cov544)', () => {
  it('pass tier exits 0 and renders dimensions', async () => {
    const rec = recoveryFile(VALID_RECOVERY);
    await expect(run(['score', '--fixture', 'demo', '--recovery', rec])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('Rehearsal: demo');
    expect(out).toContain('✓ detected');
    expect(out).toContain('✗ fixed');
  });

  it('fail tier exits VALIDATION_FAILED (1)', async () => {
    scoreRecovery.mockReturnValue(makeScore('fail'));
    const rec = recoveryFile(VALID_RECOVERY);
    await expect(run(['score', '--fixture', 'demo', '--recovery', rec])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('--report-only softens a fail tier to exit 0', async () => {
    scoreRecovery.mockReturnValue(makeScore('fail'));
    const rec = recoveryFile(VALID_RECOVERY);
    await expect(
      run(['score', '--fixture', 'demo', '--recovery', rec, '--report-only'])
    ).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });

  it('json mode prints the score', async () => {
    const rec = recoveryFile(VALID_RECOVERY);
    await expect(run(['--json', 'score', '--fixture', 'demo', '--recovery', rec])).rejects.toThrow(
      'exit:0'
    );
    expect(JSON.parse(logOutput[0]).tier).toBe('pass');
  });

  it('missing fixture manifest errors', async () => {
    findFixture.mockReturnValue({ ok: false, error: new Error('bad fixture') });
    const rec = recoveryFile(VALID_RECOVERY);
    await expect(run(['score', '--fixture', 'nope', '--recovery', rec])).rejects.toThrow('exit:2');
    expect(logOutput.join('\n')).toContain('bad fixture');
  });

  it('missing recovery file errors', async () => {
    await expect(
      run(['score', '--fixture', 'demo', '--recovery', path.join(dir, 'nope.json')])
    ).rejects.toThrow('exit:2');
    expect(logOutput.join('\n')).toContain('Recovery record not found');
  });

  it('invalid JSON in the recovery file errors', async () => {
    const rec = recoveryFile(undefined, 'not json {{');
    await expect(run(['score', '--fixture', 'demo', '--recovery', rec])).rejects.toThrow('exit:2');
    expect(logOutput.join('\n')).toContain('Invalid JSON');
  });

  it('a recovery record failing schema validation errors', async () => {
    const rec = recoveryFile({ fixtureId: 'demo', detected: 'yes' });
    await expect(run(['score', '--fixture', 'demo', '--recovery', rec])).rejects.toThrow('exit:2');
    expect(logOutput.join('\n')).toContain('Invalid recovery record');
  });

  it('fixtureId mismatch errors', async () => {
    const rec = recoveryFile({ ...VALID_RECOVERY, fixtureId: 'other' });
    await expect(run(['score', '--fixture', 'demo', '--recovery', rec])).rejects.toThrow('exit:2');
    expect(logOutput.join('\n')).toContain('does not match');
  });

  it('emitError uses json shape under --json', async () => {
    const rec = recoveryFile({ ...VALID_RECOVERY, fixtureId: 'other' });
    await expect(run(['--json', 'score', '--fixture', 'demo', '--recovery', rec])).rejects.toThrow(
      'exit:2'
    );
    expect(JSON.parse(logOutput[0]).error).toContain('does not match');
  });
});
