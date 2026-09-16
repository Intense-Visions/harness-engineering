/**
 * The env-driven remote-comprehension opt-in (harness-comprehension-serve consumer). Lives in
 * core so BOTH the cli (get_comprehension, gather_context) and the orchestrator (leaf prewarm)
 * resolve it identically — the orchestrator cannot import the cli, so a shared home is core.
 *
 * Deliberately env-driven, NOT the committed `harness.config.json`: the serve token is a
 * per-developer secret, and reading from the hosted vault (vs local/offline) is a per-developer /
 * per-environment choice, so a committed value would force it on everyone. Pure (reads a passed-in
 * env), no I/O.
 */

/** A resolved remote-comprehension opt-in. */
export interface RemoteComprehensionConfig {
  /** The hosted vault base URL (pnyon-core). */
  readonly baseUrl: string;
  /** The Outpost (UUID) whose comprehension to read. */
  readonly outpost: string;
  /** The identity-bound, read-only serve token (a PAT). */
  readonly token: string;
  /** Serve a remote unit with no local source (Mode B). Off unless explicitly enabled. */
  readonly trustRemote: boolean;
}

/**
 * Resolve the opt-in from the environment. Returns `undefined` (⇒ local behavior) unless
 * `HARNESS_COMPREHENSION_STORAGE=remote` AND the URL, Outpost, and token are all present
 * (fail-safe: an incomplete config never half-enables remote).
 */
export function resolveRemoteComprehension(
  env: Record<string, string | undefined> = process.env
): RemoteComprehensionConfig | undefined {
  if ((env.HARNESS_COMPREHENSION_STORAGE ?? '').trim().toLowerCase() !== 'remote') return undefined;
  const baseUrl = (env.HARNESS_COMPREHENSION_REMOTE_URL ?? '').trim();
  const outpost = (env.HARNESS_COMPREHENSION_OUTPOST ?? '').trim();
  const token = (env.PNYON_COMPREHENSION_SERVE_TOKEN ?? '').trim();
  if (baseUrl === '' || outpost === '' || token === '') return undefined;
  const trust = (env.HARNESS_COMPREHENSION_TRUST_REMOTE ?? '').trim().toLowerCase();
  return { baseUrl, outpost, token, trustRemote: trust === '1' || trust === 'true' };
}
