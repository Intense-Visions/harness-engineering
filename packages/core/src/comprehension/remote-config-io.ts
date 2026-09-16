/**
 * The IMPURE sibling of `remote-config.ts`'s pure {@link resolveRemoteComprehension}.
 *
 * `resolveRemoteComprehension` is pure-by-design (reads only a passed-in env + an already-parsed
 * committed config block) so the cli and the orchestrator resolve the opt-in identically. This
 * wrapper adds the ONE piece of I/O the consumer needs: when the env has no
 * `PNYON_COMPREHENSION_SERVE_TOKEN`, fall back to the global token `pnyon login` wrote to
 * `~/.pnyon/credentials.json` (see {@link readPnyonServeToken}). This makes the hosted vault usable
 * with no per-repo `.env.local` plumbing.
 *
 * Serve-token precedence (highest first): env `PNYON_COMPREHENSION_SERVE_TOKEN` (explicit override)
 * → the global `~/.pnyon/credentials.json`. The env value ALWAYS wins — the file only fills a gap,
 * it never overrides a present env token. The credential read is fail-safe (never throws), so this
 * wrapper degrades to the pure env-only behavior on any credential fault.
 *
 * The committed `file` config block (the non-secret routing — enable/url/outpost/trust) is threaded
 * through UNCHANGED to the pure resolver; this wrapper only ever affects the serve token.
 *
 * Lives in core (not the cli) so the orchestrator — which cannot import the cli — shares it.
 */
import {
  resolveRemoteComprehension,
  type RemoteComprehensionConfig,
  type RemoteComprehensionFileConfig,
} from './remote-config';
import { readPnyonServeToken, type ReadPnyonServeTokenDeps } from './credential-store';

/**
 * Resolve the remote-comprehension opt-in, falling back to the global `pnyon login` serve token
 * when the env does not carry one.
 *
 * Delegates to the pure {@link resolveRemoteComprehension} — passing the committed `file` block
 * through unchanged — after (and only after) injecting a global token into a COPIED env when
 * `PNYON_COMPREHENSION_SERVE_TOKEN` is absent/empty. A present env token is left untouched (env
 * wins). The passed-in `env` is never mutated.
 */
export function resolveRemoteComprehensionWithGlobalToken(
  env: Record<string, string | undefined> = process.env,
  file?: RemoteComprehensionFileConfig,
  deps: ReadPnyonServeTokenDeps = {}
): RemoteComprehensionConfig | undefined {
  const envToken = (env.PNYON_COMPREHENSION_SERVE_TOKEN ?? '').trim();
  if (envToken !== '') return resolveRemoteComprehension(env, file);

  const globalToken = readPnyonServeToken(deps);
  if (globalToken === undefined) return resolveRemoteComprehension(env, file);

  // Fill the gap in a COPY — never mutate the caller's env (typically process.env). Thread `file`.
  return resolveRemoteComprehension({ ...env, PNYON_COMPREHENSION_SERVE_TOKEN: globalToken }, file);
}
