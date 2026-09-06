/**
 * Canonical External-ID (`github:owner/repo#NNN`) parse/build helpers.
 *
 * Single source of truth for the format: both roadmap GitHub adapters
 * (`adapters/github-issues.ts`, `tracker/adapters/github-http.ts`) and the
 * auto-done reconciler edges import these instead of inlining the regex, so the
 * `github:owner/repo#NNN` shape can never drift between the sync and reconcile
 * paths. Re-exported from the package barrel.
 *
 * An External-ID is untrusted input: it arrives verbatim from `docs/roadmap.d/*.md`
 * shard content, which is fleet-written and PR-contributable, and every consumer
 * interpolates the parsed captures into an `api.github.com` path on a request that
 * carries the operator's token. The format is therefore validated twice — once
 * here by `parseExternalId`, and again at each sink by `githubRepoPath` (#1843).
 */

/**
 * The one regex that defines the External-ID format.
 *
 * `owner` and `repo` are held to GitHub's own name grammar rather than
 * "anything up to the next delimiter". The permissive `([^/]+)\/([^#]+)` this
 * replaces admitted `/`, `..` and `?`, so a crafted External-ID could choose the
 * path of a token-bearing request: `github:x/../../../user/emails?#1` resolved to
 * `POST https://api.github.com/user/emails`, the dot segments collapsing under
 * WHATWG URL normalization and the trailing `?` truncating the intended
 * `/issues/<n>/assignees` suffix into a query string (#1843, sibling of #1842).
 *
 * Owner: 1-39 characters, alphanumeric or hyphen, must start alphanumeric.
 * Repo: 1-100 characters, alphanumeric or `.`, `_`, `-`.
 *
 * Tightening this is deliberately BREAKING — an External-ID that GitHub itself
 * could never have issued is now rejected rather than parsed. That trade was made
 * knowingly: the alternative is leaving an authenticated path-choice primitive in
 * the format authority named by ADR 0051.
 */
const EXTERNAL_ID_RE = /^github:([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})#(\d+)$/;

/**
 * `.` and `..` have to be rejected separately from the character classes above:
 * they are made of characters a legitimate repo name may contain, and
 * `encodeURIComponent` leaves `.` untouched, so a bare dot segment survives both
 * the regex and the encoding and still collapses under URL normalization. This
 * was found the hard way in #1842.
 */
function isDotSegment(segment: string): boolean {
  return segment === '.' || segment === '..';
}

/**
 * Parse `github:owner/repo#42` into `{ owner, repo, number }`.
 * Returns null if the format is invalid.
 */
export function parseExternalId(
  externalId: string
): { owner: string; repo: string; number: number } | null {
  const match = externalId.match(EXTERNAL_ID_RE);
  if (!match) return null;
  const owner = match[1]!;
  const repo = match[2]!;
  if (isDotSegment(owner) || isDotSegment(repo)) return null;
  return { owner, repo, number: parseInt(match[3]!, 10) };
}

/**
 * Percent-encode an `owner`/`repo` pair for interpolation into an
 * `api.github.com` path, returning null when either segment could steer the
 * request somewhere other than the repository it names.
 *
 * This is the second, independent defence for #1843 and it deliberately never
 * consults `EXTERNAL_ID_RE`: call it at the sink, immediately before building the
 * URL, so that loosening the regex again cannot silently re-open the traversal.
 * The explicit rejections and the encoding are both load-bearing — the rejections
 * catch a regressed regex, and the encoding neutralises anything the rejections
 * do not anticipate.
 */
export function githubRepoPath(owner: string, repo: string): string | null {
  for (const segment of [owner, repo]) {
    if (segment.length === 0) return null;
    if (isDotSegment(segment)) return null;
    // `/` would append path segments; `?` and `#` would truncate the intended
    // suffix into a query string or fragment; whitespace is never a valid name.
    if (/[/?#\s]/.test(segment)) return null;
  }
  try {
    return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  } catch {
    // encodeURIComponent throws URIError on a lone surrogate. Treating that as an
    // unusable External-ID matches every caller's existing "invalid id" contract.
    return null;
  }
}

/** Build the External-ID string `github:owner/repo#number` from parts. */
export function buildExternalId(owner: string, repo: string, number: number): string {
  return `github:${owner}/${repo}#${number}`;
}
