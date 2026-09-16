/**
 * Discover PUBLIC pnyon Outposts (proposal `public-outpost-directory`). A contributor who wants to
 * read a project's hosted comprehension needs its Outpost id for `HARNESS_COMPREHENSION_OUTPOST`;
 * this fetches the public directory (`GET /public-outposts`) so they can find it instead of being
 * handed a UUID out of band.
 *
 * Pure over an injected `fetch` (default `globalThis.fetch`). Exposes only public metadata (id +
 * name + knowledge count — never comprehension content). Never logs or embeds the token beyond the
 * Authorization header; error messages carry a status/kind only, never the token.
 */

/** One public Outpost as the directory returns it — metadata only. */
export interface PublicOutpost {
  /** The Outpost id — the value to put in `HARNESS_COMPREHENSION_OUTPOST`. */
  readonly outpostId: string;
  /** The human-readable name, when the owner set one. */
  readonly name?: string;
  /** How many comprehended snippets the Outpost holds, when > 0. */
  readonly knowledgeCount?: number;
}

/** Inputs for {@link fetchPublicOutposts}: the pnyon-core base URL + a serve token (a PAT). */
export interface FetchPublicOutpostsConfig {
  /** The hosted vault base URL (pnyon-core), e.g. `https://pnyon-core.fly.dev`. */
  readonly baseUrl: string;
  /** An identity-bound serve token (`pnyon_cst_…`) — the endpoint also accepts the service token. */
  readonly token: string;
  /** Injected fetch (tests). Defaults to `globalThis.fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

/** One raw directory entry, before validation. */
interface RawOutpost {
  readonly outpostId?: unknown;
  readonly name?: unknown;
  readonly knowledgeCount?: unknown;
}

/** Narrow one raw entry to a {@link PublicOutpost}, or `null` when it lacks a usable id. */
function parseOutpost(raw: RawOutpost): PublicOutpost | null {
  if (typeof raw.outpostId !== 'string' || raw.outpostId === '') return null;
  return {
    outpostId: raw.outpostId,
    ...(typeof raw.name === 'string' && raw.name !== '' ? { name: raw.name } : {}),
    ...(typeof raw.knowledgeCount === 'number' ? { knowledgeCount: raw.knowledgeCount } : {}),
  };
}

/**
 * GET the public-Outpost directory. Returns the parsed list on 200; throws a status/kind-only Error
 * (never the token) on a network failure, a non-2xx, or an unparseable body.
 */
export async function fetchPublicOutposts(
  config: FetchPublicOutpostsConfig
): Promise<readonly PublicOutpost[]> {
  const doFetch = config.fetch ?? globalThis.fetch;
  const url = `${config.baseUrl.replace(/\/+$/, '')}/public-outposts`;
  let res: Response;
  try {
    res = await doFetch(url, { headers: { authorization: `Bearer ${config.token}` } });
  } catch {
    throw new Error('public-outposts request failed (network error)');
  }
  if (!res.ok) {
    throw new Error(`public-outposts request failed (HTTP ${res.status})`);
  }
  let body: { outposts?: unknown };
  try {
    body = (await res.json()) as { outposts?: unknown };
  } catch {
    throw new Error('public-outposts response was unparseable');
  }
  const rows = Array.isArray(body.outposts) ? (body.outposts as RawOutpost[]) : [];
  return rows.map(parseOutpost).filter((o): o is PublicOutpost => o !== null);
}
