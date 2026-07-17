---
title: Autosize context/output for the OllamaBackend via native /api/chat
status: draft
keywords: ollama-backend, num_ctx, api-chat, context-window, autosizing, think, keep-alive, local-dispatch
---

# Autosize context/output for the OllamaBackend via native /api/chat

## Overview & Goals

The `OllamaBackend` drives the model over Ollama's OpenAI-compatible `/v1/chat/completions`. That endpoint
**ignores** `options.num_ctx` (empirically verified 2026-07-16: a `/v1` request loads the model at its full
declared context — 262144 for `qwen3-coder:30b` — regardless of any `num_ctx`; a pre-warmed smaller instance
is force-reloaded to max on the first `/v1` call). Loading a 256K context on a 30B model burns enormous
KV-cache memory — fine on a big machine, but it OOMs/thrashes on constrained hardware, and there is no way
to size it down. Native `/api/chat` **honors** `options.num_ctx` (loads at exactly the requested size).

**Goal:** make local dispatch robust across hardware by migrating the OllamaBackend's model call from
`/v1/chat/completions` to native `/api/chat`, and **autosizing `num_ctx`** from the model's declared max +
available hardware (never blindly load 256K). Fold in the two sub-items the roadmap attached: proper
reasoning-off via native `think:false` (retiring the `/no_think` prompt hack), and an output budget
(`num_predict`). Keep the agentic tool-loop behavior identical.

**Non-goals (YAGNI):** streaming; changing model _selection_ (that's the ranker items); a precise KV-cache
memory model (a conservative tiered heuristic is enough); migrating the `/v1/models` resolution probe
(unrelated to `num_ctx`; leave it).

## Decisions made

- **D1 — Migrate the model call to native `/api/chat`.** Derive the native base by stripping a trailing
  `/v1` from `endpoint` and POST to `${base}/api/chat`. Body:
  `{ model, messages, tools, stream:false, think, keep_alive, options:{ num_ctx, num_predict? } }`.
  _(Rationale: the only endpoint that honors `num_ctx`, `think`, and output budget.)_
- **D2 — Normalize native ⇄ internal at the transport boundary; the tool loop is unchanged.** Native
  `/api/chat` returns `message.tool_calls[].function.arguments` as an **object** (not a JSON string) and
  provides no tool-call `id`. In `callModel`, normalize the native response into the existing internal
  `OllamaChatResponse`/`ToolCall` shape: `JSON.stringify` each tool-call's arguments, synthesize a stable
  `id` (e.g. `call_<n>`), map `prompt_eval_count`/`eval_count` → `usage.prompt_tokens`/`completion_tokens`.
  When building the request, convert stored assistant `tool_calls` (arguments-as-string) back to native
  (arguments-as-object) and emit `tool` messages in native shape (`{ role:'tool', content, tool_name }`).
  `runTurn`/`dispatchToolCall`/`runToolCalls` stay byte-identical. _(Rationale: contain the format change to
  one function; protect the reviewed tool loop.)_
- **D3 — Autosize `num_ctx = min(modelMax, hardwareCap)` with an explicit override.** Config gains
  `numCtx?: number` (explicit override) and `maxContextTokens?: number` (a hardware-derived cap injected by
  the orchestrator wiring — the backend does NOT import `local-models`; the seam keeps layering clean).
  Resolution at `startSession` (cached on the session): if `numCtx` set ⇒ use it; else query Ollama
  `/api/show` (POST `{model}`) for `model_info["<arch>.context_length"]` (the first key ending
  `.context_length`), `modelMax`; `num_ctx = min(modelMax ?? DEFAULT_AUTO_CTX, maxContextTokens ??
DEFAULT_AUTO_CTX)`. `DEFAULT_AUTO_CTX = 16384` (comfortably fits a large tool schema + multi-turn without
  loading 256K). A `/api/show` failure falls back to `DEFAULT_AUTO_CTX`. _(Rationale: conservative,
  hardware-aware, overridable; never blindly 256K.)_
- **D4 — Output budget `num_predict`, optional.** Config `numPredict?: number`; unset ⇒ omit (model
  default). _(Rationale: bound runaway generation when an operator wants to; default unchanged.)_
- **D5 — `disableReasoning` uses native `think:false`.** Send `think: false` in the `/api/chat` body when
  `disableReasoning` is set (and `think: true` otherwise is omitted/left default). Retire the ` /no_think`
  user-message append (native `think` is the reliable, proven off-switch — `/v1` ignored it; `/api/chat`
  honors it). _(Rationale: the correct mechanism; removes a hack.)_
- **D6 — `keep_alive` to avoid reload thrash.** Send `keep_alive` (config `keepAlive?: string`, default
  `'10m'`) so the model stays loaded at the sized `num_ctx` across turns. _(Rationale: a reload per turn at
  a large context is slow; keep the sized instance warm.)_

## Technical design

### Config (ollama.ts `OllamaBackendConfig` + types `OllamaBackendDef` + `ollama` Zod variant)

Add `numCtx?`, `maxContextTokens?`, `numPredict?`, `keepAlive?` (all optional; conditional-spread). The
orchestrator's backend construction (`backend-factory.ts` / wherever ollama backends are built) populates
`maxContextTokens` from `local-models` `detectHardware()` via a conservative memory→context heuristic (a
small pure helper; a generous machine ⇒ a high cap so `modelMax` wins, a small machine ⇒ a low cap).

### Transport (`callModel` + a new `resolveNumCtx` + response normalizer)

- `resolveNumCtx(session)` once at `startSession`: as D3; store `session.numCtx`.
- `callModel`: POST `${nativeBase}/api/chat` with the D1 body (messages converted to native by a
  `toNativeMessages` helper; `think`/`options`/`keep_alive` set). Parse via `fromNativeResponse` →
  internal shape (D2). Preserve the existing AbortController/timeout/heartbeat wiring.
- Keep `resolveModelName` and the `/v1/models` array-probe untouched (resolution only).

### Reasoning

Remove the ` /no_think` append in `runTurn`; rely on `think:false` (D5). Keep `disableReasoning` config
name/semantics; only the mechanism changes.

### Tests

The existing ollama tests mock `fetch` against `/chat/completions` with OpenAI-shaped responses. Migrate the
mocks to `/api/chat` + native response shape (`{message:{content,tool_calls:[{function:{name,arguments:{…}}}]},
prompt_eval_count,eval_count,done}`) and assert the request body carries `options.num_ctx`, `think` (when
disabled), and `keep_alive`. Add: `resolveNumCtx` picks `min(modelMax, cap)` / honors `numCtx` override /
falls back on `/api/show` failure; native tool-call normalization (object args → string, synthetic id);
usage mapping. Every SC from the MCP features (tool aggregation, curation, heartbeat, graceful skip) must
stay green under the new transport.

## Success Criteria

- SC1: `callModel` POSTs `${base}/api/chat` (not `/v1/chat/completions`) with `options.num_ctx` set and, when
  `disableReasoning`, `think:false`; `keep_alive` present. Assert on the captured request body.
- SC2: native response (object tool-call args, no id) is normalized so `runTurn` drives the tool loop
  unchanged — a native `tool_calls` turn executes the tool and appends the `tool` message. Existing
  tool-loop tests pass against native mocks.
- SC3: `resolveNumCtx` = `numCtx` override when set; else `min(modelMax from /api/show, maxContextTokens ??
DEFAULT_AUTO_CTX)`; `/api/show` failure ⇒ `DEFAULT_AUTO_CTX`. Unit tests at each branch.
- SC4: usage totals come from `prompt_eval_count`/`eval_count`; token accounting across turns unchanged.
- SC5: the ` /no_think` append is gone and `think:false` rides the `/api/chat` body when `disableReasoning`.
- SC6: all pre-existing OllamaBackend + MCP tests (aggregation, curation, heartbeat, graceful skip, TASK_COMPLETE
  completion) pass against the native transport — behavior identical except the wire format + `num_ctx`.

## Implementation Order

- **Phase 1 — Native transport.** `/api/chat` in `callModel` + native⇄internal normalization (D1/D2) +
  usage mapping; migrate existing mocks; SC1/SC2/SC4/SC6.
- **Phase 2 — Autosizing + reasoning + budget.** `resolveNumCtx` (D3) + `maxContextTokens` seam +
  `detectHardware` wiring in the factory; `think:false` (D5) retiring `/no_think`; `num_predict`/`keep_alive`
  (D4/D6); SC1/SC3/SC5. Docs: `multi-backend-routing.md` (num_ctx autosizing, native transport) + a note that
  `disableReasoning` now uses native `think`.
