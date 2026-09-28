import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  parseSupplyChainMeasurement,
  readSupplyChainMeasurement,
} from '../../src/security/supply-chain-input';
import { SecurityTimelineManager } from '../../src/security/security-timeline-manager';
import type { ScanResult } from '../../src/security/types';

const CLEAN_SCAN: ScanResult = {
  findings: [],
  scannedFiles: 10,
  rulesApplied: 5,
  externalToolsUsed: [],
  coverage: 'baseline',
};

const MEASURED_WITH_HIGH = {
  critical: 0,
  high: 2,
  moderate: 1,
  low: 0,
  info: 0,
  total: 3,
  packagesScanned: 581,
};

describe('parseSupplyChainMeasurement()', () => {
  it('accepts a well-formed measurement and keeps its denominator', () => {
    const result = parseSupplyChainMeasurement(MEASURED_WITH_HIGH);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(MEASURED_WITH_HIGH);
  });

  it('accepts a measurement without packagesScanned', () => {
    const { packagesScanned: _omitted, ...counts } = MEASURED_WITH_HIGH;
    const result = parseSupplyChainMeasurement(counts);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.packagesScanned).toBeUndefined();
  });

  it('rejects a measurement that audited zero packages — that is an abstention', () => {
    const result = parseSupplyChainMeasurement({ ...MEASURED_WITH_HIGH, packagesScanned: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/packagesScanned.*abstained/);
  });

  it('rejects a missing severity instead of defaulting it to zero', () => {
    const { high: _omitted, ...rest } = MEASURED_WITH_HIGH;
    const result = parseSupplyChainMeasurement(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/^Invalid .*high/);
  });

  it('rejects unknown keys so a typo cannot silently drop a count', () => {
    const result = parseSupplyChainMeasurement({ ...MEASURED_WITH_HIGH, hihg: 4 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/hihg/);
  });

  it.each([
    ['negative', { ...MEASURED_WITH_HIGH, high: -1, total: 0 }],
    ['fractional', { ...MEASURED_WITH_HIGH, moderate: 0.5, total: 2.5 }],
    ['string', { ...MEASURED_WITH_HIGH, high: '2' }],
  ])('rejects a %s count', (_label, input) => {
    expect(parseSupplyChainMeasurement(input).ok).toBe(false);
  });

  it('rejects a total that disagrees with its severities', () => {
    const result = parseSupplyChainMeasurement({ ...MEASURED_WITH_HIGH, total: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/total must equal/);
  });

  it('rejects a non-object payload', () => {
    expect(parseSupplyChainMeasurement([MEASURED_WITH_HIGH]).ok).toBe(false);
    expect(parseSupplyChainMeasurement(null).ok).toBe(false);
  });
});

describe('readSupplyChainMeasurement()', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supply-chain-input-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads a valid measurement file', () => {
    const file = path.join(dir, 'audit.json');
    fs.writeFileSync(file, JSON.stringify(MEASURED_WITH_HIGH));
    const result = readSupplyChainMeasurement(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.high).toBe(2);
  });

  it('errors on malformed JSON rather than returning an empty snapshot', () => {
    const file = path.join(dir, 'audit.json');
    fs.writeFileSync(file, '{ "critical": 0, ');
    const result = readSupplyChainMeasurement(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/is not valid JSON/);
  });

  it('errors on a missing file', () => {
    const result = readSupplyChainMeasurement(path.join(dir, 'absent.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Cannot read supply-chain measurement/);
  });
});

describe('a supplied measurement in the security timeline', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'supply-chain-timeline-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('records non-zero supplyChain.high and lowers the score', () => {
    const parsed = parseSupplyChainMeasurement(MEASURED_WITH_HIGH);
    if (!parsed.ok) throw parsed.error;
    const manager = new SecurityTimelineManager(root);

    const unmeasured = manager.capture(CLEAN_SCAN, 'before');
    const measured = manager.capture(CLEAN_SCAN, 'after', parsed.value);

    expect(unmeasured.supplyChain.high).toBe(0);
    expect(measured.supplyChain.high).toBe(2);
    // 2 high * 3 + 1 moderate * 1 = 7 penalty → 93, against 100 unmeasured.
    expect(unmeasured.securityScore).toBe(100);
    expect(measured.securityScore).toBe(93);
  });

  it('persists packagesScanned through save and load (not stripped by the schema)', () => {
    const parsed = parseSupplyChainMeasurement(MEASURED_WITH_HIGH);
    if (!parsed.ok) throw parsed.error;
    new SecurityTimelineManager(root).capture(CLEAN_SCAN, 'measured', parsed.value);

    const reloaded = new SecurityTimelineManager(root).load();
    expect(reloaded.snapshots).toHaveLength(1);
    expect(reloaded.snapshots[0]!.supplyChain).toEqual(MEASURED_WITH_HIGH);
  });
});
