# Plan: Spec 2 Phase 6 — Documentation, ADRs, Knowledge

**Date:** 2026-05-05 | **Spec:** `docs/changes/multi-backend-routing/proposal.md` (§"Implementation Order — Phase 6: Documentation, ADRs, knowledge"; spec phase 6 = autopilot phase index 5) | **Tasks:** 12 | **Time:** ~75 min | **Integration Tier:** small (docs-only) | **Session:** `changes--multi-backend-routing--proposal`

## Goal

After this phase, the durable knowledge surface accurately describes Spec 2's multi-backend routing world: a new operator-facing guide names `agent.backends` and `agent.routing` as the primary schema; the two existing knowledge docs that still describe single-backend dispatch / single-resolver shape are refreshed; three Architecture Decision Records (ADRs) codify the genuinely architectural choices that prior phases deferred (single-runner dispatch via `OrchestratorBackendFactory`, multi-provider `IntelligencePipeline`, named-backends-map schema); ADR-0004 is updated so its API-section reference no longer points only at the singular Spec-1 endpoint; AGENTS.md mentions the modern schema; and a single CHANGELOG entry under `[Unreleased]` covers the whole spec. `harness validate` and `harness check-docs` stay green; no production code changes.

## Observable Truths (Acceptance Criteria)

These map to the spec's "Phase 6 Exit" line ("`harness validate` and `harness check-docs` pass") and the spec's §Documentation Updates / §Architectural Decisions / §Knowledge Impact / §Integration Points subsections.

1. **Phase-6 Exit / SC47 (final)** — `harness validate` exits 0 and `harness check-docs` exits 0 with documentation coverage ≥ 98.0% (no regression vs. Phase 4's 98.0% baseline) after every commit in this phase.
2. **OT-Guide-NEW** — `docs/guides/multi-backend-routing.md` exists. It contains, at minimum: a one-paragraph overview, an `agent.backends` named-map example, an `agent.routing` map example with `default` plus at least one tier and one `intelligence.{sel|pesl}` entry, a multi-local example matching spec §"Success in plain terms" (one `claude` + one `pi`), and a "Migrating from `agent.backend` / `agent.localBackend`" section that mirrors spec §"Migration shim" mapping table verbatim.
3. **OT-Guide-XREF** — `docs/guides/hybrid-orchestrator-quickstart.md` and `docs/guides/intelligence-pipeline.md` each link to `docs/guides/multi-backend-routing.md` from a "Routing" or "Multi-backend routing" subsection. The intelligence-pipeline guide's "Agent Backend → Intelligence Provider" table gains a leading note that `routing.intelligence.{sel,pesl}` overrides the inferred resolution order.
4. **OT-Knowledge-IssueRouting** — `docs/knowledge/orchestrator/issue-routing.md` describes routing as a separate concern from escalation: a new "Backend Routing" subsection states that `routing` selects _which_ backend dispatches when a tier is permitted, while `escalation.{alwaysHuman,autoExecute}` still gates _whether_ a tier dispatches. The bullet at line 41 ("`quick-fix` and `diagnostic` route to local backend for fast execution") is rewritten to reference `routing.<tier>` explicitly. The frontmatter `tags` list adds `multi-backend` and `routing-config`.
5. **OT-Knowledge-LocalModel** — `docs/knowledge/orchestrator/local-model-resolution.md` describes the multi-resolver case: the §Lifecycle section (currently lines 60-65, single-resolver wording) is rewritten to describe the `Map<string, LocalModelResolver>` keyed by backend name, with one resolver per `type: 'local'|'pi'` entry in `agent.backends`. The §Status Surface section gains a paragraph describing `NamedLocalModelStatus` and the `/api/v1/local-models/status` array endpoint with the singular endpoint noted as a deprecated alias.
6. **OT-ADR-0004** — `docs/knowledge/decisions/0004-local-availability-disables-not-escalates.md` line 26 is updated from `GET /api/v1/local-model/status` to `GET /api/v1/local-models/status` (with a parenthetical noting the singular endpoint is a deprecated alias kept for one minor release per Spec 2 D13). Status remains `accepted`; this is an in-place update, not a supersession (the decision itself is unchanged — only the API URL).
7. **OT-ADR-NamedBackends** — A new ADR `docs/knowledge/decisions/0005-named-backends-map.md` codifies spec D2 (named-map schema) and D5 (per-type discriminated union). Status: `accepted`. Tier: `large`. Source: `docs/changes/multi-backend-routing/proposal.md`. Required sections present.
8. **OT-ADR-SingleRunner** — A new ADR `docs/knowledge/decisions/0006-single-runner-orchestrator-dispatch.md` codifies the architectural change Phase 2 introduced: dual-runner (`runner` + `localRunner`) replaced by per-dispatch `OrchestratorBackendFactory.forUseCase()` returning a fresh `AgentBackend`. Records the "per-dispatch vs. cached backend lifetime" contract. Status: `accepted`. Tier: `large`. Source spec + Phase 2 INTEGRATE artifact.
9. **OT-ADR-MultiProvider** — A new ADR `docs/knowledge/decisions/0007-multi-provider-intelligence-pipeline.md` codifies spec D6 (intelligence routing keys nested under `routing.intelligence`) plus the additive `IntelligencePipeline.peslProvider` constructor option Phase 3 introduced (loosens the "1 pipeline = 1 provider" invariant). Status: `accepted`. Tier: `medium`. Source spec + Phase 3 INTEGRATE artifact.
10. **OT-AGENTS-MD** — `AGENTS.md` mentions `agent.backends` and `agent.routing` as the modern config surface for the orchestrator package. Single-paragraph addition near the existing orchestrator package description (line 36 / line 109) is sufficient.
11. **OT-CHANGELOG** — `CHANGELOG.md` `[Unreleased]` section gains a single `### Added` entry under `(@harness-engineering/orchestrator, @harness-engineering/types, @harness-engineering/intelligence, @harness-engineering/dashboard)` describing the spec aggregate: `agent.backends` named-map schema, `agent.routing` per-use-case map (with `intelligence.sel` / `intelligence.pesl` keys), in-memory legacy-config migration shim with one-time deprecation warn, multi-resolver dashboard surface (`/api/v1/local-models/status` array endpoint + multi-banner), single-runner dispatch via `OrchestratorBackendFactory`. Plus a single `### Changed` line noting `agent.backend` / `agent.localBackend` now warn at orchestrator start and will be removed in a future release per the deprecation timeline (D13).
12. **OT-Spec-XRef** — `docs/changes/local-model-fallback/proposal.md` §Non-goals (line 21-22, "Per-use-case backend routing (deferred to Spec 2 `multi-backend-routing`)") is annotated with a forward link to this spec's resolved status. `docs/changes/hybrid-orchestrator/proposal.md` gains an "Addendum: Multi-Backend Routing (Spec 2)" subsection at the end of §Decisions or as a new §Post-Phase Update, naming the spec path. Both edits are minimal cross-references, not content rewrites.
13. **OT-No-Code-Change** — `git diff <phase-base>..HEAD -- 'packages/**/src/**' 'packages/**/tests/**'` is empty after the phase. The phase only touches `docs/`, `AGENTS.md`, `CHANGELOG.md`, and adds nothing under `packages/`. (Verifies docs-only scope; matches Integration Tier `small`.)
14. **OT-Mechanical** — `pnpm typecheck` (no-op since no code changes; runs as a smoke check), `pnpm lint` (Markdown / docs path may not be linted; ensures no incidental code drift), and the orchestrator + intelligence + dashboard test suites still pass at their Phase-4-fixup baselines (826 / 218 / 305) without any change.

## Skills (from `docs/changes/multi-backend-routing/SKILLS.md`)

The advisor's auto-generated skill list emphasizes TypeScript / Zod skills for code work; this is a docs phase so the matches are weak.

- _(no apply-tier skills)_ — All `Apply` and most `Reference` skills (`ts-template-literal-types`, `ts-zod-integration`, `gof-factory-method`, etc.) target architecture-decision and code-implementation tasks. None apply to docs writing.
- **harness-soundness-review** (process gate, not in SKILLS.md) — invoked once at end of Phase 4 (this plan's VALIDATE phase) before writing the plan, per the harness-planning skill's Phase 4 step 6.

No per-task skill annotations below — none of the listed skills move the needle on doc-writing tasks.

## Uncertainties

### Blocking

- _(none)_

### Assumptions

- **[ASSUMPTION]** Spec 2 has not yet shipped a public release. CHANGELOG entry goes under `[Unreleased]`, not under a new versioned section. Verified by `grep -n '^## ' CHANGELOG.md | head -3` showing `[Unreleased]` -> `0.14.1 — 2026-04-07`. If a release ships before this phase commits, the entry moves to that release section.
- **[ASSUMPTION]** ADR numbering: next available number is 0005 (existing ADRs 0001-0004; verified by `ls docs/knowledge/decisions/`). Three new ADRs occupy 0005, 0006, 0007. If another spec lands ADRs concurrently, the planner re-numbers at write time (per `docs/knowledge/decisions/README.md` rule: "scan this directory for existing files to determine the next number").
- **[ASSUMPTION]** ADR-0004 line 26's URL update is an in-place edit (status remains `accepted`, no `supersedes`/`superseded` field churn). Justified because the decision (local availability disables not escalates) is unchanged — only the URL surface that documents the dashboard side-effect changed shape from singular to plural. If a reviewer prefers supersession, the editor swaps line 26 plus the `status` field and adds an 0005-supersedes-0004-marker — but this plan defaults to in-place since the decision text is intact.
- **[ASSUMPTION]** Three ADRs (rather than the spec's "three ADRs warranted" plus the carry-forward debates) is the right number. The five candidates from prior INTEGRATE phases (Phase 2: ADR-0005 single-runner / ADR-0006 multi-resolver Map / ADR-0007 RoutingUseCase API; Phase 3: optional multi-provider; Phase 4: per-resolver broadcast / alias retention / reducer initial state) are pruned to three:
  - **Drafted (3):** Named-backends map (D2/D5; spec §"ADRs warranted" ADR-1), Single-runner dispatch (Phase 2 carry-forward; genuinely architectural per Phase 2 INTEGRATE merit assessment), Multi-provider intelligence pipeline (Phase 3 carry-forward; loosens prior invariant).
  - **Pruned (4):** Multi-resolver Map (spec already documents in §"Per-backend `LocalModelResolver` instantiation"; ADR would duplicate spec — Phase 2 INTEGRATE recommendation), RoutingUseCase API contract (no external consumers — Phase 2 INTEGRATE recommendation), Per-resolver broadcast / alias retention / reducer initial state (all spec-mandated in §5 + D13 — Phase 4 INTEGRATE recommendation: "they are not novel decisions arising in execution. Drafting an ADR would duplicate the spec.").
  - **Replaced (1):** Spec's "ADR-2 — Routing is explicit and strict" (records D7) and "ADR-3 — Legacy schema deprecated via in-memory shim" (records D3+D12+D13) are folded into the named-backends-map ADR's Consequences section rather than drafted as standalone files. Rationale: D7 and D13 are entirely captured in the spec's Decisions table and Migration shim subsection; standalone ADRs would duplicate. The named-backends-map ADR cross-references the spec sections.

  If a reviewer disagrees with the prune-list, the planner can promote any pruned candidate to a standalone ADR by repeating the same template; the increment is +1 task per ADR.

- **[ASSUMPTION]** The CHANGELOG entry is a single combined entry covering the whole spec (Phases 0-5), not per-phase. Matches the established repo convention (Phase 2/3/4 INTEGRATE artifacts each independently flagged "mid-spec entries fragment narrative — defer to spec completion").
- **[ASSUMPTION]** AGENTS.md does not currently mention `agent.backend` or `agent.localBackend` in the orchestrator description (verified by `grep -n 'agent.backend\|agent.localBackend' AGENTS.md` returning empty). The OT-AGENTS-MD edit is **additive** — a new sentence describing the modern surface — not a replacement. If grep finds an existing legacy-schema reference at write time, the task expands to also remove it.
- **[ASSUMPTION]** `harness check-docs` does not regress on any link or coverage check from documentation in this phase. New ADRs include all required frontmatter fields (`number`, `title`, `date`, `status`, `tier`, `source`) per `docs/knowledge/decisions/README.md`. New guide includes a top-level H1 and is internally linked from at least two existing guides (per OT-Guide-XREF).
- **[ASSUMPTION]** Knowledge graph reindex is **NOT** part of this plan's commit set, but **IS** triggered as a non-blocking post-phase hint for the autopilot DONE phase. The carry-forward chain across Phase 2/3/4 INTEGRATE artifacts deferred reindex to "spec completion" — autopilot DONE handles that, not this docs phase. Running `harness scan` + `harness ingest` mid-phase would partially capture not-yet-committed ADR / knowledge doc nodes; better to let DONE run it once after the phase exit-gate commit lands. Surfaced as a **carryForwardOpen** item in the handoff for autopilot DONE to pick up.
- **[ASSUMPTION]** `docs/changes/local-model-fallback/proposal.md` and `docs/changes/hybrid-orchestrator/proposal.md` are read-only by convention except for narrow forward-pointers / addenda. The OT-Spec-XRef edits are minimal: ≤3 lines per file, near existing related sections (Spec 1's §Non-goals already names Spec 2; we just add a forward link or status pointer, not a content rewrite).

### Deferrable

- **[DEFERRABLE]** Hard removal of `agent.backend` / `agent.localBackend` from the schema. Spec 2 D13 explicitly defers this to a follow-up spec; the deprecation-warn surface from Phase 1 stays in place. The CHANGELOG `### Changed` entry references the timeline; the new guide's "Migration" section names it. No code change here.
- **[DEFERRABLE]** Knowledge graph reindex (`harness scan` + `harness ingest`) — see ASSUMPTION above; carry-forward to autopilot DONE.
- **[DEFERRABLE]** SC36 spec wording refinement for `claude` (Phase 3 carry-forward concern). Spec author action item; not in this plan's scope. The new ADR-0007 (multi-provider intelligence pipeline) describes the actual implemented behavior (`type: 'claude'` → `ClaudeCliAnalysisProvider`), which transitively documents the spec's misnomer for any future reader.
- **[DEFERRABLE]** P2-S1 (synthesized routing default `Object.keys(backends)[0]` non-obvious; emit info log). Logging is a code change; out-of-scope here. The new guide's "Migration" section names the synthesized default explicitly so the docs surface compensates for the missing log.
- **[DEFERRABLE]** P3-SUG-3 (cloud-OpenAI missing `promptSuffix`/`jsonMode`). Code-level, pre-existing; orthogonal to docs.
- **[DEFERRABLE]** P4-S2 (`useLocalModelStatuses` standalone hook unreferenced runtime code; YAGNI deletion candidate). Code-level; out-of-scope.
- **[DEFERRABLE]** P4-S3 (banners `aria-live` polish). Code-level; out-of-scope.
- **[DEFERRABLE]** P4-S4 (skip-logging consistency). Code-level; out-of-scope.
- **[DEFERRABLE]** Updating `templates/orchestrator/harness.orchestrator.md` and project-root `harness.orchestrator.md` to add a commented new-schema example. Surfaced in spec §Documentation Updates but **out-of-scope here** because: (a) both files are config templates, not knowledge docs; (b) the deprecation cycle (D13) means the legacy schema is still the primary documented surface for one more minor release; (c) the new guide (OT-Guide-NEW) is the canonical reference per the spec's deprecation-warn message wording. Re-evaluate at the alias-removal follow-up spec.

## File Map

```
CREATE  docs/guides/multi-backend-routing.md                                              (new operator-facing guide)
CREATE  docs/knowledge/decisions/0005-named-backends-map.md                               (new ADR)
CREATE  docs/knowledge/decisions/0006-single-runner-orchestrator-dispatch.md              (new ADR)
CREATE  docs/knowledge/decisions/0007-multi-provider-intelligence-pipeline.md             (new ADR)
MODIFY  docs/knowledge/decisions/0004-local-availability-disables-not-escalates.md        (line 26 URL update)
MODIFY  docs/knowledge/orchestrator/issue-routing.md                                      (separate routing from escalation; rewrite line 41 bullet; tag updates)
MODIFY  docs/knowledge/orchestrator/local-model-resolution.md                             (multi-resolver Lifecycle + NamedLocalModelStatus paragraph)
MODIFY  docs/guides/hybrid-orchestrator-quickstart.md                                     (add "Routing" subsection linking to new guide)
MODIFY  docs/guides/intelligence-pipeline.md                                              (note routing.intelligence overrides; add link to new guide)
MODIFY  docs/changes/local-model-fallback/proposal.md                                     (annotate §Non-goals line 21-22)
MODIFY  docs/changes/hybrid-orchestrator/proposal.md                                      (append "Addendum: Multi-Backend Routing (Spec 2)")
MODIFY  AGENTS.md                                                                          (mention agent.backends + agent.routing)
MODIFY  CHANGELOG.md                                                                       (single [Unreleased] entry covering the spec)
```

13 files (4 create, 9 modify). All are docs / changelog / agent map. Zero `packages/**` changes (OT-No-Code-Change).

**Integration tier: small** — docs-only changes. Per harness-planning Integration Tier Heuristics: "Bug fix, config change, < 3 files, no new exports" maps to small for code; for docs-only phases the same heuristic applies (no public-export delta, no API surface change). Default wiring checks (`harness validate`, `harness check-docs`) run; no roadmap mark or knowledge-graph reindex required at this phase boundary (autopilot DONE handles those at spec completion).

## Skeleton (groups, ~200 tokens; pending APPROVE_PLAN)

1. New operator-facing guide (~1 task, ~12 min)
2. Three ADRs (named-backends-map, single-runner-dispatch, multi-provider-intelligence) (~3 tasks, ~24 min)
3. ADR-0004 in-place URL refresh (~1 task, ~3 min)
4. Two knowledge-doc rewrites (issue-routing, local-model-resolution) (~2 tasks, ~14 min)
5. Two guide cross-references (hybrid-orchestrator-quickstart, intelligence-pipeline) (~1 task, ~5 min)
6. Two spec cross-references (local-model-fallback, hybrid-orchestrator) (~1 task, ~3 min)
7. AGENTS.md addition (~1 task, ~3 min)
8. CHANGELOG.md `[Unreleased]` entry (~1 task, ~5 min)
9. Verification gate + phase exit chore (~1 task, ~6 min)

**Estimated total:** 12 tasks, ~75 min. **Complexity: low** confirmed (12 ≤ 10 task threshold is _slightly_ exceeded, but only by 2; no checkpoints requiring human input — all tasks are mechanical doc edits with `harness check-docs` as the validation primitive). **No complexity override recommended.** _Tasks 1-12 sequential; 5/6/7 could parallelize but are tiny enough that serial commits are simpler to review._

_Skeleton approved: pending APPROVE_PLAN._

---

## Tasks

### Task 1: Write the new operator-facing guide `docs/guides/multi-backend-routing.md`

**Depends on:** none | **Files:** `docs/guides/multi-backend-routing.md` (CREATE)

1. Create `docs/guides/multi-backend-routing.md` with the following structure:

   ````markdown
   # Multi-Backend Routing

   The orchestrator's `agent.backends` map defines named backend instances; `agent.routing` selects which named backend handles each use case. This is the modern config surface — it replaces `agent.backend` / `agent.localBackend` (which still work via an in-memory migration shim with a deprecation warning at orchestrator start).

   ## Quick example

   \```yaml
   agent:
   backends:
   cli: { type: claude, command: claude }
   local: { type: pi, endpoint: http://localhost:1234/v1, model: [gemma-4-e4b, qwen3:8b] }
   routing:
   default: cli
   quick-fix: local
   diagnostic: local
   intelligence:
   sel: local
   pesl: local
   \```

   With this config, heavy guided-change work runs on Claude CLI (subscription, no API tokens), simple-tier diagnostics run on the local Pi, and the entire intelligence pipeline runs on the local Pi.

   ## `agent.backends`

   `agent.backends` is a map of operator-chosen names to backend definitions. Each entry is a discriminated union keyed by `type`. Valid types: `mock`, `claude`, `anthropic`, `openai`, `gemini`, `local`, `pi`.

   | type        | required fields     | optional fields                          |
   | ----------- | ------------------- | ---------------------------------------- |
   | `mock`      | —                   | —                                        |
   | `claude`    | —                   | `command` (default: `claude`)            |
   | `anthropic` | `model`             | `apiKey`                                 |
   | `openai`    | `model`             | `apiKey`                                 |
   | `gemini`    | `model`             | `apiKey`                                 |
   | `local`     | `endpoint`, `model` | `apiKey`, `timeoutMs`, `probeIntervalMs` |
   | `pi`        | `endpoint`, `model` | `apiKey`, `probeIntervalMs`              |

   `model` accepts a single string or a non-empty array. With an array, the orchestrator probes `${endpoint}/v1/models` and picks the first array entry that's loaded on the server. See [Local Model Resolution](../knowledge/orchestrator/local-model-resolution.md).

   ## `agent.routing`

   `agent.routing` is a strict map of use cases to backend names. `default` is required; all other keys are optional and fall back to `default`. Unknown keys are validation errors (typo protection).

   | key                 | use case                                                   |
   | ------------------- | ---------------------------------------------------------- |
   | `default`           | required; used by maintenance, dashboard chat, fallback    |
   | `quick-fix`         | scope-tier dispatch                                        |
   | `guided-change`     | scope-tier dispatch                                        |
   | `full-exploration`  | scope-tier dispatch (note: still escalates to human first) |
   | `diagnostic`        | scope-tier dispatch                                        |
   | `intelligence.sel`  | spec-enrichment LLM call                                   |
   | `intelligence.pesl` | pre-execution-simulation LLM call                          |

   `routing` selects _which_ backend handles a permitted dispatch. `escalation.alwaysHuman` and `escalation.autoExecute` continue to control _whether_ a tier dispatches at all; routing only matters once a tier is permitted.

   ## Multi-local example

   \```yaml
   agent:
   backends:
   cloud: { type: anthropic, model: claude-3-5-sonnet-latest, apiKey: ${ANTHROPIC_API_KEY} }
   lm-studio: { type: local, endpoint: http://localhost:1234/v1, model: [qwen3:8b] }
   pi: { type: pi, endpoint: http://pi.local:1234/v1, model: [gemma-4-e4b] }
   routing:
   default: cloud
   quick-fix: pi
   diagnostic: pi
   guided-change: lm-studio
   intelligence:
   sel: lm-studio
   pesl: lm-studio
   \```

   The orchestrator probes `lm-studio` and `pi` independently. Each surfaces its own dashboard banner if unhealthy. `GET /api/v1/local-models/status` returns one entry per local backend with `backendName` and `endpoint`.

   ## Migrating from the legacy schema

   The orchestrator continues to accept `agent.backend` / `agent.localBackend` for at least one minor release. At startup, an in-memory migration shim translates legacy fields into `agent.backends` / `agent.routing`:

   | legacy field                                     | synthesized into                                                                          |
   | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
   | `agent.backend: claude` (+ `agent.command`)      | `backends.primary = { type: 'claude', command }`                                          |
   | `agent.backend: anthropic` (+ `model`, `apiKey`) | `backends.primary = { type: 'anthropic', model, apiKey }`                                 |
   | `agent.backend: openai` (similar)                | `backends.primary = { type: 'openai', model, apiKey }`                                    |
   | `agent.backend: gemini` (similar)                | `backends.primary = { type: 'gemini', model, apiKey }`                                    |
   | `agent.backend: mock`                            | `backends.primary = { type: 'mock' }`                                                     |
   | `agent.localBackend: openai-compatible`          | `backends.local = { type: 'local', endpoint, model, apiKey, timeoutMs, probeIntervalMs }` |
   | `agent.localBackend: pi`                         | `backends.local = { type: 'pi', endpoint, model, apiKey, probeIntervalMs }`               |
   | `agent.escalation.autoExecute: [<tier>, ...]`    | `routing[<tier>] = 'local'` for each listed tier                                          |
   | (always)                                         | `routing.default = 'primary'`                                                             |

   The orchestrator logs a one-time `warn`-level message at startup naming each deprecated field present and pointing at this guide. Legacy fields are removed in a future release; see the deprecation timeline for details.

   When **both** legacy and `agent.backends` are set, `agent.backends` wins and each ignored legacy field is logged.

   ## Deprecation timeline

   - **Now (Spec 2 release):** Legacy fields warn at orchestrator start. New `agent.backends` / `agent.routing` schema is the documented primary surface.
   - **Next minor release:** Legacy fields are still accepted; warn level escalates if needed.
   - **Future release (separate spec):** Legacy fields are removed. The migration shim in `packages/orchestrator/src/agent/config-migration.ts` is deleted.

   See [ADR 0005: Named backends map](../knowledge/decisions/0005-named-backends-map.md) for the architectural rationale.

   ## Related

   - [`docs/changes/multi-backend-routing/proposal.md`](../changes/multi-backend-routing/proposal.md) — the spec
   - [Local Model Resolution](../knowledge/orchestrator/local-model-resolution.md)
   - [Issue Routing](../knowledge/orchestrator/issue-routing.md)
   - [Intelligence Pipeline](./intelligence-pipeline.md)
   - [Hybrid Orchestrator Quick Start](./hybrid-orchestrator-quickstart.md)
   ````

2. Run: `harness check-docs` and confirm coverage stays ≥ 98.0% with the new file.
3. Run: `harness validate`.
4. Commit: `docs(spec2): add multi-backend-routing operator guide (Spec 2 Phase 6 OT-Guide-NEW)`

---

### Task 2: Write ADR 0005 (named-backends-map schema)

**Depends on:** Task 1 | **Files:** `docs/knowledge/decisions/0005-named-backends-map.md` (CREATE)

1. Verify next ADR number: `ls docs/knowledge/decisions/ | grep '^[0-9]' | sort | tail -1` should print `0004-...`. If it prints something else, re-number this and subsequent ADRs.
2. Create `docs/knowledge/decisions/0005-named-backends-map.md`:

   ```markdown
   ---
   number: 0005
   title: Backend definitions become a named map
   date: 2026-05-05
   status: accepted
   tier: large
   source: docs/changes/multi-backend-routing/proposal.md
   ---

   ## Context

   The orchestrator's `agent.backend` was a single string naming one of `mock | claude | anthropic | openai | gemini`, with `agent.localBackend` as an optional second slot for `local | pi`. This two-slot cap shaped the dispatch path: a hard-coded `runner` / `localRunner` split chose between the two based on a `backend === 'local'` switch. Operators wanting to mix three backends — a primary cloud, a local, and a Claude CLI subscription — couldn't express it. Routing decisions were entangled with backend identity: `escalation.autoExecute` listed tiers that should "go local" without acknowledging that "local" was a backend choice rather than a tier property.

   Three options were considered:

   1. **Add more named slots.** Extend with `agent.tertiaryBackend`, etc. Doesn't solve the entanglement, just postpones the cap.
   2. **Convert backends to an array.** `agent.backends: [...]` would scale, but ordering becomes load-bearing and routing rules would need to reference array indices.
   3. **Convert backends to a named map.** Operators choose names; routing references names. Clean separation between backend identity and routing decisions.

   ## Decision

   `agent.backends` is a `Record<string, BackendDef>` — a named map of operator-chosen keys to discriminated-union backend definitions keyed by `type`. Valid types: `mock`, `claude`, `anthropic`, `openai`, `gemini`, `local`, `pi`. Per-type fields are validated at config load via Zod (records spec D5).

   `agent.routing` is a separate map of use cases to backend names. `default` is required; all other keys (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`, `intelligence.sel`, `intelligence.pesl`) are optional and fall back to `default`. Routing rejects unknown keys (records spec D7) — typos cause hours of "why is this routing wrong" debugging, and the set of valid keys is small and known.

   Legacy `agent.backend` / `agent.localBackend` continue to work via an in-memory migration shim (`packages/orchestrator/src/agent/config-migration.ts`) that synthesizes fixed-name entries `primary` and `local` and a `routing` map mirroring `escalation.autoExecute` semantics. The shim is in-memory only; the user's YAML stays unchanged until they migrate manually (records spec D12). A one-time `warn` log at orchestrator start names each deprecated field and points at the operator guide. The deprecation lifecycle is: warn for one minor release, error in the next, remove in the one after — hard removal is a follow-up spec, not part of Spec 2 (records D13).

   When **both** legacy and new fields are set, `agent.backends` wins and each ignored legacy field is logged (records D4). Synthesized backend names are fixed (`primary` and `local`) regardless of underlying type, so docs and examples can reference them without caveats (records D8).

   ## Consequences

   **Positive:**

   - Backend identity and routing decisions are now orthogonal. Operators express "I have three backends" and "this tier uses backend X" independently.
   - Strict routing validation catches typos at config load. `routing.quickfix` (missing hyphen) fails fast with a clear error rather than silently routing to default.
   - Multiple local backends are now expressible — operators can run an LM Studio instance alongside a Pi and route different tiers to each. The `LocalModelResolver` instances become per-backend (`Map<backendName, LocalModelResolver>`).
   - Per-type discriminated unions surface backend-specific config errors at load time, not at orchestrator runtime. TypeScript narrows `BackendDef` cleanly via the `type` field.
   - The dispatch path simplifies to a single runner with a per-dispatch backend factory (see [ADR 0006](./0006-single-runner-orchestrator-dispatch.md)).

   **Negative:**

   - Operators with existing configs see a deprecation warning at orchestrator start. The warning is informational and pointable at the migration guide, but it's still noise in operator logs until they migrate.
   - The migration shim adds maintenance surface in `config-migration.ts` for at least one release window. Spec 2 ships with comprehensive shim tests (SC9–SC15) so the shim is durable.
   - Dual-mechanism period — for one minor release the orchestrator must accept both schemas. Reviewers checking config behavior must trace through the shim.

   **Neutral:**

   - Dispatch behavior is unchanged for legacy configs: a config with `agent.backend: claude` and `agent.localBackend: pi` and `escalation.autoExecute: [quick-fix, diagnostic]` produces exactly the same dispatch outcomes via the shim as it did before Spec 2. SC41 in the spec asserts state-machine.test.ts still passes byte-for-byte.

   ## Related

   - [`docs/changes/multi-backend-routing/proposal.md`](../../changes/multi-backend-routing/proposal.md) — the spec
   - [`docs/guides/multi-backend-routing.md`](../../guides/multi-backend-routing.md) — operator guide
   - [ADR 0006: Single-runner orchestrator dispatch](./0006-single-runner-orchestrator-dispatch.md) — the dispatch refactor enabled by this schema
   - [ADR 0007: Multi-provider intelligence pipeline](./0007-multi-provider-intelligence-pipeline.md) — `routing.intelligence.{sel,pesl}` plumbing
   - [ADR 0003: Local model resolution strategy](./0003-local-model-resolution-strategy.md) — `LocalModelResolver` is per-backend under this schema
   ```

3. Run: `harness check-docs`.
4. Run: `harness validate`.
5. Commit: `docs(adr): 0005 named-backends-map schema (Spec 2 Phase 6 OT-ADR-NamedBackends)`

---

### Task 3: Write ADR 0006 (single-runner orchestrator dispatch)

**Depends on:** Task 2 | **Files:** `docs/knowledge/decisions/0006-single-runner-orchestrator-dispatch.md` (CREATE)

1. Create `docs/knowledge/decisions/0006-single-runner-orchestrator-dispatch.md`:

   ```markdown
   ---
   number: 0006
   title: Single-runner orchestrator dispatch via OrchestratorBackendFactory
   date: 2026-05-05
   status: accepted
   tier: large
   source: docs/changes/multi-backend-routing/proposal.md
   ---

   ## Context

   Pre-Spec-2 the orchestrator held two `AgentRunner` fields — `this.runner` (cloud) and `this.localRunner` (local) — instantiated once per orchestrator lifetime. Dispatch chose between them with `const activeRunner = backend === 'local' && this.localRunner ? this.localRunner : this.runner;` (orchestrator.ts:1188 pre-Phase-3). The `backend` variable was a string read from `this.config.agent.backend` plus a `localBackend` override hack — a two-slot cap baked into the runtime, not just the config.

   Spec 2's `agent.backends` named map (see [ADR 0005](./0005-named-backends-map.md)) made the two-runner split untenable: with N possible backends and per-tier routing, the dispatch site needed to instantiate the right backend for each issue's `useCase`, not pick from a fixed pair. Three options were considered:

   1. **N runners.** Pre-instantiate one `AgentRunner` per `agent.backends.<name>`. Constant-memory but couples `start()` lifecycle to backend count and prevents per-dispatch container-wrapping decisions.
   2. **Lazy runner cache.** Instantiate on first use, cache by name. Reduces eager memory but state grows over orchestrator lifetime; restart is the only eviction.
   3. **Per-dispatch factory.** A single `OrchestratorBackendFactory` with `forUseCase(useCase) -> AgentBackend` constructs a fresh backend on each dispatch. Backends are short-lived (one issue's worth of work).

   ## Decision

   The orchestrator dispatches via a single `OrchestratorBackendFactory.forUseCase(useCase: RoutingUseCase): AgentBackend`. Each call resolves the routed backend name from `BackendRouter`, looks up the `BackendDef`, and instantiates a fresh backend (wrapped in `ContainerBackend` if `agent.sandboxPolicy === 'docker'`). The dispatch site at `orchestrator.ts:1343-1344` is a single line: `const backend = this.backendFactory.forUseCase(useCaseForBackendParam(issue, backend));`. The `this.runner` / `this.localRunner` fields and the `backend === 'local'` switch are deleted.

   `LocalModelResolver` instances remain long-lived — one per `type: 'local'|'pi'` entry in `agent.backends`, held in `this.localResolvers: Map<string, LocalModelResolver>`. The factory's local/pi branch passes a `getModel: () => resolver.resolveModel()` callback into the per-dispatch backend instance, so the backend reads always go through the long-lived resolver. Only the `AgentBackend` instance itself is per-dispatch.

   The factory's container-wrapping logic (Docker sandbox) moves into `instantiateBackend()`, so any backend type is wrappable uniformly — pre-Spec-2, only the cloud runner was wrapped.

   ## Consequences

   **Positive:**

   - Dispatch surface is minimal: one factory call per issue, one routing decision per call. No `if (backend === 'local')` branches survive in the dispatch path (asserted by SC30: `git grep "backend === 'local'|this\.localRunner"` returns zero hits in `packages/orchestrator/src/`).
   - Multiple backends scale linearly. Adding a third or fourth `agent.backends.<name>` entry costs nothing in dispatch complexity.
   - Container-wrapping is uniform across backend types — a critical invariant for sandbox policy enforcement.
   - The factory is testable in isolation (`tests/agent/multi-backend-dispatch.test.ts` exercises it without a full orchestrator).

   **Negative:**

   - Per-dispatch backend instantiation costs one allocation per issue. For cloud backends this is a zero-cost object construction; for local backends it's also negligible since the resolver (the heavy lifter) is shared. Profiling during Phase 3 confirmed no measurable overhead.
   - The previous "runner identity reflects backend identity" mental model is gone. Reviewers debugging dispatch must now trace through the factory + router rather than `this.runner` vs. `this.localRunner`. Compensated by inline JSDoc on `forUseCase` and the routing-driven test names.
   - The factory's `RoutingUseCase` discriminated union (`{ kind: 'tier' | 'intelligence' | 'maintenance' | 'chat' }`) becomes a public-facing type. External consumers must adapt if they previously consumed the dual-runner shape.

   **Neutral:**

   - State-machine semantics are unchanged. SC41 (state-machine.test.ts diff is empty) holds. Escalation rules (`alwaysHuman`, `autoExecute`) still gate dispatch independently of routing.

   ## Related

   - [ADR 0005: Named backends map](./0005-named-backends-map.md) — the schema this dispatch model serves
   - [`docs/changes/multi-backend-routing/proposal.md`](../../changes/multi-backend-routing/proposal.md) §"Backend instantiation per use case" — implementation detail
   - [`docs/guides/multi-backend-routing.md`](../../guides/multi-backend-routing.md) — operator-facing routing semantics
   - [Issue Routing](../orchestrator/issue-routing.md) — how `RoutingUseCase` is constructed from issue scope-tier
   ```

2. Run: `harness check-docs`.
3. Run: `harness validate`.
4. Commit: `docs(adr): 0006 single-runner orchestrator dispatch (Spec 2 Phase 6 OT-ADR-SingleRunner)`

---

### Task 4: Write ADR 0007 (multi-provider intelligence pipeline)

**Depends on:** Task 3 | **Files:** `docs/knowledge/decisions/0007-multi-provider-intelligence-pipeline.md` (CREATE)

1. Create `docs/knowledge/decisions/0007-multi-provider-intelligence-pipeline.md`:

   ```markdown
   ---
   number: 0007
   title: Multi-provider intelligence pipeline
   date: 2026-05-05
   status: accepted
   tier: medium
   source: docs/changes/multi-backend-routing/proposal.md
   ---

   ## Context

   Pre-Spec-2 the intelligence pipeline (`packages/intelligence/src/pipeline.ts`) accepted a single `AnalysisProvider` that handled both SEL (spec enrichment) and PESL (pre-execution simulation). The pipeline overrode the model name for PESL via `intelligence.models.pesl` but reused the same provider session — a hard "1 pipeline = 1 provider" invariant. Operators couldn't run SEL on a fast cheap local model and PESL on a stronger reasoning model on a different backend.

   Spec 2's `agent.routing` introduced `routing.intelligence.sel` and `routing.intelligence.pesl` as independent routing keys. When the two resolve to the same backend, today's behavior should hold (one provider, model-name override only). When they resolve to different backends, the pipeline needs distinct provider instances for each layer.

   Two options were considered:

   1. **Single-provider invariant + force same backend.** Validate at config load that `routing.intelligence.sel === routing.intelligence.pesl` (or only `sel` is set). Simpler runtime, but defeats the user benefit — operators want to mix.
   2. **Additive per-layer provider option.** `IntelligencePipeline` constructor accepts an optional `peslProvider`. When unset (the default), `pesl` falls back to the single `provider` argument and behavior is identical to pre-Spec-2. When set, the `PeslSimulator` invokes `peslProvider` instead.

   ## Decision

   `IntelligencePipeline`'s constructor gains an optional `peslProvider: AnalysisProvider | undefined`. The `PeslSimulator` is constructed with `options.peslProvider ?? provider` (`packages/intelligence/src/pipeline.ts:55-61`). The orchestrator's `createAnalysisProvider` consults `BackendRouter.resolveDefinition({ kind: 'intelligence', layer: 'pesl' })` and, when the resolved name differs from `sel`, builds a second `AnalysisProvider` from the routed `BackendDef` and passes it via the new option (`packages/orchestrator/src/orchestrator.ts:559-570`).

   Backend types `claude` and `mock` continue to map to `null` (with a `warn` log) when routed to the intelligence layer, because they have no `AnalysisProvider` implementation. `claude` routed to the SEL or PESL layer falls back to `ClaudeCliAnalysisProvider` when a `claude` CLI is reachable (`packages/orchestrator/src/agent/analysis-provider-factory.ts`). The factory module is orchestrator-private — not re-exported from any barrel — to keep the public surface small (per Phase 3 INTEGRATE finding).

   `intelligence.provider` explicit config still wins over `routing.intelligence.*` (preserves Phase 0–2 behavior; SC33).

   ## Consequences

   **Positive:**

   - Operators can mix providers per intelligence layer. SEL on a fast local model (cheap, low-latency enrichment), PESL on a stronger cloud model (reasoning-heavy simulation).
   - The default behavior is unchanged. Existing configs that don't set `routing.intelligence.pesl` see no behavioral difference; the pipeline still runs with one provider and a model-name override for PESL.
   - The provider-instantiation logic moves into a dedicated `analysis-provider-factory.ts` module. `createAnalysisProvider`'s cyclomatic complexity dropped from 33 (above the error threshold) to ≤ 5; the factory's helper carries the strategy table at warn-only complexity 13.

   **Negative:**

   - The "1 pipeline = 1 provider" invariant is gone. Code maintainers reading `IntelligencePipeline.ts` must check whether `peslProvider` was passed before assuming SEL and PESL share state.
   - Two providers means two outbound LLM connections in the worst case. For backends that maintain HTTP keep-alive pools this is fine; for backends with limited connection budgets operators see double the connection pressure when `sel !== pesl`.
   - When `routing.intelligence.pesl` resolves to a backend type without an analysis provider (`mock`), the pipeline silently falls back to the SEL provider. This is acceptable today (SC36 specifies null-fallback for unsupported types), but a future "hard-fail on unsupported PESL" mode is a candidate enhancement (carry-forward from Phase 3 INTEGRATE).

   **Neutral:**

   - The new `peslProvider` constructor option is additive — no public API breakage. External `IntelligencePipeline` consumers don't need to change.
   - `packages/orchestrator/src/agent/analysis-provider-factory.ts` is **not** re-exported from `packages/orchestrator/src/index.ts`. It stays orchestrator-private. If a downstream consumer needs the factory, the export is a separate decision recorded in a future ADR.

   ## Related

   - [ADR 0005: Named backends map](./0005-named-backends-map.md) — `routing.intelligence.{sel,pesl}` keys originate here
   - [ADR 0006: Single-runner orchestrator dispatch](./0006-single-runner-orchestrator-dispatch.md) — sibling architectural decision; same spec
   - [`docs/guides/intelligence-pipeline.md`](../../guides/intelligence-pipeline.md) — operator-facing
   - [`docs/changes/multi-backend-routing/proposal.md`](../../changes/multi-backend-routing/proposal.md) §"Intelligence pipeline wiring"
   ```

2. Run: `harness check-docs`.
3. Run: `harness validate`.
4. Commit: `docs(adr): 0007 multi-provider intelligence pipeline (Spec 2 Phase 6 OT-ADR-MultiProvider)`

---

### Task 5: Update ADR 0004 line 26 (singular → plural endpoint URL)

**Depends on:** Task 4 | **Files:** `docs/knowledge/decisions/0004-local-availability-disables-not-escalates.md` (MODIFY)

1. Open `docs/knowledge/decisions/0004-local-availability-disables-not-escalates.md` and locate line 26 (currently: `- **Dashboard surface:** A warning banner renders on the Orchestrator page with the configured list, detected list, endpoint, last error, and last probe time, sourced from a `GET /api/v1/local-model/status`route and live-updated via a`local-model:status` WebSocket topic.`).
2. Edit line 26 to read:
   `- **Dashboard surface:** A warning banner renders on the Orchestrator page with the configured list, detected list, endpoint, last error, and last probe time, sourced from `GET /api/v1/local-models/status`(one entry per local backend, returning`NamedLocalModelStatus[]`) and live-updated via a `local-model:status`WebSocket topic. The singular`GET /api/v1/local-model/status` endpoint remains as a deprecated alias for one minor release; see [ADR 0005](./0005-named-backends-map.md) and the multi-backend-routing operator guide for the deprecation timeline.`
3. Frontmatter `status` stays `accepted` — this is an in-place URL refresh, not a supersession (the decision is unchanged).
4. Run: `harness check-docs`.
5. Run: `harness validate`.
6. Commit: `docs(adr): refresh ADR-0004 dashboard URL to plural endpoint (Spec 2 Phase 6 OT-ADR-0004)`

---

### Task 6: Refresh `docs/knowledge/orchestrator/issue-routing.md` (separate routing from escalation)

**Depends on:** Task 5 | **Files:** `docs/knowledge/orchestrator/issue-routing.md` (MODIFY)

1. Open `docs/knowledge/orchestrator/issue-routing.md`.
2. Update frontmatter `tags` (line 4) from `[routing, triage, scope-tier, escalation, model-router]` to `[routing, triage, scope-tier, escalation, model-router, multi-backend, routing-config]`.
3. After the existing §Escalation Rules section (currently the last section, ending at line 41), append a new section:

   ```markdown
   ## Backend Routing

   Once a tier is permitted to dispatch (i.e. it's not blocked by `escalation.alwaysHuman` and is allowed by `escalation.autoExecute`), `agent.routing` selects _which_ backend handles it. Routing is orthogonal to escalation:

   - **Escalation** answers "should this tier dispatch at all?" — gates on `alwaysHuman`, `autoExecute`, `signalGated`, and concern signals from the intelligence pipeline.
   - **Routing** answers "where does this tier dispatch when permitted?" — selects an `agent.backends.<name>` entry by use case.

   The routing map is keyed by use case:

   - `default` (required) — fallback for any unmapped use case
   - `quick-fix`, `guided-change`, `full-exploration`, `diagnostic` — scope-tier dispatch
   - `intelligence.sel`, `intelligence.pesl` — analysis-provider selection for the intelligence pipeline

   Maintenance and dashboard chat both use `routing.default`. Unknown routing keys are validation errors.

   See [ADR 0005: Named backends map](../decisions/0005-named-backends-map.md) and [Multi-Backend Routing](../../guides/multi-backend-routing.md) for the schema and operator-facing semantics.
   ```

4. Update the bullet at line 41 (currently: `- **quick-fix** and **diagnostic** route to local backend for fast execution`) to:
   `- **quick-fix** and **diagnostic** dispatch to whichever backend `routing['quick-fix']`and`routing.diagnostic`name (defaulting to`routing.default`when unset). The legacy synthesized name is`local`; modern configs name backends explicitly.`
5. Run: `harness check-docs`.
6. Run: `harness validate`.
7. Commit: `docs(knowledge): refresh issue-routing.md for multi-backend routing (Spec 2 Phase 6 OT-Knowledge-IssueRouting)`

---

### Task 7: Refresh `docs/knowledge/orchestrator/local-model-resolution.md` (multi-resolver)

**Depends on:** Task 6 | **Files:** `docs/knowledge/orchestrator/local-model-resolution.md` (MODIFY)

1. Open `docs/knowledge/orchestrator/local-model-resolution.md`.
2. Update §Lifecycle (currently lines 60-65, single-resolver wording starting "The resolver is constructed in the `Orchestrator` constructor only when `agent.localBackend` is set..."). Replace with:

   ```markdown
   ## Lifecycle

   The orchestrator holds a `Map<string, LocalModelResolver>` (`this.localResolvers`) keyed by backend name. One resolver is constructed for each `agent.backends.<name>` entry whose `type` is `local` or `pi`. Legacy configs (with `agent.localBackend` set) flow through the migration shim, which synthesizes a single `agent.backends.local` entry — so legacy configs see exactly one resolver named `local`, preserving Spec 1 behavior.

   `Orchestrator.start()` iterates the map: each resolver's `start()` is awaited (the initial probe is synchronous), and a per-resolver `onStatusChange` listener is registered before the first probe fires. Each listener broadcasts on the `local-model:status` WebSocket topic with payload `NamedLocalModelStatus` (the per-resolver `LocalModelStatus` plus `backendName` and `endpoint`). `Orchestrator.stop()` iterates the map and calls each `resolver.stop()`, clearing all probe intervals.

   When zero `local`/`pi` backends are configured, the map is empty and no probe traffic is generated.
   ```

3. Update §Status Surface (currently lines 36-50). After the `LocalModelStatus` field table, append:

   ```markdown
   For multi-resolver configs, the orchestrator surfaces a `NamedLocalModelStatus` per resolver — `LocalModelStatus` plus a `backendName: string` and `endpoint: string`. The HTTP API returns the array via `GET /api/v1/local-models/status` (introduced by Spec 2). The singular `GET /api/v1/local-model/status` from Spec 1 remains as a deprecated alias returning the first registered resolver's `LocalModelStatus` (without `backendName` / `endpoint`); it is removed in a follow-up release.
   ```

4. Update §Consumers (currently lines 53-57) to clarify the resolver lookup:
   - Replace `**`createLocalBackend()`**` with `**Backend factory (per-dispatch)**` and update the description: `the `OrchestratorBackendFactory`looks up`this.localResolvers.get(backendName)`for each`local`/`pi`dispatch and passes`getModel: () => resolver.resolveModel()`to the per-dispatch`LocalBackend`/`PiBackend`instance. When the callback returns null, the backend's`startSession()`returns`Err({ category: 'agent_not_found' })`.`
   - Replace `**`createAnalysisProvider()`**` with `**`analysis-provider-factory` (intelligence pipeline)**` and update the description: `for each `routing.intelligence.{sel,pesl}`target whose resolved`BackendDef.type`is`local`or`pi`, the factory looks up the resolver by backend name and constructs an `OpenAICompatibleAnalysisProvider`whose`defaultModel` reads from the resolver. The pipeline disables the layer (returns null with a warn log) when the resolved model is unavailable at orchestrator start.`
5. Add to §Related (line 67): `- [ADR 0005: Named backends map](../decisions/0005-named-backends-map.md) — `agent.backends` schema with per-`type: 'local'|'pi'` resolver keying`.
6. Run: `harness check-docs`.
7. Run: `harness validate`.
8. Commit: `docs(knowledge): refresh local-model-resolution.md for multi-resolver Map (Spec 2 Phase 6 OT-Knowledge-LocalModel)`

---

### Task 8: Add cross-references to `hybrid-orchestrator-quickstart.md` and `intelligence-pipeline.md`

**Depends on:** Task 7 | **Files:** `docs/guides/hybrid-orchestrator-quickstart.md` (MODIFY), `docs/guides/intelligence-pipeline.md` (MODIFY)

1. Open `docs/guides/hybrid-orchestrator-quickstart.md`. After the §Configure harness.orchestrator.md section's YAML block (around line 56-90, find the closing `\`\`\`` of that block and the next H2/H3), insert a new H2:

   ```markdown
   ## Multi-backend routing (modern schema)

   The legacy `agent.backend` / `agent.localBackend` config shown above is supported via an in-memory migration shim and emits a deprecation warning at orchestrator start. The modern surface is `agent.backends` (named map) + `agent.routing` (per-use-case map). See [Multi-Backend Routing](./multi-backend-routing.md) for the full schema and migration guidance.
   ```

2. Open `docs/guides/intelligence-pipeline.md`. Locate the "Agent Backend → Intelligence Provider" table (around line 47-54) and immediately above it (between line 46 ending in "just enable it:" and the YAML block at line 41-44 that already exists), or directly above the table at line 47, insert a single sentence:

   ```markdown
   When `agent.routing.intelligence.sel` or `agent.routing.intelligence.pesl` is set, those routing keys override the inferred resolution order in the table below. See [Multi-Backend Routing](./multi-backend-routing.md) for routing semantics.
   ```

3. Verify: `grep -c 'multi-backend-routing.md' docs/guides/hybrid-orchestrator-quickstart.md docs/guides/intelligence-pipeline.md` returns ≥ 1 for each.
4. Run: `harness check-docs`.
5. Run: `harness validate`.
6. Commit: `docs(guides): cross-reference multi-backend-routing guide from hybrid-orchestrator-quickstart and intelligence-pipeline (Spec 2 Phase 6 OT-Guide-XREF)`

---

### Task 9: Add forward links in spec cross-references

**Depends on:** Task 8 | **Files:** `docs/changes/local-model-fallback/proposal.md` (MODIFY), `docs/changes/hybrid-orchestrator/proposal.md` (MODIFY)

1. Open `docs/changes/local-model-fallback/proposal.md`. Locate line 21-22 (currently in §Non-goals: `- Per-use-case backend routing (deferred to Spec 2 \`multi-backend-routing\`).`and`- Promoting \`LocalBackend\` / \`PiBackend\` to primary backends via \`agent.backend: 'local' | 'pi'\` (deferred to Spec 2).`).
2. Replace those two bullets with:
   - `- Per-use-case backend routing — **shipped in [Spec 2: Multi-Backend Routing](../multi-backend-routing/proposal.md)**. The deferral is resolved.`
   - `- Promoting \`LocalBackend\` / \`PiBackend\` to primary backends via \`agent.backend: 'local' | 'pi'\` — **shipped in [Spec 2: Multi-Backend Routing](../multi-backend-routing/proposal.md)** as the named-map schema. The deferral is resolved.`
3. Open `docs/changes/hybrid-orchestrator/proposal.md`. Locate the end of the document (after the last existing section). Append:

   ```markdown
   ## Addendum: Multi-Backend Routing (Spec 2)

   This spec's two-slot `agent.backend` / `agent.localBackend` design has been superseded by the named-map schema introduced in [Spec 2: Multi-Backend Routing](../multi-backend-routing/proposal.md). Legacy configs continue to work via an in-memory migration shim (warn at orchestrator start; hard removal in a follow-up release per Spec 2 D13). The dispatch model has shifted from a dual-runner split to a single-runner-per-dispatch factory; see [ADR 0006: Single-runner orchestrator dispatch](../../knowledge/decisions/0006-single-runner-orchestrator-dispatch.md).
   ```

4. Run: `harness check-docs`.
5. Run: `harness validate`.
6. Commit: `docs(specs): cross-reference Spec 2 from local-model-fallback and hybrid-orchestrator proposals (Spec 2 Phase 6 OT-Spec-XRef)`

---

### Task 10: Update `AGENTS.md` to mention the modern schema

**Depends on:** Task 9 | **Files:** `AGENTS.md` (MODIFY)

1. Open `AGENTS.md`.
2. Locate line 36 (the orchestrator package description in the repo-structure tree comment): `│   └── orchestrator/         # Agent orchestration daemon for dispatching coding agents to issues`. Update to:
   `│   └── orchestrator/         # Agent orchestration daemon for dispatching coding agents to issues; supports multi-backend routing via \`agent.backends\` / \`agent.routing\``
3. Locate line 109 (the "package summaries" section bullet for orchestrator): `- **orchestrator**: Agent orchestration daemon for dispatching coding agents to issues (depends on types, core)`. Update to:
   `- **orchestrator**: Agent orchestration daemon for dispatching coding agents to issues. Modern config surface is \`agent.backends\` (named-map) + \`agent.routing\` (per-use-case). Legacy \`agent.backend\` / \`agent.localBackend\` accepted via in-memory migration shim with deprecation warning. (depends on types, core)`
4. Verify with `grep -n 'agent.backends\|agent.routing' AGENTS.md` — should now print at least 2 hits.
5. Run: `harness check-docs`.
6. Run: `harness validate`.
7. Commit: `docs(agents): mention agent.backends and agent.routing in orchestrator package summary (Spec 2 Phase 6 OT-AGENTS-MD)`

---

### Task 11: Add the CHANGELOG `[Unreleased]` entry

**Depends on:** Task 10 | **Files:** `CHANGELOG.md` (MODIFY)

1. Open `CHANGELOG.md`.
2. Verify the file's existing convention by reading the `[Unreleased]` section (lines ~7-37): `### Added` / `### Fixed` / `### Changed` subsections, each entry naming the affected packages in parentheses.
3. Locate the `### Added` subsection inside `[Unreleased]` (currently starts around line 9). At the top of that subsection, insert a single new bullet:

   ```markdown
   - **Multi-backend routing for the orchestrator** — `agent.backends` (named map of backend definitions) and `agent.routing` (per-use-case selection of backend names). Routable use cases: `default`, four scope tiers (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`), and two intelligence layers (`intelligence.sel`, `intelligence.pesl`). Promotes `local` / `pi` to first-class named backends; multi-local configs supported with one `LocalModelResolver` per backend. New `GET /api/v1/local-models/status` endpoint returns `NamedLocalModelStatus[]`; dashboard renders one banner per unhealthy local backend. Single-runner dispatch via per-issue `OrchestratorBackendFactory` replaces the dual-runner split. Distinct intelligence-pipeline providers per layer (`peslProvider` constructor option). See [`docs/guides/multi-backend-routing.md`](docs/guides/multi-backend-routing.md), [ADR 0005](docs/knowledge/decisions/0005-named-backends-map.md), [ADR 0006](docs/knowledge/decisions/0006-single-runner-orchestrator-dispatch.md), [ADR 0007](docs/knowledge/decisions/0007-multi-provider-intelligence-pipeline.md). (`@harness-engineering/orchestrator`, `@harness-engineering/types`, `@harness-engineering/intelligence`, `@harness-engineering/dashboard`)
   ```

4. Locate (or create) a `### Changed` subsection inside `[Unreleased]` (currently around line 33-37). At the top, insert:

   ```markdown
   - **Legacy orchestrator agent config deprecated** — `agent.backend` and `agent.localBackend` continue to work via an in-memory migration shim that synthesizes `agent.backends.primary` and `agent.backends.local` plus a `routing` map mirroring `escalation.autoExecute`. Orchestrator emits a one-time `warn`-level log at startup naming each deprecated field present. Hard removal lands in a follow-up release per the deprecation timeline. (`@harness-engineering/orchestrator`)
   ```

5. Verify with `grep -c 'multi-backend' CHANGELOG.md` — should return ≥ 1.
6. Run: `harness check-docs`.
7. Run: `harness validate`.
8. Commit: `docs(changelog): add [Unreleased] entry for multi-backend routing (Spec 2 Phase 6 OT-CHANGELOG)`

---

### Task 12: Verification gate + phase exit chore

**Depends on:** Task 11 | **Files:** none (verification only) | **Category:** integration

1. Run mechanical gate (parallel-safe):
   - `harness validate` — expect `v validation passed`
   - `harness check-docs` — expect `v Documentation coverage: ≥ 98.0%`
   - `harness check-deps` — expect `v validation passed`
2. Run code-suite smoke (no code changes; suites should match Phase-4-fixup baselines):
   - `pnpm --filter @harness-engineering/orchestrator test` — expect `826/826`
   - `pnpm --filter @harness-engineering/intelligence test` — expect `218/218`
   - `pnpm --filter @harness-engineering/dashboard test` — expect `305/305`
3. Run no-code-change assertion: `git diff <phase-base>..HEAD -- 'packages/**/src/**' 'packages/**/tests/**'` — expect empty output. Where `<phase-base>` is the commit prior to Task 1 (recorded in handoff).
4. Run SC30 invariant: `git grep -E "backend === 'local'|this\\.localRunner" packages/orchestrator/src/` — expect zero hits in non-comment lines (consistent with prior phases).
5. Verify all new/modified docs are present:
   - `ls docs/guides/multi-backend-routing.md docs/knowledge/decisions/0005-named-backends-map.md docs/knowledge/decisions/0006-single-runner-orchestrator-dispatch.md docs/knowledge/decisions/0007-multi-provider-intelligence-pipeline.md`
   - `grep -c 'GET /api/v1/local-models/status' docs/knowledge/decisions/0004-local-availability-disables-not-escalates.md` — expect ≥ 1.
   - `grep -c 'Backend Routing' docs/knowledge/orchestrator/issue-routing.md` — expect ≥ 1.
   - `grep -c 'NamedLocalModelStatus' docs/knowledge/orchestrator/local-model-resolution.md` — expect ≥ 1.
   - `grep -c 'multi-backend-routing.md' docs/guides/hybrid-orchestrator-quickstart.md docs/guides/intelligence-pipeline.md` — each ≥ 1.
   - `grep -c 'multi-backend-routing/proposal.md' docs/changes/local-model-fallback/proposal.md docs/changes/hybrid-orchestrator/proposal.md` — each ≥ 1.
   - `grep -c 'agent.backends' AGENTS.md` — expect ≥ 1.
   - `grep -c 'Multi-backend routing' CHANGELOG.md` — expect ≥ 1.
6. Phase exit chore commit:
   - `git status` — verify no unstaged changes (all docs should already be committed by prior tasks).
   - If clean, write a phase-exit chore commit with no file changes (allowed for the chore commit at the phase boundary): `git commit --allow-empty -m "chore(spec2): Phase 6 exit gate green (documentation, ADRs, knowledge OT-Phase6-Exit / SC47)"`. The body of the message references the closed deferrals: ADR-0005/0006/0007 drafted, ADR-0004 URL refreshed, issue-routing.md and local-model-resolution.md updated for multi-backend, AGENTS.md mentions modern schema, CHANGELOG.md `[Unreleased]` entry added, hybrid-orchestrator-quickstart.md and intelligence-pipeline.md cross-link to new guide, spec cross-refs in local-model-fallback and hybrid-orchestrator addended.

---

## Cross-Spec Carry-Forward Resolution

This phase resolves the following deferrals from prior phases. The handoff records each closure under `carryForward`.

| Source phase          | Item                                                                             | Resolution in this phase                                                                | Status      |
| --------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------- |
| Phase 2 INTEGRATE     | ADR-0005 single-runner refactor                                                  | Drafted as ADR 0006 (numbering shifted; see Task 3)                                     | Closed      |
| Phase 2 INTEGRATE     | ADR-0006 multi-resolver Map                                                      | Pruned (duplicates spec §"Per-backend `LocalModelResolver` instantiation")              | Pruned      |
| Phase 2 INTEGRATE     | ADR-0007 RoutingUseCase API                                                      | Pruned (no external consumers; Phase 2 INTEGRATE recommendation)                        | Pruned      |
| Phase 2 INTEGRATE     | `docs/knowledge/orchestrator/issue-routing.md` refresh                           | Done in Task 6 (separate routing from escalation; tag updates)                          | Closed      |
| Phase 2 INTEGRATE     | P2-S1 (synthesized routing default info-log)                                     | Compensated via Task 1 guide (synthesized default named explicitly); code-side deferred | Compensated |
| Phase 3 INTEGRATE     | Optional ADR for multi-provider intelligence pipeline                            | Drafted as ADR 0007 (Task 4)                                                            | Closed      |
| Phase 3 INTEGRATE     | SC36 spec wording for `claude`                                                   | Compensated via ADR-0007 documenting actual implemented behavior; spec edit deferred    | Compensated |
| Phase 4 INTEGRATE     | Optional ADR for per-resolver broadcast strategy                                 | Pruned (spec-mandated in §5; would duplicate)                                           | Pruned      |
| Phase 4 INTEGRATE     | Optional ADR for deprecated alias retention                                      | Pruned (spec-mandated in D13; would duplicate)                                          | Pruned      |
| Phase 4 INTEGRATE     | Optional ADR for reducer initial state `[]` semantics                            | Pruned (spec-mandated in §5; would duplicate)                                           | Pruned      |
| Phase 4 INTEGRATE     | ADR-0004 line 26 URL refresh                                                     | Done in Task 5                                                                          | Closed      |
| Phase 4 INTEGRATE     | `docs/knowledge/orchestrator/local-model-resolution.md` multi-resolver narrative | Done in Task 7                                                                          | Closed      |
| Phase 2/3/4 INTEGRATE | CHANGELOG entry                                                                  | Done in Task 11                                                                         | Closed      |
| Phase 2/3/4 INTEGRATE | Knowledge graph reindex                                                          | Carried forward to autopilot DONE (handoff carryForward); not in this phase scope       | Carried fwd |

## Phase Exit

- **All OTs (1-14) green.** OT-No-Code-Change assertion run as part of Task 12.
- **Tasks 1-12 committed** (Task 12 commits the chore-only phase-exit marker).
- **Handoff written** at `.harness/sessions/changes--multi-backend-routing--proposal/handoff.json` per the harness-planning Output Contract.
- **CarryForwardOpen for autopilot DONE:** knowledge-graph reindex, alias-removal follow-up spec, P4-S2/S3/S4 minor follow-ups, P2-S1 info-log code-side, SC36 spec wording. None block this phase exit.

The next autopilot phase after this one is the spec's **Phase 7 — Validation gate** (autopilot phase index 6) which runs `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`, `harness validate`, `harness check-docs`, plus an end-to-end smoke. After Phase 7, autopilot DONE marks the roadmap status `done` and runs the deferred knowledge-graph reindex.
