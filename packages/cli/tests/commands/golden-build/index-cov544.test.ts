import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runGoldenPromote = vi.fn();
const runGoldenVerify = vi.fn();
const runGoldenDiff = vi.fn();

vi.mock('../../../src/commands/golden-build/runners', () => ({
  runGoldenPromote: (...a: unknown[]) => runGoldenPromote(...a),
  runGoldenVerify: (...a: unknown[]) => runGoldenVerify(...a),
  runGoldenDiff: (...a: unknown[]) => runGoldenDiff(...a),
}));

import { createGoldenBuildCommand } from '../../../src/commands/golden-build/index';
import { logger } from '../../../src/output/logger';

let logOutput: string[];
let exitCode: number | undefined;
const sink = (...a: unknown[]) => logOutput.push(a.map(String).join(' '));

const logSpy = vi.spyOn(console, 'log').mockImplementation(sink);
const infoSpy = vi.spyOn(logger, 'info').mockImplementation(sink as never);
const successSpy = vi.spyOn(logger, 'success').mockImplementation(sink as never);
const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(sink as never);
const errorSpy = vi.spyOn(logger, 'error').mockImplementation(sink as never);
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.option('--json').option('--config <path>');
  parent.addCommand(createGoldenBuildCommand());
  parent.exitOverride();
  return parent.parseAsync(['golden-build', ...args], { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  exitCode = undefined;
});

afterAll(() => {
  [logSpy, infoSpy, successSpy, warnSpy, errorSpy, exitSpy].forEach((s) => s.mockRestore());
});

describe('golden-build promote (cov544)', () => {
  it('error result (text) logs error and exits with error.exitCode', async () => {
    runGoldenPromote.mockResolvedValue({
      ok: false,
      error: { message: 'bad config', exitCode: 2 },
    });
    await expect(run(['promote'])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(logOutput.join('\n')).toContain('bad config');
  });

  it('error result (json) prints {error}', async () => {
    runGoldenPromote.mockResolvedValue({ ok: false, error: { message: 'bad', exitCode: 2 } });
    await expect(run(['--json', 'promote'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('bad');
  });

  it('changed=true prints success + manifest path, exits 0', async () => {
    runGoldenPromote.mockResolvedValue({
      ok: true,
      value: {
        changed: true,
        fileCount: 2,
        commit: 'abc',
        branch: 'main',
        manifestPath: '/m.json',
      },
    });
    await expect(run(['promote'])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('Golden build promoted');
    expect(out).toContain('/m.json');
  });

  it('changed=false prints unchanged, exits 0', async () => {
    runGoldenPromote.mockResolvedValue({ ok: true, value: { changed: false } });
    await expect(run(['promote'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('unchanged');
  });

  it('json success stringifies the value; --path is forwarded (repeatable)', async () => {
    runGoldenPromote.mockResolvedValue({ ok: true, value: { changed: true, fileCount: 1 } });
    await expect(
      run(['--json', 'promote', '--path', 'a.json', '--path', 'b.json'])
    ).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).changed).toBe(true);
    expect(runGoldenPromote).toHaveBeenCalledWith(
      expect.objectContaining({ paths: ['a.json', 'b.json'] })
    );
  });
});

describe('golden-build verify (cov544)', () => {
  it('error result exits with error.exitCode', async () => {
    runGoldenVerify.mockResolvedValue({ ok: false, error: { message: 'no golden', exitCode: 2 } });
    await expect(run(['verify'])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('clean diff exits 0 and prints "No drift" via printDiffHuman', async () => {
    runGoldenVerify.mockResolvedValue({
      ok: true,
      value: {
        clean: true,
        golden: { commit: 'abc', branch: 'main', promotedAt: 'yesterday' },
        diff: { clean: true, changed: [], missing: [], added: [] },
      },
    });
    await expect(run(['verify'])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('Golden promoted from abc');
    expect(out).toContain('No drift');
  });

  it('dirty diff exits VALIDATION_FAILED (1) and lists changed/missing/added', async () => {
    runGoldenVerify.mockResolvedValue({
      ok: true,
      value: {
        clean: false,
        diff: {
          clean: false,
          changed: [
            { path: 'c.json', goldenHash: 'aaaaaaaaaaaaaa', currentHash: 'bbbbbbbbbbbbbb' },
          ],
          missing: [{ path: 'm.json', goldenHash: 'cccccccccccccc' }],
          added: [{ path: 'a.json', currentHash: 'dddddddddddddd' }],
        },
      },
    });
    await expect(run(['verify'])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
    const out = logOutput.join('\n');
    expect(out).toContain('changed  c.json');
    expect(out).toContain('missing  m.json');
    expect(out).toContain('added    a.json');
  });

  it('json mode stringifies the value', async () => {
    runGoldenVerify.mockResolvedValue({
      ok: true,
      value: { clean: true, diff: { clean: true, changed: [], missing: [], added: [] } },
    });
    await expect(run(['--json', 'verify'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).clean).toBe(true);
  });

  it('shortHash renders "—" when a hash is missing', async () => {
    runGoldenVerify.mockResolvedValue({
      ok: true,
      value: {
        clean: false,
        diff: {
          clean: false,
          changed: [{ path: 'c.json' }],
          missing: [],
          added: [],
        },
      },
    });
    await expect(run(['verify'])).rejects.toThrow('exit:1');
    expect(logOutput.join('\n')).toContain('—');
  });
});

describe('golden-build diff (cov544)', () => {
  it('error result exits with error.exitCode', async () => {
    runGoldenDiff.mockResolvedValue({ ok: false, error: { message: 'x', exitCode: 2 } });
    await expect(run(['diff'])).rejects.toThrow('exit:2');
  });

  it('no golden prints the "not promoted yet" hint, exits 0', async () => {
    runGoldenDiff.mockResolvedValue({
      ok: true,
      value: {
        golden: null,
        clean: true,
        diff: { clean: true, changed: [], missing: [], added: [] },
      },
    });
    await expect(run(['diff'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No golden build has been promoted');
  });

  it('golden present prints diff, exits 0', async () => {
    runGoldenDiff.mockResolvedValue({
      ok: true,
      value: {
        golden: { commit: 'abc', branch: 'main', promotedAt: 'x' },
        clean: true,
        diff: { clean: true, changed: [], missing: [], added: [] },
      },
    });
    await expect(run(['diff'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No drift');
  });

  it('json mode stringifies the value', async () => {
    runGoldenDiff.mockResolvedValue({ ok: true, value: { golden: null, clean: true } });
    await expect(run(['--json', 'diff'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).clean).toBe(true);
  });

  it('json error prints {error}', async () => {
    runGoldenDiff.mockResolvedValue({ ok: false, error: { message: 'derr', exitCode: 2 } });
    await expect(run(['--json', 'diff'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('derr');
  });
});
