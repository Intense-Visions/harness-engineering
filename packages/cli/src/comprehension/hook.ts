/**
 * SF1.3 — the config gate for the OPT-IN git pre-commit comprehension hook.
 *
 * Decision (phase 5): keep the substrate fresh on the commit path via a git
 * PRE-COMMIT hook (not pre-push), so a source change and its refreshed
 * comprehension shard land in the SAME commit. The hook is:
 *  - OPT-IN — off unless `comprehension.hook: true` (default false), so adopters
 *    explicitly turn it on.
 *  - STATIC-ONLY — the hook command always passes `--static`, so it NEVER
 *    resolves a provider or calls an LLM on the commit path (SC4). This helper is
 *    a pure run/no-run gate and does not (and cannot) enable semantic.
 *  - NON-BLOCKING — a recompile failure must never block a commit (the hook wraps
 *    the call so a non-zero exit is swallowed).
 *
 * The helper lives in the CLI (not the shell hook) so the `.husky/pre-commit`
 * step stays dumb + POSIX-simple: it invokes `harness comprehend --changed
 * --static --stage --hook`, and the command itself no-ops (exit 0) when this
 * gate returns false.
 */

import { readComprehensionConfig } from './config';
import type { HarnessConfig } from '../config/schema';

/**
 * Should the pre-commit comprehension step run for this project? True only when
 * the hook is explicitly enabled AND storage is `committed` (a `cache`-mode unit
 * is git-ignored, so staging it into the commit is meaningless). Defaults to
 * false when the block (or whole config) is absent. Never throws.
 */
export function shouldRunComprehendHook(config?: HarnessConfig | null): boolean {
  const cconf = readComprehensionConfig(config);
  return cconf.hook && cconf.storage === 'committed';
}
