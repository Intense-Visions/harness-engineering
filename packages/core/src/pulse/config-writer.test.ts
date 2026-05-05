import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writePulseConfig } from './config-writer';
import type { PulseConfig } from '@harness-engineering/types';

const samplePulse: PulseConfig = {
  enabled: true,
  lookbackDefault: '24h',
  primaryEvent: 'session_started',
  valueEvent: 'plan_completed',
  completionEvents: ['plan_completed'],
  qualityScoring: false,
  qualityDimension: null,
  sources: { analytics: 'posthog', tracing: 'sentry', payments: null, db: { enabled: false } },
  metricSourceOverrides: {},
  pendingMetrics: [],
  excludedMetrics: [],
};

describe('writePulseConfig', () => {
  let tmpDir: string;
  let cfgPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-cfg-'));
    cfgPath = path.join(tmpDir, 'harness.config.json');
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves non-pulse keys byte-for-byte', () => {
    const original = { version: 1, name: 'p', layers: [{ name: 'a', pattern: 'x' }] };
    fs.writeFileSync(cfgPath, JSON.stringify(original, null, 2));
    writePulseConfig(samplePulse, { configPath: cfgPath });
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    expect(parsed.version).toBe(1);
    expect(parsed.name).toBe('p');
    expect(parsed.layers).toEqual(original.layers);
    expect(parsed.pulse).toBeDefined();
    expect(parsed.pulse.enabled).toBe(true);
  });

  it('replaces an existing pulse block (not merges)', () => {
    const original = {
      version: 1,
      pulse: { enabled: false, lookbackDefault: '7d', extraKey: 'should-be-gone' },
    };
    fs.writeFileSync(cfgPath, JSON.stringify(original, null, 2));
    writePulseConfig(samplePulse, { configPath: cfgPath });
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    expect(parsed.pulse.lookbackDefault).toBe('24h');
    expect(parsed.pulse.extraKey).toBeUndefined();
  });

  it('writes a .bak before mutating an existing config', () => {
    const original = { version: 1, name: 'p' };
    fs.writeFileSync(cfgPath, JSON.stringify(original, null, 2));
    writePulseConfig(samplePulse, { configPath: cfgPath });
    expect(fs.existsSync(`${cfgPath}.bak`)).toBe(true);
    const bak = JSON.parse(fs.readFileSync(`${cfgPath}.bak`, 'utf-8'));
    expect(bak).toEqual(original);
  });

  it('rejects a config path that does not exist', () => {
    expect(() =>
      writePulseConfig(samplePulse, { configPath: path.join(tmpDir, 'missing.json') })
    ).toThrow(/not found/i);
  });

  it('rejects an invalid PulseConfig', () => {
    fs.writeFileSync(cfgPath, JSON.stringify({ version: 1 }, null, 2));
    expect(() =>
      writePulseConfig(
        { ...samplePulse, lookbackDefault: 'banana' as never },
        { configPath: cfgPath }
      )
    ).toThrow();
  });

  it('writes atomically and leaves no .tmp file on the happy path', () => {
    const original = { version: 1, name: 'p' };
    fs.writeFileSync(cfgPath, JSON.stringify(original, null, 2));
    writePulseConfig(samplePulse, { configPath: cfgPath });
    // No sibling temp files should linger after a successful write.
    const siblings = fs.readdirSync(tmpDir);
    expect(siblings.some((f) => f.startsWith('harness.config.json.tmp-'))).toBe(false);
    // The post-mutation config is well-formed (i.e. not truncated mid-write).
    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    expect(parsed.pulse).toBeDefined();
    expect(parsed.pulse.enabled).toBe(true);
  });
});
