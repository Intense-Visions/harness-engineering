---
number: 0109
title: Effortless comprehension — agent-neutral local generation with token-free CI verification
date: 2026-08-28
status: accepted
tier: high
supersedes-framing:
  - 'up-front full-tree semantic backfill as the primary population path (ADR 0107 consequence)'
  - 'CI-side semantic generation requiring an adopter-provided API token'
relates:
  - '0106-claude-cli-fallback-analysis-provider-resolver'
  - '0107-comprehension-committed-git-versioned-substrate'
  - '0108-serve-time-hash-gate-sole-llm-free-correctness-authority'
---

## Context

ADR 0107 committed comprehension units to git and ADR 0108 made the serve-time
hash gate the sole LLM-free correctness authority. What 0107 deliberately left as
a follow-up was **population**: how a fully-compiled substrate (semantic included)
stays fresh as code changes, without a human running `harness comprehend`
periodically. Dogfooding surfaced the gap concretely:

- The opt-in pre-commit hook is **static-only by design** (it always passes
  `--static`, never resolves a provider — see `hook.ts`). So an ordinary
  edit-commit that touches a module **overwrites** its rich `semantic: present`
  unit with a `semantic: absent` one, and that downgrade rides into the PR. On a
  repo whose `main` is 100% `semantic: present`, ordinary edits silently erode the
  substrate, healed only by out-of-band "semantic pass" commits.

Three hard constraints shape the fix, and each kills an obvious-but-wrong answer:

1. **Effortless — no periodic manual commands.** Rules out "run `comprehend --all`
   on a schedule." Generation must be triggered by the act of changing code.
2. **In the PR — committed, reviewed, landed with the change.** Rules out a local
   ephemeral cache (last-considered `storage: cache` overlay): the user wants the
   compiled artifact reviewed in the diff, not hidden per-developer.
3. **No adopter API token.** Many adopters have only **subscription** licenses
   (Claude Pro/Max/Team, or the equivalent for another agent) and cannot add a
   metered API key to CI due to cost. Rules out **CI-side semantic generation** —
   CI has neither a subscription session nor a key. And critically, **the harness
   is not Claude-only**: adopters drive it with Claude Code, Cursor, Codex, or
   Gemini CLI, each with its own auth. Any generation path that assumes a specific
   provider or a Claude model id is wrong (the `generate-semantic` seam is already
   written provider-neutral — it refuses to force a Claude model onto a non-Claude
   provider — and that discipline must hold end to end).

The naive committed-substrate design also has a **collision** worry: if every PR
regenerates the shards of the modules it touches, parallel PRs churn the same
`_module.md` files. That worry is real but bounded (addressed under Decision §4).

## Decision

**Generate comprehension where an authenticated agent already runs — the
developer's machine, on whatever subscription/auth that agent already has — and
make CI a token-free verifier, not a generator. Keep every generation path
agent- and provider-neutral, and make the committed shard byte-stable so parallel
PRs do not collide.**

### 1. Primary path — the in-session agent authors semantic on use (agent-neutral)

The common case: the change is already flowing through a coding agent (Claude
Code, Cursor, Codex, Gemini CLI). That agent is a capable model, already reading
the module to make the change. So it authors the module's semantic unit itself and
stages the shard — no second process, no API token, riding the subscription
session already open.

Mechanically: `get_comprehension` on a miss/stale unit returns the **static** unit
plus a `semanticNeeded` signal; a companion **`put_comprehension`** tool accepts
the agent-authored `{ summary, invariants }`, validates it in TypeScript against
the existing `semanticResponseSchema` (authority-in-TS — the model's text is never
trusted raw), and writes the shard. This seam is **agent-neutral by
construction**: it is a shared MCP tool, so any MCP-speaking agent fills it on its
own auth; the tool never resolves a provider and never names a model.

This is the most quota-efficient path: emitting a summary is marginal extra output
for an agent already reading the module, versus a fresh N-call provider fan-out.

### 2. Backstop — provider-neutral local resolution for edits made outside a session

A human editing in an IDE, or a plain `git commit`, will not trigger §1. For those,
an **opt-in** local recompile resolves a provider through the **provider-neutral**
D8 resolver (ADR 0106), extended to treat _any_ authenticated local agent as a
provider — Anthropic key, OpenAI/Codex, Gemini, a local OpenAI-compatible `/v1`
endpoint (Ollama), or the respective logged-in CLI (subscription auth, no key) —
degrading to `null` (static-only) when none resolve. No provider is ever forced to
a foreign model id. This path costs latency + real subscription quota, so it is
opt-in, not the default.

### 3. CI — token-free verification, never generation

CI enforces that local generation happened, using **only frontmatter + hash reads,
no LLM, no token**:

- **Static freshness** — each changed module's `sourceHash` matches its source
  (the existing `comprehend --check`, deterministic).
- **No semantic regression** — no shard flips `semantic: present → absent` versus
  the merge base (a frontmatter-field read).

A red check means "your session/backstop did not refresh this — regenerate and
push," not "CI needs a key." The fix always lives on the developer's
subscription. This makes the regression guard **token-free** and adopter-safe: it
only _blocks a downgrade_, it never _generates_.

### 4. Byte-stable shards + a regenerate-on-conflict merge driver

Two mechanical properties shrink the collision surface to nothing that needs a
human:

- **Byte-stable output.** A shard must be a pure function of its module's source
  at a hash — no wall-clock. `compiledAt` is dropped from the committed surface
  (git history already records _when_ a shard landed; `sourceHash` records _what_
  it was compiled from). Two PRs that make the _same_ change then produce
  _byte-identical_ shards and never conflict. (This directly removes the observed
  failure where two branches building an identical change differed only by a
  wall-clock `compiledAt`.)
- **Merge driver.** `.gitattributes` maps `**/_module.md` to a `comprehension`
  merge driver that resolves any residual conflict by **regenerating from the
  merged source** rather than hand-merging — sound because the shard is 100%
  derived. Developers never resolve a comprehension merge marker.

Crucially, comprehension conflicts are a **strict subset** of conflicts that
already exist: two PRs collide on a shard only if they edit the same module's
source, which already collides at the code level. The substrate adds no new
collision axis.

## Consequences

- **Effortless for the common path, honest at the boundary.** Modules touched in a
  coding-agent session heal forward automatically into the PR, on the agent's own
  auth, no token. A pure-human edit on a machine with _no_ model degrades to a
  static-only shard (the regression guard blocks _losing_ semantic, but never
  _forces new_ semantic where nothing can produce it for free) — and heals the
  moment any session next touches that module.
- **Adopter-portable across agents and license models.** No API token is required
  anywhere; no Claude assumption is baked in. A subscription-only, Cursor/Codex/
  Gemini adopter is fully served. A default adopter (`hook: false`, no CI key) sees
  no new behavior. New config reuses the existing `comprehension` block / `ci`
  enum rather than adding top-level keys that would warn on an older installed CLI.
- **CI stays free and deterministic.** The verify gate is frontmatter/hash only —
  no LLM, no flakiness, no spend — so it can be a required check without imposing
  cost on adopters.
- **Collisions become non-events.** Byte-stability eliminates same-change
  conflicts; the merge driver auto-resolves same-module residuals by regeneration.
- **`storage: cache` is retained as an opt-out, not the default.** Adopters who
  prefer disposable, un-reviewed units keep that path (ADR 0107 §1); the default
  remains committed-and-reviewed, which this ADR makes sustainable.
- **`compiledAt` becomes vestigial and migrates lazily.** The field is dropped on
  the next recompile of each module (a one-time one-line diff per module as it is
  touched); no mass regeneration is required, and the parser already tolerates its
  absence.

## Implementation slices

1. **Byte-stable shards** — drop `compiledAt` from the emitted surface; make it
   optional and forward-tolerant. Independently valuable; unblocks the rest.
2. **`put_comprehension` write-back seam** + `get_comprehension` `semanticNeeded`
   signal — the agent-neutral in-session authoring path.
3. **Provider-neutral backstop resolver** — generalize ADR 0106's resolver to any
   authenticated local agent / endpoint; wire the opt-in local recompile.
4. **Token-free CI verify** — extend `comprehend --check` with the
   `present → absent` regression assertion; keep it LLM-free.
5. **Merge driver** — `.gitattributes` + a `harness`-installed `comprehension`
   git merge driver that regenerates on conflict.
