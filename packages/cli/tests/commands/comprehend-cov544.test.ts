import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -----------------------------------------------------------------------------
// comprehend-cov544 — branch-coverage lift for src/commands/comprehend.ts.
// Drives the action-dispatch paths (runComprehendAction → check/stats/refresh/
// compile modes, compileComprehension, runRefreshMainPass, emitGithubAnnotation)
// that the existing pure-helper tests never reach. Every collaborator is mocked
// so the branches run deterministically without git/LLM/filesystem.
// -----------------------------------------------------------------------------

vi.mock('@harness-engineering/core', () => {
  class ComprehensionStore {
    root: string;
    constructor(opts: { root: string }) {
      this.root = opts.root;
    }
    path(module: string): string {
      return `${this.root}/${module}/_module.md`;
    }
  }
  return {
    ComprehensionStore,
    COMPREHENSION_ROOT: '.harness/comprehension',
    createNodeComprehensionIO: () => ({}),
    createNodeModuleSourceReader: () => ({}),
  };
});

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({ ok: true, value: { version: 1 } }),
}));

vi.mock('../../src/comprehension/config', () => ({
  readComprehensionConfig: vi.fn(() => ({
    semantic: true,
    model: null,
    maxTokensPerRun: 1000,
    concurrency: 1,
  })),
  resolveComprehensionCiMode: vi.fn(() => 'verify'),
  comprehensionEndpoint: vi.fn(() => undefined),
  comprehensionCli: vi.fn(() => undefined),
  selectSemanticModel: vi.fn(() => undefined),
}));

vi.mock('../../src/comprehension/hook', () => ({
  shouldRunComprehendHook: vi.fn(() => true),
}));

vi.mock('../../src/comprehension/policy', () => ({
  committedSemanticAllowed: vi.fn(() => true),
}));

vi.mock('../../src/comprehension/refresh-gate', () => ({
  resolveRefreshJobGate: vi.fn(() => ({ active: false, reason: 'not-enabled' })),
  explainInactiveRefreshGate: vi.fn((reason: string) => `inactive: ${reason}`),
}));

vi.mock('../../src/comprehension/regression', () => ({
  detectSemanticRegressions: vi.fn(() => []),
  detectCommittedSemanticOnBranch: vi.fn(() => []),
  readSemanticMapAtRef: vi.fn(() => ({})),
  defaultRefReadDeps: vi.fn(() => ({})),
}));

vi.mock('../../src/comprehension/static-extractor', () => ({
  createStaticExtractor: vi.fn(() => () => ({})),
}));

vi.mock('../../src/comprehension/invalidation', () => ({
  filesToModules: vi.fn(() => []),
  enumerateModules: vi.fn(() => []),
}));

vi.mock('../../src/comprehension/generate-semantic', () => ({
  maybeCreateGenerateSemantic: vi.fn(() => undefined),
}));

vi.mock('../../src/comprehension/compile-run', () => ({
  runComprehend: vi.fn(async () => ({
    mode: 'all',
    compiled: [],
    semanticPresent: 0,
    semanticAbsent: 0,
    skipped: [],
    fresh: [],
  })),
  runComprehendCheck: vi.fn(async () => ({ ok: true, stale: [], skipped: [] })),
  runComprehendStats: vi.fn(async () => ({
    units: 3,
    rawTokens: 1000,
    servedTokens: 100,
    savedTokens: 900,
    savedPct: 90,
  })),
}));

vi.mock('../../src/mcp/utils/analysis-provider', () => ({
  resolveAnalysisProvider: vi.fn(async () => null),
}));

vi.mock('../../src/commands/validate-scope', () => ({
  deriveChangedSurface: vi.fn(() => ({ ok: true, files: [] })),
}));

import { createComprehendCommand } from '../../src/commands/comprehend';
import { logger } from '../../src/output/logger';
import { resolveComprehensionCiMode } from '../../src/comprehension/config';
import { shouldRunComprehendHook } from '../../src/comprehension/hook';
import { committedSemanticAllowed } from '../../src/comprehension/policy';
import {
  resolveRefreshJobGate,
  explainInactiveRefreshGate,
} from '../../src/comprehension/refresh-gate';
import {
  detectSemanticRegressions,
  detectCommittedSemanticOnBranch,
  readSemanticMapAtRef,
} from '../../src/comprehension/regression';
import {
  runComprehend,
  runComprehendCheck,
  runComprehendStats,
} from '../../src/comprehension/compile-run';
import { resolveAnalysisProvider } from '../../src/mcp/utils/analysis-provider';
import { deriveChangedSurface } from '../../src/commands/validate-scope';

const EXIT = Symbol('exit');

describe('comprehend command action paths (cov544)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logInfo: ReturnType<typeof vi.spyOn>;
  let logWarn: ReturnType<typeof vi.spyOn>;
  let logError: ReturnType<typeof vi.spyOn>;
  let logSuccess: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let exitCodes: number[];
  const savedGithubActions = process.env.GITHUB_ACTIONS;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply defaults cleared by clearAllMocks.
    vi.mocked(resolveComprehensionCiMode).mockReturnValue('verify' as never);
    vi.mocked(shouldRunComprehendHook).mockReturnValue(true);
    vi.mocked(committedSemanticAllowed).mockReturnValue(true);
    vi.mocked(resolveRefreshJobGate).mockReturnValue({
      active: false,
      reason: 'not-enabled',
    } as never);
    vi.mocked(explainInactiveRefreshGate).mockImplementation(
      (reason: string) => `inactive: ${reason}`
    );
    vi.mocked(detectSemanticRegressions).mockReturnValue([]);
    vi.mocked(detectCommittedSemanticOnBranch).mockReturnValue([]);
    vi.mocked(readSemanticMapAtRef).mockReturnValue({} as never);
    vi.mocked(resolveAnalysisProvider).mockResolvedValue(null as never);
    vi.mocked(deriveChangedSurface).mockReturnValue({ ok: true, files: [] } as never);
    vi.mocked(runComprehend).mockResolvedValue({
      mode: 'all',
      compiled: [],
      semanticPresent: 0,
      semanticAbsent: 0,
      skipped: [],
      fresh: [],
    } as never);
    vi.mocked(runComprehendCheck).mockResolvedValue({
      ok: true,
      stale: [],
      skipped: [],
    } as never);
    vi.mocked(runComprehendStats).mockResolvedValue({
      units: 3,
      rawTokens: 1000,
      servedTokens: 100,
      savedTokens: 900,
      savedPct: 90,
    } as never);

    exitCodes = [];
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCodes.push(code ?? 0);
      throw EXIT;
    }) as never);
    logInfo = vi.spyOn(logger, 'info').mockImplementation(() => {});
    logWarn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    logError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    logSuccess = vi.spyOn(logger, 'success').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    delete process.env.GITHUB_ACTIONS;
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logInfo.mockRestore();
    logWarn.mockRestore();
    logError.mockRestore();
    logSuccess.mockRestore();
    stdoutSpy.mockRestore();
    if (savedGithubActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = savedGithubActions;
  });

  async function run(args: string[]): Promise<void> {
    const cmd = createComprehendCommand();
    try {
      await cmd.parseAsync(args, { from: 'user' });
    } catch (e) {
      if (e !== EXIT) throw e;
    }
  }

  // --- hook gate ------------------------------------------------------------

  it('--hook exits SUCCESS immediately when the hook gate is disabled', async () => {
    vi.mocked(shouldRunComprehendHook).mockReturnValue(false);
    await run(['--hook']);
    expect(exitCodes).toEqual([0]);
    // Never reached the compile path.
    expect(runComprehend).not.toHaveBeenCalled();
  });

  // --- stats mode -----------------------------------------------------------

  it('--stats reports savings and exits SUCCESS', async () => {
    await run(['--stats']);
    expect(runComprehendStats).toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('90.0%'));
    expect(exitCodes).toEqual([0]);
  });

  // --- check mode -----------------------------------------------------------

  it('--check with comprehension.ci:off disables the gate and exits SUCCESS', async () => {
    vi.mocked(resolveComprehensionCiMode).mockReturnValue('off' as never);
    await run(['--check']);
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('comprehension.ci: off'));
    expect(exitCodes).toEqual([0]);
    expect(runComprehendCheck).not.toHaveBeenCalled();
  });

  it('--check reports all-fresh and exits SUCCESS', async () => {
    await run(['--check']);
    expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining('source-fresh'));
    expect(exitCodes).toEqual([0]);
  });

  it('--check reports stale units + skips and exits VALIDATION_FAILED', async () => {
    vi.mocked(runComprehendCheck).mockResolvedValue({
      ok: false,
      stale: ['pkg/m'],
      skipped: [{ path: 'pkg/x', reason: 'unreadable' }],
    } as never);
    await run(['--check']);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('skipped pkg/x'));
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('source-stale'));
    expect(exitCodes).toEqual([1]);
  });

  it('--check --since with an unreadable base ref refuses to pass (VALIDATION_FAILED)', async () => {
    vi.mocked(readSemanticMapAtRef).mockImplementation((ref: string) =>
      ref === 'HEAD' ? ({} as never) : (null as never)
    );
    await run(['--check', '--since', 'origin/main']);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("base ref 'origin/main'"));
    expect(exitCodes).toEqual([1]);
  });

  it('--check --since with an unreadable HEAD names HEAD in the error', async () => {
    vi.mocked(readSemanticMapAtRef).mockImplementation((ref: string) =>
      ref === 'HEAD' ? (null as never) : ({} as never)
    );
    await run(['--check', '--since', 'origin/main']);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("'HEAD'"));
    expect(exitCodes).toEqual([1]);
  });

  it('--check --since (main context) flags a present→absent regression as VALIDATION_FAILED', async () => {
    vi.mocked(detectSemanticRegressions).mockReturnValue(['pkg/m']);
    await run(['--check', '--since', 'origin/main']);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('regressed semantic present→absent')
    );
    expect(exitCodes).toEqual([1]);
  });

  it('--check --since (main context) with no regression exits SUCCESS', async () => {
    vi.mocked(detectSemanticRegressions).mockReturnValue([]);
    await run(['--check', '--since', 'origin/main']);
    expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining('No semantic regressions'));
    expect(exitCodes).toEqual([0]);
  });

  it('--check --since --context pr warns on committed semantic and never flags a regression', async () => {
    vi.mocked(detectCommittedSemanticOnBranch).mockReturnValue(['pkg/m']);
    await run(['--check', '--since', 'origin/main', '--context', 'pr']);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('COMMITTED semantic on a branch'));
    expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining('Static-only PR path'));
    expect(exitCodes).toEqual([0]);
  });

  it('--check --context with an invalid value falls back to the strict main default', async () => {
    // "bogus" is rejected → context undefined → main-path messaging used.
    vi.mocked(detectSemanticRegressions).mockReturnValue([]);
    await run(['--check', '--since', 'origin/main', '--context', 'bogus']);
    expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining('No semantic regressions'));
    expect(exitCodes).toEqual([0]);
  });

  it('--check with ci:refresh but off the main-pass warns and still returns the gate verdict', async () => {
    vi.mocked(resolveComprehensionCiMode).mockReturnValue('refresh' as never);
    vi.mocked(committedSemanticAllowed).mockReturnValue(false);
    await run(['--check']);
    // runRefreshMainPass warns it is off the main-pass, verdict from the check stays SUCCESS.
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('off the main-pass'));
    expect(exitCodes).toEqual([0]);
  });

  it('--check with ci:refresh on the main-pass but no provider defers to the local main pass', async () => {
    vi.mocked(resolveComprehensionCiMode).mockReturnValue('refresh' as never);
    vi.mocked(committedSemanticAllowed).mockReturnValue(true);
    vi.mocked(resolveAnalysisProvider).mockResolvedValue(null as never);
    await run(['--check']);
    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining('no analysis provider is available')
    );
    expect(exitCodes).toEqual([0]);
  });

  // --- compile mode ---------------------------------------------------------

  it('--all compiles and reports the summary line, exits SUCCESS', async () => {
    vi.mocked(runComprehend).mockResolvedValue({
      mode: 'all',
      compiled: ['pkg/m'],
      semanticPresent: 1,
      semanticAbsent: 0,
      skipped: [{ path: 'pkg/s', reason: 'x' }],
      fresh: ['pkg/f'],
    } as never);
    await run(['--all']);
    expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining('Compiled 1 module(s)'));
    expect(exitCodes).toEqual([0]);
  });

  it('--all returns null (re-entrancy refused) and exits SUCCESS without a summary', async () => {
    vi.mocked(runComprehend).mockResolvedValue({ reentrancyRefused: true } as never);
    await run(['--all']);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('already active'));
    expect(logSuccess).not.toHaveBeenCalled();
    expect(exitCodes).toEqual([0]);
  });

  it('--changed --hook skips the recompile when the changed surface cannot be derived', async () => {
    vi.mocked(deriveChangedSurface).mockReturnValue({
      ok: false,
      files: [],
      reason: 'detached HEAD',
    } as never);
    await run(['--changed', '--hook']);
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('nothing to recompile'));
    expect(runComprehend).not.toHaveBeenCalled();
    expect(exitCodes).toEqual([0]);
  });

  it('--all off the main-pass forces static-only and explains the deferral', async () => {
    vi.mocked(committedSemanticAllowed).mockReturnValue(false);
    await run(['--all']);
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('PR path is static-only'));
    expect(exitCodes).toEqual([0]);
  });

  it('--all --stage takes the staging branch (no-op when nothing compiled)', async () => {
    // compiled empty ⇒ stageCompiledUnits is a no-op, but the `if (opts.stage)` branch runs.
    await run(['--all', '--stage']);
    expect(exitCodes).toEqual([0]);
  });

  // --- refresh mode ---------------------------------------------------------

  it('--refresh with the gate inactive (not-enabled) is a quiet no-op SUCCESS', async () => {
    vi.mocked(resolveRefreshJobGate).mockReturnValue({
      active: false,
      reason: 'not-enabled',
    } as never);
    await run(['--refresh']);
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('inactive: not-enabled'));
    // no-credential is the only reason that annotates; not-enabled must not.
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(exitCodes).toEqual([0]);
  });

  it('--refresh with reason no-credential emits a GitHub warning annotation under Actions', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    vi.mocked(resolveRefreshJobGate).mockReturnValue({
      active: false,
      reason: 'no-credential',
    } as never);
    await run(['--refresh']);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('::warning::'));
    expect(exitCodes).toEqual([0]);
  });

  it('--refresh with reason no-credential does NOT annotate outside GitHub Actions', async () => {
    // GITHUB_ACTIONS unset ⇒ emitGithubAnnotation early-returns.
    vi.mocked(resolveRefreshJobGate).mockReturnValue({
      active: false,
      reason: 'no-credential',
    } as never);
    await run(['--refresh']);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(exitCodes).toEqual([0]);
  });

  it('--refresh active but everything already fresh emits a notice and exits SUCCESS', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    vi.mocked(resolveRefreshJobGate).mockReturnValue({ active: true } as never);
    vi.mocked(resolveAnalysisProvider).mockResolvedValue({} as never);
    vi.mocked(runComprehend).mockResolvedValue({
      mode: 'all',
      compiled: [],
      semanticPresent: 0,
      semanticAbsent: 0,
      skipped: [],
      fresh: [],
    } as never);
    await run(['--refresh']);
    expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining('already'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('::notice::'));
    expect(exitCodes).toEqual([0]);
  });

  it('--refresh active with recompiled modules reports the regenerated count', async () => {
    vi.mocked(resolveRefreshJobGate).mockReturnValue({ active: true } as never);
    vi.mocked(resolveAnalysisProvider).mockResolvedValue({} as never);
    vi.mocked(runComprehend).mockResolvedValue({
      mode: 'all',
      compiled: ['pkg/m'],
      semanticPresent: 1,
      semanticAbsent: 0,
      skipped: [],
      fresh: [],
    } as never);
    await run(['--refresh']);
    expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining('regenerated 1 module(s)'));
    expect(exitCodes).toEqual([0]);
  });
});
