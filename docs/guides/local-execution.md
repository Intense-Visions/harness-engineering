# Local-Model Execution (Operator Guide)

Run autonomous **contained** engineering/maintenance tasks on **local models**, on-device, with no cloud calls — safely. This is the validated setup, operating rules, and task-fit envelope from an extended evaluation of local execution on this repo.

> **TL;DR.** For **contained** tasks (a new lint rule, a small helper, a focused config change, a well-repro'd bugfix, doc/test upkeep) the local pipeline is useful **and safe** today: the enforced gates mean it either produces acceptable work or blocks/retries/escalates — it **never silently ships broken or spec-violating code**. For **complex logic** or **lights-out high-volume autonomy**, it is not there yet (model-capability ceiling + local GPU limits) — escalate those to a stronger model or a human.

---

## Why it's safe even when the model is imperfect

The orchestrator enforces two gates **independently of the model**, after the staged workflow:

1. **Mechanical gate** — typecheck + lint + the full test suite of every touched package (no `--no-verify`).
2. **Spec-vs-diff outcome-eval** — a reasoner-as-judge compares the change to the spec; a high-confidence `NOT_SATISFIED` blocks.

A block re-dispatches with the failure threaded back; retry exhaustion halts to **needs-human**. So the open question is _throughput_ (how often it lands clean), never _safety_.

---

## The task-fit envelope — `local-eligible` triage checklist

Route a task to local execution only if **all** of these hold. Otherwise escalate to a stronger model or a human.

- [ ] **Single concern, contained blast radius** — one feature/fix in one area; not a cross-module refactor.
- [ ] **Clear, testable acceptance** — you can state what "done" looks like and it's checkable by tests.
- [ ] **Pattern to follow** — there's an existing example in the repo to mirror (a sibling rule, a similar handler).
- [ ] **Bounded new logic** — no non-trivial algorithm, subtle type/AST narrowing, or deep cross-file reasoning. (This is the hard ceiling: the local coder does simple `MemberExpression`-shaped logic well, but stalls on multi-form AST detection.)
- [ ] **Minimal collateral wiring** — if it needs fiddly multi-site registration (a barrel/index, several configs), first make that **auto-derived** (see "Reduce collateral surface"); a weak coder reliably fumbles precise multi-file edits.
- [ ] **Well-specified** — a short, concrete work item (the design stage produces a real spec, but a vague ask amplifies drift).

**Good fits:** new ESLint rule with a single AST pattern; a focused bugfix with a repro; a small utility + its test; adding a doc entry; a mechanical, pattern-following change.
**Escalate:** complex algorithms; type-system/AST subtlety; cross-cutting refactors; anything security-sensitive or architecture-defining.

---

## The validated configuration

Three roles, each on the model that suits it:

| Role         | Stage(s)                                             | Backend / model                                                 | Why                                                                                                                                          |
| ------------ | ---------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Coder**    | execution, verification                              | **Codex** driving **qwen3-coder:30b** (`reasoningEffort: none`) | Codex's edit + self-verify + retry loop converges where a bare tool-loop stalls; `none` is required (the model rejects a reasoning request). |
| **Reasoner** | design, planning, review (`cognitiveMode: thinking`) | **qwen3.6:27b**, reasoning ON                                   | Writes the spec/plan the coder builds against; the `<think>` trace helps design.                                                             |
| **Judge**    | settle-gate outcome-eval                             | **gpt-oss:20b** (fast, non-reasoning)                           | ~8s spec-vs-diff verdict; a reasoning model is unusable on `/v1`; more independent than the coder judging itself.                            |

The complete, copy-paste config lives at **`templates/orchestrator/harness.orchestrator.local.md`**. Key points:

- `routing.default: codex-exec` (fully-local); `routing.modes.thinking: reasoner`; `routing.intelligence.sel: judge`.
- Curated MCP tool allowlist (~a dozen lifecycle tools), not the full ~99-tool flood, which makes a local model over-explore.
- A staged `local-full-workflow` (design → plan → execute → verify → review) with the gates enforced at settle.
- `escalation.maxLocalStageRetries: 4`, then halt to needs-human.

---

## Operating rules (do these)

1. **Scope the queue.** The orchestrator picks every `planned`/`in-progress` row by Status. Point `tracker.filePath` at a **curated `local-eligible` queue** (e.g. `.harness/local-queue.roadmap.md`), not your whole roadmap. Add only tasks that pass the checklist above, and **name each row `local-<slug>`** — the staged `local-full-workflow` matches on the `local-` identifier prefix, so the prefix is what enrolls a task in the full design→…→review lifecycle.
2. **Gates on, always.** Never `--no-verify`. The gates are the safety layer.
3. **Fresh model server per session.** Long multi-hour runs degrade the local model server (model-swapping starves the coder → empty executions). `brew services restart ollama` (or equivalent) before a run; prefer **short supervised bursts** over lights-out all-day.
4. **Bound and escalate.** `maxLocalStageRetries: 3–5`, then needs-human (or, in the hybrid variant, hand off to the cloud backend). Don't grind for hours.
5. **Reduce collateral surface.** Where a task class needs fiddly multi-site edits, eliminate the edit via generation (see below) — it converts coin-flips into reliable passes.

### Reduce collateral surface (the highest-leverage reliability move)

The single biggest reliability win in the evaluation was making a required multi-site edit **unnecessary**: e.g. the ESLint rule **barrel is auto-generated** from the rule files (a rule's basename is its name, its default export is the rule), so adding a rule is a single self-contained file drop — no barrel edit to fumble. Apply the same principle wherever local tasks must touch a shared index/config/registry.

---

## Running it (this repo)

```bash
# 1. Fresh model server (avoids multi-hour degradation)
brew services restart ollama

# 2. Ensure the models are present
ollama list        # expect: qwen3-coder:30b, qwen3.6:27b, gpt-oss:20b

# 3. Launch the orchestrator against the local config + curated queue
node packages/cli/dist/bin/harness.js orchestrator run \
  --workflow templates/orchestrator/harness.orchestrator.local.md --headless
```

Supervise the run; each unit goes design → plan → execute → verify → review → gate → ship (a PR). On a block it retries with feedback; on exhaustion it halts to needs-human. (When dogfooding this repo, point the config's harness MCP server at the built dist — `node packages/cli/dist/bin/harness-mcp.js` — so it reflects local changes; adopters use the installed `harness-mcp`.)

---

## Hardware notes

64 GB works, but the reasoner + coder can't co-reside, so they swap — which is what degrades long runs. Two ways to remove that wall:

- **More VRAM** so both models stay resident.
- **Coder-only local** — drop the local reasoner and route design/judge to a cheap cloud call (or the hybrid backend), so nothing swaps.

On 64 GB strictly local: prefer short bursts + a fresh server restart per session.

---

## Hybrid variant (widens the envelope with ~zero extra work)

Add the cloud backend as an **escalation target**: local handles `local-eligible` tasks; anything classified complex (or that exhausts local retries) routes to the cloud backend instead of a human. You keep on-device economics for the bulk of small tasks and get frontier capability exactly where local stalls. It's a routing change, not new machinery: set `routing.default: primary` (or route only complex tiers to it) in the config.

> Not recommended: NVMe **weight-streaming** engines (running a frontier MoE from disk) for the execution loop — at ~0.5–7 tok/s they're 10–100× too slow for turn-heavy agentic coding. They may fit a rare, latency-tolerant single-shot call (a design decision, a judge verdict), not the loop.

---

## What the evaluation actually showed

- The pipeline mechanics, gates, and reasoner-as-judge are **sound and validated end-to-end** — a clean run produced a correct rule + matching test + appended doc, passed both gates (`SATISFIED`), and reached ship.
- Most early "local can't do this" turned out to be **harness bugs, not model limits** — each was fixed (stage deadlines, the codex reasoning request, the eval diff hiding new files / drowning in noise, process-group kill on abort, barrel auto-discovery, scratch-cruft handling).
- The residual walls are real but **specific**: (a) the coder's **capability ceiling** on complex logic, (b) **per-run tidiness variance** (mitigated by guardrails + surface reduction), and (c) **local GPU degradation** over multi-hour runs. None block _safe, scoped, supervised_ use today.

**Bottom line:** use it now for scoped, gated, supervised contained maintenance; escalate complex work; revisit lights-out autonomy when the executor and hardware improve.
