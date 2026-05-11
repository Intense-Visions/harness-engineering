# Plan: Phase 6 — Documentation, ADRs, knowledge graph

**Date:** 2026-05-09
**Spec:** `docs/changes/roadmap-tracker-only/proposal.md` (§"Documentation Updates", §"Architectural Decisions (ADRs)", §"Knowledge Impact", §"Implementation Order" Phase 6)
**Tasks:** 18
**Time:** ~85 minutes
**Integration Tier:** medium
**Session:** `changes--roadmap-tracker-only--proposal`

## Goal

Land all user-, operator-, and machine-facing documentation for file-less roadmap mode — three ADRs, four `business_*` knowledge entries under a new `docs/knowledge/roadmap/` domain, five reference/guide doc updates, an `AGENTS.md` pointer, and three package CHANGELOG entries via changesets — so that an operator can opt into file-less mode using only the published docs and an auditor can trace every architectural choice to a numbered, accepted ADR. Roll up the carry-forward housekeeping items that are still in scope for this phase: spec criterion F2 honesty fix, the two pre-existing typecheck regressions, and two micro test-cleanup deltas surfaced by REV-P4-2/REV-P4-3.

## Scope Notes (read first)

1. **No new product code in this phase.** Every task in this plan is markdown/JSON, except (a) Task 16 fixes one `Ok(...)` call site in `packages/core/src/roadmap/tracker/adapters/github-issues.ts` for TS2322, (b) Task 17 broadens one type parameter in `packages/cli/src/commands/validate.ts` for TS2379, and (c) Task 15 rewrites argument order in two existing test files. None of these change behavior — they are pure typecheck/test housekeeping that the prompt explicitly authorizes to be folded into Phase 6.
2. **The `docs/decisions/` directory does not exist.** The proposal references `docs/decisions/ADR-XXXX-*.md` but the project's actual ADR home is `docs/knowledge/decisions/NNNN-<slug>.md` (4-digit zero-padded), per `docs/knowledge/decisions/README.md`. ADRs land at `docs/knowledge/decisions/`. ADR numbers start at 0008 (highest existing is 0007). See §Decisions D-P6-A.
3. **CHANGELOG entries are added via `.changeset/<slug>.md` files, not by hand-editing `packages/*/CHANGELOG.md`.** The project uses `@changesets/cli`; CHANGELOG.md regenerates on `pnpm changeset version`. See §Decisions D-P6-B.
4. **New knowledge domain `roadmap` lands at `docs/knowledge/roadmap/`** with four `.md` files: one `business_concept`, one `business_rule`, one `business_process` (migration), and an update to the existing `docs/knowledge/dashboard/claim-workflow.md` (which stays in the `dashboard` domain — the file-less branch is a workflow extension, not a new concept).
5. **Roadmap row status.** The `Tracker-Only Roadmap (File-less Mode)` row currently reads `Status: planned`. By Phase 6 completion, Phases 1–6 will be landed but Phase 7 (Dashboard conflict UX) remains. Per D-P6-C, this row flips to `Status: in-progress` (NOT `done`) because the proposal scope still includes Phase 7 as a GA blocker. The summary stays unchanged.
6. **Spec criterion F2 fix.** Per the carry-forward `_carryForwardForPhase6` recorded in autopilot-state.json and Phase 2 decision D-P2-B, the wording of F2 in `proposal.md` is rewritten from "produce one success and one ConflictError" to "best-effort detection of concurrent claim races, surfaced as ConflictError when detected". This is an in-place edit to the proposal; the corresponding integration test (Phase 4) already aligns with the relaxed semantics.
7. **Three ADRs, not two.** Proposal §"Architectural Decisions (ADRs)" lists two. Carry-forward REV-P4-6 / VER-P4-S4 asks for a third ADR (or a §inside an existing one) that explains the `tracker.kind: 'github-issues'` (orchestrator workflow) vs `roadmap.tracker.kind: 'github'` (file-backed sync) schema-kind decoupling. Per D-P6-D, this lands as a dedicated third ADR (0010) so it has its own number and search index, rather than being buried inside one of the other two.
8. **Layer rules.** Phase 6 touches only `docs/` and `.changeset/` for the bulk of the work, plus one source-file fix in `packages/core/` (Task 16), one in `packages/cli/` (Task 17), and two test files (Task 15). No cross-package import shuffling, no barrel changes, no API surface changes.
9. **Auto-upgrade rule.** Per prompt: if task count >20 or checkpoint count >6, plan auto-upgrades to high complexity for APPROVE_PLAN. This plan has 18 tasks and 2 checkpoints, so it stays at the default medium band.
10. **Out of scope (deferred).** Phase 7 (Dashboard conflict UX) — that is the explicit next-phase deliverable, with its own plan, and the dashboard work is gated by a server contract decision from Phase 4 (D-P4-B). All Phase-2 REVIEW deferred suggestions (9 items, listed in Phase 2 carry-forward) that are not in the Phase-6 prompt remain deferred. REV-P4-1 (tautological D4 divergence test) is explicitly deferred per the prompt ("minor, defer"). REV-P5-S1 through REV-P5-S7 are mentioned in the migration knowledge entry where relevant; they are not code-fix tasks in Phase 6.

## Decisions

| #      | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P6-A | ADR home is `docs/knowledge/decisions/` not `docs/decisions/`. Use 4-digit zero-padded sequential numbers `0008`, `0009`, `0010`. File-name pattern `NNNN-<slug>.md`. Frontmatter follows `docs/knowledge/decisions/README.md` (`number`, `title`, `date`, `status: accepted`, `tier`, `source`).                                                                                                                                                            | The proposal references `docs/decisions/` which does not exist. The actual ADR ingestion pipeline reads `docs/knowledge/decisions/`. Filing under the non-existent path would silently exclude these ADRs from the knowledge graph.                                                                                                                                                                                                                   |
| D-P6-B | CHANGELOG entries are added as `.changeset/<slug>.md` files, NOT by editing `packages/{core,orchestrator,cli}/CHANGELOG.md` directly. Use one combined changeset per package-set: `.changeset/file-less-roadmap-mode.md` covering all three packages (`core: minor`, `orchestrator: minor`, `cli: minor`) plus one entry per separable concern if cross-package coupling is misleading.                                                                      | `@changesets/cli` is the project standard (verified by `.changeset/config.json` + commit `ba8da2e3` which holds two changeset files). Hand-editing `CHANGELOG.md` desyncs with the generator. A single changeset is correct because all three packages ship the same feature on the same release cycle.                                                                                                                                               |
| D-P6-C | Roadmap row for `Tracker-Only Roadmap (File-less Mode)` flips from `Status: planned` to `Status: in-progress`. Plan field updates from `—` to point at `docs/changes/roadmap-tracker-only/plans/` (the directory). The summary line stays unchanged.                                                                                                                                                                                                         | `done` is wrong because Phase 7 is still pending. `planned` is wrong because Phases 1–6 are landed. `in-progress` is the only status that honestly captures "GA blocker remaining". Pointing the Plan field at the plans directory (not a single plan) is consistent with how multi-phase efforts are listed elsewhere in `docs/roadmap.md` (cross-check: `Multi-Backend Routing` row at line 1095 uses `docs/changes/multi-backend-routing/plans/`). |
| D-P6-D | Third ADR `0010-roadmap-tracker-kind-schema-decoupling.md` lands as its own ADR (NOT as a §inside one of the other two). Title: "Roadmap tracker.kind schema is decoupled between orchestrator workflow config (`github-issues`) and roadmap sync config (`github`)".                                                                                                                                                                                        | The two existing tracker.kind enums live in different config schemas (orchestrator workflow vs roadmap sync) and they evolved independently. A standalone ADR is searchable (`grep tracker.kind` finds it), has its own number for cross-reference, and is the kind of question the next maintainer asks. Folding into ADR 0009 would dilute the audit-history rationale.                                                                             |
| D-P6-E | Phase 6 folds in pre-existing TS2322 (core) + TS2379 (cli) as dedicated fix commits with no other changes. The two fixes are scoped to the minimum diff that makes `pnpm -r typecheck` green and they ship in this phase (NOT a follow-up) because (a) the prompt explicitly authorizes "dedicated fix commit" treatment for both, (b) leaving typecheck red while landing doc changes pollutes the green-build invariant Phase 6 is otherwise establishing. | Doc-only phases that accidentally leave typecheck red turn into noisy bisect surfaces three months later. Fixing them in this phase costs ~5 minutes (each is a one-line widen-the-type change) and removes a latent landmine.                                                                                                                                                                                                                        |
| D-P6-F | REV-P4-2 (ConflictError constructor arg order in 2 test files) and REV-P4-3 (missing "cascade dropped" footnote test for S1 manage_roadmap) are folded into a single test-cleanup commit. REV-P4-4 (S6 generic 502 vs S3/S5 specific 409) is documented as a known asymmetry in the migration knowledge entry's "Operator notes" section but NOT fixed in this phase. REV-P4-1 is deferred per the prompt.                                                   | These are tiny test-only deltas with no behavioral risk and the next author who reads those test files will be confused without them. Fixing the S6/S3/S5 asymmetry is a real refactor (`makeConflictBody` helper extraction) and belongs in a separate change request — documenting it in knowledge prevents the "did you know" surprise.                                                                                                            |
| D-P6-G | Knowledge entries reference REV-P5-S1 (history-hash day-granularity), REV-P5-S7 (no advisory lockfile), and C-P5-rawBody-resolver-overupdates inline in the `Roadmap Migration to File-less Mode` business_process entry as "Known limitations" — not in the migration guide proper (which already covers C-P5-rawBody-resolver-overupdates per Phase 5).                                                                                                    | Knowledge entries are the place an LLM looks when answering "why does migration sometimes inflate Would-update counts?" — putting these caveats in the structured knowledge file makes them retrievable. The migration guide is the operator's first-read; it already explains C-P5-rawBody-resolver-overupdates and doesn't need to grow.                                                                                                            |

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous (ADR presence and pipeline ingestability):** Three ADR files shall exist at `docs/knowledge/decisions/0008-tracker-abstraction-in-core.md`, `docs/knowledge/decisions/0009-audit-history-as-issue-comments.md`, and `docs/knowledge/decisions/0010-roadmap-tracker-kind-schema-decoupling.md`. Each file shall have YAML frontmatter with `number`, `title`, `date`, `status: accepted`, `tier`, `source` populated and three body sections titled `## Context`, `## Decision`, `## Consequences`. _(Trace: Tasks 4, 5, 6.)_

2. **Ubiquitous (proposal §F2 honesty fix):** The line in `docs/changes/roadmap-tracker-only/proposal.md` matching `Two concurrent claim attempts.*produce one success` shall be replaced with wording that says "best-effort detection of concurrent claim races, surfaced as ConflictError when detected" (substring match accepted). _(Trace: Task 1.)_

3. **Ubiquitous (roadmap row update):** The `Tracker-Only Roadmap (File-less Mode)` row in `docs/roadmap.md` shall read `**Status:** in-progress` (NOT `planned`, NOT `done`) and `**Plan:** docs/changes/roadmap-tracker-only/plans/` (NOT `—`). _(Trace: Task 2.)_

4. **Ubiquitous (knowledge domain exists):** A new directory `docs/knowledge/roadmap/` shall exist and contain at least three files: `file-less-roadmap-mode.md` (business*concept), `tracker-as-source-of-truth.md` (business_rule), `roadmap-migration-to-file-less.md` (business_process). Each file shall start with valid YAML frontmatter containing `type`, `domain: roadmap`, and `tags`. *(Trace: Tasks 7, 8, 9.)\_

5. **Ubiquitous (updated claim-workflow):** The file `docs/knowledge/dashboard/claim-workflow.md` shall contain a step or sub-bullet describing the file-less branch with the substring `client.claim()` AND (case-insensitive substring) `ETag` AND `conflict`. _(Trace: Task 10.)_

6. **Ubiquitous (roadmap-sync guide):** `docs/guides/roadmap-sync.md` shall contain a heading `## File-less mode` (or contains the substring `## File-less` at heading depth `##`) and that section shall include subsections covering opt-in, behavioral differences, migration command, and troubleshooting. _(Trace: Task 11.)_

7. **Ubiquitous (configuration reference):** `docs/reference/configuration.md` shall document the `roadmap.mode` field in the `RoadmapConfig Object` table with `Type: '"file-backed" | "file-less"'`, `Required: No`, `Default: "file-backed"`. The configuration document shall additionally describe the two `harness validate` rules `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT`. _(Trace: Task 12.)_

8. **Ubiquitous (cli-commands reference):** `docs/reference/cli-commands.md` shall contain a `### harness roadmap migrate` (or `### harness roadmap`) heading documenting `--to=file-less` and `--dry-run` flags, with at least one usage example. _(Trace: Task 13.)_

9. **Ubiquitous (mcp-tools reference):** `docs/reference/mcp-tools.md` `### manage_roadmap` section shall include a note that the tool's behavior is mode-aware (substring match: "mode" AND "file-less"). _(Trace: Task 14.)_

10. **Ubiquitous (AGENTS.md pointer):** The Roadmap section of `AGENTS.md` shall contain a single-line note pointing readers at the `roadmap.mode` flag and the new mode guide. Substring match: `roadmap.mode` AND `file-less`. _(Trace: Task 3.)_

11. **Ubiquitous (changeset entry):** A new changeset file under `.changeset/` shall exist (filename slug: `file-less-roadmap-mode`) declaring `@harness-engineering/core`, `@harness-engineering/orchestrator`, and `@harness-engineering/cli` at `minor` bump, with body text covering: lifted `IssueTrackerClient` interface and tracker submodule in core, new `tracker.kind: "github-issues"` adapter in orchestrator, `harness roadmap migrate` command in cli, and the new `roadmap.mode` config field. _(Trace: Task 18.)_

12. **Event-driven (typecheck green):** When `pnpm -r typecheck` runs after Task 16 and Task 17, it shall exit 0. (Today it fails with TS2322 in core and TS2379 in cli — both pre-existing, both in scope per the prompt.) _(Trace: Tasks 16, 17, plus final validation in Task 18.)_

13. **Ubiquitous (test cleanup REV-P4-2 + REV-P4-3):** After Task 15, (a) `ConflictError` constructors in `packages/cli/tests/mcp/tools/roadmap.file-less.test.ts:~221` and `packages/orchestrator/tests/tracker/adapters/github-issues-issue-tracker.test.ts:~145` shall pass arguments in the same order as the `ConflictError` class definition; (b) `packages/cli/tests/mcp/tools/roadmap.file-less.test.ts` shall contain at least one test asserting the "cascade dropped" footnote behavior for the S1 `manage_roadmap update` sub-action. _(Trace: Task 15.)_

14. **Ubiquitous (harness validate):** `harness validate` and `harness check-deps` shall pass at every task's final step. _(Trace: every task.)_

15. **Ubiquitous (pipeline integration verified):** After all tasks land, the knowledge pipeline shall ingest the three ADR files as `decision` nodes and the four knowledge files as `business_concept`/`business_rule`/`business_process` nodes. (Verified by spot-running `harness knowledge-pipeline --domain roadmap` in detect mode and confirming the new domain is recognized — see Task 18 final step.) _(Trace: Task 18.)_

## File Map

**CREATE (knowledge domain & entries):**

- `docs/knowledge/roadmap/file-less-roadmap-mode.md` — new `business_concept` (Task 7).
- `docs/knowledge/roadmap/tracker-as-source-of-truth.md` — new `business_rule` (Task 8).
- `docs/knowledge/roadmap/roadmap-migration-to-file-less.md` — new `business_process` (Task 9).

**CREATE (ADRs):**

- `docs/knowledge/decisions/0008-tracker-abstraction-in-core.md` (Task 4).
- `docs/knowledge/decisions/0009-audit-history-as-issue-comments.md` (Task 5).
- `docs/knowledge/decisions/0010-roadmap-tracker-kind-schema-decoupling.md` (Task 6).

**CREATE (changeset):**

- `.changeset/file-less-roadmap-mode.md` (Task 18).

**MODIFY (docs):**

- `docs/changes/roadmap-tracker-only/proposal.md` — F2 wording (Task 1).
- `docs/roadmap.md` — Tracker-Only row status + plan (Task 2).
- `AGENTS.md` — Roadmap section one-liner (Task 3).
- `docs/knowledge/dashboard/claim-workflow.md` — step 4 file-less branch (Task 10).
- `docs/guides/roadmap-sync.md` — `## File-less mode` section (Task 11).
- `docs/reference/configuration.md` — `roadmap.mode` field + validation rules (Task 12).
- `docs/reference/cli-commands.md` — `harness roadmap migrate` subcommand (Task 13).
- `docs/reference/mcp-tools.md` — `manage_roadmap` mode-aware note (Task 14).

**MODIFY (test cleanup, D-P6-F):**

- `packages/cli/tests/mcp/tools/roadmap.file-less.test.ts` — ConflictError arg order + cascade-dropped test (Task 15).
- `packages/orchestrator/tests/tracker/adapters/github-issues-issue-tracker.test.ts` — ConflictError arg order (Task 15).

**MODIFY (typecheck housekeeping, D-P6-E):**

- `packages/core/src/roadmap/tracker/adapters/github-issues.ts:254` — TS2322 fix (Task 16).
- `packages/cli/src/commands/validate.ts:153` — TS2379 fix (Task 17).

## Skeleton

_Skeleton produced and self-approved per standard rigor at 18 tasks; the skeleton is recorded here for review:_

1. Spec & roadmap surface fixes (~3 tasks, ~10 min) — proposal F2, roadmap row, AGENTS.md.
2. ADRs (~3 tasks, ~18 min) — 0008 tracker-in-core, 0009 audit-history, 0010 schema-decoupling.
3. New `roadmap/` knowledge domain (~3 tasks, ~18 min) — concept, rule, migration process.
4. Update existing knowledge (~1 task, ~4 min) — claim-workflow.md.
5. Reference & guide docs (~4 tasks, ~22 min) — guides/roadmap-sync, reference/configuration, reference/cli-commands, reference/mcp-tools.
6. Test cleanup & typecheck (~3 tasks, ~10 min) — REV-P4-2+REV-P4-3, TS2322, TS2379.
7. Changeset + final validation (~1 task, ~3 min).

**Estimated total:** 18 tasks, ~85 minutes. _Skeleton approved: yes (self-approved at standard rigor; no auto-upgrade triggered)._

## Tasks

### Task 1: Rewrite proposal §F2 to honest "best-effort" wording

**Depends on:** none | **Files:** `docs/changes/roadmap-tracker-only/proposal.md` | **Category:** docs

1. Open `docs/changes/roadmap-tracker-only/proposal.md`. Locate the row in the `### Functional` table starting with `| F2  | Two concurrent claim attempts on the same feature produce one success and one ` (line ~300).
2. Replace the entire `Criterion` cell with: `Best-effort detection of concurrent claim races: when a concurrent claim is detected via refetch-and-compare, the losing call returns ConflictError. GitHub REST does not honor If-Match on PATCH, so detection is not guaranteed for interleavings where the window between read and write is microscopic (see ADR 0009 §Consequences and Phase 2 decision D-P2-B).`
3. Replace the `Verification` cell with: `Unit test: two clients race claim() with stale ETags; the test asserts that EITHER one returns ConflictError (detection case) OR both succeed and the integration test layer logs the missed race for telemetry (undetected case).`
4. Run: `harness validate` (no code change, but exercises markdown link integrity).
5. Commit: `docs(roadmap-tracker-only): honest F2 wording — best-effort race detection per D-P2-B`.

### Task 2: Flip `Tracker-Only Roadmap (File-less Mode)` row to in-progress in `docs/roadmap.md`

**Depends on:** none | **Files:** `docs/roadmap.md` | **Category:** integration

1. Open `docs/roadmap.md`. Locate the section starting at line ~1102 (`### Tracker-Only Roadmap (File-less Mode)`).
2. Change `- **Status:** planned` → `- **Status:** in-progress` (rationale: Phases 1–6 complete, Phase 7 dashboard conflict UX still pending — `done` would be premature; `planned` is now wrong).
3. Change `- **Plan:** —` → `- **Plan:** docs/changes/roadmap-tracker-only/plans/` (mirrors `Multi-Backend Routing` row at line ~1101).
4. Leave `**Spec**`, `**Summary**`, `**Blockers**` unchanged.
5. Run: `harness validate`. Run: `harness check-deps`.
6. Commit: `docs(roadmap): mark tracker-only roadmap row in-progress; point Plan at plans/ dir`.

### Task 3: Add one-line file-less pointer to AGENTS.md Roadmap section

**Depends on:** none | **Files:** `AGENTS.md` | **Category:** integration

1. Open `AGENTS.md`. Locate `### Project Roadmap` section (heading at line ~502).
2. After the existing `**External tracker sync** —` paragraph (line ~506) and before `**Auto-pick pilot** —` (line ~508), insert a new paragraph:

   ```
   **File-less mode (opt-in)** — Setting `roadmap.mode: "file-less"` in `harness.config.json` makes the configured GitHub Issues tracker the canonical roadmap; `docs/roadmap.md` must not exist. All consumers (CLI, dashboard, MCP `manage_roadmap`, orchestrator, `harness:roadmap-pilot`) branch on the mode flag at runtime. Migrate with `harness roadmap migrate --to=file-less`. See `docs/guides/roadmap-sync.md` §"File-less mode" and ADRs 0008–0010 for the design rationale.
   ```

3. Run: `harness validate`. Run: `harness check-deps`.
4. Commit: `docs(agents): point at roadmap.mode file-less flag in Roadmap section`.

### Task 4: Write ADR 0008 — Tracker abstraction lives in `@harness-engineering/core`

**Depends on:** none | **Files:** `docs/knowledge/decisions/0008-tracker-abstraction-in-core.md` | **Category:** integration

1. Verify the next free ADR number with: `ls docs/knowledge/decisions/ | grep -E '^[0-9]{4}-' | sort | tail -3`. Expected highest: `0007-multi-provider-intelligence-pipeline.md`. Confirm 0008 is unused.
2. Create `docs/knowledge/decisions/0008-tracker-abstraction-in-core.md` with frontmatter:

   ```yaml
   ---
   number: 0008
   title: IssueTrackerClient abstraction lives in @harness-engineering/core
   date: 2026-05-09
   status: accepted
   tier: medium
   source: docs/changes/roadmap-tracker-only/proposal.md
   ---
   ```

3. Write three sections:
   - **## Context** — Describe the pre-Phase-1 state: tracker logic in `packages/orchestrator/src/tracker/adapters/roadmap.ts`, no abstraction accessible to non-orchestrator consumers (CLI MCP tool, dashboard, planning skills). Reference the three alternative locations considered: `packages/types` (rejected — interface-only, can't ship a reference implementation), `packages/orchestrator` (rejected — non-orchestrator consumers would have to depend on the orchestrator runtime), `packages/core` (chosen).
   - **## Decision** — Lift the `IssueTrackerClient` interface and shared types (`TrackedFeature`, `ConflictError`, `FeaturePatch`, `HistoryEvent`) to `packages/core/src/roadmap/tracker/`. The orchestrator's existing `RoadmapTrackerAdapter` keeps its file-backed role; the new `GitHubIssuesTrackerAdapter` (in `packages/core/src/roadmap/tracker/adapters/github-issues.ts`) implements the lifted interface for file-less mode. Factory at `packages/core/src/roadmap/tracker/factory.ts`. Re-exported via `packages/core/src/roadmap/index.ts`. Cross-reference Phase 1 + Phase 2 commits (`107cc794`–`2b308d23`).
   - **## Consequences** — Positive: CLI MCP tool, dashboard claim route, `harness roadmap migrate`, and roadmap-pilot scoring all import the same client. Layer rules preserved (core is lowest layer). Negative: any future tracker backend (Linear, Jira) implements the interface in core, growing core's surface — but the alternative (per-package adapters) re-creates the divergence. Neutral: orchestrator file-backed adapter and core file-less adapter coexist behind the factory; `createTrackerClient(config)` dispatches on `tracker.kind`.
4. Add a `## Related` section linking to ADR 0009, ADR 0010, `docs/changes/roadmap-tracker-only/proposal.md`, and `docs/guides/roadmap-sync.md`.
5. Run: `harness validate`. Run: `harness check-deps`.
6. Commit: `docs(adr): 0008 tracker abstraction lives in @harness-engineering/core`.

### Task 5: Write ADR 0009 — Audit history stored as GitHub issue comments

**Depends on:** Task 4 | **Files:** `docs/knowledge/decisions/0009-audit-history-as-issue-comments.md` | **Category:** integration

1. Create `docs/knowledge/decisions/0009-audit-history-as-issue-comments.md` with frontmatter:

   ```yaml
   ---
   number: 0009
   title: Roadmap audit history stored as GitHub issue comments
   date: 2026-05-09
   status: accepted
   tier: medium
   source: docs/changes/roadmap-tracker-only/proposal.md
   ---
   ```

2. Write three sections:
   - **## Context** — The pre-Phase-2 proposal sketched a local-file audit log (`docs/roadmap.audit.jsonl`). Problems: per-clone divergence (each developer's pilot-affinity score reads a different history), gitignored noise, no UI surface in GitHub. Alternatives considered: (a) local file (rejected — re-creates per-clone divergence), (b) `.harness/audit.jsonl` checked-in (rejected — merge-conflict surface and bloats git history), (c) issue comments (chosen).
   - **## Decision** — Each history event is posted as a GitHub issue comment with a content-addressed HTML-comment marker:

     ```
     <!-- harness-history hash:<short8> -->
     {"type":"assigned","actor":"alice","at":"2026-05-09T12:00:00Z","details":{...}}
     ```

     The hash is `sha256(type + actor + at + JSON.stringify(details ?? {}))` truncated to 8 hex chars. `fetchHistory(externalId, limit?)` filters comments by the prefix and parses the JSON envelope. `appendHistory(externalId, event)` skips events whose hash already exists on the issue. See Phase 2 `GitHubIssuesTrackerAdapter.appendHistory` and Phase 5 `packages/core/src/roadmap/migrate/history-hash.ts`. Cost: one extra GitHub API call per history event, bounded by human action rate.

   - **## Consequences** — Positive: append-only, conflict-free, visible to all clones and the GitHub UI, survives clone deletion. The hash prevents migration re-runs from posting duplicates. Negative: history is not queryable without listing issue comments (cannot do `WHERE assignee='alice' AND date >…` in a single API call); for cross-feature reporting, Phase 6+ work would need a comment-aggregating cache. Neutral: history events are not editable post-hoc (a comment can be edited or deleted by privileged users, but harness ignores any comment whose body fails the hash check). **F2 honesty footnote:** A consequence of the comment-based model is that there is no transactional read-modify-write on issue state; concurrent claim races are detected best-effort via refetch-and-compare (NOT atomically prevented). See proposal §Success Criteria F2 wording (Task 1).

3. Add a `## Related` section linking to ADR 0008, ADR 0010, the Phase 5 migration knowledge entry, and `packages/core/src/roadmap/migrate/history-hash.ts`.
4. Run: `harness validate`. Run: `harness check-deps`.
5. Commit: `docs(adr): 0009 audit history stored as GitHub issue comments`.

### Task 6: Write ADR 0010 — `tracker.kind` schema decoupling between workflow and roadmap-sync

**Depends on:** Task 5 | **Files:** `docs/knowledge/decisions/0010-roadmap-tracker-kind-schema-decoupling.md` | **Category:** integration

1. Create `docs/knowledge/decisions/0010-roadmap-tracker-kind-schema-decoupling.md` with frontmatter:

   ```yaml
   ---
   number: 0010
   title: tracker.kind schema decoupling — orchestrator workflow vs roadmap sync
   date: 2026-05-09
   status: accepted
   tier: small
   source: docs/changes/roadmap-tracker-only/proposal.md
   ---
   ```

2. Write three sections:
   - **## Context** — Two `tracker.kind` enums exist in the config schema:
     - `tracker.kind: "github-issues"` (in orchestrator workflow config: `packages/orchestrator/src/config/workflow.ts` — selects `GitHubIssuesTrackerAdapter` for orchestrator agent dispatch).
     - `roadmap.tracker.kind: "github"` (in roadmap sync config: `packages/cli/src/config/schema.ts` — selects the file-backed `syncToExternal` / `syncFromExternal` engine).
       They evolved independently (the orchestrator one is newer, added in Phase 4). They are different concepts: workflow `tracker.kind` selects the runtime client; roadmap `tracker.kind` declares the project's canonical sync backend. Until this ADR, the relationship was undocumented and several reviewers asked "should these be the same enum?".
   - **## Decision** — Keep them as separate enums with different value spaces. `roadmap.tracker.kind` stays `"github"` (single value, file-backed sync engine). `workflow.tracker.kind` is `"local"` | `"github"` | `"github-issues"` (the third value selects the file-less adapter at orchestrator construction time — see Phase 4 commit `4039272d` / `D-P4-E`). The `"github"` value is shared by both schemas but means different things in each context: in `roadmap.tracker`, it identifies the file-backed sync target; in `workflow.tracker`, it identifies the orchestrator's pre-file-less GitHub integration (kept for backward compatibility — Phase 4 deliberately avoided breaking the existing value). Config-validator helper `getRoadmapMode` reads `roadmap.mode` only; nothing flows between the two enums.
   - **## Consequences** — Positive: each schema can evolve without breaking the other. The orchestrator can add `"linear"` to its `workflow.tracker.kind` without touching the file-backed sync engine, and vice versa. Negative: reviewers see two values named `kind` and assume they're the same field — mitigated by this ADR and by the `roadmap.mode` doc in `docs/reference/configuration.md` (Task 12). Neutral: a future unification (single tracker.kind enum across both schemas) is possible but would be a breaking config change; no urgency.
3. Add a `## Related` section linking to ADR 0008, ADR 0009, the Phase 4 plan, the Phase 4 commits `2292b24c` (S2 stub removal) and `4039272d` (createTracker dispatch), and `docs/reference/configuration.md`.
4. Run: `harness validate`. Run: `harness check-deps`.
5. Commit: `docs(adr): 0010 tracker.kind schema decoupling between workflow and roadmap sync`.

### Task 7: Write knowledge entry — `file-less-roadmap-mode` (business_concept)

**Depends on:** Task 6 | **Files:** `docs/knowledge/roadmap/file-less-roadmap-mode.md` | **Category:** integration

1. Create `docs/knowledge/roadmap/` directory if it does not exist: `mkdir -p docs/knowledge/roadmap`.
2. Create `docs/knowledge/roadmap/file-less-roadmap-mode.md` with frontmatter:

   ```yaml
   ---
   type: business_concept
   domain: roadmap
   tags: [file-less, tracker, github-issues, multi-session, etag, opt-in, mode]
   ---
   ```

3. Write `# File-less Roadmap Mode` as the H1, then a one-paragraph "what it is" summary followed by sections:
   - `## What it is` — Opt-in mode where `roadmap.mode: "file-less"` makes the configured external tracker (today: GitHub Issues; designed pluggable for Linear/Jira) the canonical roadmap store. `docs/roadmap.md` does not exist in file-less projects.
   - `## Activation` — Single config flag `roadmap.mode: "file-less"` plus a one-shot migration via `harness roadmap migrate --to=file-less`. Validation rules `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT` enforce consistency.
   - `## Architecture` — Single shared `IssueTrackerClient` interface in `@harness-engineering/core` (see ADR 0008). ETag-conditional reads (`If-None-Match`, returns 200 or 304); best-effort conflict detection on writes via refetch-and-compare (see ADR 0009 §Consequences and proposal §F2 — GitHub REST does not honor `If-Match` on PATCH).
   - `## Cross-links` — Mentions: `Roadmap Claim Workflow` (`docs/knowledge/dashboard/claim-workflow.md`), `Web Dashboard` (`docs/knowledge/dashboard/web-dashboard.md`), `Tracker as Source of Truth` (sibling business_rule, Task 8), `Roadmap Migration to File-less Mode` (sibling business_process, Task 9).
   - `## Key Files` — Bulleted list with: `packages/core/src/roadmap/tracker/types.ts`, `packages/core/src/roadmap/tracker/factory.ts`, `packages/core/src/roadmap/tracker/adapters/github-issues.ts`, `packages/core/src/roadmap/mode.ts` (getRoadmapMode helper), `packages/core/src/validation/roadmap-mode.ts` (validator).
4. Run: `harness validate`. Run: `harness check-deps`.
5. Commit: `docs(knowledge): add roadmap/file-less-roadmap-mode business_concept`.

### Task 8: Write knowledge entry — `tracker-as-source-of-truth` (business_rule)

**Depends on:** Task 7 | **Files:** `docs/knowledge/roadmap/tracker-as-source-of-truth.md` | **Category:** integration

1. Create `docs/knowledge/roadmap/tracker-as-source-of-truth.md` with frontmatter:

   ```yaml
   ---
   type: business_rule
   domain: roadmap
   tags: [file-less, source-of-truth, invariant, validation, tracker]
   ---
   ```

2. Write `# Tracker as Source of Truth` H1, then:
   - `## Rule` — When `roadmap.mode === "file-less"`:
     1. The configured external tracker (`roadmap.tracker.kind: "github"` — at least, until additional kinds ship) is the canonical store of all features, statuses, assignments, and history.
     2. `docs/roadmap.md` MUST NOT exist (enforced by validation rule `ROADMAP_MODE_FILE_PRESENT`).
     3. `roadmap.tracker` MUST be configured (enforced by validation rule `ROADMAP_MODE_MISSING_TRACKER`).
     4. All consumers (CLI MCP `manage_roadmap`, dashboard claim endpoint, orchestrator `RoadmapTrackerAdapter`, `harness:roadmap-pilot`, brainstorming, planning) MUST route reads and writes through an `IssueTrackerClient` instance obtained from `createTrackerClient(config)`.
   - `## Enforcement` — Three layers:
     1. **Config-load time:** `validateRoadmapMode` (`packages/core/src/validation/roadmap-mode.ts`) runs as part of `harness validate` and rejects misconfigurations.
     2. **Runtime:** consumers branch on `loadProjectRoadmapMode(projectRoot)` and dispatch to file-less code paths. The Phase 4 audit (`stubAuditAfter: 0`) confirms zero un-wired sites.
     3. **Migration:** `harness roadmap migrate --to=file-less` enforces the file→tracker move atomically (config flip is gated behind successful tracker writes — see migration knowledge entry, Task 9).
   - `## Exceptions` — None. There is no "hybrid" mode and no local fallback. Teams without a tracker stay on file-backed mode (the default).
   - `## Why this rule exists` — Two reasons: (a) prevents per-clone divergence — every developer's `harness:roadmap-pilot` reads the same affinity history; (b) eliminates the multi-session write conflict on `docs/roadmap.md` that motivated this whole proposal (see `docs/changes/roadmap-tracker-only/proposal.md` §Overview).
   - `## Cross-links` — `File-less Roadmap Mode` (sibling concept), ADR 0008, ADR 0009.
3. Run: `harness validate`. Run: `harness check-deps`.
4. Commit: `docs(knowledge): add roadmap/tracker-as-source-of-truth business_rule`.

### Task 9: Write knowledge entry — `roadmap-migration-to-file-less` (business_process)

**Depends on:** Task 8 | **Files:** `docs/knowledge/roadmap/roadmap-migration-to-file-less.md` | **Category:** integration

1. Create `docs/knowledge/roadmap/roadmap-migration-to-file-less.md` with frontmatter:

   ```yaml
   ---
   type: business_process
   domain: roadmap
   tags: [file-less, migration, dry-run, idempotent, archive, github-issues, operator]
   ---
   ```

2. Write `# Roadmap Migration to File-less Mode` H1, then:
   - `## Trigger` — Operator runs `harness roadmap migrate --to=file-less [--dry-run]` after configuring `roadmap.tracker` and confirming the pre-flight checklist (see `docs/changes/roadmap-tracker-only/migration.md` §"Pre-flight checklist").
   - `## Flow` — Numbered steps mirroring Phase 5 `packages/core/src/roadmap/migrate/run.ts`:
     1. Verify `roadmap.tracker` configured (else abort with `ROADMAP_MODE_MISSING_TRACKER`).
     2. Parse current `docs/roadmap.md`.
     3. For each feature without an `External-ID`: `client.create()`. Title-only collisions (existing issue with same title, no External-ID recorded) refuse and exit AMBIGUOUS (decision D-P5-E).
     4. For each feature: `client.update()` to write body metadata block (`bodyMetaMatches` short-circuits unchanged blocks, decision D-P5-B).
     5. For each pre-existing Assignment-History row: `client.appendHistory()` skipping events whose hash already exists (decision D-P5-C — see ADR 0009).
     6. Rename `docs/roadmap.md` → `docs/roadmap.md.archived`. Archive collisions refuse-and-abort (decision D-P5-D).
     7. Write `harness.config.json.pre-migration` byte-for-byte backup (decision D-P5-F), then mutate `harness.config.json` to set `roadmap.mode: "file-less"`.
   - `## Dry run` — `--dry-run` performs steps 1–4 in-memory; no GitHub writes. Output shows `Would create: N`, `Would update: M`, `Unchanged: K`, `Would append history: H`, `Ambiguous: A`.
   - `## Idempotence` — Re-runs after success exit at step 1 with `Already migrated; nothing to do.`. Re-runs after partial failure pick up where they stopped: step 3 skips features with recorded External-IDs; step 5 skips events whose hash is already posted.
   - `## Known limitations (carry-forward)` — Per decision D-P6-G:
     - **REV-P5-S1 history-hash day-granularity:** Events on the same day with the same `type` + `actor` collide (different `details` payloads notwithstanding, the hash deduplicates them). Acceptable for migration backfill of legacy Assignment-History tables (which only record `assigned` / `released` / `completed` at day-grain anyway). Future history events from interactive workflows hash at second-grain via the `at` field.
     - **REV-P5-S7 no advisory lockfile:** Two concurrent `harness roadmap migrate` invocations (e.g., the operator + a CI run in the same minute) are not prevented by harness itself — coordination is the operator's responsibility. The migration guide flags this in §"Pre-flight checklist".
     - **C-P5-rawBody-resolver-overupdates:** The Phase 2 GitHub Issues adapter does not expose raw issue bodies, so `bodyMetaMatches` cannot short-circuit unchanged-body cases — re-runs report inflated `Would update` counts. The dry-run plan is still safe to execute (writes are idempotent at the adapter level); the inflation is cosmetic. Migration guide explains in §"Re-run output looks different from a fresh run".
   - `## Rollback recipe` — Restore `docs/roadmap.md` from `docs/roadmap.md.archived`, restore `harness.config.json` from `harness.config.json.pre-migration`, delete the issues created during migration if they exist. Full recipe in `docs/changes/roadmap-tracker-only/migration.md` §"Rollback recipe".
   - `## Cross-links` — `File-less Roadmap Mode`, `Tracker as Source of Truth`, ADR 0008, ADR 0009, the migration guide.
   - `## Key Files` — `packages/cli/src/commands/roadmap/migrate.ts`, `packages/core/src/roadmap/migrate/run.ts`, `packages/core/src/roadmap/migrate/plan-builder.ts`, `packages/core/src/roadmap/migrate/history-hash.ts`, `packages/core/src/roadmap/migrate/body-diff.ts`, `docs/changes/roadmap-tracker-only/migration.md`.
3. Run: `harness validate`. Run: `harness check-deps`.
4. Commit: `docs(knowledge): add roadmap/roadmap-migration-to-file-less business_process`.

### Task 10: Update `docs/knowledge/dashboard/claim-workflow.md` step 4 with file-less branch

**Depends on:** Task 9 | **Files:** `docs/knowledge/dashboard/claim-workflow.md` | **Category:** integration

1. Open `docs/knowledge/dashboard/claim-workflow.md`. Locate `4. **Claim execution** —` (around line ~22).
2. Replace the existing step-4 sub-bullet list with a branching version:

   ```markdown
   4. **Claim execution** — On confirm, the dashboard POSTs to `/api/actions/roadmap/claim`. The server branches on `roadmap.mode`:

      **File-backed mode** (default):
      - Acquires file lock on `docs/roadmap.md`
      - Parses roadmap via `parseRoadmap()` from `@harness-engineering/core`
      - Validates feature is claimable (correct status, no existing assignee)
      - Sets `status: in-progress`, `assignee: <github-username>`, `updatedAt: <now>`
      - Appends to assignment history
      - Serializes and writes via `serializeRoadmap()`
      - Invalidates SSE caches (`roadmap`, `overview`)

      **File-less mode** (`roadmap.mode: "file-less"`):
      - Resolves a tracker client via `createTrackerClient(loadTrackerClientConfigFromProject(root))` from `@harness-engineering/core`
      - Calls `client.claim(externalId, githubUsername, ifMatch)` with the cached ETag from the prior fetch
      - On 412 / refetch-and-compare conflict, the adapter returns `ConflictError`; the route translates it to HTTP `409 TRACKER_CONFLICT` with the conflict diff in the body (Phase 4 decision D-P4-B)
      - On success, `appendHistory()` records the assignment event as a deduplicated issue comment (see ADR 0009)
      - Invalidates SSE caches (`roadmap`, `overview`)
   ```

3. Add a sentence at the end of step 5 (GitHub sync): `In file-less mode, step 5 is a no-op because the tracker is already the source of truth — the assignment was written in step 4.`
4. Update the `## Key Files` section to add: `packages/dashboard/src/server/routes/actions.ts` (file-less branch in claim handler), `packages/core/src/roadmap/tracker/factory.ts`, `packages/core/src/roadmap/load-tracker-client-config.ts`.
5. Run: `harness validate`. Run: `harness check-deps`.
6. Commit: `docs(knowledge): add file-less branch to dashboard claim-workflow step 4`.

### Task 11: Add `## File-less mode` section to `docs/guides/roadmap-sync.md`

**Depends on:** none | **Files:** `docs/guides/roadmap-sync.md` | **Category:** docs

1. Open `docs/guides/roadmap-sync.md`. Append a new `## File-less mode` heading at the end (or before any existing trailing "Troubleshooting" / "FAQ" section if present — verify with `grep -n '^## ' docs/guides/roadmap-sync.md`).
2. Write four subsections under `## File-less mode`:
   - `### What it is` — One paragraph: opt-in mode where the GitHub Issues tracker is canonical, `docs/roadmap.md` does not exist, multi-session conflict is delegated to the tracker via ETag-conditional reads and best-effort conflict detection on writes. Point at ADRs 0008 and 0009 and the business_concept `File-less Roadmap Mode`.
   - `### How to opt in` — Step list: (1) ensure `roadmap.tracker` is configured; (2) set `roadmap.mode: "file-less"` in `harness.config.json`; (3) run `harness roadmap migrate --to=file-less --dry-run` to preview; (4) run without `--dry-run` to commit; (5) verify `harness validate` passes (it will reject if `docs/roadmap.md` still exists).
   - `### Behavioral differences` — Bullet list:
     - Sort order is `Priority` (P0–P3) → fall back to issue creation order. No positional ordering.
     - `harness:roadmap-pilot` scoring uses the file-less algorithm (see `scoreRoadmapCandidatesFileLess` in `packages/core/src/roadmap/pilot-scoring.ts`).
     - Concurrent claim races are best-effort detected, NOT atomically prevented (see proposal §F2 and ADR 0009 §Consequences).
     - Dashboard surfaces conflicts as HTTP 409 `TRACKER_CONFLICT`; the React UX is shipped in Phase 7 (see roadmap row).
     - `fullSync` engine is bypassed (the tracker IS the truth).
   - `### Migration command` — Cross-reference `docs/changes/roadmap-tracker-only/migration.md` for the operator walkthrough and `docs/reference/cli-commands.md` for the flag reference. Brief inline example showing `harness roadmap migrate --to=file-less --dry-run`.
   - `### Troubleshooting` — Three common errors: (a) `ROADMAP_MODE_MISSING_TRACKER` — set `roadmap.tracker`; (b) `ROADMAP_MODE_FILE_PRESENT` — re-run the migrate command or manually `rm docs/roadmap.md` if you have intentionally archived it elsewhere; (c) `TRACKER_CONFLICT` HTTP 409 from claim — refresh the dashboard and retry (the React-side auto-refresh ships in Phase 7).
3. Run: `harness validate`. Run: `harness check-deps`.
4. Commit: `docs(guides): add File-less mode section to roadmap-sync guide`.

### Task 12: Document `roadmap.mode` in `docs/reference/configuration.md`

**Depends on:** none | **Files:** `docs/reference/configuration.md` | **Category:** docs

1. Open `docs/reference/configuration.md`. Locate `### RoadmapConfig Object` (line ~647).
2. Replace the existing one-row `| tracker | …` table with a two-row table that adds `mode`:

   ```markdown
   | Field     | Type                           | Required | Default         | Description                                               |
   | --------- | ------------------------------ | -------- | --------------- | --------------------------------------------------------- |
   | `mode`    | `"file-backed" \| "file-less"` | No       | `"file-backed"` | Roadmap storage mode. See §"Mode validation rules" below. |
   | `tracker` | `TrackerConfig`                | No       | —               | External tracker sync settings                            |
   ```

3. After the `### TrackerConfig Object` block (around line ~653) add a new subsection `### Mode validation rules` containing two rule descriptions:

   ```markdown
   ### Mode validation rules

   Two cross-cutting invariants are enforced by `harness validate` (rule implementation in `packages/core/src/validation/roadmap-mode.ts`):

   - **`ROADMAP_MODE_MISSING_TRACKER`** — When `roadmap.mode` is `"file-less"`, `roadmap.tracker` must be configured. File-less mode requires an external tracker as the source of truth.
   - **`ROADMAP_MODE_FILE_PRESENT`** — When `roadmap.mode` is `"file-less"`, `docs/roadmap.md` must NOT exist. Run `harness roadmap migrate --to=file-less` to convert a file-backed project; the command archives `docs/roadmap.md` to `docs/roadmap.md.archived` as the final step.

   See `docs/guides/roadmap-sync.md` §"File-less mode" for the operator walkthrough and ADRs 0008 (tracker abstraction in core), 0009 (audit history as issue comments), 0010 (tracker.kind schema decoupling).
   ```

4. Update the example JSON block (line ~668) to optionally show `mode` (commented as `// optional; defaults to "file-backed"`).
5. Run: `harness validate`. Run: `harness check-deps`.
6. Commit: `docs(reference): document roadmap.mode field and validation rules`.

### Task 13: Document `harness roadmap migrate` in `docs/reference/cli-commands.md`

**Depends on:** none | **Files:** `docs/reference/cli-commands.md` | **Category:** docs

1. Open `docs/reference/cli-commands.md`. Locate the existing `### harness migrate` heading (line ~273) — note this is the unrelated legacy-artifacts migration.
2. Insert a new section `### harness roadmap` BEFORE `### harness scan` (line ~327) — alphabetical placement. Use the same formatting style as nearby entries (see `### harness migrate` at line ~273):

   ```markdown
   ### `harness roadmap`

   Roadmap command group. Subcommands operate on the project's roadmap (file-backed `docs/roadmap.md` or file-less external tracker, depending on `roadmap.mode`).

   #### `harness roadmap migrate`

   Migrate a project's roadmap from file-backed to file-less mode.

   **Usage:**
   ```

   harness roadmap migrate --to=<target> [--dry-run]

   ```

   **Flags:**

   - `--to=<target>` (required) — Target mode. Currently only `file-less` is supported.
   - `--dry-run` — Print the migration plan (issues that would be created, body blocks that would be updated, history events that would be appended) without making any GitHub API writes.

   **Behavior:**

   - Verifies `roadmap.tracker` is configured (else exits non-zero with `ROADMAP_MODE_MISSING_TRACKER`).
   - Parses `docs/roadmap.md`, creates GitHub issues for features lacking `External-ID`, updates body metadata blocks, posts deduplicated history comments, archives `docs/roadmap.md` → `docs/roadmap.md.archived`, writes `harness.config.json.pre-migration` backup, sets `roadmap.mode: "file-less"`.
   - Idempotent on re-run. A re-run after a successful migration exits 0 with `Already migrated; nothing to do.`. A re-run after partial failure picks up where it stopped.
   - Title-only collisions (existing issue with the same title but no recorded `External-ID`) refuse and exit AMBIGUOUS; the operator resolves by recording the External-ID in `roadmap.md` and re-running.
   - Archive-file collisions (`docs/roadmap.md.archived` already exists) refuse and abort with a remediation message.

   **Examples:**

   ```

   # Preview the migration without making any API writes.

   harness roadmap migrate --to=file-less --dry-run

   # Commit the migration.

   harness roadmap migrate --to=file-less

   ```

   See [`docs/guides/roadmap-sync.md`](../guides/roadmap-sync.md#file-less-mode) §"File-less mode" and [`docs/changes/roadmap-tracker-only/migration.md`](../changes/roadmap-tracker-only/migration.md) for the full operator walkthrough.
   ```

3. Run: `harness validate`. Run: `harness check-deps`.
4. Commit: `docs(reference): document harness roadmap migrate subcommand`.

### Task 14: Note mode-aware behavior in `docs/reference/mcp-tools.md` `manage_roadmap`

**Depends on:** none | **Files:** `docs/reference/mcp-tools.md` | **Category:** docs

1. Open `docs/reference/mcp-tools.md`. Locate `### manage_roadmap` (line ~718).
2. Replace the existing description line (line ~720, `Manage the project roadmap: show, add, update, remove, sync features, or query by filter. Reads and writes docs/roadmap.md.`) with:

   ```markdown
   Manage the project roadmap: show, add, update, remove, sync features, or query by filter. **Mode-aware:** in `roadmap.mode: "file-backed"` (default), reads and writes `docs/roadmap.md`. In `roadmap.mode: "file-less"`, dispatches through an `IssueTrackerClient` against the configured GitHub Issues tracker — no local file is read or written. See `docs/guides/roadmap-sync.md` §"File-less mode" and ADRs 0008–0010.
   ```

3. Run: `harness validate`. Run: `harness check-deps`.
4. Commit: `docs(reference): note manage_roadmap mode-aware behavior`.

### Task 15: Test cleanup — REV-P4-2 ConflictError arg order + REV-P4-3 cascade-dropped test

**Depends on:** none | **Files:** `packages/cli/tests/mcp/tools/roadmap.file-less.test.ts`, `packages/orchestrator/tests/tracker/adapters/github-issues-issue-tracker.test.ts` | **Category:** housekeeping

1. **REV-P4-2 (arg order):**
   - Open `packages/cli/tests/mcp/tools/roadmap.file-less.test.ts`. Around line ~221, locate the `new ConflictError(…)` call. Check the actual signature in `packages/core/src/roadmap/tracker/types.ts` (search for `class ConflictError` or `interface ConflictError`). Reorder the constructor arguments in the test to match the class signature.
   - Open `packages/orchestrator/tests/tracker/adapters/github-issues-issue-tracker.test.ts`. Around line ~145, repeat the same fix.
   - Run both test files in isolation: `pnpm --filter @harness-engineering/cli test -- tests/mcp/tools/roadmap.file-less.test.ts` and `pnpm --filter @harness-engineering/orchestrator test -- tests/tracker/adapters/github-issues-issue-tracker.test.ts`. Both must still pass.
2. **REV-P4-3 (cascade-dropped test):** In `packages/cli/tests/mcp/tools/roadmap.file-less.test.ts`, add a new `it(...)` block under the `manage_roadmap update` describe (find by `grep -n "manage_roadmap" packages/cli/tests/mcp/tools/roadmap.file-less.test.ts`). The test scaffold:

   ```ts
   it('returns the "cascade dropped" footnote when update would have cascaded but cascade is disabled in file-less mode', async () => {
     // Set up file-less project fixture with a feature whose update would cascade to dependents.
     // Invoke manage_roadmap action='update' with a status change.
     // Assert: response includes a footnote mentioning "cascade" and "dropped" (substring match).
     // This is the regression test required by Phase 4 plan line ~201 (REV-P4-3).
     // ...
   });
   ```

   Implement the test fixture and assertion. Look at neighboring tests in the same file for the standard mocking style.

3. Run full test suite for both packages: `pnpm --filter @harness-engineering/cli test` and `pnpm --filter @harness-engineering/orchestrator test`. All tests must pass.
4. Run: `harness validate`. Run: `harness check-deps`.
5. Commit: `test(file-less): fix ConflictError arg order (REV-P4-2) and add cascade-dropped footnote test (REV-P4-3)`.

### Task 16: Fix pre-existing TS2322 in `packages/core/src/roadmap/tracker/adapters/github-issues.ts:254`

**Depends on:** none | **Files:** `packages/core/src/roadmap/tracker/adapters/github-issues.ts` | **Category:** housekeeping

1. Reproduce: `pnpm --filter @harness-engineering/core typecheck 2>&1 | grep TS2322`. Expect the error at `src/roadmap/tracker/adapters/github-issues.ts(254,7)`.
2. The error is on the `return Ok({ feature: this.mapIssue(data, new Map()), wrote: true, priorFeature });` line in `updateInternal()`. The return type is `Result<{ feature: TrackedFeature; wrote: boolean; priorFeature?: TrackedFeature }, ConflictError | Error>` but `wrote: true` narrows to literal `true` (which is fine for `boolean`) and `priorFeature: TrackedFeature | undefined` should be assignable to `priorFeature?: TrackedFeature` under `exactOptionalPropertyTypes: true` — but TS treats explicit `undefined` differently from absent. Fix: conditionally include the field.

   Change line 254:

   ```ts
   return Ok({ feature: this.mapIssue(data, new Map()), wrote: true, priorFeature });
   ```

   to:

   ```ts
   return Ok({
     feature: this.mapIssue(data, new Map()),
     wrote: true,
     ...(priorFeature !== undefined ? { priorFeature } : {}),
   });
   ```

3. Run: `pnpm --filter @harness-engineering/core typecheck`. Must exit 0.
4. Run: `pnpm --filter @harness-engineering/core test`. All tests must pass.
5. Run: `harness validate`. Run: `harness check-deps`.
6. Commit: `fix(core): TS2322 in github-issues adapter updateInternal return type (exactOptional)`.

### Task 17: Fix pre-existing TS2379 in `packages/cli/src/commands/validate.ts:153`

**Depends on:** Task 16 | **Files:** `packages/cli/src/commands/validate.ts` | **Category:** housekeeping

1. Reproduce: `pnpm --filter @harness-engineering/cli typecheck 2>&1 | grep TS2379`. Expect the error at `src/commands/validate.ts(153,49)`.
2. The error is that `validateRoadmapMode(config, cwd)` receives a `config` whose `roadmap` field is typed `{ ... } | undefined`, but `RoadmapModeValidationConfig` declares `roadmap?: { mode?: string; tracker?: unknown } | null`. Under `exactOptionalPropertyTypes: true`, explicit `undefined` is not assignable to an optional property whose declared type does not include `undefined`. Fix: widen `RoadmapModeValidationConfig.roadmap` in `packages/core/src/validation/roadmap-mode.ts:13` to accept `undefined`.

   In `packages/core/src/validation/roadmap-mode.ts`, change:

   ```ts
   export interface RoadmapModeValidationConfig extends RoadmapModeConfig {
     roadmap?: {
       mode?: string;
       tracker?: unknown;
     } | null;
   }
   ```

   to:

   ```ts
   export interface RoadmapModeValidationConfig extends RoadmapModeConfig {
     roadmap?:
       | {
           mode?: string | undefined;
           tracker?: unknown;
         }
       | null
       | undefined;
   }
   ```

   (This matches the call-site shape from `loadHarnessConfig` exactly under `exactOptionalPropertyTypes: true`.)

3. Run: `pnpm --filter @harness-engineering/cli typecheck`. Must exit 0.
4. Run: `pnpm --filter @harness-engineering/core typecheck` (the type lives in core; sibling packages must still typecheck).
5. Run: `pnpm --filter @harness-engineering/core test` and `pnpm --filter @harness-engineering/cli test`. All must pass.
6. Run: `pnpm -r typecheck`. The entire workspace must exit 0 (no TS errors after Tasks 16+17).
7. Run: `harness validate`. Run: `harness check-deps`.
8. Commit: `fix(core, cli): TS2379 by widening RoadmapModeValidationConfig.roadmap to accept undefined`.

### Task 18: Add changeset for file-less roadmap mode; final validation

**Depends on:** Tasks 1–17 | **Files:** `.changeset/file-less-roadmap-mode.md` | **Category:** integration | **[checkpoint:human-verify]**

1. Verify ADR & knowledge files are in place: `ls docs/knowledge/decisions/0008-* docs/knowledge/decisions/0009-* docs/knowledge/decisions/0010-* docs/knowledge/roadmap/`. All five files must exist.
2. Create `.changeset/file-less-roadmap-mode.md` with the following content (mirror the format from `.changeset/resolve-js-imports-279.md`):

   ```markdown
   ---
   '@harness-engineering/core': minor
   '@harness-engineering/orchestrator': minor
   '@harness-engineering/cli': minor
   ---

   feat(roadmap): tracker-only roadmap mode (file-less)

   Adds opt-in file-less roadmap mode where the configured external tracker is canonical, eliminating `docs/roadmap.md` as a multi-session conflict surface. See [`docs/changes/roadmap-tracker-only/proposal.md`](../docs/changes/roadmap-tracker-only/proposal.md) and ADRs 0008–0010.

   **`@harness-engineering/core`:**

   - New `packages/core/src/roadmap/tracker/` submodule: `IssueTrackerClient` interface lifted from orchestrator, `createTrackerClient(config)` factory, body-metadata block parser/serializer, ETag store with LRU eviction, conflict-detection policy, and `GitHubIssuesTrackerAdapter` for file-less mode.
   - New `packages/core/src/roadmap/mode.ts` with `getRoadmapMode(config)` helper.
   - New `packages/core/src/roadmap/load-tracker-client-config.ts` (canonical home for tracker-config loading; replaces three duplicates in cli/dashboard/orchestrator).
   - New `packages/core/src/roadmap/migrate/` namespace: body-diff, history-event hashing, plan-builder, idempotent runner.
   - New `packages/core/src/validation/roadmap-mode.ts` with `validateRoadmapMode` enforcing `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT`.
   - New `scoreRoadmapCandidatesFileLess` in `packages/core/src/roadmap/pilot-scoring.ts` (priority + createdAt sort, deliberate D4 semantic break).
   - Config schema: `roadmap.mode: "file-backed" | "file-less"` (optional, defaults to `"file-backed"`).
   - Fixes pre-existing `TS2322` in `packages/core/src/roadmap/tracker/adapters/github-issues.ts` (`updateInternal` return shape) and `TS2379` in `packages/cli/src/commands/validate.ts` (call site against `RoadmapModeValidationConfig` widened to accept `undefined`).

   **`@harness-engineering/orchestrator`:**

   - New tracker kind `tracker.kind: "github-issues"` in workflow config selects `GitHubIssuesTrackerAdapter` (see ADR 0010 for the kind-schema decoupling rationale vs `roadmap.tracker.kind: "github"`).
   - `createTracker()` dispatches on `tracker.kind`; the Phase 4 stub at orchestrator constructor is removed.
   - Roadmap-status (S5) and roadmap-append (S6) endpoints translate `ConflictError` to HTTP `409 TRACKER_CONFLICT` shape; React surface lands in a follow-up.

   **`@harness-engineering/cli`:**

   - New `harness roadmap` command group with `harness roadmap migrate --to=file-less [--dry-run]` subcommand. One-shot, dry-run-capable, idempotent migration that creates GitHub issues for unmigrated features, writes body metadata blocks, posts deduplicated history comments, archives `docs/roadmap.md`, and flips `roadmap.mode`.
   - `manage_roadmap` MCP tool is mode-aware: in file-less mode, dispatches through `IssueTrackerClient` instead of touching `docs/roadmap.md`.
   - `harness validate` runs the two new cross-cutting rules `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT`.

   **Documentation:**

   - Three ADRs added under `docs/knowledge/decisions/`: 0008 (tracker abstraction in core), 0009 (audit history as issue comments), 0010 (`tracker.kind` schema decoupling).
   - New knowledge domain `docs/knowledge/roadmap/` with three entries: `file-less-roadmap-mode` (business_concept), `tracker-as-source-of-truth` (business_rule), `roadmap-migration-to-file-less` (business_process).
   - `docs/guides/roadmap-sync.md` gains a `## File-less mode` section.
   - `docs/reference/configuration.md`, `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md`, and `AGENTS.md` updated.
   - Migration walkthrough at `docs/changes/roadmap-tracker-only/migration.md` (shipped in Phase 5).
   - Proposal §F2 wording reworded to "best-effort detection" per Phase 2 D-P2-B.
   ```

3. Run: `harness validate`. Run: `harness check-deps`.
4. Run: `pnpm -r typecheck`. Must exit 0.
5. Run: `pnpm -r test` for the four affected packages: `pnpm --filter @harness-engineering/core --filter @harness-engineering/cli --filter @harness-engineering/orchestrator --filter @harness-engineering/dashboard test`. All tests must pass.
6. **[checkpoint:human-verify]** — Present the full diff (or at least the file list) for the phase. Confirm with the human:
   - All three ADRs (0008, 0009, 0010) land at `docs/knowledge/decisions/` (NOT `docs/decisions/`).
   - The roadmap row status flip to `in-progress` is the intended choice (vs. `done` or staying `planned`).
   - The pre-existing TS fixes are folded in (Tasks 16 + 17), per D-P6-E.
   - The changeset bump tier is `minor` for all three packages (consistent with "new feature, new exports, mode flag").
     Wait for human confirmation before committing the changeset.
7. Commit: `chore(release): changeset for file-less roadmap mode (Phase 6)`.
8. Knowledge-pipeline detect spot-check: `harness knowledge-pipeline --domain roadmap` (NO `--fix` flag). Confirm output recognizes the new domain and lists the four files (3 new + 1 updated). Do NOT modify anything if the detect output flags gaps — record any gaps in the handoff as concerns for Phase 7 or a follow-up.

## Phase 6 Soundness Review

Per Phase 4 of the harness-planning skill (step 6), run a soundness review against this draft BEFORE writing the plan file or handoff. Self-review log:

- **Every observable truth traces to specific tasks** — verified above in each truth's `_(Trace: …)_` annotation.
- **Every task fits in 2-5 minutes** — verified by file scope: Tasks 1–14 are all single-file-of-markdown edits; Tasks 15–17 are minimal code/test edits; Task 18 is one new file plus validation. The longest task is Task 9 (~6 minutes for the migration knowledge entry).
- **No vague tasks** — every task has exact file paths, exact substring matches, exact commit messages.
- **TDD where applicable** — only Task 15 adds a test (and runs it before the source compiles, per harness-execution standards). Tasks 16 and 17 fix TS errors that pre-existing tests already cover; they reuse existing test suites. The remaining tasks are docs.
- **File map is complete** — 14 created files, 8 modified non-test files, 2 modified test files, 2 source files for TS fixes. Total 26 distinct files; cross-checked against the task list.
- **Carry-forward items either folded in or explicitly deferred** — covered in §Scope Notes item 10.
- **Uncertainties surfaced** — see §Uncertainties below.

## Uncertainties

- **[ASSUMPTION]** Phase 5's `migration.md` already documents the C-P5-rawBody-resolver-overupdates limitation in language compatible with this plan's Task 9 knowledge entry. If the migration guide's wording diverges substantially, Task 9 may need a quick wording sync. Risk: low; recoverable in Task 9 itself.
- **[ASSUMPTION]** The `ConflictError` class constructor signature in `packages/core/src/roadmap/tracker/types.ts` is stable (not changed since REV-P4-2 was flagged). Risk: low; Task 15 step 1 explicitly re-reads the class definition before editing.
- **[ASSUMPTION]** The proposed TS2379 fix (Task 17) doesn't break any consumer of `RoadmapModeValidationConfig` outside `packages/cli`. Mitigation: Task 17 step 4 typechecks core; step 5 runs both core + cli tests. Risk: low.
- **[ASSUMPTION]** Knowledge-pipeline detect mode runs cleanly on the new `roadmap` domain without configuration changes. The pipeline auto-discovers `docs/knowledge/<domain>/` directories. Risk: low; if discovery is gated by a config allowlist, Task 18 step 8 catches it as a "concern" without blocking the phase.
- **[DEFERRABLE]** Whether Phase 7 (Dashboard conflict UX) should be re-described in the file-less knowledge entries when it ships. Defer — Phase 7's plan will own its own knowledge-entry updates.
- **[DEFERRABLE]** Whether REV-P5-S2 (`--format=json` for CI consumers) and REV-P5-S5 (`--to` flag future-proofing for reverse migration) should be mentioned in the knowledge entry's "Known limitations". Decision: NO — they are feature requests, not limitations. Defer to a future change request.

## Session State

This plan is recorded in:

- `docs/changes/roadmap-tracker-only/plans/2026-05-09-phase-6-docs-knowledge-plan.md` (this file)
- Handoff in `.harness/sessions/changes--roadmap-tracker-only--proposal/handoff.json`
- State written via `manage_state` to the session at `decisions`, `constraints`, `risks`, `openQuestions`, and `evidence` sections (autopilot wires this up).

## Harness Integration

- **`harness validate`** — Runs as the final step of every task and as a gate after Task 17 (workspace-wide typecheck) and Task 18 (final validation).
- **`harness check-deps`** — Runs alongside validate in every task.
- **Plan location** — `docs/changes/roadmap-tracker-only/plans/2026-05-09-phase-6-docs-knowledge-plan.md`.
- **Handoff** — `.harness/sessions/changes--roadmap-tracker-only--proposal/handoff.json` (overwriting prior); see handoff fields: fromSkill, phase, summary, completed, pending, concerns, decisions, contextKeywords.

## Success Criteria

- All 18 tasks complete; commits land in topological order (1→18 with Task 17 depending on Task 16; Task 18 depending on Tasks 1–17).
- `pnpm -r typecheck` exits 0 at Task 18 step 4.
- `harness validate` and `harness check-deps` pass at every task's final step.
- The three ADRs are ingested as `decision` nodes by the knowledge pipeline (verified in Task 18 step 8 by `harness knowledge-pipeline --domain roadmap` detect output).
- The new `roadmap` knowledge domain is recognized by the pipeline.
- Roadmap row updated; AGENTS.md updated; proposal F2 reworded.
- One new changeset file under `.changeset/` declares minor bumps for core, orchestrator, cli.
- Human-approved the plan at APPROVE_PLAN and reviewed the final diff at the Task 18 checkpoint.

## Red Flags

- If `harness knowledge-pipeline --domain roadmap` at Task 18 step 8 reports the new domain as `unrecognized` or `not configured`, STOP. The pipeline likely needs a config update (allowlist of domain names) — surface as a Phase 6 follow-up concern and DO NOT block the phase.
- If `pnpm -r typecheck` fails at Task 18 step 4 with any error NOT covered by Tasks 16+17, STOP. Investigate before committing the changeset — silent regressions in this phase are exactly what D-P6-E exists to prevent.
- If Task 15 reveals that `ConflictError` constructor arg order in production code (`packages/core/src/roadmap/tracker/types.ts`) is what should change rather than the test files, STOP and revisit — that turns a test-cleanup commit into a behavioral change.

## Gates

- **No new behavior in this phase.** The only source-code changes are Task 15 (test additions), Task 16 (TS-narrowing widen), Task 17 (interface-typing widen). None alter runtime behavior. If you find yourself writing a `if (mode === 'file-less') { … }` branch in production code during this phase, you are out of scope — escalate.
- **No new tracker kind in this phase.** The proposal explicitly defers Linear/Jira; do not start scaffolding their adapters even in docs.
- **No dashboard React work in this phase.** That is Phase 7's deliverable; the docs may _reference_ Phase 7 but must not preempt its content.
- **ADR numbers must be sequential and unique.** Task 4 step 1 verifies the next free number; if 0008 is taken (e.g., by an interleaving session), use the next free number and update Task 5 / Task 6 numbering AND all cross-references in this plan.
