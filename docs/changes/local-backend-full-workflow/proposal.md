---
title: Local backend runs the full harness workflow
status: draft
keywords: local-backend, pi-coding-agent, orchestrator, dispatch-template, workflow-gates, outcome-eval, agent-autonomy
---

# Local backend runs the full harness workflow

## Overview & Goals

Today the orchestrator renders **one** Claude-Code-shaped dispatch prompt (`harness.orchestrator.md`
lines 121–190, applied at `orchestrator.ts:1948`) that instructs the agent to run the workflow via
`/harness:*` **slash commands**. The `primary` backend is the `claude` CLI (`claude.ts:1` `spawn`),
which has those commands. The `local` backend (`pi.ts`) is a `pi-coding-agent` with only
`read/write/bash/grep/find` — no slash commands, no harness MCP tools — so it **cannot** run the
workflow and is deliberately scoped to `quick-fix`/`diagnostic` (`harness.orchestrator.md:27,44`).

**Goal:** let a `local`/`pi` dispatch run the _same_ rigor (brainstorm → plan → execute → **verify** →
**outcome-eval** → review → ship) — enforced such that **poor output halts, never ships** — so
autonomous local execution advances the strategy's **Agent Autonomy** KPI _without_ adding the
"cleanup tax" the strategy exists to remove (`STRATEGY.md#target-problem`, `#agent-autonomy`).

**Non-goals (YAGNI):** making a small local model _good enough_ to merge unattended (that's model-bound,
not wiring-bound — see Risks); porting the full slash-command runtime into pi; multi-agent local
orchestration.

## Decisions made

- **D1 — Success bar = enable the wiring with enforced gates (halt-not-ship).** The gates are the
  safety net; a local run that can't pass them halts to a human rather than shipping cleanup tax.
  Structured so offloading judgment to a stronger provider is a later config flip. _(Rationale: our
  own evidence — a bare local run produced an incomplete, non-compiling ESLint rule; even qwen3:32b
  stopped before verifying — says merge-quality full self-driving is model-bound. Gates convert that
  risk from "ships bad code" to "halts.")_
- **D2 — Hybrid enforcement: agent does the creative stages, the harness enforces the gates.** The
  local agent is guided through brainstorm/plan/implement by a template; the **orchestrator runs and
  blocks on** `verify` and `outcome-eval`, re-prompting on failure until they pass or it halts.
  _(Rationale: the local model's demonstrated failure mode is skipping steps — enforcement must not
  depend on the model's discipline.)_
- **D3 — A separate `harness.orchestrator.local.md` template**, selected by backend type at dispatch.
  It inlines the workflow _methodology_ (no slash commands) and directs the agent to invoke gates as
  **bash `harness <gate>`** CLI commands. _(Rationale: keeps the Claude template untouched; reuses the
  pi agent's existing bash capability + the harness CLI surface — `harness validate`,
  `harness skill run`, `outcome-eval`, etc.)_
- **D4 — Blocking gates = `verify` (typecheck+lint+test) and `outcome-eval`;** `review` is
  advisory→escalate; brainstorm/plan are methodology, not blocking. _(Rationale: a small local model's
  spec/brainstorm has low value; what actually protects quality is "compiles + tests pass + satisfies
  acceptance.")_
- **D5 — Gate provider defaults to local (SEL); a config flag routes the judgment gates
  (`outcome-eval`/`review`) to a stronger provider.** This is the C-enablement seam from D1.

## Technical design

### Backend-aware template selection

`orchestrator.ts` holds a single `promptTemplate: string` (`:248`, rendered `:1948`). Introduce a
resolver keyed by the **resolved backend type**:

- `resolvePromptTemplate(backendName): string` → returns the `local` template when the resolved
  backend `def.type` is `pi`/`local`, else the default. Templates are loaded once at construction
  (default from `harness.orchestrator.md`, local from `harness.orchestrator.local.md` when present;
  falls back to the default template if the local file is absent, preserving today's behavior).
- The render call at `:1948` uses the resolved template for the chosen backend of _this_ dispatch.

### `harness.orchestrator.local.md` (the local dispatch prompt)

Same frontmatter contract; a **bash-shaped** workflow body:

1. **Brainstorm/Plan (methodology, inline):** read conventions, enumerate the exact files (incl.
   registrations), state the acceptance check. No slash commands.
2. **Execute:** implement per the plan with file tools.
3. **Gate calls (bash):** run `harness verify` and, when a spec/acceptance exists,
   `harness outcome-eval`; the template tells the agent these are also enforced by the harness, so it
   must reach a green state.
4. **Ship** only after gates are green (branch/commit/push/PR), identical to the Claude template's
   step 7.

### Harness-enforced gate loop (the D2 enforcement)

Extend the local dispatch path so the orchestrator — not the agent's discipline — owns the gate:

- After the agent signals completion (or hits an intermediate checkpoint), the orchestrator runs the
  **blocking gates** (`verify`, `outcome-eval`) against the workspace diff via the existing CLI/gate
  surfaces.
- **Pass →** allow ship / mark complete. **Fail →** feed the failure back as a follow-up turn
  ("verify failed: …; fix and continue"), bounded by the existing `agent.maxTurns` / retry budget.
  On budget exhaustion, **halt to human** (reuse the `needs-human` escalation the retrospective path
  already emits, `orchestrator.ts:2397`).
- This composes with the **already-shipped post-diff retrospective** (`deriveRoutingRetrospectiveVerdict`)
  as a second, merge-level safety layer — no new review machinery.

### Gate-provider routing (the D5 seam)

The judgment gates resolve their `AnalysisProvider` through the same layer the triage report now uses
(`resolveTriageProvider` pattern / `buildAnalysisProviderForLayer`). Default = local SEL; a
`agent.routing.workflowGates: local | primary` flag (config-only) routes `outcome-eval`/`review` to a
stronger backend when set. Absent ⇒ local (byte-identical default).

## Integration Points

- **Entry Points:** new `harness.orchestrator.local.md` template file; `resolvePromptTemplate` in the
  orchestrator dispatch path; the harness-enforced gate loop on the local dispatch branch.
- **Registrations Required:** ship `templates/orchestrator/harness.orchestrator.local.md` alongside the
  existing template (so `harness init` scaffolds it); wire the template resolver at orchestrator
  construction. No barrel/skill-tier changes.
- **Documentation Updates:** `docs/guides/multi-backend-routing.md` (local now runs the full workflow,
  gated); a note in `harness.orchestrator.md` pointing at the local template; AGENTS.md orchestrator
  section.
- **Architectural Decisions:** **D2 (harness-enforced gates for local)** and **D3 (backend-specific
  dispatch template)** each warrant an ADR — they change the dispatch contract from "one template, agent
  self-drives" to "template-per-backend, harness enforces gates for the tool-limited backend."
- **Knowledge Impact:** concepts — _backend-shaped dispatch prompt_, _harness-enforced gate loop_,
  _gate-provider routing_; relationship — `local backend → runs → workflow (gated)`.

## Success Criteria

- SC1: A dispatch to a `local`/`pi` backend renders `harness.orchestrator.local.md` (not the Claude
  template); a dispatch to `primary` renders the default. Verified by a template-resolution unit test.
- SC2: The local template contains **no `/harness:` slash-command instructions** and instead invokes
  gates as bash `harness <gate>` — asserted by a template-lint test.
- SC3: When the local agent's output fails `verify`, the orchestrator re-prompts with the failure and
  does **not** allow ship; on retry-budget exhaustion it escalates `needs-human`. Verified by an
  orchestrator test with a stubbed failing→passing gate.
- SC4: A high-confidence `NOT_SATISFIED` `outcome-eval` verdict blocks ship on the local path (same
  authority as the Claude path). Verified by a stubbed-verdict test.
- SC5: Absent `harness.orchestrator.local.md`, local dispatch falls back to the default template
  (no regression). Verified by a fallback test.
- SC6: `agent.routing.workflowGates: primary` routes `outcome-eval` to the primary backend; absent ⇒
  local. Verified by a provider-resolution test.

## Implementation Order

- **Phase 1 — Backend-aware template + local template.** `resolvePromptTemplate`, ship
  `harness.orchestrator.local.md`, fallback-to-default. (SC1, SC2, SC5)
- **Phase 2 — Harness-enforced gate loop.** Run `verify`/`outcome-eval` on the local dispatch branch;
  re-prompt on fail; escalate on exhaustion; compose with the retrospective. (SC3, SC4)
- **Phase 3 — Gate-provider routing seam.** `workflowGates` config flag. (SC6)
- **Phase 4 — Docs + ADRs + validate.** Guides, ADRs for D2/D3, `harness validate`.

## Design revision (Phase 5) — real skills, not a paraphrase; autonomous brainstorming

Phases 1–4 shipped, but review surfaced that D3's local template **paraphrased the workflow
methodology inline** — a second, drifting source of truth ("pseudo skills"). This revision replaces
the paraphrase with the _real_ skills, delivered through a channel the pi agent already has.

- **D6 — The local agent runs the REAL skills via `harness skill run <name>`, not a paraphrase.**
  `harness skill run <name>` prints the verbatim `SKILL.md` (phase preamble + body) to stdout — the
  same content the Claude client injects via a `/harness:*` slash command — as a pure CLI read (no MCP
  server). Every core workflow skill (`harness-brainstorming/planning/execution/verification/code-review/…`)
  contains **zero `mcp__harness__` references** and drives the harness **CLI**, so bash + `skill run` is
  sufficient; **MCP wiring into pi is unnecessary (YAGNI).** The only pi-incompatibility — skills
  referencing each other as `/harness:X` — resolves the same way: `harness skill run harness-X`.
  _(Supersedes the "inline the methodology" half of D3. D3's other half — a backend-specific template
  selected by backend type — stands; the template is now a thin **indirection shim**, not a methodology
  restatement, which erases D3's "two templates to keep in sync" cost: methodology lives once, in the
  skills.)_
- **D7 — The local template is a ~40–60 line bootstrap shim.** It carries no methodology: it tells the
  agent it has no slash commands, gives the redirect rule (`/harness:X` → `harness skill run harness-X`),
  names the ordered entry sequence for a dispatch, and points at `harness skill list`. The gates remain
  ENFORCED by the orchestrator (Phase 2) regardless of how the agent obtains its instructions.
- **D8 — Autonomous brainstorming: the agent is the decider, at full rigor.** Brainstorming already
  computes a confidence-rated recommendation at every fork and then stops for the human. A new
  `harness skill run <name> --autonomous` flag prepends an **autonomous-decider preamble** (a
  `buildPreamble` section, so it re-anchors on _every_ stage's output — robust against a small model
  forgetting a once-read template) that flips only that one instruction: do the full analysis exactly as
  written (the ≥2-approaches gate, YAGNI, the persona council, soundness review all run), then **adopt
  your own recommendation, record the question + answer + rationale in the spec's "Decisions made," and
  continue** — self-approve the Phase-4 sign-off once soundness converges, proceed through the handoff.
  _(Roadmap triage upstream decides local-eligibility and pre-resolves trivial forks — a separate layer;
  brainstorming here still runs full rigor. The exercise is the value.)_
- **D9 — One safety valve, no mid-run human pause.** The two spots where the skill is most emphatic
  about human judgment — **strategy contradictions** ("never auto-resolve") and **any low-confidence
  fork** — are still decided by the agent and proceed, but are recorded as explicit **flags in the spec
  and surfaced in the PR body**, so the human's PR review (the existing merge gate) sees exactly what was
  decided and where confidence was low. Halt-not-ship still governs _code_ (the enforced gates); the
  flags govern _decisions_.

### Phase 5 success criteria

- SC7: `harness skill run <name> --autonomous` prepends the autonomous-decider preamble to the skill
  output; absent, output is byte-identical to today. Verified by a CLI unit test.
- SC8: The local template invokes `harness skill run … --autonomous` and contains **no inlined
  workflow methodology** (it is a shim, under a line budget, and teaches the `/harness:X` →
  `skill run harness-X` redirect). Verified by the updated SC2 template-lint test.

### Phase 5 implementation order

- **Phase 5 — skill-run indirection + autonomous brainstorming.** Add the `--autonomous`
  preamble+flag (SC7); rewrite `harness.orchestrator.local.md` (+ template copy) to the shim (SC8);
  update the SC2 lint test; ADR 0071 rationale → indirection shim; new ADR for D8/D9 (autonomous local
  decisions + PR-flag safety valve). Phases 2 (enforced gates) and 3 (provider seam) are untouched.
