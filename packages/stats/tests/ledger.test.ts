import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { BanditConfig, Pull } from '@harness-engineering/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BanditLedger, DEFAULT_LEDGER_PATH } from '../src/bandit/ledger';

const NOW = new Date('2026-09-24T00:00:00.000Z');
const config: BanditConfig = { policy: 'thompson', halfLifeDays: 30, minEffectiveN: 2 };

function pull(overrides: Partial<Pull> = {}): Pull {
  return {
    ts: '2026-09-23T00:00:00.000Z',
    consumer: 'routing',
    context: 'quick-fix',
    arm: 'local',
    mode: 'exploit',
    ...overrides,
  };
}

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'stats-ledger-'));
  file = path.join(dir, 'nested', 'bandit.jsonl');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('BanditLedger.fold', () => {
  it('treats a missing file as an empty ledger (SC9)', () => {
    const ledger = new BanditLedger({ path: file });
    expect(ledger.fold('routing', 'quick-fix', config, NOW)).toEqual({
      arms: [],
      malformed: 0,
      bytes: 0,
      readError: false,
    });
  });

  it('skips one malformed line and counts it, keeping the good lines (SC9)', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ reward: { outcome: 1 } }));
    appendFileSync(file, '{"ts":"2026-09-23T00:00:00.000Z","consumer":"rou\n'); // torn line (A6)
    ledger.append(pull({ arm: 'remote', reward: { outcome: 0 } }));
    const result = ledger.fold('routing', 'quick-fix', config, NOW);
    expect(result.malformed).toBe(1);
    expect(result.arms.map((a) => a.arm)).toEqual(['local', 'remote']);
    expect(result.bytes).toBe(readFileSync(file).length);
  });

  it('counts malformed lines ledger-wide but folds only the requested (consumer, context) bucket', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ reward: { outcome: 1 } }));
    ledger.append(pull({ context: 'deep', arm: 'other', reward: { outcome: 1 } }));
    ledger.append(pull({ consumer: 'fleet-command', arm: 'pr-fleet', reward: { outcome: 1 } }));
    appendFileSync(file, 'not json\n');
    const result = ledger.fold('routing', 'quick-fix', config, NOW);
    expect(result.arms.map((a) => a.arm)).toEqual(['local']);
    expect(result.malformed).toBe(1);
    expect(ledger.fold('routing', 'deep', config, NOW).arms.map((a) => a.arm)).toEqual(['other']);
  });

  it('unscored pulls fold to the prior with effectiveN 0 and a lastPull (SC4, D9)', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: '2026-09-20T00:00:00.000Z' }));
    ledger.append(pull({ ts: '2026-09-22T00:00:00.000Z' }));
    expect(ledger.fold('routing', 'quick-fix', config, NOW).arms).toEqual([
      {
        arm: 'local',
        alpha: 1,
        beta: 1,
        effectiveN: 0,
        novel: true,
        meanUtility: 0,
        lastPull: '2026-09-22T00:00:00.000Z',
      },
    ]);
  });

  it('applies the consumer utility and validates the config', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ reward: { outcome: 1, costUsd: 2 } }));
    const result = ledger.fold(
      'routing',
      'quick-fix',
      config,
      NOW,
      (r) => r.outcome / (r.costUsd ?? 1)
    );
    expect(result.arms[0]?.meanUtility).toBe(0.5);
    expect(() => ledger.fold('routing', 'quick-fix', { ...config, halfLifeDays: 0 }, NOW)).toThrow(
      /halfLifeDays/
    );
  });

  it('routes read errors other than ENOENT to onError and returns an empty fold flagged readError', () => {
    const onError = vi.fn<(error: Error) => void>();
    const ledger = new BanditLedger({ path: dir, onError }); // a directory, not a file: EISDIR
    let result: ReturnType<BanditLedger['fold']> | undefined;
    expect(() => {
      result = ledger.fold('routing', 'quick-fix', config, NOW);
    }).not.toThrow();
    expect(result).toEqual({ arms: [], malformed: 0, bytes: 0, readError: true });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('a read error with no onError is still a silent empty fold', () => {
    const ledger = new BanditLedger({ path: dir });
    expect(ledger.fold('routing', 'quick-fix', config, NOW).readError).toBe(true);
  });

  it('folds a 10,000-line ledger correctly (spec: O(lines) full re-fold)', () => {
    const lines: string[] = [];
    for (let i = 0; i < 10_000; i += 1) {
      lines.push(
        JSON.stringify(
          pull({
            ts: NOW.toISOString(),
            arm: i % 2 === 0 ? 'even' : 'odd',
            reward: { outcome: i % 2 },
          })
        )
      );
    }
    mkdirSync(path.dirname(file), { recursive: true }); // no prior append created nested/
    writeFileSync(file, lines.join('\n') + '\n');
    const result = new BanditLedger({ path: file }).fold('routing', 'quick-fix', config, NOW);
    expect(result.malformed).toBe(0);
    expect(result.arms.find((a) => a.arm === 'odd')?.alpha).toBe(1 + 5000);
    expect(result.arms.find((a) => a.arm === 'even')?.beta).toBe(1 + 5000);
  });
});

describe('BanditLedger.append', () => {
  it('creates the directory, appends one JSON line per pull, and round-trips through fold', () => {
    const ledger = new BanditLedger({ path: file });
    const p = pull({ reward: { outcome: 1, costUsd: 0.02 }, ref: 'issue-1' });
    ledger.append(p);
    ledger.append(pull({ arm: 'remote' }));
    const text = readFileSync(file, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.split('\n').filter(Boolean)).toHaveLength(2);
    const first: unknown = JSON.parse(text.split('\n')[0] ?? '');
    expect(first).toEqual(p);
  });

  it('routes IO failures to onError and never throws', () => {
    const blocker = path.join(dir, 'blocker');
    writeFileSync(blocker, 'i am a file');
    const onError = vi.fn<(error: Error) => void>();
    const ledger = new BanditLedger({ path: path.join(blocker, 'bandit.jsonl'), onError });
    expect(() => ledger.append(pull())).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('loses the pull silently when onError is omitted', () => {
    const blocker = path.join(dir, 'blocker');
    writeFileSync(blocker, 'i am a file');
    const ledger = new BanditLedger({ path: path.join(blocker, 'bandit.jsonl') });
    expect(() => ledger.append(pull())).not.toThrow();
  });

  it('defaults to <cwd>/.harness/metrics/bandit.jsonl without touching it', () => {
    const ledger = new BanditLedger();
    expect(DEFAULT_LEDGER_PATH).toBe(path.join('.harness', 'metrics', 'bandit.jsonl'));
    expect(ledger.path).toBe(path.resolve(DEFAULT_LEDGER_PATH));
  });
});

describe('BanditLedger late scoring by ref (spec "Ledger", SC5)', () => {
  const T0 = '2026-09-23T00:00:00.000Z';
  const T1 = '2026-09-23T06:00:00.000Z';
  const T2 = '2026-09-23T12:00:00.000Z';

  function scored(ledger: BanditLedger) {
    return ledger.fold('routing', 'quick-fix', config, NOW).arms;
  }

  it('attributes a later reward to the earlier unscored pull exactly once (SC5)', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: T0, ref: 'issue-1' }));
    ledger.append(pull({ ts: T1, ref: 'issue-1', reward: { outcome: 1 } }));
    const arms = scored(ledger);
    expect(arms).toHaveLength(1);
    const local = arms[0];
    expect(local).toMatchObject({ arm: 'local', lastPull: T1, novel: true });
    // the scoring line (T1, 18h old) wins wholesale: exactly one weighted observation
    const w = Math.pow(0.5, 0.75 / 30);
    expect(local?.effectiveN).toBeCloseTo(w, 12);
    expect(local?.alpha).toBeCloseTo(1 + w, 12);
    expect(local?.beta).toBe(1);
  });

  it('the latest scored line wins and a scored ref is never downgraded by a later unscored line', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: T0, ref: 'issue-2' }));
    ledger.append(pull({ ts: T1, ref: 'issue-2', reward: { outcome: 0 } }));
    ledger.append(pull({ ts: T2, ref: 'issue-2', reward: { outcome: 1 } }));
    ledger.append(pull({ ts: T2, ref: 'issue-2' }));
    const [local] = scored(ledger);
    expect(local?.effectiveN).toBeCloseTo(Math.pow(0.5, 0.5 / 30), 12);
    expect(local?.alpha).toBeGreaterThan(local?.beta ?? Infinity); // outcome 1 won
  });

  it('counts an arm mismatch on the same ref as malformed and skips it', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: T0, ref: 'issue-3', arm: 'local' }));
    ledger.append(pull({ ts: T1, ref: 'issue-3', arm: 'remote', reward: { outcome: 1 } }));
    const result = ledger.fold('routing', 'quick-fix', config, NOW);
    expect(result.malformed).toBe(1);
    expect(result.arms).toEqual([
      {
        arm: 'local',
        alpha: 1,
        beta: 1,
        effectiveN: 0,
        novel: true,
        meanUtility: 0,
        lastPull: T0,
      },
    ]);
  });

  it('the same ref in another (consumer, context) is a different pull, not a mismatch', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: T0, ref: 'issue-4' }));
    ledger.append(
      pull({ ts: T1, ref: 'issue-4', context: 'deep', arm: 'remote', reward: { outcome: 1 } })
    );
    const quickFix = ledger.fold('routing', 'quick-fix', config, NOW);
    expect(quickFix.malformed).toBe(0);
    expect(quickFix.arms[0]?.effectiveN).toBe(0);
    const deep = ledger.fold('routing', 'deep', config, NOW);
    expect(deep.malformed).toBe(0);
    expect(deep.arms[0]?.arm).toBe('remote');
    expect(deep.arms[0]?.effectiveN).toBeGreaterThan(0);
  });

  it('a pull without ref can only be scored inline: later reward lines never attach to it', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: T0 }));
    ledger.append(pull({ ts: T1, reward: { outcome: 1 } }));
    const [local] = scored(ledger);
    expect(local?.effectiveN).toBeCloseTo(Math.pow(0.5, 0.75 / 30), 12); // exactly one scored pull
    expect(local?.lastPull).toBe(T1);
  });

  it('an inline-scored pull with a ref is counted once and can still be re-scored later', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: T0, ref: 'issue-5', reward: { outcome: 0 } }));
    expect(scored(ledger)[0]?.beta).toBeGreaterThan(1);
    ledger.append(pull({ ts: T1, ref: 'issue-5', reward: { outcome: 1 } }));
    const [local] = scored(ledger);
    expect(local?.effectiveN).toBeCloseTo(Math.pow(0.5, 0.75 / 30), 12);
    expect(local?.alpha).toBeGreaterThan(local?.beta ?? Infinity);
  });
});
