import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  writePulseConfigDefinition,
  handleWritePulseConfig,
  seedPulseFromStrategyDefinition,
  handleSeedPulseFromStrategy,
} from './pulse';

const STRATEGY_WITH_KEY_METRICS = `---
name: SeedTarget
last_updated: 2026-06-02
version: 1
---

# SeedTarget

## Target problem

Stub.

## Our approach

Stub.

## Who it's for

Stub.

## Key metrics

- Daily active users: measured via session_started events in Posthog.
- Plan completion rate: measured via plan_completed events.

## Tracks

- Stub track.
`;

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mcp-pulse-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('write_pulse_config MCP tool', () => {
  it('definition has expected name and required fields', () => {
    expect(writePulseConfigDefinition.name).toBe('write_pulse_config');
    expect((writePulseConfigDefinition.inputSchema as { required: string[] }).required).toEqual([
      'path',
      'config',
    ]);
  });

  it('writes a pulse block, preserves other top-level keys, and writes .bak', async () => {
    const configPath = path.join(tmpDir, 'harness.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ name: 'existing', conventions: [] }, null, 2) + '\n'
    );

    const result = await handleWritePulseConfig({
      path: tmpDir,
      config: {
        enabled: true,
        lookbackDefault: '24h',
        primaryEvent: 'session_started',
        valueEvent: 'plan_completed',
        completionEvents: [],
        qualityScoring: false,
        qualityDimension: null,
        sources: { analytics: null, tracing: null, payments: null, db: { enabled: false } },
        metricSourceOverrides: {},
        pendingMetrics: [],
        excludedMetrics: [],
      },
    });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.written).toBe(true);

    const after = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(after.name).toBe('existing'); // preserved
    expect(after.conventions).toEqual([]); // preserved
    expect(after.pulse.enabled).toBe(true);
    expect(after.pulse.primaryEvent).toBe('session_started');

    expect(fs.existsSync(`${configPath}.bak`)).toBe(true);
  });

  it('refuses to touch disk when the config fails PulseConfigSchema validation', async () => {
    const configPath = path.join(tmpDir, 'harness.config.json');
    fs.writeFileSync(configPath, JSON.stringify({ name: 'existing' }, null, 2) + '\n');

    const result = await handleWritePulseConfig({
      path: tmpDir,
      config: { not: 'a valid pulse config' },
    });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.written).toBe(false);
    expect(result.isError).toBe(true);
    const after = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(after.pulse).toBeUndefined();
  });
});

describe('seed_pulse_from_strategy MCP tool', () => {
  it('definition has expected name', () => {
    expect(seedPulseFromStrategyDefinition.name).toBe('seed_pulse_from_strategy');
  });

  it('returns warnings when STRATEGY.md is absent', async () => {
    const result = await handleSeedPulseFromStrategy({ path: tmpDir });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.name).toBeNull();
    expect(payload.keyMetrics).toEqual([]);
    expect(payload.warnings.length).toBeGreaterThan(0);
  });

  it('extracts name and key-metric bullets from a valid STRATEGY.md', async () => {
    fs.writeFileSync(path.join(tmpDir, 'STRATEGY.md'), STRATEGY_WITH_KEY_METRICS);
    const result = await handleSeedPulseFromStrategy({ path: tmpDir });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.name).toBe('SeedTarget');
    expect(payload.keyMetrics.length).toBe(2);
    expect(payload.keyMetrics[0]).toMatch(/Daily active users/);
  });
});
