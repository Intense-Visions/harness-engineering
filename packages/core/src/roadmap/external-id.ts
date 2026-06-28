/**
 * Canonical External-ID (`github:owner/repo#NNN`) parse/build helpers.
 *
 * Single source of truth for the format: both roadmap GitHub adapters
 * (`adapters/github-issues.ts`, `tracker/adapters/github-http.ts`) and the
 * auto-done reconciler edges import these instead of inlining the regex, so the
 * `github:owner/repo#NNN` shape can never drift between the sync and reconcile
 * paths. Re-exported from the package barrel.
 */

/** The one regex that defines the External-ID format. */
const EXTERNAL_ID_RE = /^github:([^/]+)\/([^#]+)#(\d+)$/;

/**
 * Parse `github:owner/repo#42` into `{ owner, repo, number }`.
 * Returns null if the format is invalid.
 */
export function parseExternalId(
  externalId: string
): { owner: string; repo: string; number: number } | null {
  const match = externalId.match(EXTERNAL_ID_RE);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]!, number: parseInt(match[3]!, 10) };
}

/** Build the External-ID string `github:owner/repo#number` from parts. */
export function buildExternalId(owner: string, repo: string, number: number): string {
  return `github:${owner}/${repo}#${number}`;
}
