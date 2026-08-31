/**
 * ADR 0116 — single-writer semantic comprehension policy.
 *
 * `main` is the ONLY writer of the SEMANTIC half of a comprehension unit. PRs
 * carry only the deterministic STATIC skeleton (byte-stable ⇒ they never
 * conflict); the non-deterministic, LLM-authored semantic half is (re)generated
 * once, out of the PR path, where there is no concurrency — so a single writer
 * means zero shard conflicts regardless of which merge button lands the PR.
 *
 * This module is the pure, injectable decision seam: "may THIS invocation write
 * _committed_ semantic?" The answer is yes only during the **main-pass** — a
 * maintainer running `harness comprehend --all` on `main` (the chosen
 * maintainer-local provider, ADR 0116 §3), a post-merge main job, or the opt-in
 * token-gated `comprehension.ci: refresh` runner (#1689) that supplies its own
 * credential. Everywhere else — the pre-commit hook, in-session
 * `put_comprehension`, a developer's `comprehend --changed` on a feature branch —
 * committed semantic is suppressed (the PR path stays static-only).
 *
 * Enforcement is BRANCH-based (option (a) of ADR 0116 §1): the `storage: cache`
 * overlay of option (b) is not path-routed today (every shard under
 * `.harness/comprehension/**` is force-tracked by `.gitignore`), so the minimal
 * correct rule is "don't write committed semantic unless we can PROVE we are the
 * single writer (`main`)." Defaulting an unknown branch to "not the main-pass"
 * keeps the conflict-avoidance invariant safe under detached HEAD / no-git.
 */

import { execSync } from 'node:child_process';

/** The single-writer branch. Semantic commits are permitted only here. */
export const MAIN_BRANCH = 'main';

/** Seam over branch resolution + env so the predicate is testable disk/git-free. */
export interface MainPassDeps {
  /** Resolved current branch, or null when it could not be determined. */
  branch: string | null;
  /** Process env (GITHUB_REF / the explicit main-pass override live here). */
  env: NodeJS.ProcessEnv;
}

/**
 * Resolve the current branch the SAME way `verify.ts` does: honour explicit CI
 * env vars first (CI runs detached HEAD on PR builds, where `rev-parse` returns
 * the literal "HEAD"), then fall back to git. Returns null when nothing resolves.
 */
export function resolveComprehensionBranch(
  env: NodeJS.ProcessEnv = process.env,
  exec: (cmd: string) => string = (cmd) =>
    execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
): string | null {
  const envBranch =
    env.HARNESS_BRANCH || env.GITHUB_HEAD_REF || env.CI_COMMIT_REF_NAME || env.BUILDKITE_BRANCH;
  if (envBranch && envBranch.length > 0) return envBranch;
  try {
    const out = exec('git rev-parse --abbrev-ref HEAD').trim();
    if (out && out !== 'HEAD') return out;
  } catch {
    return null;
  }
  return null;
}

/**
 * Is THIS invocation the main-pass — the single authorized writer of committed
 * semantic (ADR 0116)? True when:
 *  - the explicit override `HARNESS_COMPREHENSION_MAIN_PASS=1` is set (the seam a
 *    post-merge main job or the #1689 keyed runner flips — detached HEAD on `main`
 *    makes branch resolution unreliable there), OR
 *  - `GITHUB_REF` is `refs/heads/main` (a CI push to main, detached HEAD), OR
 *  - the resolved branch IS `main` (the maintainer-local main-pass, ADR 0116 §3).
 *
 * Everything else — every feature branch, every PR build, an unknown branch — is
 * the PR path: NOT the main-pass, so committed semantic is suppressed.
 */
export function isMainPassContext(deps: MainPassDeps): boolean {
  const { branch, env } = deps;
  if (env.HARNESS_COMPREHENSION_MAIN_PASS === '1') return true;
  if (env.GITHUB_REF === `refs/heads/${MAIN_BRANCH}`) return true;
  return branch === MAIN_BRANCH;
}

/**
 * May this invocation write COMMITTED semantic? The single-writer rule: only the
 * main-pass may. On the PR path the caller must stay static-only (compile) or
 * refuse the write (`put_comprehension`). Convenience wrapper that resolves the
 * branch + reads env for callers that don't already hold a `MainPassDeps`.
 */
export function committedSemanticAllowed(
  env: NodeJS.ProcessEnv = process.env,
  resolveBranch: (e: NodeJS.ProcessEnv) => string | null = (e) => resolveComprehensionBranch(e)
): boolean {
  return isMainPassContext({ branch: resolveBranch(env), env });
}
