// packages/intelligence/src/triage/brainstorm/runner.test.ts
//
// Roadmap Auto-Triage — Phase 2, Task 2 (TDD): the fork-drive + halt spec.
//
// SC1–SC3, SC5, SC6 against a STUBBED ForkGenerator (the LLM is the injected seam). These
// pin the decision core BEFORE runner.ts implements it:
//   • all-high-confidence forks → completed{ spec } carrying every accepted decision (SC1)
//   • one below-'high' fork → halted AT that fork, no spec (SC2 — the no-go trigger)
//   • generator throws → halted{ reason: 'error' } (SC5 — never a spec)
//   • depth budget respected — the loop never asks past maxForks (SC3)
//   • determinism — identical input + stub ⇒ identical outcome (SC6)
//   • self-consistency — a generator that flips its recommendation across samples must
//     surface as confidence:'low' and therefore HALT (overconfidence hardening).
//
// The runner is PURE: no live model, no IO. The generator is the only seam.

import { describe, it, expect } from 'vitest';
import { runAutoBrainstorm } from './runner.js';
import type { BrainstormInput, Fork, ForkDecision, ForkGenerator, DepthBudget } from './types.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function fork(id: string): Fork {
  return { id, question: `Which approach for ${id}?`, options: ['A', 'B'] };
}

function decision(id: string, confidence: ForkDecision['confidence']): ForkDecision {
  return {
    fork: fork(id),
    recommendation: 'A',
    confidence,
    rationale: `${id}: A is the safe default.`,
  };
}

/**
 * A generator over a fixed script of decisions: returns each in order, then `null` (done).
 * Records how many times it was asked so we can assert the depth budget is respected.
 */
function scriptedGenerator(script: readonly ForkDecision[]): ForkGenerator & { calls: number } {
  const gen = {
    calls: 0,
    next(index: number): ForkDecision | null {
      gen.calls += 1;
      return script[index] ?? null;
    },
  };
  return gen;
}

/** A generator that always throws — exercises the SC5 error path. */
const throwingGenerator: ForkGenerator = {
  next() {
    throw new Error('model exploded');
  },
};

/**
 * A generator that simulates self-consistency N-sampling INSIDE the seam: it samples a fork
 * `samples` times; when the sampled recommendation is unstable (flips), it downgrades the
 * returned decision to `confidence:'low'` (the overconfidence-hardening contract). Here we
 * drive it with a fixed flip pattern so the runner test stays deterministic.
 */
function selfConsistentGenerator(opts: {
  /** Per-fork sample recommendations; a fork whose samples disagree is downgraded to low. */
  samplesByFork: readonly (readonly string[])[];
}): ForkGenerator {
  return {
    next(index: number): ForkDecision | null {
      const samples = opts.samplesByFork[index];
      if (!samples) return null;
      const stable = samples.every((s) => s === samples[0]);
      return {
        fork: fork(`f${index}`),
        recommendation: samples[0] ?? 'A',
        // Reported enum is 'high', but an unstable sample set forces 'low' (the hardening).
        confidence: stable ? 'high' : 'low',
        rationale: stable ? 'stable across samples' : 'recommendation flipped across samples',
      };
    },
  };
}

function inputFor(overrides: Partial<BrainstormInput> = {}): BrainstormInput {
  return {
    externalId: 'ISS-1',
    title: 'Add a retry cap to the fetch client',
    summary: 'Cap retries at a configurable maximum.',
    level: 'simple',
    ...overrides,
  };
}

const DEPTH_2: DepthBudget = { maxForks: 2 };
const DEPTH_4: DepthBudget = { maxForks: 4 };

// ---------------------------------------------------------------------------
// SC1 — clean completion carries the spec draft with every accepted decision.
// ---------------------------------------------------------------------------

describe('runAutoBrainstorm — SC1 clean completion', () => {
  it('all-high-confidence forks → completed{ spec } accumulating every decision', async () => {
    const gen = scriptedGenerator([decision('f0', 'high'), decision('f1', 'high')]);
    const out = await runAutoBrainstorm(inputFor(), gen, DEPTH_4);
    expect(out.kind).toBe('completed');
    if (out.kind !== 'completed') throw new Error('expected completed');
    expect(out.spec.externalId).toBe('ISS-1');
    expect(out.spec.decisions.map((d) => d.fork.id)).toEqual(['f0', 'f1']);
    expect(out.spec.title).toBe('Add a retry cap to the fetch client');
  });

  it('a brainstorm with NO forks (generator returns null immediately) completes with an empty spec', async () => {
    const gen = scriptedGenerator([]);
    const out = await runAutoBrainstorm(inputFor(), gen, DEPTH_4);
    expect(out.kind).toBe('completed');
    if (out.kind !== 'completed') throw new Error('expected completed');
    expect(out.spec.decisions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SC2 — a fork below the 'high' bar halts AT that fork; no spec.
// ---------------------------------------------------------------------------

describe('runAutoBrainstorm — SC2 halt on low confidence (the no-go trigger)', () => {
  it('a medium-confidence fork halts at that fork with reason low-confidence, no spec', async () => {
    const gen = scriptedGenerator([decision('f0', 'high'), decision('f1', 'medium')]);
    const out = await runAutoBrainstorm(inputFor(), gen, DEPTH_4);
    expect(out.kind).toBe('halted');
    if (out.kind !== 'halted') throw new Error('expected halted');
    expect(out.reason).toBe('low-confidence');
    expect(out.fork.id).toBe('f1');
  });

  it('a low-confidence FIRST fork halts immediately (never reaches later forks)', async () => {
    const gen = scriptedGenerator([decision('f0', 'low'), decision('f1', 'high')]);
    const out = await runAutoBrainstorm(inputFor(), gen, DEPTH_4);
    expect(out.kind).toBe('halted');
    if (out.kind !== 'halted') throw new Error('expected halted');
    expect(out.fork.id).toBe('f0');
    // It halted at f0, so it must not have asked for f1 (calls === 1).
    expect(gen.calls).toBe(1);
  });

  it('only high auto-accepts — medium and low both halt (confidence is a conservative input)', async () => {
    for (const c of ['medium', 'low'] as const) {
      const out = await runAutoBrainstorm(
        inputFor(),
        scriptedGenerator([decision('f0', c)]),
        DEPTH_4
      );
      expect(out.kind).toBe('halted');
    }
  });
});

// ---------------------------------------------------------------------------
// SC5 — generator error → halted{ reason: 'error' }; never a spec, never a throw.
// ---------------------------------------------------------------------------

describe('runAutoBrainstorm — SC5 error path (never throws)', () => {
  it('a throwing generator halts with reason error and a legible detail', async () => {
    const out = await runAutoBrainstorm(inputFor(), throwingGenerator, DEPTH_4);
    expect(out.kind).toBe('halted');
    if (out.kind !== 'halted') throw new Error('expected halted');
    expect(out.reason).toBe('error');
    expect(out.detail.toLowerCase()).toContain('exploded');
  });

  it('an async-rejecting generator also halts with reason error (runner is total)', async () => {
    const rejecting: ForkGenerator = { next: () => Promise.reject(new Error('timeout')) };
    const out = await runAutoBrainstorm(inputFor(), rejecting, DEPTH_4);
    expect(out.kind).toBe('halted');
    if (out.kind !== 'halted') throw new Error('expected halted');
    expect(out.reason).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// SC3 — depth budget respected: the loop never asks past maxForks.
// ---------------------------------------------------------------------------

describe('runAutoBrainstorm — SC3 depth budget', () => {
  it('never asks the generator past maxForks even if it keeps producing forks', async () => {
    // A generator that would produce forks forever; the budget must cap it.
    const endless: ForkGenerator & { calls: number } = {
      calls: 0,
      next(index: number): ForkDecision {
        endless.calls += 1;
        return decision(`f${index}`, 'high');
      },
    };
    const out = await runAutoBrainstorm(inputFor(), endless, DEPTH_2);
    // Capped at 2 forks: completes with exactly 2 decisions and 2 generator calls.
    expect(out.kind).toBe('completed');
    if (out.kind !== 'completed') throw new Error('expected completed');
    expect(out.spec.decisions.length).toBe(2);
    expect(endless.calls).toBe(2);
  });

  it('depth scales from the mapping — a trivial item uses a shallower budget than simple', async () => {
    const { depthForLevel } = await import('./types.js');
    expect(depthForLevel('trivial').maxForks).toBeLessThan(depthForLevel('simple').maxForks);
  });
});

// ---------------------------------------------------------------------------
// Self-consistency (overconfidence hardening) — a flip forces low ⇒ halt.
// ---------------------------------------------------------------------------

describe('runAutoBrainstorm — self-consistency downgrade halts', () => {
  it('a fork whose recommendation is STABLE across samples stays high → accepted', async () => {
    const gen = selfConsistentGenerator({ samplesByFork: [['A', 'A', 'A']] });
    const out = await runAutoBrainstorm(inputFor(), gen, DEPTH_2);
    expect(out.kind).toBe('completed');
  });

  it('a fork whose recommendation FLIPS across samples is forced to low → halted', async () => {
    const gen = selfConsistentGenerator({ samplesByFork: [['A', 'B', 'A']] });
    const out = await runAutoBrainstorm(inputFor(), gen, DEPTH_2);
    expect(out.kind).toBe('halted');
    if (out.kind !== 'halted') throw new Error('expected halted');
    expect(out.reason).toBe('low-confidence');
  });
});

// ---------------------------------------------------------------------------
// SC6 — determinism: identical input + stub ⇒ identical outcome.
// ---------------------------------------------------------------------------

describe('runAutoBrainstorm — SC6 determinism', () => {
  it('produces byte-identical outcomes for identical inputs + stubs', async () => {
    const a = await runAutoBrainstorm(
      inputFor(),
      scriptedGenerator([decision('f0', 'high'), decision('f1', 'high')]),
      DEPTH_4
    );
    const b = await runAutoBrainstorm(
      inputFor(),
      scriptedGenerator([decision('f0', 'high'), decision('f1', 'high')]),
      DEPTH_4
    );
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
