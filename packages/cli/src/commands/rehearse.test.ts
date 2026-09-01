import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { createRehearseCommand } from './rehearse';
import { ExitCode } from '../utils/errors';

/**
 * Behavior contract for `harness rehearse` (list / show / score). Characterizes
 * the CURRENT behavior of the three action handlers, the `renderScore` +
 * fixture-manifest rendering, and the `emitError` JSON-vs-human dual output +
 * exit codes — the guard rails a refactor of this command must preserve.
 *
 * Hermetic: the core catalog/scoring functions (`loadCatalog`, `findFixture`,
 * `scoreRecovery`, `RecoveryRecordSchema`), the templates-dir resolver, and
 * `fs`/`process.exit`/console are all stubbed, so no real fixture files, scoring
 * engine, or process exit run. Behavior is characterized as-is.
 */

const hoisted = vi.hoisted(() => ({
  loadCatalogMock: vi.fn(),
  findFixtureMock: vi.fn(),
  scoreRecoveryMock: vi.fn(),
  safeParseMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  resolveTemplatesDirMock: vi.fn(),
}));

vi.mock('@harness-engineering/core', () => ({
  loadCatalog: hoisted.loadCatalogMock,
  findFixture: hoisted.findFixtureMock,
  scoreRecovery: hoisted.scoreRecoveryMock,
  RecoveryRecordSchema: { safeParse: hoisted.safeParseMock },
}));
vi.mock('../utils/paths', () => ({ resolveTemplatesDir: hoisted.resolveTemplatesDirMock }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: hoisted.existsSyncMock, readFileSync: hoisted.readFileSyncMock };
});

class ProcessExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

const manifest = {
  id: 'flaky-timer',
  title: 'A flaky timer test',
  failureMode: 'flake',
  difficulty: 'medium',
  expectedCheck: 'canary-flake-hunter',
  summary: 'timer races under load',
  plantedFile: 'src/timer.ts',
  plantedDescription: 'a 10ms sleep',
  expectedFix: 'inject a clock',
  rubric: { detected: 'a', correctCheck: 'b', fixed: 'c', noCollateral: 'd' },
};

const score = {
  fixtureId: 'flaky-timer',
  failureMode: 'flake',
  score: 75,
  tier: 'partial',
  dimensions: [
    { name: 'detected', credited: true, weight: 40, reason: 'found it' },
    { name: 'fixed', credited: false, weight: 30, reason: 'missed' },
  ],
};

async function run(argv: string[]): Promise<{ code: number | null; out: string }> {
  const lines: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(' '));
  });
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ProcessExitError(code ?? 0);
  }) as never);
  const program = new Command();
  program.option('--json').option('--quiet').option('--verbose');
  program.addCommand(createRehearseCommand());
  let code: number | null = null;
  try {
    await program.parseAsync(['node', 'harness', 'rehearse', ...argv]);
  } catch (err) {
    if (err instanceof ProcessExitError) code = err.code;
    else throw err;
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { code, out: lines.join('\n') };
}

beforeEach(() => {
  for (const m of Object.values(hoisted)) m.mockReset();
  hoisted.resolveTemplatesDirMock.mockReturnValue('/templates');
  hoisted.loadCatalogMock.mockReturnValue([manifest]);
  hoisted.findFixtureMock.mockReturnValue({ ok: true, value: manifest });
  hoisted.scoreRecoveryMock.mockReturnValue(score);
  hoisted.safeParseMock.mockReturnValue({ success: true, data: { fixtureId: 'flaky-timer' } });
  hoisted.existsSyncMock.mockReturnValue(true);
  hoisted.readFileSyncMock.mockReturnValue('{"fixtureId":"flaky-timer"}');
});

afterEach(() => vi.restoreAllMocks());

describe('rehearse list', () => {
  it('renders the human fixture list and exits SUCCESS', async () => {
    const { code, out } = await run(['list']);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('Rehearsal fixtures (1):');
    expect(out).toContain('flaky-timer');
    expect(out).toContain('A flaky timer test');
  });

  it('warns and exits SUCCESS when the catalog is empty', async () => {
    hoisted.loadCatalogMock.mockReturnValue([]);
    const { code, out } = await run(['list']);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('No rehearsal fixtures found.');
  });

  it('emits the projected JSON catalog under --json', async () => {
    const { code, out } = await run(['list', '--json']);
    expect(code).toBe(ExitCode.SUCCESS);
    const parsed = JSON.parse(out);
    expect(parsed).toEqual([
      {
        id: 'flaky-timer',
        title: 'A flaky timer test',
        failureMode: 'flake',
        difficulty: 'medium',
        expectedCheck: 'canary-flake-hunter',
      },
    ]);
  });
});

describe('rehearse show', () => {
  it('renders the manifest, planted detail, expected fix, and rubric in human mode', async () => {
    const { code, out } = await run(['show', 'flaky-timer']);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('flaky-timer — A flaky timer test');
    expect(out).toContain('planted in src/timer.ts');
    expect(out).toContain('expected fix');
    expect(out).toContain('detected      — a');
    expect(out).toContain('noCollateral  — d');
  });

  it('emits the full manifest as JSON under --json', async () => {
    const { out } = await run(['show', 'flaky-timer', '--json']);
    expect(JSON.parse(out)).toEqual(manifest);
  });

  it('emits an error and exits ERROR when the fixture is not found (human)', async () => {
    hoisted.findFixtureMock.mockReturnValue({ ok: false, error: { message: 'no such fixture' } });
    const { code, out } = await run(['show', 'nope']);
    expect(code).toBe(ExitCode.ERROR);
    expect(out).toContain('no such fixture');
  });

  it('emits a JSON error object on failure under --json', async () => {
    hoisted.findFixtureMock.mockReturnValue({ ok: false, error: { message: 'no such fixture' } });
    const { code, out } = await run(['show', 'nope', '--json']);
    expect(code).toBe(ExitCode.ERROR);
    expect(JSON.parse(out)).toEqual({ error: 'no such fixture' });
  });
});

describe('rehearse score', () => {
  const base = ['score', '--fixture', 'flaky-timer', '--recovery', 'rec.json'];

  it('renders the score breakdown and exits SUCCESS on a partial tier', async () => {
    const { code, out } = await run(base);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('Rehearsal: flaky-timer [flake]');
    expect(out).toContain('score: 75/100  (PARTIAL)');
    expect(out).toContain('✓ detected (+40) — found it');
    expect(out).toContain('✗ fixed (0/30) — missed');
  });

  it('exits VALIDATION_FAILED on a fail tier', async () => {
    hoisted.scoreRecoveryMock.mockReturnValue({ ...score, tier: 'fail', score: 10 });
    const { code } = await run(base);
    expect(code).toBe(ExitCode.VALIDATION_FAILED);
  });

  it('softens a fail tier to exit 0 under --report-only', async () => {
    hoisted.scoreRecoveryMock.mockReturnValue({ ...score, tier: 'fail', score: 10 });
    const { code } = await run([...base, '--report-only']);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('emits the score as JSON under --json', async () => {
    const { out } = await run([...base, '--json']);
    expect(JSON.parse(out)).toEqual(score);
  });

  it('errors when the recovery file is missing', async () => {
    hoisted.existsSyncMock.mockReturnValue(false);
    const { code, out } = await run(base);
    expect(code).toBe(ExitCode.ERROR);
    expect(out).toContain('Recovery record not found');
  });

  it('errors on invalid JSON in the recovery file', async () => {
    hoisted.readFileSyncMock.mockReturnValue('{not json');
    const { code, out } = await run(base);
    expect(code).toBe(ExitCode.ERROR);
    expect(out).toContain('Invalid JSON');
  });

  it('errors when the recovery record fails schema validation', async () => {
    hoisted.safeParseMock.mockReturnValue({ success: false, error: { message: 'bad shape' } });
    const { code, out } = await run(base);
    expect(code).toBe(ExitCode.ERROR);
    expect(out).toContain('Invalid recovery record');
  });

  it('errors when the record fixtureId does not match --fixture', async () => {
    hoisted.safeParseMock.mockReturnValue({ success: true, data: { fixtureId: 'other' } });
    const { code, out } = await run(base);
    expect(code).toBe(ExitCode.ERROR);
    expect(out).toContain('does not match');
  });

  it('errors when the fixture itself is not found', async () => {
    hoisted.findFixtureMock.mockReturnValue({ ok: false, error: { message: 'unknown fixture' } });
    const { code, out } = await run(base);
    expect(code).toBe(ExitCode.ERROR);
    expect(out).toContain('unknown fixture');
  });
});
