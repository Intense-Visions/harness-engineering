// packages/local-models/src/capability/agentic.ts
//
// The ONLY I/O in the agentic-suitability dimension (D5). The pure ranker consumes
// `toolCalling` + `measuredAgenticLatencyMs` as candidate INPUTS; this thin, opt-in
// helper is how the recommender fills them in one call. It runs the deterministic
// #833 tool-calling probe (`probeToolCalling`) and one TIMED `/v1/chat/completions`
// agentic call, returning the two signals the ranker's `scoreAgentic` composes.
//
// Fail-open by construction: any transport/parse failure ⇒ the corresponding signal
// is left `undefined` (never throws). Undefined tool-calling → the ranker fails open
// (eligible + flagged); undefined latency → the ranker falls back to the speed
// estimate. So a probe outage degrades gracefully rather than excluding a model.
//
// @see docs/changes/local-model-agentic-suitability/proposal.md (D5, SC6)

import { probeToolCalling } from './tool-calling.js';

/** Inputs for {@link probeAgenticSignals}. Mirrors {@link probeToolCalling}'s deps. */
export interface ProbeAgenticDeps {
  /** Ollama model id, e.g. `qwen3:32b`. */
  model: string;
  /** The OpenAI-compatible base URL, e.g. `http://127.0.0.1:11434/v1`. */
  baseUrl: string;
  /** Bearer token for the endpoint (Ollama ignores the value). */
  apiKey?: string;
  /** Injectable fetch for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable clock (ms) for deterministic latency tests. Defaults to `performance.now`. */
  now?: () => number;
}

/** The two agentic signals a candidate carries into the ranker. Both optional (fail-open). */
export interface AgenticSignals {
  /** Tool-calling capability from the #833 probe; `undefined` when unprobed/unreachable. */
  toolCalling?: boolean;
  /** Measured turn latency (ms) for the timed agentic call; `undefined` on transport error. */
  measuredAgenticLatencyMs?: number;
}

/**
 * A representative single-turn agentic prompt. We only need a real turn's worth of
 * generation to time the model's responsiveness; the CONTENT of the reply is
 * irrelevant here (tool-calling correctness is the separate `probeToolCalling`
 * probe's job), so a small `max_tokens` keeps the probe cheap.
 */
const AGENTIC_PROMPT =
  'You are an autonomous coding agent. Briefly plan the first step to add a ' +
  'unit test for a function named `add`, then stop.';

/**
 * Time one agentic `/v1/chat/completions` turn. Returns the elapsed ms, or
 * `undefined` on any transport/non-2xx failure (fail-open). Never throws.
 */
async function measureAgenticLatency(deps: ProbeAgenticDeps): Promise<number | undefined> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const clock = deps.now ?? (() => performance.now());
  const v1 = deps.baseUrl.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(deps.apiKey !== undefined ? { Authorization: `Bearer ${deps.apiKey}` } : {}),
  };
  const started = clock();
  try {
    const res = await fetchImpl(`${v1}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: deps.model,
        messages: [{ role: 'user', content: AGENTIC_PROMPT }],
        stream: false,
        max_tokens: 256,
      }),
    });
    if (!res.ok) return undefined;
    // Drain the body so the turn is fully completed before we stop the clock —
    // time-to-full-response is the interactive-loop cost the ranker gates on.
    await res.json();
    return Math.max(0, clock() - started);
  } catch {
    return undefined; // transport error ⇒ unmeasured ⇒ ranker falls back to the estimate
  }
}

/**
 * Probe a model's agentic signals: does it emit native `tool_calls`, and how long
 * does a real agentic turn take? Runs the deterministic tool-calling probe and a
 * timed agentic call, each independently fail-open. NEVER throws — a fully failed
 * probe returns `{ toolCalling: undefined, measuredAgenticLatencyMs: undefined }`,
 * which the ranker treats as fail-open (eligible + flagged, latency estimated).
 */
export async function probeAgenticSignals(deps: ProbeAgenticDeps): Promise<AgenticSignals> {
  const toolCallingDeps = {
    model: deps.model,
    baseUrl: deps.baseUrl,
    ...(deps.apiKey !== undefined ? { apiKey: deps.apiKey } : {}),
    ...(deps.fetchImpl !== undefined ? { fetchImpl: deps.fetchImpl } : {}),
  };

  // Independent probes: even if one throws internally it's caught, but run them
  // sequentially so a shared local backend isn't hit with two concurrent turns.
  const toolCalling = await probeToolCalling(toolCallingDeps).catch(() => undefined);
  const measuredAgenticLatencyMs = await measureAgenticLatency(deps);

  // exactOptionalPropertyTypes: conditional-spread, never assign `undefined`.
  return {
    ...(toolCalling !== undefined ? { toolCalling } : {}),
    ...(measuredAgenticLatencyMs !== undefined ? { measuredAgenticLatencyMs } : {}),
  };
}
