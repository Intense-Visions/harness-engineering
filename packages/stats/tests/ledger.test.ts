import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
      expired: 0,
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
    expect(result).toEqual({ arms: [], malformed: 0, expired: 0, bytes: 0, readError: true });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('a read error with no onError is still a silent empty fold', () => {
    const ledger = new BanditLedger({ path: dir });
    expect(ledger.fold('routing', 'quick-fix', config, NOW).readError).toBe(true);
  });

  it('folds a 10,000-line ledger spread over four half-lives correctly (spec: O(lines) full re-fold)', () => {
    const DAY_MS = 86_400_000;
    const lines: string[] = [];
    // independent expectation: plain sums of 0.5^(age / halfLife) over the same synthetic lines
    const expected = { odd: { alpha: 1, effectiveN: 0 }, even: { beta: 1, effectiveN: 0 } };
    for (let i = 0; i < 10_000; i += 1) {
      const daysAgo = (i % 9) * 15; // 0..120 days: 0..4 half-lives at halfLifeDays 30
      const ts = new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();
      const odd = i % 2 === 1;
      lines.push(
        JSON.stringify(pull({ ts, arm: odd ? 'odd' : 'even', reward: { outcome: odd ? 1 : 0 } }))
      );
      const w = Math.pow(0.5, daysAgo / 30);
      if (odd) {
        expected.odd.alpha += w;
        expected.odd.effectiveN += w;
      } else {
        expected.even.beta += w;
        expected.even.effectiveN += w;
      }
      if (i % 100 === 0) {
        // a second context in the same file must be filtered out, not folded in
        lines.push(
          JSON.stringify(pull({ ts, context: 'deep', arm: 'odd', reward: { outcome: 1 } }))
        );
      }
    }
    mkdirSync(path.dirname(file), { recursive: true }); // no prior append created nested/
    writeFileSync(file, lines.join('\n') + '\n');
    const result = new BanditLedger({ path: file }).fold('routing', 'quick-fix', config, NOW);
    expect(result.malformed).toBe(0);
    expect(result.arms.map((a) => a.arm)).toEqual(['even', 'odd']);
    const odd = result.arms[1];
    const even = result.arms[0];
    expect(odd?.alpha).toBeCloseTo(expected.odd.alpha, 6);
    expect(odd?.beta).toBe(1);
    expect(odd?.effectiveN).toBeCloseTo(expected.odd.effectiveN, 6);
    expect(even?.beta).toBeCloseTo(expected.even.beta, 6);
    expect(even?.alpha).toBe(1);
    expect(even?.effectiveN).toBeCloseTo(expected.even.effectiveN, 6);
    expect(expected.odd.effectiveN).toBeLessThan(5000); // decay actually applied
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

describe('BanditLedger retention (fold) and compact', () => {
  const DAY_MS = 86_400_000;
  /** ISO instant `daysAgo` before NOW. The default bound is 10 x 30 days = 300. */
  const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();

  it('skips a pull past the retention bound, keeps one just inside it, and keeps the boundary itself', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: at(301), arm: 'ancient', reward: { outcome: 1 } }));
    ledger.append(pull({ ts: at(300), arm: 'boundary', reward: { outcome: 1 } })); // exactly 10 half-lives
    ledger.append(pull({ ts: at(299), arm: 'recent', reward: { outcome: 1 } }));
    const result = ledger.fold('routing', 'quick-fix', config, NOW);
    // the ancient pull is absent, not merely down-weighted: it never creates an arm entry
    expect(result.arms.map((a) => a.arm)).toEqual(['boundary', 'recent']); // the bound is inclusive
    expect(result.expired).toBe(1);
    expect(result.malformed).toBe(0); // too old to matter is not malformed
    expect(result.arms[0]?.effectiveN).toBeCloseTo(Math.pow(0.5, 10), 12); // 2^-10, about 0.001
    expect(result.arms[1]?.effectiveN).toBeCloseTo(Math.pow(0.5, 299 / 30), 12);
  });

  it('moves the bound with retentionHalfLives: the same pull expires under 3 and counts under 4', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: at(100), reward: { outcome: 1 } })); // 100 days = 3.33 half-lives
    const under = (retentionHalfLives: number) =>
      ledger.fold('routing', 'quick-fix', { ...config, retentionHalfLives }, NOW);
    expect(under(3).arms).toEqual([]); // bound 90 days
    expect(under(3).expired).toBe(1);
    expect(under(4).arms.map((a) => a.arm)).toEqual(['local']); // bound 120 days
    expect(under(4).expired).toBe(0);
  });

  it('compact drops exactly the expired lines, preserves the rest byte for byte, and holds the posterior', () => {
    const ledger = new BanditLedger({ path: file });
    const kept = [
      pull({ ts: at(1), reward: { outcome: 1 } }),
      pull({ ts: at(299), arm: 'remote' }),
    ];
    const expired = [pull({ ts: at(301), arm: 'ancient' }), pull({ ts: at(5000), arm: 'fossil' })];
    // interleaved, so a compaction that merely truncated a prefix could not pass
    for (const p of [expired[0], kept[0], expired[1], kept[1]]) ledger.append(p as Pull);
    const before = ledger.fold('routing', 'quick-fix', config, NOW);

    const expectedText = kept.map((p) => JSON.stringify(p) + '\n').join('');
    expect(ledger.compact(config, NOW)).toEqual({
      kept: 2,
      dropped: 2,
      bytes: Buffer.byteLength(expectedText),
    });
    expect(readFileSync(file, 'utf8')).toBe(expectedText);

    const after = ledger.fold('routing', 'quick-fix', config, NOW);
    expect(after.arms).toEqual(before.arms); // the fold already ignored exactly what compact deleted
    expect(after.expired).toBe(0);
    expect(after.bytes).toBe(Buffer.byteLength(expectedText));
  });

  it('compact is idempotent: the second call drops nothing and rewrites nothing', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: at(301), arm: 'ancient' }));
    ledger.append(pull({ ts: at(1), reward: { outcome: 1 } }));
    const first = ledger.compact(config, NOW);
    expect(first).toEqual({ kept: 1, dropped: 1, bytes: readFileSync(file).length });
    const text = readFileSync(file, 'utf8');
    const second = ledger.compact(config, NOW);
    expect(second).toEqual({ kept: 1, dropped: 0, bytes: first.bytes });
    expect(readFileSync(file, 'utf8')).toBe(text);
  });

  it('compact on a missing file reports zeros and creates neither the file nor its directory', () => {
    const ledger = new BanditLedger({ path: file });
    expect(ledger.compact(config, NOW)).toEqual({ kept: 0, dropped: 0, bytes: 0 });
    expect(existsSync(file)).toBe(false);
    expect(existsSync(path.dirname(file))).toBe(false);
  });

  it('keeps a line retention cannot judge, so the malformed count survives compaction', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: at(301), arm: 'ancient' }));
    ledger.append(pull({ ts: at(1), reward: { outcome: 1 } }));
    appendFileSync(file, 'not json\n');
    expect(ledger.compact(config, NOW)).toEqual({
      kept: 2,
      dropped: 1,
      bytes: readFileSync(file).length,
    });
    expect(readFileSync(file, 'utf8')).toContain('not json\n'); // no ts to judge: never deleted blind
    expect(ledger.fold('routing', 'quick-fix', config, NOW).malformed).toBe(1);
  });

  it('compact validates the config and leaves the ledger alone', () => {
    const ledger = new BanditLedger({ path: file });
    ledger.append(pull({ ts: at(301), arm: 'ancient' }));
    const before = readFileSync(file, 'utf8');
    expect(() => ledger.compact({ ...config, retentionHalfLives: 0 }, NOW)).toThrow(
      /retentionHalfLives/
    );
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  // chmod cannot revoke directory write access on Windows — Node maps it to the read-only
  // file attribute only — so the failure these two force never occurs there and compact
  // succeeds. The behaviour under test is platform-independent; only the simulation is POSIX.
  const posixOnly = it.skipIf(process.platform === 'win32');

  posixOnly(
    'an unwritable directory routes the failure to onError, leaves the ledger intact, and leaves no temp file',
    () => {
      const onError = vi.fn<(error: Error) => void>();
      const flat = path.join(dir, 'bandit.jsonl'); // directly in dir, so chmod can lock the write
      const ledger = new BanditLedger({ path: flat, onError });
      ledger.append(pull({ ts: at(301), arm: 'ancient' }));
      ledger.append(pull({ ts: at(1), reward: { outcome: 1 } }));
      const before = readFileSync(flat, 'utf8');
      chmodSync(dir, 0o500); // readable and listable, not writable: the temp file cannot be created
      try {
        expect(ledger.compact(config, NOW)).toEqual({ kept: 0, dropped: 0, bytes: 0 });
      } finally {
        chmodSync(dir, 0o700);
      }
      expect(onError).toHaveBeenCalledTimes(1);
      expect(readFileSync(flat, 'utf8')).toBe(before); // uncompacted, still correct
      expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    }
  );

  posixOnly(
    'a rename the ledger survives is reported, not thrown, even when the temp file cannot be removed',
    () => {
      const onError = vi.fn<(error: Error) => void>();
      const flat = path.join(dir, 'bandit.jsonl');
      const ledger = new BanditLedger({ path: flat, onError });
      ledger.append(pull({ ts: at(301), arm: 'ancient' }));
      ledger.append(pull({ ts: at(1), reward: { outcome: 1 } }));
      const before = readFileSync(flat, 'utf8');
      // pre-create the temp file, then lock the directory: writing an existing file still
      // succeeds, but the rename onto the ledger and the temp cleanup both need the directory
      const tmp = `${flat}.${String(process.pid)}.tmp`;
      writeFileSync(tmp, '');
      chmodSync(dir, 0o500);
      try {
        expect(ledger.compact(config, NOW)).toEqual({ kept: 0, dropped: 0, bytes: 0 });
      } finally {
        chmodSync(dir, 0o700);
      }
      expect(onError).toHaveBeenCalledTimes(1); // the rename failure, not a cleanup failure
      expect(readFileSync(flat, 'utf8')).toBe(before); // the destination survived: ledger untouched
    }
  );

  it('a compact read error other than ENOENT reports zeros through onError', () => {
    const onError = vi.fn<(error: Error) => void>();
    const ledger = new BanditLedger({ path: dir, onError }); // a directory, not a file: EISDIR
    expect(ledger.compact(config, NOW)).toEqual({ kept: 0, dropped: 0, bytes: 0 });
    expect(onError).toHaveBeenCalledTimes(1);
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
