import { describe, it, expect } from 'vitest';

import type { HarnessFitRunner, HarnessFitProbeTask } from '@harness-engineering/local-models';
import { scoreBuildQuality } from '@harness-engineering/local-models';

// Import via the PACKAGE BARREL (index) — this is the composition-seam contract:
// the orchestrator surfaces its runner impl so the CLI/composition root can PROVIDE
// it to local-models' probe policy without reaching into internal paths (Task 3).
import { HarnessFitProbeRunner } from '../index.js';

describe('composition seam — orchestrator provides a HarnessFitRunner impl (Task 3, D3)', () => {
  it('HarnessFitProbeRunner is exported from the barrel and satisfies the interface', () => {
    // Structural assignability check: the impl IS a HarnessFitRunner. If the
    // interface or the impl drifts, this stops compiling.
    const runner: HarnessFitRunner = new HarnessFitProbeRunner();
    expect(typeof runner.runProbe).toBe('function');
  });

  it('the provided impl flows a canned run through the pure policy (injection works)', async () => {
    const task: HarnessFitProbeTask = {
      id: 't',
      prompt: 'p',
      files: {},
      acceptanceCommand: 'true',
    };
    // Inject stub seams so no Ollama server / real workspace is needed — proving
    // the impl is fully injectable at the composition root.
    const runner: HarnessFitRunner = new HarnessFitProbeRunner({
      createBackend: () => {
        throw new Error('should not build a real backend in this test');
      },
      makeWorkspace: async () => ({ path: '/tmp/x', cleanup: async () => {} }),
      seedFiles: async () => {},
      runAcceptance: async () => ({ exitCode: 0 }),
    });

    // The stub createBackend throws → fail-open error result (D6), which the pure
    // policy maps to undefined. Proves the whole seam composes end-to-end.
    const result = await runner.runProbe('m', task);
    expect(result.error).toBeTruthy();
    expect(scoreBuildQuality(result)).toBeUndefined();
  });
});
