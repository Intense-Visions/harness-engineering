/**
 * Peer-model unload for the reasoner unstick advisory.
 *
 * On a single-GPU box the coder (codex's execution model) and the reasoner cannot both
 * be resident, so the unstick's reasoner call must swap the coder out. In isolation that
 * swap is fast (~30s), but IN A RUN the reasoner request is repeatedly starved past its
 * budget (Ollama serves one request at a time; the just-finished coder is still resident
 * and the swap contends) — observed cx4–cx7: the advisory timed out and was skipped every
 * time, so the escalation never reached the coder.
 *
 * Fix: right before the reasoner call, explicitly UNLOAD the coder from Ollama
 * (`/api/generate` with `keep_alive: 0`) so the GPU is free and the reasoner loads
 * cleanly with nothing to evict. Best-effort — codex reloads the coder on the next
 * dispatch. This helper resolves the (url, model) target from config; the caller fires
 * the request and swallows any error.
 */

/** Resolve the Ollama unload target — the coder model + the `/api/generate` URL. */
export function resolvePeerUnloadTarget(opts: {
  /** The reasoner (thinking) backend's OpenAI-compatible endpoint, e.g. `…:11434/v1`. */
  reasonerEndpoint?: string | undefined;
  /** The execution (routing.default) backend's model — the coder to unload. */
  executionModel?: string | string[] | undefined;
}): { url: string; model: string } | undefined {
  const { reasonerEndpoint, executionModel } = opts;
  if (reasonerEndpoint === undefined || reasonerEndpoint === '') return undefined;
  const model = Array.isArray(executionModel) ? executionModel[0] : executionModel;
  if (model === undefined || model === '') return undefined;
  const base = reasonerEndpoint.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  return { url: `${base}/api/generate`, model };
}

/** The slices of agent config the unload target is derived from (accepts `AgentConfig`). */
export interface PeerUnloadConfig {
  routing?: unknown;
  backends?: unknown;
}

/** Pick the first entry of a `string | string[]`-ish name field. */
function firstName(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

/** Read a string-valued property from an unknown object, else undefined. */
function strProp(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === 'object' && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

/** Read a backend def by name from an unknown `backends` map. */
function backend(backends: unknown, name: string | undefined): unknown {
  if (name === undefined || !backends || typeof backends !== 'object') return undefined;
  return (backends as Record<string, unknown>)[name];
}

/**
 * Navigate agent config → the unload target: the reasoner (thinking) backend supplies the
 * Ollama endpoint, the execution (routing.default) backend supplies the coder model.
 * Pure and defensive (routing/backends are `unknown`), so the orchestrator method stays a
 * thin fetch wrapper and this navigation is unit-tested.
 */
export function resolvePeerUnloadFromConfig(
  config: PeerUnloadConfig
): { url: string; model: string } | undefined {
  const routing =
    config.routing && typeof config.routing === 'object'
      ? (config.routing as Record<string, unknown>)
      : {};
  const modes =
    routing.modes && typeof routing.modes === 'object'
      ? (routing.modes as Record<string, unknown>)
      : {};
  const reasonerDef = backend(config.backends, firstName(modes.thinking));
  const reasonerEndpoint = strProp(reasonerDef, 'endpoint');
  const execDef = backend(config.backends, firstName(routing.default));
  const executionModel =
    execDef && typeof execDef === 'object' && 'model' in execDef
      ? (execDef as { model?: string | string[] }).model
      : undefined;
  return resolvePeerUnloadTarget({ reasonerEndpoint, executionModel });
}
