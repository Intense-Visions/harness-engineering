import { describe, it, expect } from 'vitest';
import {
  selectProbeTargets,
  isProbeDue,
  isCacheFresh,
  probeCacheKey,
  type ProbeCandidate,
  type HarnessFitCacheEntry,
  type HarnessFitCacheStore,
} from '../../src/capability/probe-policy.js';

/**
 * Phase 3 / Task 1 — the PURE cost-gating policy (D5/SC4). Every test runs
 * against a fake in-memory cache + a supplied `now` — no real Ollama, no real
 * disk, no ambient clock. Proves:
 *   - top-N cap respected (the N+1-th row is NEVER probed),
 *   - the full discovered set is never probed,
 *   - VRAM-unfit + `toolCalling === false` are prefiltered out,
 *   - a FRESH-cached candidate is skipped; a stale/absent one is probed,
 *   - the cadence gate keeps the probe off every refresh (opt-in + due-check).
 */

const NOW = 1_000_000_000_000;

/** A tiny in-memory cache store — the injected disk store's stand-in. */
function memCache(seed: Record<string, HarnessFitCacheEntry> = {}): HarnessFitCacheStore {
  const map = new Map<string, HarnessFitCacheEntry>(Object.entries(seed));
  return {
    get: (key) => map.get(key),
    set: (key, entry) => {
      map.set(key, entry);
    },
  };
}

function candidate(o: Partial<ProbeCandidate> & { hfRepoId: string }): ProbeCandidate {
  return {
    ollamaName: `${o.hfRepoId.toLowerCase()}:latest`,
    quant: 'Q4_K_M',
    fitsHardware: true,
    ...o,
  };
}

describe('probeCacheKey', () => {
  it('keys on the ollama tag (version anchor) + quant', () => {
    expect(probeCacheKey({ hfRepoId: 'Qwen/Q', ollamaName: 'qwen3:32b', quant: 'Q4_K_M' })).toBe(
      'qwen3:32b@Q4_K_M'
    );
  });

  it('falls back to the HF repo id when there is no ollama name', () => {
    expect(probeCacheKey({ hfRepoId: 'Org/Model', ollamaName: undefined, quant: 'Q8_0' })).toBe(
      'Org/Model@Q8_0'
    );
  });

  it('distinguishes re-quants of the same model (quant is part of identity)', () => {
    const a = probeCacheKey({ hfRepoId: 'X', ollamaName: 'm:v', quant: 'Q4_K_M' });
    const b = probeCacheKey({ hfRepoId: 'X', ollamaName: 'm:v', quant: 'Q8_0' });
    expect(a).not.toBe(b);
  });
});

describe('isCacheFresh', () => {
  const ttl = 7 * 24 * 60 * 60 * 1000; // 7d

  it('is fresh within the TTL window', () => {
    expect(isCacheFresh({ buildQuality: 0.9, probedAt: NOW - 1000 }, NOW, ttl)).toBe(true);
  });

  it('is stale once the age exceeds the TTL', () => {
    expect(isCacheFresh({ buildQuality: 0.9, probedAt: NOW - ttl - 1 }, NOW, ttl)).toBe(false);
  });

  it('treats a non-positive TTL as always-stale (always re-probe)', () => {
    expect(isCacheFresh({ buildQuality: 0.9, probedAt: NOW }, NOW, 0)).toBe(false);
  });

  it('treats a mildly future probedAt (clock skew) as fresh, not stale', () => {
    expect(isCacheFresh({ buildQuality: 0.9, probedAt: NOW + 1000 }, NOW, ttl)).toBe(true);
  });
});

describe('selectProbeTargets — top-N cost gate', () => {
  const ttl = 7 * 24 * 60 * 60 * 1000;

  it('probes only the benchmark top-N; the N+1-th row is never probed', () => {
    const ranked = [
      candidate({ hfRepoId: 'A' }),
      candidate({ hfRepoId: 'B' }),
      candidate({ hfRepoId: 'C' }),
      candidate({ hfRepoId: 'D' }), // N+1 (topN=3) — must NOT be probed
      candidate({ hfRepoId: 'E' }),
    ];
    const targets = selectProbeTargets(ranked, {
      topN: 3,
      cache: memCache(),
      now: NOW,
      cacheTtlMs: ttl,
    });
    expect(targets.map((t) => t.hfRepoId)).toEqual(['A', 'B', 'C']);
  });

  it('never probes the full discovered set even with a large topN', () => {
    const ranked = Array.from({ length: 50 }, (_, i) => candidate({ hfRepoId: `M${i}` }));
    const targets = selectProbeTargets(ranked, {
      topN: 5,
      cache: memCache(),
      now: NOW,
      cacheTtlMs: ttl,
    });
    expect(targets).toHaveLength(5);
    expect(targets.length).toBeLessThan(ranked.length);
  });

  it('applies the top-N window BEFORE prefiltering (a prefiltered leader does not pull in N+1)', () => {
    const ranked = [
      candidate({ hfRepoId: 'A', fitsHardware: false }), // in top-N but prefiltered out
      candidate({ hfRepoId: 'B' }),
      candidate({ hfRepoId: 'C' }),
      candidate({ hfRepoId: 'D' }), // N+1 — must NOT be pulled in
    ];
    const targets = selectProbeTargets(ranked, {
      topN: 3,
      cache: memCache(),
      now: NOW,
      cacheTtlMs: ttl,
    });
    // A dropped (unfit), B + C probed, D never reached.
    expect(targets.map((t) => t.hfRepoId)).toEqual(['B', 'C']);
  });

  it('returns nothing when topN is 0', () => {
    const ranked = [candidate({ hfRepoId: 'A' })];
    expect(
      selectProbeTargets(ranked, { topN: 0, cache: memCache(), now: NOW, cacheTtlMs: ttl })
    ).toEqual([]);
  });
});

describe('selectProbeTargets — prefilter', () => {
  const ttl = 7 * 24 * 60 * 60 * 1000;

  it('skips VRAM-unfit candidates', () => {
    const ranked = [
      candidate({ hfRepoId: 'FIT' }),
      candidate({ hfRepoId: 'UNFIT', fitsHardware: false }),
    ];
    const targets = selectProbeTargets(ranked, {
      topN: 5,
      cache: memCache(),
      now: NOW,
      cacheTtlMs: ttl,
    });
    expect(targets.map((t) => t.hfRepoId)).toEqual(['FIT']);
  });

  it('skips candidates that confirmed cannot tool-call (toolCalling === false)', () => {
    const ranked = [
      candidate({ hfRepoId: 'CAN', toolCalling: true }),
      candidate({ hfRepoId: 'CANT', toolCalling: false }),
      candidate({ hfRepoId: 'UNKNOWN', toolCalling: undefined }), // fails open ⇒ probe-worthy
    ];
    const targets = selectProbeTargets(ranked, {
      topN: 5,
      cache: memCache(),
      now: NOW,
      cacheTtlMs: ttl,
    });
    expect(targets.map((t) => t.hfRepoId)).toEqual(['CAN', 'UNKNOWN']);
  });
});

describe('selectProbeTargets — cache', () => {
  const ttl = 7 * 24 * 60 * 60 * 1000;

  it('skips a candidate whose buildQuality is cached FRESH', () => {
    const cached = candidate({ hfRepoId: 'CACHED' });
    const cache = memCache({
      [probeCacheKey(cached)]: { buildQuality: 0.9, probedAt: NOW - 1000 },
    });
    const ranked = [cached, candidate({ hfRepoId: 'UNCACHED' })];
    const targets = selectProbeTargets(ranked, { topN: 5, cache, now: NOW, cacheTtlMs: ttl });
    expect(targets.map((t) => t.hfRepoId)).toEqual(['UNCACHED']);
  });

  it('re-probes a candidate whose cache entry is STALE', () => {
    const stale = candidate({ hfRepoId: 'STALE' });
    const cache = memCache({
      [probeCacheKey(stale)]: { buildQuality: 0.9, probedAt: NOW - ttl - 1 },
    });
    const targets = selectProbeTargets([stale], { topN: 5, cache, now: NOW, cacheTtlMs: ttl });
    expect(targets.map((t) => t.hfRepoId)).toEqual(['STALE']);
  });

  it('probes a candidate with NO cache entry', () => {
    const targets = selectProbeTargets([candidate({ hfRepoId: 'FRESH' })], {
      topN: 5,
      cache: memCache(),
      now: NOW,
      cacheTtlMs: ttl,
    });
    expect(targets.map((t) => t.hfRepoId)).toEqual(['FRESH']);
  });
});

describe('isProbeDue — cadence gate', () => {
  const interval = 24 * 60 * 60 * 1000; // 24h

  it('is never due when disabled (opt-in, D5)', () => {
    expect(
      isProbeDue({ lastProbeAt: undefined }, { enabled: false, intervalMs: interval, now: NOW })
    ).toBe(false);
  });

  it('is due on the first pass (never run before)', () => {
    expect(
      isProbeDue({ lastProbeAt: undefined }, { enabled: true, intervalMs: interval, now: NOW })
    ).toBe(true);
  });

  it('is NOT due before the interval elapses (not every refresh)', () => {
    expect(
      isProbeDue(
        { lastProbeAt: NOW - interval + 1 },
        { enabled: true, intervalMs: interval, now: NOW }
      )
    ).toBe(false);
  });

  it('is due once the interval has elapsed', () => {
    expect(
      isProbeDue({ lastProbeAt: NOW - interval }, { enabled: true, intervalMs: interval, now: NOW })
    ).toBe(true);
  });
});
