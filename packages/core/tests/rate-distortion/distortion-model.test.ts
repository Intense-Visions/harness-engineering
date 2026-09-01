import { describe, it, expect } from 'vitest';
import {
  fitDistortionModel,
  classifySensitivity,
  DEFAULT_MODEL_VERSION,
} from '../../src/rate-distortion/distortion-model';
import { runAblationSuite } from '../../src/rate-distortion/ablation';
import type {
  Ablation,
  InformationClass,
  ReplayObservation,
  ReplayOutcome,
  ReplayRun,
} from '../../src/rate-distortion/types';

const FIXED_NOW = () => new Date('2026-08-31T00:00:00.000Z');

/** Find the fitted cell for a (task class × information class) pair. */
function cell(
  model: ReturnType<typeof fitDistortionModel>,
  taskClass: string,
  informationClass: InformationClass
) {
  const found = model.cells.find(
    (c) => c.taskClass === taskClass && c.informationClass === informationClass
  );
  if (!found) throw new Error(`missing cell ${taskClass} × ${informationClass}`);
  return found;
}

describe('classifySensitivity', () => {
  it('is sensitive when the lower CI bound clears the threshold', () => {
    expect(classifySensitivity(5, 0, 0.5)).toBe('sensitive');
  });

  it('is insensitive when the upper CI bound is below the threshold', () => {
    expect(classifySensitivity(0, 0, 0.5)).toBe('insensitive');
    // A negative delta (removing the class *reduced* rework) is also insensitive.
    expect(classifySensitivity(-3, 0.2, 0.5)).toBe('insensitive');
  });

  it('is inconclusive when the CI straddles the threshold', () => {
    expect(classifySensitivity(0.6, 1.0, 0.5)).toBe('inconclusive');
  });

  it('is inconclusive when the CI is infinite (n < 2)', () => {
    expect(classifySensitivity(10, Infinity, 0.5)).toBe('inconclusive');
  });
});

describe('fitDistortionModel — seeded ground truth (acceptance criterion)', () => {
  // Ground truth: for `implementation`, stated-constraints is load-bearing
  // (ablating it adds rework) and conversational-history is not. For `planning`,
  // the assignment is the reverse. The fit must recover this.
  const LOAD_BEARING: Record<string, InformationClass> = {
    implementation: 'stated-constraints',
    planning: 'conversational-history',
  };

  const seededRunner = (run: ReplayRun, ablation: Ablation): ReplayOutcome => {
    if (ablation.kind === 'baseline') return { rework: 1 };
    const loadBearing = LOAD_BEARING[run.taskClass];
    const extra = ablation.informationClass === loadBearing ? 5 : 0;
    return { rework: 1 + extra };
  };

  const makeRuns = (taskClass: string, count: number): ReplayRun[] =>
    Array.from({ length: count }, (_, i) => ({
      runId: `${taskClass}-${i}`,
      taskClass,
      context: {
        'prior-tool-results': 'x',
        'resolved-decisions': 'x',
        'code-excerpts': 'x',
        'conversational-history': 'x',
        'stated-constraints': 'x',
      },
    }));

  it('measures the artificially load-bearing class as sensitive and its counterpart as insensitive', async () => {
    const runs = [...makeRuns('implementation', 3), ...makeRuns('planning', 3)];
    const observations = await runAblationSuite(runs, seededRunner);
    const model = fitDistortionModel(observations, { now: FIXED_NOW });

    // implementation: constraints sensitive, history insensitive.
    expect(cell(model, 'implementation', 'stated-constraints').sensitivity).toBe('sensitive');
    expect(cell(model, 'implementation', 'stated-constraints').meanDelta).toBeCloseTo(5);
    expect(cell(model, 'implementation', 'conversational-history').sensitivity).toBe('insensitive');

    // planning: the reverse.
    expect(cell(model, 'planning', 'conversational-history').sensitivity).toBe('sensitive');
    expect(cell(model, 'planning', 'conversational-history').meanDelta).toBeCloseTo(5);
    expect(cell(model, 'planning', 'stated-constraints').sensitivity).toBe('insensitive');
  });

  it('enumerates both task classes and stamps version + fit time', async () => {
    const runs = [...makeRuns('implementation', 2), ...makeRuns('planning', 2)];
    const observations = await runAblationSuite(runs, seededRunner);
    const model = fitDistortionModel(observations, { now: FIXED_NOW, version: '2.1.0' });

    expect(model.taskClasses).toEqual(['implementation', 'planning']);
    expect(model.version).toBe('2.1.0');
    expect(model.fittedAt).toBe('2026-08-31T00:00:00.000Z');
    expect(model.runsObserved).toBe(4);
  });
});

describe('fitDistortionModel — statistics + edge cases', () => {
  const obs = (
    runId: string,
    taskClass: string,
    ablation: Ablation,
    rework: number
  ): ReplayObservation => ({ runId, taskClass, ablation, outcome: { rework } });

  it('defaults version to 1.0.0', () => {
    const model = fitDistortionModel([], { now: FIXED_NOW });
    expect(model.version).toBe(DEFAULT_MODEL_VERSION);
    expect(model.taskClasses).toEqual([]);
    expect(model.runsObserved).toBe(0);
  });

  it('marks a cell inconclusive with n=1 (a single sample cannot establish sensitivity)', () => {
    const observations = [
      obs('r1', 't', { kind: 'baseline' }, 0),
      obs('r1', 't', { kind: 'ablated', informationClass: 'code-excerpts' }, 100),
    ];
    const model = fitDistortionModel(observations, { now: FIXED_NOW });
    const c = cell(model, 't', 'code-excerpts');
    expect(c.n).toBe(1);
    expect(c.ci95).toBe(Infinity);
    expect(c.sensitivity).toBe('inconclusive');
  });

  it('marks a never-exercised cell inconclusive with n=0', () => {
    const model = fitDistortionModel([obs('r1', 't', { kind: 'baseline' }, 0)], { now: FIXED_NOW });
    const c = cell(model, 't', 'prior-tool-results');
    expect(c.n).toBe(0);
    expect(c.sensitivity).toBe('inconclusive');
  });

  it('ignores ablated observations for a run that has no baseline', () => {
    const observations = [
      obs('r1', 't', { kind: 'ablated', informationClass: 'code-excerpts' }, 9),
    ];
    const model = fitDistortionModel(observations, { now: FIXED_NOW });
    expect(cell(model, 't', 'code-excerpts').n).toBe(0);
    expect(model.runsObserved).toBe(0);
  });

  it('surfaces an advisory prior per cell without changing the classification', () => {
    const observations = [
      obs('r1', 't', { kind: 'baseline' }, 0),
      obs('r1', 't', { kind: 'ablated', informationClass: 'code-excerpts' }, 0),
      obs('r2', 't', { kind: 'baseline' }, 0),
      obs('r2', 't', { kind: 'ablated', informationClass: 'code-excerpts' }, 0),
    ];
    const model = fitDistortionModel(observations, {
      now: FIXED_NOW,
      prior: { 'code-excerpts': 0.9 },
    });
    const c = cell(model, 't', 'code-excerpts');
    expect(model.priorApplied).toBe(true);
    expect(c.priorDemand).toBe(0.9);
    // The measured delta is 0, so despite a high prior the cell stays insensitive.
    expect(c.sensitivity).toBe('insensitive');
  });
});
