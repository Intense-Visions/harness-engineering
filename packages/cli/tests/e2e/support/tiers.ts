// Shared E2E helper: the unified tier gates (ADR 0111).
//
// Before this, every gated test invented its own env var (HARNESS_E2E,
// HARNESS_E2E_LIVE, HARNESS_E2E_GITHUB). These predicates are the single vocabulary
// for `describe.skipIf(...)` so tier membership is consistent and greppable.
import { spawnSync } from 'node:child_process';
import { HAS_HARNESS_BIN } from './harness-cli';

/** A fake executable on PATH is only reliable on posix; win32 uses the static path. */
export const POSIX = process.platform !== 'win32';

/** Tier B (gated live) is opt-in via `HARNESS_E2E_LIVE=1`. */
export function isTierBEnabled(): boolean {
  return process.env.HARNESS_E2E_LIVE === '1';
}

/** Whether a real `claude` binary is discoverable on PATH (Tier B precondition). */
export function hasClaudeCli(): boolean {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], {
    encoding: 'utf8',
  });
  return probe.status === 0;
}

/** Whether an LLM credential is present (any provider-neutral form). */
export function hasProviderCredential(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.HARNESS_ANALYSIS_BASE_URL);
}

/**
 * `describe.skipIf` predicate for **Tier A/C** suites: skip only when the built
 * binary is absent (they are smoke tests over the artifact, not the source).
 */
export const skipUnlessBin = !HAS_HARNESS_BIN;

/**
 * `describe.skipIf` predicate for **Tier A** suites that drop a fake executable on
 * PATH: additionally require posix.
 */
export const skipUnlessBinPosix = !HAS_HARNESS_BIN || !POSIX;

/**
 * `describe.skipIf` predicate for **Tier B** (gated live) suites: run only when
 * the binary exists AND `HARNESS_E2E_LIVE=1`. The nightly lane sets the flag;
 * PRs and contributor machines skip. A separate reachability assertion in
 * `main-health.yml` guards against the suite silently never running.
 */
export const skipTierB = !HAS_HARNESS_BIN || !isTierBEnabled();
