import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  evaluateModelSentinel,
  acknowledgeModelDrift,
  hasUnacknowledgedMaterialDrift,
} from './evaluate';
import { readSentinelHistory } from './store';

const T0 = new Date('2026-08-31T12:00:00.000Z');
const T1 = new Date('2026-08-31T13:00:00.000Z');
const T2 = new Date('2026-08-31T14:00:00.000Z');

describe('evaluateModelSentinel', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'model-sentinel-eval-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('records the initial baseline on first run', () => {
    const backends = { p: { type: 'anthropic', model: 'claude-opus-4-8' } };
    const result = evaluateModelSentinel(root, backends, T0);
    expect(result.drift.kind).toBe('initial');
    expect(result.wroteRecord).toBe(true);
    expect(result.previousDigest).toBeNull();
    expect(readSentinelHistory(root)).toHaveLength(1);
  });

  it('writes no record and reports unchanged when config is stable', () => {
    const backends = { p: { type: 'anthropic', model: 'm1' } };
    evaluateModelSentinel(root, backends, T0);
    const second = evaluateModelSentinel(root, backends, T1);
    expect(second.drift.kind).toBe('unchanged');
    expect(second.wroteRecord).toBe(false);
    expect(readSentinelHistory(root)).toHaveLength(1);
  });

  it('a simulated model swap produces a material drift record within one cycle', () => {
    evaluateModelSentinel(root, { p: { type: 'anthropic', model: 'claude-opus-4-8' } }, T0);
    const swapped = evaluateModelSentinel(
      root,
      { p: { type: 'anthropic', model: 'claude-opus-5' } },
      T1
    );
    expect(swapped.drift.kind).toBe('changed');
    expect(swapped.drift.severity).toBe('material');
    expect(swapped.wroteRecord).toBe(true);
    const history = readSentinelHistory(root);
    expect(history).toHaveLength(2);
    expect(hasUnacknowledgedMaterialDrift(history)).toBe(true);
  });

  it('acknowledgement appends a record and clears the --check gate (append-only)', () => {
    evaluateModelSentinel(root, { p: { type: 'anthropic', model: 'm1' } }, T0);
    const backends = { p: { type: 'anthropic', model: 'm2' } };
    evaluateModelSentinel(root, backends, T1);
    expect(hasUnacknowledgedMaterialDrift(readSentinelHistory(root))).toBe(true);

    const ack = acknowledgeModelDrift(root, backends, 'reviewed drift report', T2);
    expect(ack.acknowledged).toBe(true);
    expect(ack.note).toBe('reviewed drift report');

    const history = readSentinelHistory(root);
    expect(history).toHaveLength(3); // initial + change + ack — nothing rewritten
    expect(hasUnacknowledgedMaterialDrift(history)).toBe(false);
  });

  it('hasUnacknowledgedMaterialDrift is false on an empty or benign history', () => {
    expect(hasUnacknowledgedMaterialDrift([])).toBe(false);
    evaluateModelSentinel(root, { p: { type: 'anthropic', model: 'm1' } }, T0);
    expect(hasUnacknowledgedMaterialDrift(readSentinelHistory(root))).toBe(false);
  });
});
