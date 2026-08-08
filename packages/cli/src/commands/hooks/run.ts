import { Command } from 'commander';
import {
  parseCodexNotifyPayload,
  retrospectSession,
  retrospectLogLine,
} from '../../hooks/session-retrospect-core.js';

/**
 * PATH-resolvable entry for agent lifecycle hooks that cannot use a shell.
 *
 * Codex's `notify` key is a raw argv array with no shell and a CWD that is not
 * guaranteed to be the repo root, so it cannot use the `git rev-parse` shell
 * command the other agents use. Routing it through `harness hooks run
 * session-retrospect-codex` makes the generated `.codex/config.toml` line
 * machine-independent (no absolute path) and therefore committable.
 *
 * Every path is fail-soft (returns exit code 0, never throws): Codex ignores
 * notify exit codes and this is a log-only hook, so an unknown name, an
 * absent/malformed payload, disabled retrospection, or any thrown error must
 * never block or delay a turn.
 */

/** Handle the Codex notify payload: parse, delegate to the shared core, log. */
async function runCodexRetrospect(rawPayload: string | undefined): Promise<number> {
  const parsed = parseCodexNotifyPayload(rawPayload);
  if (!parsed) return 0;
  const result = await retrospectSession(parsed);
  const line = retrospectLogLine('session-retrospect-codex', result);
  if (line) process.stderr.write(line);
  return 0;
}

/**
 * Dispatch table of wired hook names. Only `session-retrospect-codex` is wired
 * today; the shape lets additional agent hook names be added without redesign.
 */
const HOOKS: Record<string, (rawPayload: string | undefined) => Promise<number>> = {
  'session-retrospect-codex': runCodexRetrospect,
};

/**
 * Run a bundled hook by name and return the intended exit code (always 0).
 * Never throws: an unknown name returns 0 (fail-soft, D4) and any error thrown
 * by a handler is swallowed after logging to stderr.
 */
export async function runHook(name: string, rawPayload: string | undefined): Promise<number> {
  try {
    // Guard with Object.hasOwn so inherited prototype names ('toString',
    // 'constructor', ...) do not resolve a handler off the prototype chain and
    // bypass the unknown-name → exit 0 fail-soft (D4).
    const handler = Object.hasOwn(HOOKS, name) ? HOOKS[name] : undefined;
    if (!handler) return 0;
    return await handler(rawPayload);
  } catch (err: unknown) {
    process.stderr.write(
      `[hooks run ${name}] Failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    return 0;
  }
}

export function createRunCommand(): Command {
  return new Command('run')
    .argument('<name>', 'Hook name to run (e.g. session-retrospect-codex)')
    .argument(
      '[payload]',
      'JSON payload delivered by the agent (Codex notify passes it as the trailing arg)'
    )
    .description(
      'Run a bundled agent lifecycle hook by name (PATH-resolvable entry for Codex notify)'
    )
    .action(async (name: string, payload: string | undefined) => {
      process.exit(await runHook(name, payload));
    });
}
