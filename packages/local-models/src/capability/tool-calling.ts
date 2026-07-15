// packages/local-models/src/capability/tool-calling.ts
//
// Determine whether a local model can drive an AGENTIC build — i.e. it emits native OpenAI
// `tool_calls` rather than rendering the call as text (which the coding-agent SDK cannot parse).
//
// Two-stage, cheap-first:
//   1. FREE capability gate — Ollama `/api/show` returns a `capabilities` array (derived from the
//      model's GGUF/HF chat template). No `tools` there ⇒ definitely can't ⇒ `false`, no inference.
//   2. GROUND TRUTH — one `/v1/chat/completions` call with a tool schema. `capabilities:['tools']`
//      is NECESSARY but not SUFFICIENT (e.g. qwen2.5-coder:7b claims it yet emits the call as
//      TEXT), so we confirm the response actually carries native `tool_calls`.
//
// Any transport/parse failure ⇒ `undefined` (unknown) so the caller fails OPEN (an unknown model
// is not excluded from build routing; only a confirmed `false` is). The single tool-call FORMAT
// probe is deterministic — unlike the multi-turn agentic loop — so one call is a reliable signal.

/** Inputs for {@link probeToolCalling}. */
export interface ProbeToolCallingDeps {
  /** Ollama model id, e.g. `qwen3:32b`. */
  model: string;
  /** The OpenAI-compatible base URL, e.g. `http://127.0.0.1:11434/v1`. */
  baseUrl: string;
  /** Bearer token for the endpoint (Ollama ignores the value). */
  apiKey?: string;
  /** Injectable fetch for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** A minimal tool schema the model can answer with a single `tool_calls` entry. */
const PROBE_TOOL = [
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file on disk',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
];

/**
 * Probe whether `model` emits native OpenAI `tool_calls`. Returns `true` (confirmed),
 * `false` (no `tools` capability, or tools-capable but emits text), or `undefined` (unknown —
 * probe unreachable/failed). Never throws.
 */
export async function probeToolCalling(deps: ProbeToolCallingDeps): Promise<boolean | undefined> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const v1 = deps.baseUrl.replace(/\/$/, '');
  const root = v1.replace(/\/v1$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(deps.apiKey !== undefined ? { Authorization: `Bearer ${deps.apiKey}` } : {}),
  };
  try {
    // 1. Free capability gate.
    const showRes = await fetchImpl(`${root}/api/show`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: deps.model }),
    });
    if (!showRes.ok) return undefined;
    const show = (await showRes.json()) as { capabilities?: unknown };
    const caps = Array.isArray(show.capabilities) ? show.capabilities : [];
    if (!caps.includes('tools')) return false; // definitely can't — free negative, no inference

    // 2. Ground truth: does it actually emit native tool_calls?
    const chatRes = await fetchImpl(`${v1}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: deps.model,
        messages: [
          {
            role: 'user',
            content: "Create a file named hello.txt containing 'hi'. Use the write_file tool.",
          },
        ],
        tools: PROBE_TOOL,
        stream: false,
        max_tokens: 512,
      }),
    });
    if (!chatRes.ok) return undefined;
    const chat = (await chatRes.json()) as {
      choices?: Array<{ message?: { tool_calls?: unknown } }>;
    };
    const toolCalls = chat.choices?.[0]?.message?.tool_calls;
    return Array.isArray(toolCalls) && toolCalls.length > 0;
  } catch {
    return undefined; // unknown ⇒ fail-open (caller does not exclude unknowns)
  }
}
