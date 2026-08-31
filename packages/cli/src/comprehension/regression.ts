/**
 * ADR 0109 slice 4 / ADR 0110 §4 — token-free semantic-regression detection.
 *
 * The committed comprehension substrate is only worth keeping if `main` cannot
 * silently strip a module's expensively-authored semantic understanding down to
 * static-only. This module answers, against a base ref, using ONLY frontmatter
 * reads — no LLM, no provider, no token: did a module's unit flip
 * `semantic: present → absent`?
 *
 * ADR 0110 reframes WHERE that question is a regression. Under single-writer,
 * PRs are STATIC-ONLY: every touched module legitimately goes `present` (base) →
 * `absent` (PR), because semantic is deferred to the `main` main-pass. So on a
 * PR that flip is EXPECTED and NOT a regression — flagging it would false-positive
 * on every PR. The gate's real job moves to guarding `main`: post-merge, did
 * `main` LOSE semantic it previously had? The `context` selects which question is
 * asked; the check itself is pure git + string parsing (adopter-cost-free).
 */

import { spawnSync } from 'node:child_process';
import { COMPREHENSION_ROOT } from '@harness-engineering/core';

export type SemanticState = 'present' | 'absent';

/**
 * Which path the check runs on (ADR 0110 §4):
 *  - `'main'`: post-merge guard — `present → absent` means `main` lost semantic
 *    (a real regression the single-writer main-pass must never produce).
 *  - `'pr'`: the static-only PR path — `present → absent` is EXPECTED and never a
 *    regression, so no module is flagged (kills the per-PR false positive).
 */
export type RegressionContext = 'main' | 'pr';

/**
 * Modules whose unit regressed `present → absent` from `base` to `head`, as
 * judged for the given `context` (default `'main'`, the strict post-merge guard).
 *
 * `context: 'main'` — only a module present in BOTH maps that lost its semantic
 * counts; a deleted module (absent from `head`) or a brand-new module (absent
 * from `base`) is never a regression. Result is sorted for stable reporting.
 *
 * `context: 'pr'` — always `[]`: on the static-only PR path `present → absent` is
 * the designed outcome (semantic lands on `main`, ADR 0110), not a regression.
 */
export function detectSemanticRegressions(
  base: Map<string, SemanticState>,
  head: Map<string, SemanticState>,
  context: RegressionContext = 'main'
): string[] {
  // ADR 0110 §4: on a PR the present→absent downgrade is EXPECTED, not a
  // regression. The gate guards `main`, so a PR run flags nothing here.
  if (context === 'pr') return [];
  const regressed: string[] = [];
  for (const [module, state] of base) {
    if (state === 'present' && head.get(module) === 'absent') {
      regressed.push(module);
    }
  }
  return regressed.sort();
}

/**
 * ADR 0110 §1 policy companion (PR path): modules where `head` COMMITTED semantic
 * that `base` did not already carry (`base` absent/missing → `head` present).
 * Under single-writer, PRs must be static-only — committed semantic belongs to
 * the `main` main-pass, so a semantic ADDITION on a branch violates policy. This
 * is the mirror of the reframed regression gate: on a PR we don't flag the
 * expected `present → absent` loss, we flag the disallowed committed-semantic
 * ADDITION. Advisory (defense-in-depth for the branch-based write suppression);
 * `present → present` (semantic inherited unchanged from `main`) is never flagged.
 * Result is sorted for stable reporting.
 */
export function detectCommittedSemanticOnBranch(
  base: Map<string, SemanticState>,
  head: Map<string, SemanticState>
): string[] {
  const offending: string[] = [];
  for (const [module, state] of head) {
    if (state === 'present' && base.get(module) !== 'present') {
      offending.push(module);
    }
  }
  return offending.sort();
}

/**
 * Extract `{ module, semantic }` from a serialized `_module.md` shard via a
 * lightweight frontmatter scan (our serializer emits fixed-key-order, one scalar
 * per line, so a per-line match is exact — no YAML dependency, no core-barrel
 * coupling). Returns null when either field is missing/malformed.
 */
export function parseModuleSemantic(
  md: string
): { module: string; semantic: SemanticState } | null {
  const rawModule = /^module:\s*(.+)$/m.exec(md)?.[1];
  const rawSemantic = /^semantic:\s*(present|absent)\s*$/m.exec(md)?.[1];
  if (rawModule === undefined || rawSemantic === undefined) return null;
  // Strip surrounding single/double quotes emitted by quoteYamlScalar.
  const module = rawModule.trim().replace(/^['"]|['"]$/g, '');
  if (module.length === 0) return null;
  return { module, semantic: rawSemantic as SemanticState };
}

/** Git seams so ref reading is injectable (disk-/git-free in tests). */
export interface RefReadDeps {
  /**
   * Repo-relative shard paths tracked at `ref`, or `null` when the ref itself
   * could not be resolved (unfetched, bad ref, git error). `null` is DISTINCT
   * from an empty array (ref resolved, no shards) so the caller can fail loud on
   * an unreadable base instead of silently passing (a false green).
   */
  listShardsAtRef(ref: string): string[] | null;
  /** Contents of `path` at `ref`, or null when the path did not exist there. */
  showAtRef(ref: string, path: string): string | null;
}

/**
 * Build the `module → semantic` map from every committed shard at `ref`. Returns
 * `null` when the ref could not be resolved (propagating `listShardsAtRef`'s
 * failure signal) so the caller distinguishes "base has no regressions" from
 * "base could not be read" — the latter must never be reported as a pass.
 */
export function readSemanticMapAtRef(
  ref: string,
  deps: RefReadDeps
): Map<string, SemanticState> | null {
  const shards = deps.listShardsAtRef(ref);
  if (shards === null) return null;
  const map = new Map<string, SemanticState>();
  for (const path of shards) {
    const md = deps.showAtRef(ref, path);
    if (md === null) continue;
    const parsed = parseModuleSemantic(md);
    if (parsed) map.set(parsed.module, parsed.semantic);
  }
  return map;
}

/** Default git seams over a working directory (spawnSync, never throws). */
export function defaultRefReadDeps(cwd: string, root = COMPREHENSION_ROOT): RefReadDeps {
  return {
    listShardsAtRef(ref: string): string[] | null {
      const res = spawnSync('git', ['ls-tree', '-r', '--name-only', ref, '--', root], {
        cwd,
        encoding: 'utf8',
      });
      // Non-zero ⇒ the ref could not be resolved: signal FAILURE (null), never an
      // empty list, so an unfetched/bad base ref cannot masquerade as "no shards".
      if (res.status !== 0 || typeof res.stdout !== 'string') return null;
      return res.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.endsWith('/_module.md'));
    },
    showAtRef(ref: string, path: string): string | null {
      const res = spawnSync('git', ['show', `${ref}:${path}`], { cwd, encoding: 'utf8' });
      if (res.status !== 0 || typeof res.stdout !== 'string') return null;
      return res.stdout;
    },
  };
}
