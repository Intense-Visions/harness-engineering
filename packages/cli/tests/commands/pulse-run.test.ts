import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPulseRunCommand } from '../../src/commands/pulse-run';

describe('pulse run CLI', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'pulse-run-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeConfig(pulse: unknown): void {
    writeFileSync(
      join(tmp, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'test', layers: [], forbiddenImports: [], pulse }, null, 2)
    );
  }

  it('skipped status when pulse.enabled is false', async () => {
    writeConfig({ enabled: false });
    const status = await runPulseRunCommand({
      configPath: join(tmp, 'harness.config.json'),
      outputDir: join(tmp, 'reports'),
      nonInteractive: true,
      lookback: '24h',
    });
    expect(status.status).toBe('skipped');
    expect(status.reason).toMatch(/pulse\.enabled/);
  });

  it('writes report file and returns success when configured', async () => {
    writeConfig({
      enabled: true,
      lookbackDefault: '24h',
      primaryEvent: 'click',
      valueEvent: 'value',
      completionEvents: [],
      qualityScoring: false,
      qualityDimension: null,
      sources: { analytics: 'mock', tracing: null, payments: null, db: { enabled: false } },
      metricSourceOverrides: {},
      pendingMetrics: [],
      excludedMetrics: [],
    });
    const status = await runPulseRunCommand({
      configPath: join(tmp, 'harness.config.json'),
      outputDir: join(tmp, 'reports'),
      nonInteractive: true,
      lookback: '24h',
    });
    expect(status.status).toBe('success');
    expect(status.path).toBeDefined();
    const files = readdirSync(join(tmp, 'reports'));
    expect(files.some((f) => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.md$/.test(f))).toBe(true);
    // Report contains the 4 standard sections.
    const body = readFileSync(status.path!, 'utf-8');
    expect(body).toContain('## Headlines');
    expect(body).toContain('## Usage');
    expect(body).toContain('## System performance');
    expect(body).toContain('## Followups');
  });

  it('uses pulse.lookbackDefault when --lookback omitted', async () => {
    writeConfig({
      enabled: true,
      lookbackDefault: '7d',
      primaryEvent: 'click',
      valueEvent: 'value',
      completionEvents: [],
      qualityScoring: false,
      qualityDimension: null,
      sources: { analytics: 'mock', tracing: null, payments: null, db: { enabled: false } },
      metricSourceOverrides: {},
      pendingMetrics: [],
      excludedMetrics: [],
    });
    const status = await runPulseRunCommand({
      configPath: join(tmp, 'harness.config.json'),
      outputDir: join(tmp, 'reports'),
      nonInteractive: true,
    });
    expect(status.status).toBe('success');
  });
});
