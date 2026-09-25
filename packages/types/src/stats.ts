/**
 * Shared shapes for `@harness-engineering/stats` — the explore/exploit bandit
 * and the sequential probability ratio test — and for every consumer that
 * records to or reads the bandit ledger (routing, fleet-command, roadmap).
 *
 * Spec: docs/changes/stats-explore-exploit/proposal.md, "Data structures".
 * One ledger line is one `Pull`; a pull without a `reward` contributes nothing
 * to the posterior (D9); the consumer supplies the scalar utility over the
 * `{ outcome, costUsd? }` pair (D8).
 */

export interface Pull {
  ts: string; // ISO-8601 instant with a zone designator (Z or ±HH:MM)
  consumer: string; // 'routing' | 'fleet-command' | 'roadmap' | free string
  context: string; // consumer-defined bucket, e.g. task class, wave, track
  arm: string; // consumer-defined arm id, e.g. backend name, fleet name
  mode: 'exploit' | 'explore';
  reward?: { outcome: number; costUsd?: number }; // outcome in [0,1]; absent until scored
  ref?: string; // pointer to the outcome: issue id, PR number, lane id
}

export interface ArmState {
  arm: string;
  alpha: number; // decayed Beta posterior
  beta: number;
  effectiveN: number; // sum of decayed weights
  novel: boolean; // effectiveN < minEffectiveN
  meanUtility: number; // via the consumer's utility over scored pulls
  lastPull?: string;
}

export interface BanditConfig {
  policy: 'scoutFraction' | 'thompson';
  scoutFraction?: number; // default 0.1; only read by scoutFraction
  halfLifeDays?: number; // default 30
  minEffectiveN?: number; // default 2
  prior?: { alpha: number; beta: number }; // default { 1, 1 }
}

export interface Choice {
  arm: string;
  mode: 'exploit' | 'explore';
  reason: string; // one line, printable at a human gate unchanged
}

export type SprtVerdict = 'accept' | 'reject' | 'continue';
export interface SprtConfig {
  alpha: number; // declared type-I error
  beta: number; // declared type-II error
  p0: number; // Bernoulli success probability under h0
  p1: number; // under h1
  maxN?: number; // optional cost bound
}
