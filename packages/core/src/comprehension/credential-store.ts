/**
 * Read the global `pnyon login` credential — the harness comprehension consumer's side of the
 * PUBLISHED `~/.pnyon/credentials.json` contract.
 *
 * `pnyon login` writes the identity-bound, read-only `pnyon_cst_` serve token into
 * `~/.pnyon/credentials.json` under the flat key `comprehension-serve-token`, so every repo (and
 * every AI tool that shells out) can read hosted comprehension with NO per-repo `.env.local` /
 * `PNYON_COMPREHENSION_SERVE_TOKEN` plumbing. This module reads that same file + key.
 *
 * FAIL-SAFE (undefined), deliberately UNLIKE the pnyon CLI's fail-CLOSED read: a missing file,
 * malformed JSON, a non-object, a missing/empty key, or ANY read error returns `undefined` so the
 * consumer degrades to LOCAL comprehension. A bad global credential must never throw, crash, or
 * otherwise break the harness — the worst outcome is "no remote token", i.e. local behavior.
 *
 * The fs read and the home inputs are INJECTED (optional deps) so the reader is fully unit-testable
 * with no real `~/.pnyon`. NEVER logs the token.
 *
 * Lives in core (not the cli) so BOTH the cli tools and the orchestrator — which cannot import the
 * cli — resolve the shared global credential identically.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * The credential-map key the `pnyon_cst_` serve token is stored under — the PUBLISHED contract
 * `pnyon login` writes and this consumer reads. Do NOT change it: it is a cross-tool wire contract.
 */
export const SERVE_TOKEN_CREDENTIAL_KEY = 'comprehension-serve-token';

/** The credential file inside the `~/.pnyon` home directory. */
const CREDENTIALS_FILE = 'credentials.json';

/**
 * Injected inputs for {@link readPnyonServeToken}. All optional; production defaults read the real
 * filesystem and `os.homedir()`, but tests supply them so no real `~/.pnyon` is touched.
 */
export interface ReadPnyonServeTokenDeps {
  /** Read a UTF-8 file, returning `undefined` when it is absent/unreadable (never throws). */
  readFile?: (path: string) => string | undefined;
  /** The home directory (defaults to `os.homedir()`); the `~/.pnyon` fallback base. */
  homeDir?: string;
  /** The `$PNYON_HOME` override (defaults to `process.env.PNYON_HOME`); wins over `homeDir`. */
  pnyonHome?: string | undefined;
}

/** Default fs reader: reads UTF-8, swallowing any error into `undefined` (fail-safe). */
function defaultReadFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Resolve the `~/.pnyon` directory: `$PNYON_HOME` if set (mirrors the pnyon CLI), else
 * `<homedir>/.pnyon`.
 */
function resolvePnyonDir(deps: ReadPnyonServeTokenDeps): string {
  const pnyonHome = deps.pnyonHome !== undefined ? deps.pnyonHome : process.env.PNYON_HOME;
  if (pnyonHome !== undefined && pnyonHome.trim() !== '') return pnyonHome;
  const home = deps.homeDir !== undefined ? deps.homeDir : homedir();
  return join(home, '.pnyon');
}

/**
 * Read the `comprehension-serve-token` written by `pnyon login` from `~/.pnyon/credentials.json`.
 *
 * Returns the token string, or `undefined` when it cannot be read for ANY reason (absent file,
 * malformed JSON, non-object payload, missing or empty key, or a read error). Never throws — the
 * consumer must degrade to local comprehension, never crash on a bad global credential.
 */
export function readPnyonServeToken(deps: ReadPnyonServeTokenDeps = {}): string | undefined {
  const readFile = deps.readFile ?? defaultReadFile;
  try {
    const dir = resolvePnyonDir(deps);
    const raw = readFile(join(dir, CREDENTIALS_FILE));
    if (raw === undefined) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const token = (parsed as Record<string, unknown>)[SERVE_TOKEN_CREDENTIAL_KEY];
    if (typeof token !== 'string' || token.trim() === '') return undefined;
    return token;
  } catch {
    // Fail-safe: a malformed file, a throwing injected reader, or any other fault degrades to
    // "no global token" (⇒ local comprehension). Never propagate — never break the harness.
    return undefined;
  }
}
