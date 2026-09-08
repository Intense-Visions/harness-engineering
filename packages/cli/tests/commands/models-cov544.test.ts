import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExitCode } from '../../src/utils/errors';

const fetchModelsMock = vi.fn();
vi.mock('@harness-engineering/orchestrator', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, defaultFetchModels: (...a: unknown[]) => fetchModelsMock(...a) };
});

import { createModelsCommand } from '../../src/commands/models';

const exitSentinel = new Error('__exit__');

describe('models command surface (cov544)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let logs: string[];
  let tmpDir: string;
  let origCwd: string;
  const origToken = process.env['HARNESS_ADMIN_TOKEN'];
  const origUrl = process.env['HARNESS_ORCHESTRATOR_URL'];
  const origRoot = process.env['HARNESS_PROJECT_ROOT'];

  beforeEach(() => {
    origCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'models-cov-'));
    logs = [];
    fetchModelsMock.mockReset();
    process.exitCode = undefined;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw exitSentinel;
    }) as never);
    logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.join(' '));
    });
    errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      logs.push(a.join(' '));
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation((...a: unknown[]) => {
      logs.push(a.join(' '));
    });
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    vi.unstubAllGlobals();
    if (origToken === undefined) delete process.env['HARNESS_ADMIN_TOKEN'];
    else process.env['HARNESS_ADMIN_TOKEN'] = origToken;
    if (origUrl === undefined) delete process.env['HARNESS_ORCHESTRATOR_URL'];
    else process.env['HARNESS_ORCHESTRATOR_URL'] = origUrl;
    if (origRoot === undefined) delete process.env['HARNESS_PROJECT_ROOT'];
    else process.env['HARNESS_PROJECT_ROOT'] = origRoot;
  });

  function writeConfig(config: object): void {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1, ...config })
    );
  }

  async function run(args: string[]): Promise<number | undefined> {
    const cmd = createModelsCommand();
    cmd.exitOverride();
    try {
      await cmd.parseAsync(args, { from: 'user' });
    } catch (e) {
      if (e !== exitSentinel) throw e;
    }
    return exitSpy.mock.calls.at(-1)?.[0] as number | undefined;
  }

  // ── probe ────────────────────────────────────────────────────────────────

  it('probe resolves a loaded configured model (status ok, exit 0)', async () => {
    writeConfig({
      agent: { backends: { local1: { type: 'local', endpoint: 'http://x/v1', model: 'm1' } } },
    });
    process.chdir(tmpDir);
    fetchModelsMock.mockResolvedValue(['m1', 'other']);
    const code = await run(['probe']);
    expect(logs.join('\n')).toContain('resolved:   m1');
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('probe reports no-match (configured model not loaded, exit ERROR)', async () => {
    writeConfig({
      agent: { backends: { local1: { type: 'local', endpoint: 'http://x/v1', model: 'm1' } } },
    });
    process.chdir(tmpDir);
    fetchModelsMock.mockResolvedValue(['different']);
    const code = await run(['probe']);
    expect(logs.join('\n')).toContain('no configured model is loaded');
    expect(code).toBe(ExitCode.ERROR);
  });

  it('probe --json prints the machine-readable result', async () => {
    writeConfig({
      agent: { backends: { local1: { type: 'local', endpoint: 'http://x/v1', model: 'm1' } } },
    });
    process.chdir(tmpDir);
    fetchModelsMock.mockResolvedValue(['m1']);
    const code = await run(['probe', '--json']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.status).toBe('ok');
    expect(parsed.resolved).toBe('m1');
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('probe surfaces a fetch error (status error, exit ERROR)', async () => {
    process.chdir(tmpDir);
    fetchModelsMock.mockRejectedValue(new Error('conn refused'));
    const code = await run(['probe', '--endpoint', 'http://127.0.0.1:9/v1']);
    expect(logs.join('\n')).toContain('conn refused');
    expect(code).toBe(ExitCode.ERROR);
  });

  it('probe with --endpoint bypasses config (empty configured → no-match)', async () => {
    process.chdir(tmpDir);
    fetchModelsMock.mockResolvedValue(['x']);
    const code = await run(['probe', '--endpoint', 'http://host/v1']);
    expect(code).toBe(ExitCode.ERROR);
  });

  it('probe errors when no local backend is configured', async () => {
    writeConfig({ agent: { backends: { primary: { type: 'claude', command: 'claude' } } } });
    process.chdir(tmpDir);
    const code = await run(['probe']);
    expect(logs.join('\n')).toContain('No local backend');
    expect(code).toBe(ExitCode.ERROR);
  });

  it('probe errors when the requested --backend name is not found', async () => {
    writeConfig({
      agent: { backends: { local1: { type: 'local', endpoint: 'http://x/v1', model: 'm1' } } },
    });
    process.chdir(tmpDir);
    const code = await run(['probe', '--backend', 'ghost']);
    expect(logs.join('\n')).toContain('not found');
    expect(code).toBe(ExitCode.ERROR);
  });

  // ── proposals ──────────────────────────────────────────────────────────────

  it('proposals prints a JSON array (empty queue)', async () => {
    process.env['HARNESS_PROJECT_ROOT'] = tmpDir;
    await run(['proposals']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(Array.isArray(parsed)).toBe(true);
  });

  // ── approve / reject (fetch round-trip via reportMutation) ─────────────────

  it('approve prints the route body on success', async () => {
    process.env['HARNESS_ADMIN_TOKEN'] = 'tok';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, text: async () => 'approved-body' }))
    );
    await run(['approve', 'proposal_1']);
    expect(logs.join('\n')).toContain('approved-body');
  });

  it('reject exits ERROR when the token is missing', async () => {
    delete process.env['HARNESS_ADMIN_TOKEN'];
    const code = await run(['reject', 'proposal_1', '--reason', 'stale']);
    expect(logs.join('\n')).toContain('HARNESS_ADMIN_TOKEN is required');
    expect(code).toBe(ExitCode.ERROR);
  });

  it('reject exits ERROR when the route returns a non-2xx', async () => {
    process.env['HARNESS_ADMIN_TOKEN'] = 'tok';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 409, text: async () => 'conflict' }))
    );
    const code = await run(['reject', 'proposal_1', '--reason', 'stale']);
    expect(code).toBe(ExitCode.ERROR);
  });

  // ── refresh (sets process.exitCode, does not throw) ─────────────────────────

  it('refresh sets a zero exit code on success and logs the emitted count', async () => {
    process.env['HARNESS_ADMIN_TOKEN'] = 'tok';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ emitted: 3, warnings: ['w1'] }),
      }))
    );
    const cmd = createModelsCommand();
    await cmd.parseAsync(['refresh'], { from: 'user' });
    expect(process.exitCode).toBe(ExitCode.SUCCESS);
    expect(logs.join('\n')).toContain('emitted 3');
  });

  it('refresh sets a non-zero exit code when the token is missing', async () => {
    delete process.env['HARNESS_ADMIN_TOKEN'];
    const cmd = createModelsCommand();
    await cmd.parseAsync(['refresh'], { from: 'user' });
    expect(process.exitCode).toBe(ExitCode.ERROR);
  });
});
