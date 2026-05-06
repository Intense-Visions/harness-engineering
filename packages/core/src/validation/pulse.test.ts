import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { validatePulseConfig } from './pulse';

async function tmpProject(config: unknown): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-validate-'));
  await fs.writeFile(path.join(dir, 'harness.config.json'), JSON.stringify(config));
  return dir;
}

describe('validatePulseConfig', () => {
  it('returns ok=true when no pulse: block exists', async () => {
    const dir = await tmpProject({ name: 'x' });
    const r = await validatePulseConfig(dir);
    expect(r.ok).toBe(true);
  });

  it('returns ok=true for a valid pulse: block', async () => {
    const dir = await tmpProject({
      name: 'x',
      pulse: {
        enabled: true,
        lookbackDefault: '24h',
        primaryEvent: 'pv',
        valueEvent: 'val',
        completionEvents: [],
        qualityScoring: false,
        qualityDimension: null,
        sources: { analytics: null, tracing: null, payments: null, db: { enabled: false } },
        metricSourceOverrides: {},
        pendingMetrics: [],
        excludedMetrics: [],
      },
    });
    const r = await validatePulseConfig(dir);
    expect(r.ok).toBe(true);
  });

  it('returns ok=false for invalid pulse: block', async () => {
    const dir = await tmpProject({ name: 'x', pulse: { enabled: 'nope' } });
    const r = await validatePulseConfig(dir);
    expect(r.ok).toBe(false);
  });
});
