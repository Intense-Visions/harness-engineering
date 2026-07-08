# Plan: LMLM Phase 9 — Docs + ADRs + Plugin/Barrel Regeneration

**Date:** 2026-07-08 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` | **Tasks:** 11 | **Time:** ~40 min | **Integration Tier:** small

## Goal

Close out LMLM by capturing the genuinely-missing foundational ADRs, writing the operator guide, patching the remaining reference docs, adding a changeset for every changed published package, and regenerating barrels + plugin manifests — ending with `harness check-docs`, `generate:barrels:check`, and `generate:plugin:check` clean and no NEW `harness validate` findings above the pre-existing baseline.

## Scope Inventory (what already exists — do NOT recreate)

Verified on branch `feat/lmlm-wire-operator-surfaces` @ `ec597828b`:

| Artifact                                                         | Status                        | Covers spec item                               |
| ---------------------------------------------------------------- | ----------------------------- | ---------------------------------------------- |
| ADR `0058-generalize-skill-proposal-into-discriminated-proposal` | EXISTS (Phase 5)              | Spec ADR-NNNN+4 (D11 schema generalization)    |
| ADR `0059-background-scheduler-and-silent-drift-reconciliation`  | EXISTS (Phase 6)              | Spec ADR-NNNN+5 (D9 scheduler, D12 drift)      |
| ADR `0060-lmlm-operator-surfaces-and-dispatch-safe-eviction`     | EXISTS (Phase 7)              | Spec ADR-NNNN+3-ish + D10/S1; D13 stale-target |
| `docs/knowledge/orchestrator/local-model-lifecycle.md`           | EXISTS (Phase 6, upd Phase 7) | Domain knowledge doc                           |
| `docs/knowledge/orchestrator/local-model-resolution.md`          | UPDATED (Phase 4)             | Resolver `poolState` integration               |
| AGENTS.md LMLM section                                           | EXISTS (Phase 7)              | AGENTS.md doc update                           |
| `.changeset/lmlm-phase8-dashboard-panel.md`                      | EXISTS (Phase 8)              | dashboard changeset                            |
| D13 stale-target (`failed_target_missing`)                       | DOCUMENTED (0060 + knowledge) | Spec ADR-NNNN+6 — **no new ADR needed**        |

**ADR consolidation decision (see Uncertainties):** The spec proposed 7 ADRs (NNNN..NNNN+6). NNNN+3/+4/+5/+6 map to existing 0058/0059/0060 (+D13). The genuinely-missing foundational Phase 0-3 decisions are **D3** (separate package + native TS ranking port), **D1** (pool-bounded autonomy), **D4** (Ollama-first install). These are consolidated into **two** new ADRs (0061, 0062) to honor the "prefer NOT proliferating ADRs" guidance.

## Observable Truths (Acceptance Criteria)

1. `docs/knowledge/decisions/0061-lmlm-package-boundary-and-native-ranking-port.md` exists with valid ADR frontmatter (`number: 0061`, `status: accepted`, `tier: large`, `source:` = spec path) and Context/Decision/Consequences sections capturing D3; it does not duplicate 0058-0060.
2. `docs/knowledge/decisions/0062-pool-bounded-autonomy-and-ollama-first-install.md` exists with valid ADR frontmatter (`number: 0062`) and sections capturing D1 + D4.
3. `docs/guides/local-model-lifecycle.md` exists and covers: enabling (`localModels.enabled` + config block), first-time pool setup (disk budget + org/family allowlist), what a proposal looks like, approve/reject via CLI **and** dashboard, troubleshooting — and surfaces the three KNOWN LIMITATIONS in a dedicated, non-buried section.
4. `docs/guides/multi-backend-routing.md` has a section noting `type: local | pi` backends can opt into LMLM via `localModels.enabled = true`.
5. `docs/knowledge/intelligence/provider-architecture.md` "Per-Layer Model Overrides" section notes overrides can reference pool-managed model names.
6. `README.md` orchestrator capabilities has one LMLM sentence linking the guide + ADRs.
7. `docs/guides/index.md` links the new guide (link-based doc coverage) and the knowledge doc cross-links ADR 0061/0062 + the guide.
8. A changeset in `.changeset/` names each changed published package — `@harness-engineering/{local-models,types,core,orchestrator,cli}` — (dashboard already covered).
9. `pnpm generate:barrels:check` exits clean.
10. `pnpm generate:plugin:check` exits clean.
11. `harness check-docs` reports no NEW orphan/broken-link findings attributable to the added docs.
12. `harness validate` shows no NEW findings above the ~391-issue pre-existing baseline (this phase may legitimately reduce doc-coverage findings).

## Uncertainties

- **[ASSUMPTION]** Two consolidated ADRs (0061 = package+algorithm, 0062 = autonomy+install) is the right granularity. If the release owner wants Ollama-first (D4) as its own ADR, split 0062 into 0062 (autonomy) + 0063 (Ollama-first). Recommendation: keep two. Surfaced at Task 2 checkpoint. (If wrong, only Task 2 changes.)
- **[ASSUMPTION]** This repo drives release notes from changesets, not hand-edited `CHANGELOG.md`. The root `CHANGELOG.md` is release-generated; Phase 9 adds changesets and does **not** hand-edit `CHANGELOG.md`. (If wrong, add a CHANGELOG entry task.)
- **[ASSUMPTION]** One multi-package changeset satisfies the release gate (each changed published package must appear in _a_ changeset). Using a single file listing all five backend packages at `minor`. (If the gate requires one-file-per-package, split — Task 8 is the only change.)
- **[DEFERRABLE]** Bump level `minor` chosen for all five (backward-compatible feature; schema migrates on read). Release owner may downgrade to `patch`.
- **[DEFERRABLE]** `pnpm generate:plugin:all` may be a no-op if plugin manifests don't surface CLI subcommands; `:check` is the authority either way.

## File Map

- CREATE `docs/knowledge/decisions/0061-lmlm-package-boundary-and-native-ranking-port.md`
- CREATE `docs/knowledge/decisions/0062-pool-bounded-autonomy-and-ollama-first-install.md`
- CREATE `docs/guides/local-model-lifecycle.md`
- CREATE `.changeset/lmlm-phases-4-7-backend.md`
- MODIFY `docs/guides/multi-backend-routing.md` (add LMLM opt-in section + See-also link)
- MODIFY `docs/knowledge/intelligence/provider-architecture.md` (Per-Layer Model Overrides note)
- MODIFY `README.md` (orchestrator capabilities bullet)
- MODIFY `docs/guides/index.md` (link new guide)
- MODIFY `docs/knowledge/orchestrator/local-model-lifecycle.md` (cross-link ADR 0061/0062 + operator guide; ensure limitations cross-referenced)
- REGENERATE (verify-only, commit if drift) barrels + plugin manifests via `pnpm generate:barrels` / `pnpm generate:plugin:all`

## Skeleton

1. Foundational ADRs (0061 package+algorithm, 0062 autonomy+install) — ~2 tasks, ~10 min
2. Operator guide + doc patches (guide, multi-backend, provider-arch, README, index, knowledge cross-links) — ~5 tasks, ~18 min
3. Changeset for changed published packages — ~1 task, ~3 min
4. Regeneration + verification (barrels:check, plugin:check, check-docs, validate) — ~3 tasks, ~9 min

**Estimated total:** 11 tasks, ~40 minutes.
_Skeleton approved: n/a — produced under single-shot planning instruction (write + commit immediately); direction recorded for reviewer._

---

## Tasks

### Task 1: Author ADR 0061 — LMLM package boundary + native TS ranking port

**Depends on:** none | **Files:** `docs/knowledge/decisions/0061-lmlm-package-boundary-and-native-ranking-port.md`

1. Create the file with frontmatter (mirror 0060's shape):
   ```yaml
   ---
   number: 0061
   title: LMLM as a standalone package with a native TS ranking port
   date: 2026-07-08
   status: accepted
   tier: large
   source: docs/changes/local-model-lifecycle-manager/proposal.md
   ---
   ```
2. Write these required sections (prose, operator/architect-facing):
   - **## Context** — Phases 0-3 shipped before the ADR practice; the package-boundary + algorithm-port decisions (D3) were never captured. The resolver, CLI, and dashboard all need to consume ranking + pool logic; a Python/uv runtime dependency (whichllm) is unacceptable in the monorepo.
   - **## Decision** — LMLM lives in a standalone `@harness-engineering/local-models` package, not orchestrator-internal. The whichllm-style algorithm (hardware detect, VRAM math, speed estimate, evidence grading, recency-weighted ranking) is a **native TS port**, not a wrapper. A `ModelRecommender` interface preserves the option to wrap a future engine. Live HF API keeps data fresh; a frozen `snapshot.json` is the offline fallback.
   - **## Consequences** — Reusable from CLI + dashboard + future standalone use; clean layer boundary; ranker independently testable via parity fixtures (`packages/local-models/tests/ranker/parity/`); no Python runtime dep; algorithm needs tuning only when new GPU/quant categories emerge.
   - **## Alternatives rejected** — (a) orchestrator-internal module (couples ranker to daemon lifecycle, not reusable); (b) whichllm subprocess wrapper (Python/uv runtime dep, breaks unattended freshness).
   - **## See also** — link ADR 0058, 0059, 0060, and `docs/knowledge/orchestrator/local-model-lifecycle.md`.
3. Run: `harness validate`
4. Commit: `docs(lmlm): add ADR 0061 package boundary and native ranking port`

### Task 2: Author ADR 0062 — Pool-bounded autonomy + Ollama-first install

**Depends on:** Task 1 | **Files:** `docs/knowledge/decisions/0062-pool-bounded-autonomy-and-ollama-first-install.md`

`[checkpoint:human-verify]` — Before writing, confirm the 2-ADR consolidation (0061 package+algorithm, 0062 autonomy+install) is acceptable and does not duplicate 0058-0060. If the reviewer wants Ollama-first split out, author 0063 separately and scope 0062 to D1 only.

1. Create the file with frontmatter:
   ```yaml
   ---
   number: 0062
   title: Pool-bounded autonomy with Ollama-first installation
   date: 2026-07-08
   status: accepted
   tier: large
   source: docs/changes/local-model-lifecycle-manager/proposal.md
   ---
   ```
2. Write required sections:
   - **## Context** — D1 + D4 (Phase 0-3 decisions) were never captured as ADRs. LMLM must act autonomously without crossing the "arbitrary HF downloads" trust line; and it must install/swap models unattended, which only Ollama's REST API supports safely today.
   - **## Decision** — **Pool-bounded autonomy (D1):** operator pre-approves a disk budget + allowed HF orgs/families **once**; the orchestrator auto-pulls, swaps, and evicts within that pool; approval is per-pool, not per-model. Changes that add/swap/evict pool members still flow through the hermes-phase-4 review queue as proposals (single approve/reject). **Ollama-first install (D4):** first-class install/swap/delete via Ollama REST (`/api/pull|delete|tags|show`); LM Studio / vLLM / llama.cpp are advisory only (copy-paste command). The orchestrator never starts or supervises the backend server.
   - **## Consequences** — Maximum "just works" with authority explicit at the budget+allowlist boundary; preserves the explicit-approval invariant (approved repo A is never silently swapped for repo B — cross-ref D13/0060); matches the existing "orchestrator doesn't manage the server" invariant; non-Ollama users get recommendations without auto-install disruption.
   - **## Alternatives rejected** — (a) per-model approval (defeats autonomy, operator toil); (b) multi-backend auto-install in v1 (no stable scriptable API beyond Ollama).
   - **## See also** — link ADR 0058, 0059, 0060, 0061; `docs/knowledge/orchestrator/local-model-lifecycle.md`; the operator guide (Task 3).
3. Run: `harness validate`
4. Commit: `docs(lmlm): add ADR 0062 pool-bounded autonomy and Ollama-first install`

### Task 3: Write the operator guide

**Depends on:** Task 2 | **Files:** `docs/guides/local-model-lifecycle.md` | **Category:** integration

1. Create `docs/guides/local-model-lifecycle.md` with a title `# Local Model Lifecycle Manager (Operator Guide)` and these sections:
   - **Overview** — one paragraph; LMLM is opt-in (`localModels.enabled = false` by default) and additive to `LocalModelResolver`.
   - **Enabling LMLM** — the `localModels` config block (copy from spec "Config schema" lines 210-230): `enabled`, `pool.{diskBudgetGb,allowedOrgs,allowedFamilies}`, `refresh.{intervalMs,proposalThreshold,jitterMs}`, `installer.{backend,ollamaEndpoint}`, `hardware.override`.
   - **First-time pool setup** — set a disk budget + allowlist (`harness models pool set-budget`, `pool allow-org`, `pool allow-family`); pool starts empty.
   - **What a proposal looks like** — the `justification` shape (summary, benchmarkBasis, hardwareFit, evidence, freshness); proposals arrive in the shared review queue.
   - **Approve / reject** — CLI (`harness models proposals`, `harness models approve <id>`, `harness models reject <id>`) and dashboard (`/s/local-models` Recommendations card; approve/reject via the shared `/api/v1/proposals/:id/{approve,reject}` route). Note the Pool card is read-only.
   - **## Known limitations (read before relying on autonomy)** — surface all three plainly:
     1. **Autonomous proposals are inert until Phase 2 lands.** The scheduler is seeded with an **empty candidate set**; the live-HF→RankerCandidate parser is not yet shipped, so the autonomous swap-proposal loop proposes nothing in production. Manual `harness models` commands, resolver-from-pool, and drift reconciliation all work today.
     2. **Dashboard Pool card is read-only.** No direct install/evict from the UI; mutate the pool via proposals + the CLI.
     3. **Eviction deferral (D10/S1) is agent-run-coarse.** It over-defers (safe) — a swap waits for a fully idle window rather than per-request granularity. See ADR 0060.
   - **Troubleshooting** — Ollama unreachable (`installer_unavailable`, pool unchanged, proposal stays pending, S6); HF unreachable (frozen snapshot, warning with snapshot date, S4); hardware detect failure (falls to CPU profile, S3); disk budget exceeded (rejected at engine layer, S5).
   - **See also** — link ADR 0061, 0062, 0058-0060; `docs/knowledge/orchestrator/local-model-lifecycle.md`; `docs/guides/multi-backend-routing.md`.
2. Run: `harness validate`
3. Commit: `docs(lmlm): add operator guide with known-limitations section`

### Task 4: Add LMLM opt-in section to multi-backend-routing guide

**Depends on:** Task 3 | **Files:** `docs/guides/multi-backend-routing.md` | **Category:** integration

1. Add a new section (before the closing "See also"/related-links block, which currently links `local-model-resolution.md` at ~line 187). Exact content:

   ```markdown
   ## Opting a backend into the Local Model Lifecycle Manager

   Backends of `type: local` or `type: pi` can hand pool management to the
   Local Model Lifecycle Manager (LMLM) by setting `localModels.enabled = true`
   in `harness.config.json`. When enabled, the resolver's candidate list is
   derived from LMLM pool state (ordered by score) instead of a hand-curated
   `model: [...]` array; the orchestrator proposes pool add/swap/evict changes
   through the review queue. With `localModels.enabled = false` (default),
   behavior is byte-identical to today's hand-curated lists.

   See the [Local Model Lifecycle Manager guide](./local-model-lifecycle.md).
   ```

2. Add `- [Local Model Lifecycle Manager](./local-model-lifecycle.md)` to the guide's See-also list.
3. Run: `harness validate`
4. Commit: `docs(lmlm): note LMLM opt-in in multi-backend-routing guide`

### Task 5: Note pool-managed models in provider-architecture

**Depends on:** Task 3 | **Files:** `docs/knowledge/intelligence/provider-architecture.md` | **Category:** integration

1. In the "## Per-Layer Model Overrides" section (currently ~line 41-63), after the `intelligence.models` example, append a sentence:
   ```markdown
   When LMLM is enabled (`localModels.enabled = true`), the model names referenced
   in a per-layer override (`intelligence.models.sel | pesl | ...`) can be
   pool-managed models — the same Ollama names LMLM installs and the resolver
   surfaces. The override resolves against whatever the pool has loaded.
   See the [Local Model Lifecycle](../orchestrator/local-model-lifecycle.md) knowledge doc.
   ```
2. Run: `harness validate`
3. Commit: `docs(lmlm): note pool-managed models in provider-architecture`

### Task 6: Add LMLM capability to README

**Depends on:** Task 3 | **Files:** `README.md` | **Category:** integration

1. In the orchestrator capabilities list (near the `**Orchestrator Gateway API**` bullet at ~line 30), add a sibling bullet:
   ```markdown
   - **Local Model Lifecycle Manager** — Opt-in (`localModels.enabled`) autonomy for the local model pool: hardware-aware ranking, disk-budget-bounded install/swap/evict through the review queue, and a `LocalModelResolver` that consumes pool state. Manual `harness models` + resolver-from-pool + drift reconciliation ship today; autonomous swap proposals await the Phase-2 candidate parser. See the [operator guide](docs/guides/local-model-lifecycle.md), [ADR 0061](docs/knowledge/decisions/0061-lmlm-package-boundary-and-native-ranking-port.md), and [ADR 0062](docs/knowledge/decisions/0062-pool-bounded-autonomy-and-ollama-first-install.md).
   ```
2. Run: `harness validate`
3. Commit: `docs(lmlm): add LMLM capability to README`

### Task 7: Cross-link ADRs + guide from the knowledge doc; link guide from guides index

**Depends on:** Task 3 | **Files:** `docs/knowledge/orchestrator/local-model-lifecycle.md`, `docs/guides/index.md` | **Category:** integration

1. In `docs/knowledge/orchestrator/local-model-lifecycle.md`, ensure a "See also" / decisions section links ADR **0061** and **0062** (alongside existing 0058-0060) and the operator guide `../../guides/local-model-lifecycle.md`. Verify the existing candidate-discovery-gap note (~line 106) is present; if it lacks a pointer to the guide's Known Limitations, add one sentence linking it.
2. In `docs/guides/index.md`, add a guide entry in the "## Available Guides" list (mirror the `### [Title](./file.md)` pattern):

   ```markdown
   ### [Local Model Lifecycle Manager](./local-model-lifecycle.md)

   Enable and operate the local model pool: hardware-aware recommendations,
   disk-budget-bounded install/swap/evict via the review queue, CLI + dashboard
   approve/reject, and known limitations.
   ```

3. Run: `harness validate`
4. Commit: `docs(lmlm): cross-link ADRs and operator guide`

### Task 8: Add changeset for changed published packages

**Depends on:** none | **Files:** `.changeset/lmlm-phases-4-7-backend.md` | **Category:** integration

1. Create `.changeset/lmlm-phases-4-7-backend.md` (dashboard already has its own changeset from Phase 8):

   ```markdown
   ---
   '@harness-engineering/local-models': minor
   '@harness-engineering/types': minor
   '@harness-engineering/core': minor
   '@harness-engineering/orchestrator': minor
   '@harness-engineering/cli': minor
   ---

   Local Model Lifecycle Manager (LMLM) backend: hardware-aware ranking + pool
   manager + Ollama installer in the new `@harness-engineering/local-models`
   package; generalized discriminated `ProposalSchema` (`kind: 'skill' | 'model'`,
   backward-compatible on read) in types + the shared proposal store in core;
   background refresh scheduler with silent drift reconciliation, the
   `/api/v1/local-models/*` read routes, kind-aware approve/reject, and
   `local-models:{pool,proposal}` WS topics in the orchestrator; and the
   `harness models {status,suggest,pool,proposals,approve,reject,install,evict,refresh}`
   CLI. Opt-in via `localModels.enabled`; default-off behavior is unchanged.
   ```

   Note: if the release gate requires one changeset per package, split this into five files with the same bodies scoped per package.

2. Run: `harness validate`
3. Commit: `chore(lmlm): add changeset for phases 4-7 backend packages`

### Task 9: Regenerate barrels and verify clean

**Depends on:** Task 8 | **Files:** barrel outputs (`packages/*/src/index.ts` generated regions), `scripts/generate-core-barrel.mjs` (only if allowlist drift) | **Category:** integration

1. Run: `pnpm generate:barrels`
2. Run: `pnpm generate:barrels:check` — must exit 0.
   - If the core barrel check fails because a genuinely-new core export (e.g. `createModelProposal`) is missing, the curated allowlist in `scripts/generate-core-barrel.mjs` needs the module added — the `proposals` module is deliberately not exported today, so only add it if `:check` proves a consumer needs it. Re-run `generate:barrels` then `:check`.
3. If step 1 produced diffs, stage the regenerated files. Run: `harness validate`
4. Commit (only if there is a diff): `chore(lmlm): regenerate barrel exports`

### Task 10: Regenerate plugin manifests and verify clean

**Depends on:** Task 9 | **Files:** `.claude-plugin/**`, `.cursor-plugin/**`, `.gemini-extension/**`, `agents/skills/**` (regen outputs) | **Category:** integration

1. Run: `pnpm generate:plugin:all`
2. Run: `pnpm generate:plugin:check` — must exit 0 for all four targets (claude, cursor, gemini, codex).
3. If step 1 produced diffs, stage the regenerated manifests. Run: `harness validate`
4. Commit (only if there is a diff): `chore(lmlm): regenerate plugin manifests`

### Task 11: Final verification — check-docs + validate delta

**Depends on:** Task 10 | **Files:** none (verification) | **Category:** integration

`[checkpoint:human-verify]` — Review the `harness check-docs` and `harness validate` output. Confirm: (a) no NEW broken-link/orphan findings for the added docs; (b) validate shows no NEW findings above the ~391 pre-existing baseline (a reduction in doc-coverage findings is expected and fine); (c) both regen `:check` commands are clean.

1. Run: `harness check-docs` — confirm the new guide + ADRs are linked (no orphan) and no broken links.
2. Run: `pnpm generate:barrels:check && pnpm generate:plugin:check` — confirm both clean.
3. Run: `harness validate` — compare finding count against the ~391 baseline; attribute any delta.
4. No commit (verification only). Report the deltas at the checkpoint.

---

## Sequencing Notes

- Tasks 1-2 (ADRs) first — the guide (Task 3) and README (Task 6) link them.
- Tasks 4-7 depend only on the guide existing (Task 3) and touch disjoint files — parallelizable.
- Task 8 (changeset) is independent of the docs tasks — parallelizable with 1-7.
- Tasks 9→10→11 (regen + verify) are serial and last; regen `:check` and `check-docs` must be clean before sign-off.

## Rollback / Safety

- All tasks are docs/changeset/regen only — no runtime code. Rollback is `git revert` of the docs commits.
- Regen tasks commit only when there is an actual diff; a clean `:check` with no diff means the earlier phases already regenerated correctly.
- Branch guard: this plan is committed on `feat/lmlm-wire-operator-surfaces`; verify `git branch --show-current` before each commit (concurrent automation can reset HEAD / wipe uncommitted files — commit per task).
