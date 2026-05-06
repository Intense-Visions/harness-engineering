# Plan: Feedback Loops — Phase 8 Documentation and ADRs

**Date:** 2026-05-05 | **Spec:** docs/changes/compound-engineering-adoption/feedback-loops/proposal.md | **Tasks:** 8 | **Time:** ~22 min | **Integration Tier:** small

## Goal

Ship the documentation deliverables that close out the feedback-loops feature: 5 ADRs capturing the load-bearing decisions, an AGENTS.md update surfacing the new artifact roots, a conventions doc on the compound vs. knowledge-pipeline boundary, and a one-line companion note in `harness-observability` SKILL.md.

## Observable Truths (Acceptance Criteria)

1. `docs/knowledge/decisions/0003-compound-vs-knowledge-pipeline-boundary.md` exists, follows the existing ADR frontmatter format (number, title, date, status, tier, source), and states the post-mortem-playbook vs. structural-domain-fact split with its rationale and consequences.
2. `docs/knowledge/decisions/0004-report-only-maintenance-tasks-for-pulse-and-compound.md` exists and explains the report-only maintenance-task choice (vs. standalone /schedule wiring), referencing the Phase 6 `BUILT_IN_TASKS` registration.
3. `docs/knowledge/decisions/0005-pulse-config-in-harness-config-json.md` exists and records the decision to keep pulse config under `harness.config.json` (vs. a separate config file), referencing the Phase 1 schema and Phase 3 writer.
4. `docs/knowledge/decisions/0006-compound-auto-invocation-deferred.md` exists and records the deferral of trigger-phrase auto-invocation, referencing the Phase 7 orchestrator step 6b mechanical-trigger alternative.
5. `docs/knowledge/decisions/0007-learnings-md-deprecation-scope.md` exists and explicitly scopes the deprecation to the orchestrator's compounding-knowledge-sink semantic only — NOT the file or the runtime read paths in `packages/core/src/state/learnings*.ts`.
6. `AGENTS.md` contains a new short section that surfaces `docs/solutions/` and `docs/pulse-reports/` for agent discovery, cross-links ADR-3 (0003) for the boundary, and references Phase 6 maintenance-task wiring.
7. `docs/conventions/compound-vs-knowledge-pipeline.md` exists with concrete examples of when to write a compound doc vs. when to add a `business_fact` to the knowledge graph, and documents the connection (compound output → `BusinessKnowledgeIngestor.ingestSolutions` → `business_concept` nodes). Flags real PostHog/Sentry/Stripe adapters as "Phase 4.5 follow-up."
8. `agents/skills/claude-code/harness-observability/SKILL.md` has a one-line note that `harness-pulse` is the read-side companion (pulse READS observability data; observability skill DESIGNS instrumentation).
9. `harness validate` passes after all writes.

## File Map

- CREATE `docs/knowledge/decisions/0003-compound-vs-knowledge-pipeline-boundary.md`
- CREATE `docs/knowledge/decisions/0004-report-only-maintenance-tasks-for-pulse-and-compound.md`
- CREATE `docs/knowledge/decisions/0005-pulse-config-in-harness-config-json.md`
- CREATE `docs/knowledge/decisions/0006-compound-auto-invocation-deferred.md`
- CREATE `docs/knowledge/decisions/0007-learnings-md-deprecation-scope.md`
- CREATE `docs/conventions/compound-vs-knowledge-pipeline.md`
- MODIFY `AGENTS.md` (add short section surfacing solutions/pulse-reports + boundary cross-link)
- MODIFY `agents/skills/claude-code/harness-observability/SKILL.md` (one-line companion note)

## Tasks

### Task 1: Write ADR-3 — compound vs. knowledge-pipeline boundary

**Depends on:** none | **Files:** `docs/knowledge/decisions/0003-compound-vs-knowledge-pipeline-boundary.md`

1. Create the file with the following content (matches existing ADR format from 0001/0002):

   ```markdown
   ---
   number: 0003
   title: Compound vs knowledge-pipeline scope boundary
   date: 2026-05-05
   status: accepted
   tier: medium
   source: docs/changes/compound-engineering-adoption/feedback-loops/proposal.md
   ---

   ## Context

   Harness has two knowledge surfaces that can blur into each other: `harness-knowledge-pipeline`
   extracts structural domain facts from code into the knowledge graph, and the new
   `harness-compound` skill captures solved-problem playbooks (post-mortems) into
   `docs/solutions/<track>/<category>/`. Without an explicit boundary, both could end up
   trying to own the same artifact and produce drift.

   ## Decision

   - `harness-knowledge-pipeline` extracts **structural domain facts FROM CODE** (entities,
     relationships, invariants) into `business_fact` graph nodes.
   - `harness-compound` captures **post-mortem playbooks WRITTEN BY HUMANS/AGENTS** after a
     fix into `docs/solutions/<track>/<category>/<slug>.md`.
   - Compound output is a **candidate input** to the knowledge pipeline (via
     `BusinessKnowledgeIngestor.ingestSolutions`, wired in Phase 7); the pipeline never
     writes solution docs.
   - Solution docs in `docs/solutions/knowledge-track/` with stable `last_updated` dates are
     candidates for promotion to `business_fact` nodes.

   ## Consequences

   **Positive:**

   - Clear ownership: code-derived facts vs. human-derived playbooks live in distinct surfaces.
   - One-way flow (compound → pipeline) prevents cycles and double-writes.
   - Knowledge-track solutions can graduate into the graph as evidence stabilizes.

   **Negative:**

   - Authors must decide track at write time; the conventions doc gives examples to reduce
     ambiguity.

   **Neutral:**

   - The boundary is operational, not enforced by tooling. The conventions doc and code
     review carry the load.
   ```

2. Run: `harness validate`
3. Commit: `docs(adr): add ADR-0003 for compound vs knowledge-pipeline boundary`

### Task 2: Write ADR-4 — report-only maintenance tasks for pulse and compound

**Depends on:** Task 1 | **Files:** `docs/knowledge/decisions/0004-report-only-maintenance-tasks-for-pulse-and-compound.md`

1. Create the file with frontmatter `number: 0004`, `title: Pulse and compound-candidates as report-only maintenance tasks`, `date: 2026-05-05`, `status: accepted`, `tier: medium`, source as the proposal path.
2. Sections:
   - **Context:** Two new periodic jobs (`product-pulse` daily, `compound-candidates` weekly) needed scheduling. Options: standalone `/schedule` wiring or reuse the maintenance-task system.
   - **Decision:** Both register as `report-only` maintenance tasks in `BUILT_IN_TASKS` (Phase 6, `packages/orchestrator/src/maintenance/task-registry.ts`). The maintenance system is the canonical scheduling engine; reuse gets leader election, dashboard surfacing, and run history for free. `product-pulse` runtime-checks `pulse.enabled`; `compound-candidates` has no gate.
   - **Consequences:** Positive — no parallel scheduler; consistent observability. Negative — both tasks inherit maintenance-system constraints (cron-only timing, no per-tenant scheduling). Neutral — the `report-only` tier means neither task ever mutates state.
3. Run: `harness validate`
4. Commit: `docs(adr): add ADR-0004 for report-only maintenance task wiring`

### Task 3: Write ADR-5 — pulse config in harness.config.json

**Depends on:** Task 2 | **Files:** `docs/knowledge/decisions/0005-pulse-config-in-harness-config-json.md`

1. Create the file with frontmatter `number: 0005`, `title: Pulse config in harness.config.json`, `date: 2026-05-05`, `status: accepted`, `tier: small`, source as the proposal path.
2. Sections:
   - **Context:** `harness-pulse` requires per-project config (lookback default, primary event, sources, etc.). Options: separate `pulse.config.json` or new section in existing `harness.config.json`.
   - **Decision:** `pulse:` section inside `harness.config.json` (Phase 1 Zod schema; Phase 3 first-run interview writes to it). Secrets stay in env vars (`PULSE_POSTHOG_TOKEN`, etc.) and are never persisted to config.
   - **Consequences:** Positive — one config file to discover and validate; secrets stay out of disk config. Negative — `harness.config.json` grows over time. Neutral — schema validation lives in `packages/core/src/pulse/`; flagged by `harness validate`.
3. Run: `harness validate`
4. Commit: `docs(adr): add ADR-0005 for pulse config location`

### Task 4: Write ADR-6 — compound auto-invocation deferred

**Depends on:** Task 3 | **Files:** `docs/knowledge/decisions/0006-compound-auto-invocation-deferred.md`

1. Create the file with frontmatter `number: 0006`, `title: Compound auto-invocation deferred`, `date: 2026-05-05`, `status: accepted`, `tier: small`, source as the proposal path.
2. Sections:
   - **Context:** Compound could be triggered automatically by phrase detection ("that worked", "fixed"). The risk: false positives create noisy or wrong post-mortems.
   - **Decision:** Auto-invocation deferred. The orchestrator template's step 6b (Phase 7) uses **mechanical triggers** instead — debug skill invoked, multi-commit fix, multiple attempts, or hotspot file touched. These are factual signals, not phrase guesses. Manual invocation (`/harness:compound`) and the `compound-candidates` weekly scanner cover the remaining surface.
   - **Consequences:** Positive — no AI-confidently-wrong post-mortems; opt-in is safer. Negative — some learnings will go uncaptured until a human invokes. Neutral — revisit if usage data justifies (e.g., candidate-list action rate stays high but coverage gaps remain).
3. Run: `harness validate`
4. Commit: `docs(adr): add ADR-0006 deferring compound auto-invocation`

### Task 5: Write ADR-7 — learnings.md deprecation scope

**Depends on:** Task 4 | **Files:** `docs/knowledge/decisions/0007-learnings-md-deprecation-scope.md`

1. Create the file with frontmatter `number: 0007`, `title: .harness/learnings.md deprecation scope`, `date: 2026-05-05`, `status: accepted`, `tier: medium`, source as the proposal path.
2. Sections:
   - **Context:** `.harness/learnings.md` was the unstructured sink for compounding knowledge before this spec. With `docs/solutions/` taking over, it could be tempting to delete the file outright, but live consumers still depend on the path.
   - **Decision:** The deprecation is scoped **only to the orchestrator's compounding-knowledge-sink semantic**. Specifically:
     - `harness.orchestrator.md` and `templates/orchestrator/harness.orchestrator.md` replace the "document learnings in `.harness/learnings.md`" directive with the compound directive (Phase 7).
     - `packages/core/src/state/learnings*.ts` runtime read paths are **preserved unchanged**.
     - The MCP `learnings` resource is **preserved unchanged**.
     - Ephemeral session use of `.harness/learnings.md` (in-flight notes, not durable knowledge) is **preserved unchanged**.
   - **Consequences:** Positive — no breakage for live consumers; the deprecation is semantic, not structural. Negative — there are now two paths (`.harness/learnings.md` for ephemeral, `docs/solutions/` for durable) and authors must understand which is which. Neutral — the conventions doc explains the split.
3. Run: `harness validate`
4. Commit: `docs(adr): add ADR-0007 scoping .harness/learnings.md deprecation`

### Task 6: Write the conventions doc on compound vs. knowledge-pipeline boundary

**Depends on:** Task 1 | **Files:** `docs/conventions/compound-vs-knowledge-pipeline.md`

1. Create the file with the following structure:

   ```markdown
   # Compound vs Knowledge-Pipeline: Operational Guidance

   **Date:** 2026-05-05
   **ADR:** docs/knowledge/decisions/0003-compound-vs-knowledge-pipeline-boundary.md

   ## Purpose

   ADR-0003 defines the boundary at the decision level. This doc gives the day-to-day
   operational guidance: when to write a compound doc vs. when to add a `business_fact`
   to the knowledge graph, and how the two connect.

   ## When to write a compound doc

   You just solved a problem. The artifact is `docs/solutions/<track>/<category>/<slug>.md`.

   - **bug-track** when the learning is "we hit X, the fix was Y." Categories:
     `build-errors`, `test-failures`, `runtime-errors`, `performance-issues`,
     `database-issues`, `security-issues`, `ui-bugs`, `integration-issues`, `logic-errors`.
   - **knowledge-track** when the learning is a pattern, decision, or convention worth
     reusing. Categories: `architecture-patterns`, `design-patterns`, `tooling-decisions`,
     `conventions`, `dx`, `best-practices`.

   Examples:

   - "Stalled lease cleanup in orchestrator" → `bug-track/concurrency-issues/`.
   - "When to use Zod refinements vs. transforms" → `knowledge-track/best-practices/`.
   - "Why we picked PostHog over Mixpanel" → `knowledge-track/tooling-decisions/`.

   ## When to add a business_fact to the knowledge graph

   You discovered a structural domain fact while reading code or specs. The artifact is a
   `business_fact` node in the knowledge graph, written by `harness-knowledge-pipeline`
   from extracted code and PRD signals.

   - "An invoice has many line items" → `business_fact` node.
   - "User authentication uses JWT with 1h expiry" → `business_fact` node.
   - "Order status is one of `pending|confirmed|shipped|delivered|cancelled`" →
     `business_fact` node.

   These are not post-mortems. They are _what the system is_, not _what we learned_.

   ## How they connect

   Compound output is a candidate input to the knowledge pipeline:
   ```

   docs/solutions/knowledge-track/<category>/<slug>.md
   → BusinessKnowledgeIngestor.ingestSolutions (Phase 7 wiring)
   → business_concept nodes in the knowledge graph

   ```

   Knowledge-track solutions with stable `last_updated` dates are candidates for promotion
   to `business_fact` nodes. The pipeline never writes back to `docs/solutions/`.

   ## Decision tree

   1. Is this a fact about how the product/system works (entities, relationships, invariants)?
      → Knowledge graph (`business_fact`).
   2. Is this a story about a problem we solved or a pattern we want to reuse?
      → Compound doc.
   3. Both? Write the compound doc; the pipeline will pick it up if it stabilizes.

   ## Out of scope (Phase 4.5 follow-up)

   Real PostHog / Sentry / Stripe adapters with sanitization implementations are
   Phase 4.5 work. The provider-adapter `sanitize` interface is defined in Phase 3;
   live adapters land later.
   ```

2. Run: `harness validate`
3. Commit: `docs(conventions): add compound vs knowledge-pipeline operational guidance`

### Task 7: Update harness-observability SKILL.md with companion note

**Depends on:** Task 6 | **Files:** `agents/skills/claude-code/harness-observability/SKILL.md`

1. Read `agents/skills/claude-code/harness-observability/SKILL.md` to find the right insertion point — typically near the top, after the description, before the steps. Look for a "When to use" or similar prefatory section.
2. Add a single sentence (one line) stating: `Note: harness-pulse is the read-side companion — pulse READS observability data and produces a single-page report; this skill DESIGNS instrumentation. See docs/changes/compound-engineering-adoption/feedback-loops/proposal.md.`
3. Do not modify any other content. Do not add a new section header. Keep this minimal.
4. Run: `harness validate`
5. Commit: `docs(skills): note harness-pulse as observability read-side companion`

### Task 8: Update AGENTS.md with solutions/pulse-reports surfacing

**Depends on:** Task 6, Task 7 | **Files:** `AGENTS.md` | **Category:** integration

`[checkpoint:human-verify]` — AGENTS.md is high-impact; show the diff and pause for confirmation before commit.

1. Read `AGENTS.md` to identify the appropriate section. Look for a section that describes documentation roots or agent-discoverable surfaces (likely near "Documentation" or "Discovery" or the general structure list).
2. Add a short subsection (no more than ~12 lines) titled `### Compound learning and pulse reports` with this content (adjust phrasing to match existing AGENTS.md voice):

   ```markdown
   ### Compound learning and pulse reports

   Two artifact roots support the feedback-loops feature:

   - `docs/solutions/<track>/<category>/<slug>.md` — solved-problem playbooks written
     via `/harness:compound`. Tracks: `bug-track/`, `knowledge-track/`. See
     `docs/conventions/compound-vs-knowledge-pipeline.md` for category guidance.
   - `docs/pulse-reports/YYYY-MM-DD_HH-MM.md` — daily single-page pulse reports
     written by the `product-pulse` maintenance task. Read these when prioritizing.

   The boundary with `harness-knowledge-pipeline` is documented in
   ADR-0003 (`docs/knowledge/decisions/0003-compound-vs-knowledge-pipeline-boundary.md`):
   compound captures post-mortem playbooks; the pipeline extracts structural facts
   from code. Both `product-pulse` and `compound-candidates` are registered as
   `report-only` maintenance tasks (see the orchestrator maintenance section).
   ```

3. Verify: the addition reads consistently with the surrounding AGENTS.md style. Do NOT touch unrelated sections. Do NOT add emojis.
4. Show the diff (`git diff AGENTS.md`) at the checkpoint and pause for human confirmation.
5. Run: `harness validate`
6. Run: `harness check-deps` (to verify no missing imports introduced anywhere)
7. Commit: `docs(agents): surface docs/solutions/ and docs/pulse-reports/ for agent discovery`

## Integration Points (from spec)

- **Documentation Updates:** AGENTS.md update and conventions doc are the integration items for this phase. Both are covered by Tasks 6 and 8.
- **Architectural Decisions:** All five ADRs covered by Tasks 1-5.
- **No code changes** — Phase 8 is documentation-only. No barrel exports, no slash command regeneration, no schema registration.

## Out of Scope (deferred or non-goals)

- Real PostHog / Sentry / Stripe adapters — Phase 4.5 follow-up; flagged in conventions doc.
- The pre-existing CLI gray-matter build issue — separate ticket; no AGENTS.md mention required unless it surfaces during `harness validate` here.
- Schema contract-pin test tightening from Phase 7 (split invalid-frontmatter test) — optional; deferred.
- Pulse-report UTC vs. local time discussion — out of scope for docs phase; defer.

## Risks

- **Risk:** ADR overlap with conventions doc on the boundary topic. **Mitigation:** ADRs stay brief (decision + rationale + consequences); operational guidance with concrete examples lives in the conventions doc.
- **Risk:** AGENTS.md additions drift from existing style. **Mitigation:** Human-verify checkpoint before commit; constrain addition to one short subsection.
- **Risk:** ADR numbering collision if other ADRs land concurrently. **Mitigation:** Verify the next free number is 0003 before Task 1; if not, renumber the whole sequence consistently.
