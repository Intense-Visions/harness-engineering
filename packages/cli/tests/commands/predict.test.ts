import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { createPredictCommand, runPredict } from '../../src/commands/predict';

const mockPredict = vi.fn();

vi.mock('@harness-engineering/core', () => {
  // Use actual classes so `new` works
  const TM = vi.fn(function (this: any) {
    this._type = 'timeline';
  });
  const PE = vi.fn(function (this: any) {
    this.predict = mockPredict;
  });
  const SIE = vi.fn(function (this: any) {
    this._type = 'estimator';
  });
  return {
    TimelineManager: TM,
    PredictionEngine: PE,
    SpecImpactEstimator: SIE,
  };
});

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn(),
}));

const mockPredictionResult = {
  snapshotsUsed: 5,
  stabilityForecast: {
    current: 82,
    projected12w: 75,
    confidence: 'medium',
  },
  categories: {
    'circular-deps': {
      adjusted: {
        current: 3,
        threshold: 10,
        projectedValue4w: 4,
        projectedValue8w: 5,
        projectedValue12w: 6,
        thresholdCrossingWeeks: null,
        confidence: 'medium',
      },
    },
  },
  warnings: [],
};

const mockPredictionResultWithWarnings = {
  snapshotsUsed: 5,
  stabilityForecast: {
    current: 82,
    projected12w: 75,
    confidence: 'medium',
  },
  categories: {
    'circular-deps': {
      adjusted: {
        current: 3,
        threshold: 10,
        projectedValue4w: 4,
        projectedValue8w: 5,
        projectedValue12w: 6,
        thresholdCrossingWeeks: 8,
        confidence: 'medium',
      },
    },
    'layer-violations': {
      adjusted: {
        current: 1.5,
        threshold: 5,
        projectedValue4w: 2,
        projectedValue8w: 3,
        projectedValue12w: 4,
        thresholdCrossingWeeks: null,
        confidence: 'high',
      },
    },
  },
  warnings: [
    {
      severity: 'critical',
      message: 'Circular deps will breach threshold',
      contributingFeatures: ['feature-a', 'feature-b'],
    },
    {
      severity: 'warning',
      message: 'Coupling increasing',
      contributingFeatures: [],
    },
    {
      severity: 'info',
      message: 'Module size stable',
      contributingFeatures: [],
    },
  ],
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  program.option('--verbose', 'Verbose output');
  program.option('--quiet', 'Quiet output');
  program.option('--config <path>', 'Config path');
  program.addCommand(createPredictCommand());
  return program;
}

describe('predict command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/fake-project');
    mockPredict.mockReturnValue(mockPredictionResult);
  });

  describe('createPredictCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createPredictCommand();
      expect(cmd.name()).toBe('predict');
    });

    it('has --category option', () => {
      const cmd = createPredictCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--category');
    });

    it('has --no-roadmap option', () => {
      const cmd = createPredictCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--no-roadmap');
    });

    it('has --horizon option', () => {
      const cmd = createPredictCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--horizon');
    });

    it('has description', () => {
      const cmd = createPredictCommand();
      expect(cmd.description()).toContain('Predict');
    });
  });

  describe('runPredict', () => {
    it('returns prediction result on success', async () => {
      const { resolveConfig } = await import('../../src/config/loader');
      const core = await import('@harness-engineering/core');

      vi.mocked(resolveConfig).mockReturnValue({ ok: true, value: {} } as any);

      const result = runPredict({ cwd: '/tmp/fake-project' });
      expect(result).toEqual(mockPredictionResult);
      expect(core.TimelineManager).toHaveBeenCalledWith('/tmp/fake-project');
      expect(core.SpecImpactEstimator).toHaveBeenCalledWith('/tmp/fake-project');
    });

    it('throws when config resolution fails', async () => {
      const { resolveConfig } = await import('../../src/config/loader');
      const configError = new Error('No config found');
      vi.mocked(resolveConfig).mockReturnValue({ ok: false, error: configError } as any);

      expect(() => runPredict({ cwd: '/tmp/fake-project' })).toThrow('No config found');
    });

    it('skips SpecImpactEstimator when noRoadmap is true', async () => {
      const { resolveConfig } = await import('../../src/config/loader');
      const core = await import('@harness-engineering/core');

      vi.mocked(resolveConfig).mockReturnValue({ ok: true, value: {} } as any);

      runPredict({ cwd: '/tmp/fake-project', noRoadmap: true });
      expect(core.SpecImpactEstimator).not.toHaveBeenCalled();
      expect(core.PredictionEngine).toHaveBeenCalledWith(
        '/tmp/fake-project',
        expect.anything(),
        null
      );
    });

    it('creates SpecImpactEstimator when noRoadmap is false', async () => {
      const { resolveConfig } = await import('../../src/config/loader');
      const core = await import('@harness-engineering/core');

      vi.mocked(resolveConfig).mockReturnValue({ ok: true, value: {} } as any);

      runPredict({ cwd: '/tmp/fake-project', noRoadmap: false });
      expect(core.SpecImpactEstimator).toHaveBeenCalledWith('/tmp/fake-project');
    });

    it('passes category filter to engine.predict', async () => {
      const { resolveConfig } = await import('../../src/config/loader');

      vi.mocked(resolveConfig).mockReturnValue({ ok: true, value: {} } as any);

      runPredict({ cwd: '/tmp/fake-project', category: 'complexity' });
      expect(mockPredict).toHaveBeenCalledWith(
        expect.objectContaining({ categories: ['complexity'] })
      );
    });

    it('passes horizon to engine.predict', async () => {
      const { resolveConfig } = await import('../../src/config/loader');

      vi.mocked(resolveConfig).mockReturnValue({ ok: true, value: {} } as any);

      runPredict({ cwd: '/tmp/fake-project', horizon: 8 });
      expect(mockPredict).toHaveBeenCalledWith(expect.objectContaining({ horizon: 8 }));
    });

    it('does not pass horizon when not specified', async () => {
      const { resolveConfig } = await import('../../src/config/loader');

      vi.mocked(resolveConfig).mockReturnValue({ ok: true, value: {} } as any);

      runPredict({ cwd: '/tmp/fake-project' });
      const callArg = mockPredict.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('horizon');
    });

    it('passes includeRoadmap true by default', async () => {
      const { resolveConfig } = await import('../../src/config/loader');

      vi.mocked(resolveConfig).mockReturnValue({ ok: true, value: {} } as any);

      runPredict({ cwd: '/tmp/fake-project' });
      expect(mockPredict).toHaveBeenCalledWith(expect.objectContaining({ includeRoadmap: true }));
    });

    it('uses process.cwd() when cwd not specified', async () => {
      const { resolveConfig } = await import('../../src/config/loader');
      const core = await import('@harness-engineering/core');

      vi.mocked(resolveConfig).mockReturnValue({ ok: true, value: {} } as any);

      runPredict({});
      expect(core.TimelineManager).toHaveBeenCalledWith('/tmp/fake-project');
    });

    it('uses provided configPath', async () => {
      const { resolveConfig } = await import('../../src/config/loader');

      vi.mocked(resolveConfig).mockReturnValue({ ok: true, value: {} } as any);

      runPredict({ configPath: '/custom/config.json' });
      expect(resolveConfig).toHaveBeenCalledWith('/custom/config.json');
    });
  });

  describe('command action (text mode)', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { resolveConfig } = await import('../../src/config/loader');
      vi.mocked(resolveConfig).mockReturnValue({ ok: true, value: {} } as any);
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it('prints prediction report in text mode', async () => {
      mockPredict.mockReturnValue(mockPredictionResult);
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'predict']);

      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Architecture Prediction');
      expect(output).toContain('Stability');
      expect(output).toContain('circular-deps');
    });

    it('prints warnings and crossing labels', async () => {
      mockPredict.mockReturnValue(mockPredictionResultWithWarnings);
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'predict']);

      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Warnings');
      expect(output).toContain('Circular deps will breach threshold');
      expect(output).toContain('Accelerated by');
      expect(output).toContain('feature-a');
      expect(output).toContain('~8 weeks');
    });

    it('prints JSON output in --json mode', async () => {
      mockPredict.mockReturnValue(mockPredictionResult);
      const program = createProgram();
      await program.parseAsync(['node', 'test', '--json', 'predict']);

      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      const parsed = JSON.parse(output);
      expect(parsed.snapshotsUsed).toBe(5);
      expect(parsed.stabilityForecast.current).toBe(82);
    });
  });

  describe('command action error handling', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    beforeEach(async () => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it('handles error in text mode', async () => {
      const { resolveConfig } = await import('../../src/config/loader');
      vi.mocked(resolveConfig).mockReturnValue({
        ok: false,
        error: new Error('No config'),
      } as any);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'predict'])).rejects.toThrow('process.exit');
      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('handles error in JSON mode', async () => {
      const { resolveConfig } = await import('../../src/config/loader');
      vi.mocked(resolveConfig).mockReturnValue({
        ok: false,
        error: new Error('No config'),
      } as any);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', '--json', 'predict'])).rejects.toThrow(
        'process.exit'
      );

      const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('"error"');
    });

    it('handles invalid horizon value', async () => {
      const { resolveConfig } = await import('../../src/config/loader');
      vi.mocked(resolveConfig).mockReturnValue({ ok: true, value: {} } as any);

      const program = createProgram();
      await expect(
        program.parseAsync(['node', 'test', 'predict', '--horizon', 'abc'])
      ).rejects.toThrow('process.exit');
      expect(mockExit).toHaveBeenCalledWith(2);
    });
  });
});
