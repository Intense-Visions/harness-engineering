/**
 * stats-explore-exploit Phase 1 — typecheck-only fixture.
 *
 * This file is NOT executed at runtime. It is excluded from the
 * package's runtime build (see `tsconfig.build.json` `exclude`) and
 * compiled as part of `pnpm --filter @harness-engineering/types
 * typecheck` only. A failure to compile here is a regression on the
 * shared bandit/SPRT shapes in `../stats` (spec: docs/changes/
 * stats-explore-exploit/proposal.md, "Data structures").
 */
import type { ArmState, BanditConfig, Choice, Pull, SprtConfig, SprtVerdict } from '../index';

// --- 1. Pull: unscored (reward absent, D9), scored inline, and late-scoring by ref ---
const _unscored: Pull = {
  ts: '2026-09-24T00:00:00.000Z',
  consumer: 'routing',
  context: 'quick-fix',
  arm: 'local',
  mode: 'explore',
  ref: 'issue-1557',
};
const _scoredLate: Pull = {
  ts: '2026-09-24T01:00:00.000Z',
  consumer: 'routing',
  context: 'quick-fix',
  arm: 'local',
  mode: 'explore',
  reward: { outcome: 1, costUsd: 0.02 },
  ref: 'issue-1557',
};
const _scoredInlineNoRef: Pull = {
  ts: '2026-09-24T02:00:00.000Z',
  consumer: 'fleet-command',
  context: 'wave-3',
  arm: 'pr-fleet',
  mode: 'exploit',
  reward: { outcome: 0 },
};
void _unscored;
void _scoredLate;
void _scoredInlineNoRef;

// --- 2. ArmState: a novel arm has no lastPull ---
const _novel: ArmState = {
  arm: 'local',
  alpha: 1,
  beta: 1,
  effectiveN: 0,
  novel: true,
  meanUtility: 0,
};
const _seasoned: ArmState = {
  arm: 'claude-sonnet',
  alpha: 9.2,
  beta: 1.8,
  effectiveN: 10,
  novel: false,
  meanUtility: 0.84,
  lastPull: '2026-09-24T02:00:00.000Z',
};
void _novel;
void _seasoned;

// --- 3. BanditConfig: minimal thompson; full scoutFraction with prior ---
const _thompson: BanditConfig = { policy: 'thompson', halfLifeDays: 30, minEffectiveN: 2 };
const _scout: BanditConfig = {
  policy: 'scoutFraction',
  scoutFraction: 0.1,
  halfLifeDays: 30,
  minEffectiveN: 2,
  prior: { alpha: 1, beta: 1 },
};
void _thompson;
void _scout;

// --- 4. Choice: mode + one-line printable reason (G2) ---
const _choice: Choice = {
  arm: 'local',
  mode: 'explore',
  reason: 'scout 1-in-10, least sampled (n=0.4)',
};
void _choice;

// --- 5. SPRT: verdict union and config with/without maxN ---
const _verdicts: SprtVerdict[] = ['accept', 'reject', 'continue'];
const _sprtBounded: SprtConfig = { alpha: 0.05, beta: 0.05, p0: 0.5, p1: 0.7, maxN: 200 };
const _sprtUnbounded: SprtConfig = { alpha: 0.05, beta: 0.05, p0: 0.5, p1: 0.7 };
void _verdicts;
void _sprtBounded;
void _sprtUnbounded;

// --- 6. Negative: one literal outside each spec-pinned union must not compile ---
// Each directive is load-bearing: if the union widens to `string`, the
// directive becomes unused and typecheck fails with TS2578.
const _badMode: Pull = {
  ts: '2026-09-24T00:00:00.000Z',
  consumer: 'routing',
  context: 'c',
  arm: 'a',
  // @ts-expect-error mode is 'exploit' | 'explore'
  mode: 'random',
};
const _badPolicy: BanditConfig = {
  // @ts-expect-error policy is 'scoutFraction' | 'thompson'
  policy: 'random',
  halfLifeDays: 30,
  minEffectiveN: 2,
};
const _badChoiceMode: Choice = {
  arm: 'a',
  // @ts-expect-error mode is 'exploit' | 'explore'
  mode: 'scout',
  reason: 'r',
};
// @ts-expect-error SprtVerdict is 'accept' | 'reject' | 'continue'
const _badVerdict: SprtVerdict = 'maybe';
void _badMode;
void _badPolicy;
void _badChoiceMode;
void _badVerdict;
