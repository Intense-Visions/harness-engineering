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

  it('rethrows read errors other than ENOENT', () => {
    const ledger = new BanditLedger({ path: dir }); // a directory, not a file
    expect(() => ledger.fold('routing', 'quick-fix', config, NOW)).toThrow();
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
