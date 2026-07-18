import { describe, expect, it } from 'vitest';

import {
  scoreBuildQuality,
  DEFAULT_HARNESS_FIT_TASKS,
  type HarnessFitProbeTask,
  type HarnessFitRunner,
  type HarnessFitResult,
} from '../../src/capability/harness-fit.js';

/**
 * Phase 2 / Task 1 — the INJECTION SEAM (D3): `local-models` defines the
 * `HarnessFitRunner` interface + the portable task-suite schema, but never the
 * I/O impl (that is the orchestrator's job). These tests prove the CONTRACT:
 *   - the default task suite is self-describing + adopter-portable, and
 *   - a fake `HarnessFitRunner` returning a canned `HarnessFitResult` flows
 *     cleanly through `scoreBuildQuality` → a `buildQuality` multiplier.
 * No real probe runs here.
 */

describe('DEFAULT_HARNESS_FIT_TASKS — portable, self-describing fixtures (SC5, D4)', () => {
  it('ships 2–3 default tasks', () => {
    expect(DEFAULT_HARNESS_FIT_TASKS.length).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_HARNESS_FIT_TASKS.length).toBeLessThanOrEqual(3);
  });

  it('every task is self-describing: id + prompt + acceptanceCommand, no host-repo layout', () => {
    for (const task of DEFAULT_HARNESS_FIT_TASKS) {
      expect(task.id).toBeTruthy();
      expect(task.prompt).toBeTruthy();
      expect(task.acceptanceCommand).toBeTruthy();
      // Adopter-portable: no hardcoded monorepo layout or workspace-specific paths.
      const blob = `${task.prompt} ${task.acceptanceCommand} ${JSON.stringify(task.files ?? {})}`;
      expect(blob).not.toContain('@harness-engineering/');
      expect(blob).not.toContain('packages/');
      expect(blob).not.toContain('/Users/');
    }
  });

  it('task ids are unique', () => {
    const ids = DEFAULT_HARNESS_FIT_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('seeded files (when present) are a flat string→string map living in the workspace', () => {
    for (const task of DEFAULT_HARNESS_FIT_TASKS) {
      if (task.files === undefined) continue;
      for (const [rel, content] of Object.entries(task.files)) {
        expect(typeof rel).toBe('string');
        expect(typeof content).toBe('string');
        // Relative paths only — a probe seeds a throwaway workspace, never absolute.
        expect(rel.startsWith('/')).toBe(false);
      }
    }
  });
});

describe('HarnessFitRunner — the injection contract (D3, SC3)', () => {
  /** A fake runner: local-models depends ONLY on the interface, never on the impl. */
  function fakeRunner(canned: HarnessFitResult): HarnessFitRunner {
    return {
      runProbe: async (_model: string, _task: HarnessFitProbeTask) => canned,
    };
  }

  it('a converged canned result flows runProbe → scoreBuildQuality → HIGH buildQuality', async () => {
    const runner = fakeRunner({ converged: true, toolCalls: 6, filesTouched: 2, retries: 0 });
    const result = await runner.runProbe('gpt-oss:20b', DEFAULT_HARNESS_FIT_TASKS[0]!);
    const bq = scoreBuildQuality(result);
    expect(bq).toBeDefined();
    expect(bq!).toBeGreaterThanOrEqual(0.9);
  });

  it('a narrated canned result flows to a LOW buildQuality', async () => {
    const runner = fakeRunner({ converged: false, toolCalls: 1, filesTouched: 0, retries: 0 });
    const result = await runner.runProbe('llama3.3:70b', DEFAULT_HARNESS_FIT_TASKS[0]!);
    const bq = scoreBuildQuality(result);
    expect(bq!).toBeLessThanOrEqual(0.15);
  });

  it('an errored canned result is fail-open (buildQuality undefined, D6)', async () => {
    const runner = fakeRunner({
      converged: false,
      toolCalls: 0,
      filesTouched: 0,
      retries: 0,
      error: 'model failed to load',
    });
    const result = await runner.runProbe('nonexistent:1b', DEFAULT_HARNESS_FIT_TASKS[0]!);
    expect(scoreBuildQuality(result)).toBeUndefined();
  });
});
