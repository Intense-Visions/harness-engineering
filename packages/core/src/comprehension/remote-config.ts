/**
 * The remote-comprehension opt-in (harness-comprehension-serve consumer). Lives in core so BOTH the
 * cli (get_comprehension, gather_context) and the orchestrator (leaf prewarm) resolve it
 * identically — the orchestrator cannot import the cli, so a shared home is core. Pure (reads a
 * passed-in env + an optional already-parsed config block), no I/O.
 *
 * Config precedence — the NON-SECRET routing (enable/url/outpost/trustRemote) may be committed to
 * `harness.config.json` (`comprehension.remote`) so a team shares it; the ENV overrides each field
 * per developer/machine. The SERVE TOKEN is the one exception: it is read ONLY from the environment
 * (`PNYON_COMPREHENSION_SERVE_TOKEN`) and is never a config field, so a secret is never committed.
 */

/**
 * The default hosted vault base URL — pnyon's production comprehension service. Used when neither
 * the env nor the committed config supplies a URL, so adopters only have to name an Outpost + a
 * serve token (the URL is the one value nobody can guess). Override to point at another host.
 */
export const DEFAULT_REMOTE_URL = 'https://core.pnyon.com';

/** A fully-resolved remote-comprehension opt-in. */
export interface RemoteComprehensionConfig {
  /** The hosted vault base URL (defaults to {@link DEFAULT_REMOTE_URL} when unset). */
  readonly baseUrl: string;
  /** The Outpost (UUID) whose comprehension to read. */
  readonly outpost: string;
  /** The identity-bound, read-only serve token (a PAT) — ALWAYS from the env, never committed. */
  readonly token: string;
  /** Serve a remote unit with no local source (Mode B). Off unless explicitly enabled. */
  readonly trustRemote: boolean;
}

/**
 * The COMMITTED, non-secret half of the config — the shape of `harness.config.json`'s
 * `comprehension.remote` block. Deliberately NO token field (the token is env-only).
 */
export interface RemoteComprehensionFileConfig {
  /** Turn remote-read on for the repo (still gated by a serve token in the env). */
  readonly enabled?: boolean;
  /** The hosted vault base URL (defaults to {@link DEFAULT_REMOTE_URL}). */
  readonly url?: string;
  /** The Outpost (UUID) whose comprehension to read. */
  readonly outpost?: string;
  /** Serve a remote unit with no local source (Mode B). */
  readonly trustRemote?: boolean;
}

/**
 * Defensively narrow an arbitrary parsed value (e.g. `JSON.parse(harness.config.json).comprehension
 * .remote`) to a {@link RemoteComprehensionFileConfig}, keeping only well-typed known fields. A
 * `token` (or any unknown key) is dropped — the token can never enter via committed config. Returns
 * `undefined` for a non-object. Lets a non-cli caller (the orchestrator) read the block without the
 * cli's Zod schema.
 */
export function normalizeRemoteFileConfig(raw: unknown): RemoteComprehensionFileConfig | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const out: {
    enabled?: boolean;
    url?: string;
    outpost?: string;
    trustRemote?: boolean;
  } = {};
  if (typeof r.enabled === 'boolean') out.enabled = r.enabled;
  if (typeof r.url === 'string') out.url = r.url;
  if (typeof r.outpost === 'string') out.outpost = r.outpost;
  if (typeof r.trustRemote === 'boolean') out.trustRemote = r.trustRemote;
  return out;
}

/** Whether remote-read is enabled: env `STORAGE` wins ('remote' on, any other value off); when the
 * env is unset, the committed `enabled` flag decides. */
function isRemoteEnabled(
  env: Record<string, string | undefined>,
  file?: RemoteComprehensionFileConfig
): boolean {
  const envStorage = (env.HARNESS_COMPREHENSION_STORAGE ?? '').trim().toLowerCase();
  return envStorage === '' ? file?.enabled === true : envStorage === 'remote';
}

/** Resolve `trustRemote`: env wins ('1'/'true' → on, any other value → off); env unset ⇒ committed. */
function resolveTrust(
  env: Record<string, string | undefined>,
  file?: RemoteComprehensionFileConfig
): boolean {
  const envTrust = (env.HARNESS_COMPREHENSION_TRUST_REMOTE ?? '').trim().toLowerCase();
  return envTrust === '' ? file?.trustRemote === true : envTrust === '1' || envTrust === 'true';
}

/**
 * Resolve the opt-in by merging the (optional) committed config block with the environment. Returns
 * `undefined` (⇒ local behavior) unless remote is enabled AND an Outpost + serve token resolve. Env
 * overrides committed config per field; the base URL defaults to {@link DEFAULT_REMOTE_URL}; the
 * token is env-only. (Fail-safe: an incomplete config never half-enables remote — a repo can commit
 * `enabled`+`outpost`, and it stays LOCAL for anyone without a token, including CI.)
 */
export function resolveRemoteComprehension(
  env: Record<string, string | undefined> = process.env,
  file?: RemoteComprehensionFileConfig
): RemoteComprehensionConfig | undefined {
  if (!isRemoteEnabled(env, file)) return undefined;
  const baseUrl =
    (env.HARNESS_COMPREHENSION_REMOTE_URL ?? '').trim() ||
    (file?.url ?? '').trim() ||
    DEFAULT_REMOTE_URL;
  const outpost = (env.HARNESS_COMPREHENSION_OUTPOST ?? '').trim() || (file?.outpost ?? '').trim();
  const token = (env.PNYON_COMPREHENSION_SERVE_TOKEN ?? '').trim();
  if (outpost === '' || token === '') return undefined;
  return { baseUrl, outpost, token, trustRemote: resolveTrust(env, file) };
}
