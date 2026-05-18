# Hermes Phase 4: Skill Proposal / Refinement Loop

**Keywords:** hermes-phase-4, skill-proposals, skill-refinement, provenance, soundness-gate, review-queue, agent-emitted-skills

**Spec for issue:** `hermes-phase-4-skill-afd40273` (roadmap item — Hermes adoption Phase 4)
**Parent meta-spec:** `docs/changes/hermes-adoption/proposal.md` (Killer adoption K1, decomposed phase 4)

## Overview

Harness already lets humans author skills (`harness skill create`). It does not let an agent emit a skill proposal as a side-effect of work it just completed, and it does not let an agent propose a refinement to an existing skill. Hermes ships exactly this loop: every skill carries provenance (community / agent-proposed / user-authored) and usage telemetry, and self-improvement is a first-class operation.

This phase adds the loop to harness with one critical twist: every proposal — new or refinement — passes through the existing `harness:soundness-review` skill before it can be promoted to the catalog. Promotion is not a free action; it is gated by the same mechanical-review discipline used for specs and plans.

### Problem

Today, when an agent finishes a non-trivial task and notices that a recurring pattern would justify a new skill (or refines an existing one), there is no machinery to capture that signal. The contributor has to remember it, manually run `harness skill create`, hand-author the YAML + Markdown, and open a PR. In practice this never happens — the signal is lost. Worse, when a skill _does_ get refined, there is no record of who or what authored each version, no telemetry to tell whether the skill is being used, and no audit trail when a low-quality "AI slop" skill creeps in.

Three concrete gaps:

1. **No capture surface** — agents have no MCP tool to emit a proposal. The signal evaporates between sessions.
2. **No provenance** — once a skill is in the catalog, harness cannot answer "who/what authored this?" The audit trail relies entirely on git, which conflates many concerns.
3. **No review queue** — the moment proposals start arriving, harness needs a dashboard surface where humans (or the soundness-review skill on their behalf) decide what gets promoted, what gets sent back for revisions, and what gets rejected outright.

### Goals

1. **Capture without commitment.** Agents can emit a skill proposal at any point. It goes into a queue, not the catalog. The agent's work is not blocked.
2. **Mechanical-gate promotion.** Every proposal — agent-proposed or otherwise — must pass `harness:soundness-review` before it can be promoted. No "trust the operator" exceptions.
3. **Round-trip provenance.** Every skill in the catalog records which channel produced it (`community | agent-proposed | user-authored`), and which proposal (if any) it originated from.
4. **Same flow for refinements.** When an agent proposes a delta against an existing skill, the proposal carries a diff and goes through the identical queue.
5. **Lightweight reviewer UX.** Approve / reject / edit must be one click; soundness-review status is visible inline; reviewer should be able to process a proposal in under 30 seconds.

### Non-goals

- **Auto-promotion of agent-proposed skills.** Hermes does this. We deliberately do not. Soundness-review acts as a circuit breaker.
- **Authoring the soundness-review checks for skill proposals.** `harness:soundness-review` already runs spec/plan modes; adding `--mode skill` requires the same check vocabulary (S/P → K-series). That is its own design effort and is **out of scope** for this phase — Phase 4 wires the gate, the soundness-review skill grows the check vocabulary in a separate spec when the queue first surfaces concrete patterns to enforce.
- **A skill marketplace / sharing across installs.** That is W1 (Skills Hub) on the watch list and stays deferred.
- **Re-deriving provenance for the entire existing catalog.** We backfill the harness-authored skills as `user-authored`, the community-contributed ones (if any) by manual classification, and accept that any older agent-touched skills will be tagged `user-authored` by default. Cost-benefit does not justify forensic backfill.
- **A separate proposal-author identity.** Provenance records the _channel_, not the human. If we ever want author identity, that's a follow-up.

### Scope

**In-scope:**

- `emit_skill_proposal` MCP tool
- `.harness/proposals/` directory + JSON-on-disk storage schema
- Provenance field on the skill schema (`provenance: community | agent-proposed | user-authored`)
- `originatingProposalId` field linking promoted skills back to the proposal that produced them
- Per-skill usage telemetry surfaced explicitly (counts derived from existing `skill_invocation` events; no new telemetry events introduced)
- Dashboard `Proposals` review queue page with approve / reject / edit actions
- Approval pipeline: trigger soundness-review → on pass, write skill files; on fail, surface findings + leave proposal in queue
- Refinement deltas: proposals can target an existing skill name, carrying a textual diff against the current version
- Gateway API routes: list / get / approve / reject proposals (scoped under a new `manage-proposals` scope)
- Webhook event types: `proposal.created`, `proposal.approved`, `proposal.rejected`
- ADR: skill proposal/refinement workflow
- Knowledge graph nodes: `Skill Proposal`, `Skill Provenance`, `Skill Proposal Queue`

**Out-of-scope:**

- The skill-mode check vocabulary inside `harness:soundness-review` (separate spec, triggered by first real queue contents)
- Notification sink integration beyond emitting the webhook event (sinks are Phase 3's machinery; Phase 3 already subscribes to gateway events)
- Refinement diff _application_ (we store the diff; reviewers apply it manually via the edit action in v1; auto-apply is a follow-up if the queue volume justifies it)
- Bulk review actions (approve N at once); the reviewer UX expects single-item flow
- Proposal authorship across agents (we record `proposedBy: <agent-id>` but do not surface multi-agent collaboration on a single proposal)
- Skill deletion proposals — out-of-scope; deletion stays a manual git operation

---

## Decisions Made

### D1 — Proposal storage: filesystem JSON, not SQLite

`.harness/proposals/<id>.json` per proposal. Reasons:

- Matches `.harness/sessions/` and `.harness/interactions/` patterns; no new infra
- Trivial to inspect, grep, hand-edit during review
- Volume expectation: low (≤ a few dozen open proposals at any time)
- SQLite was considered (Phase 1 used FTS5 for sessions) but rejected: proposals don't need full-text search, and the queue page reads small JSON files at most a few hundred ms cold

### D2 — Provenance is a closed enum, not free text

Three values only: `community | agent-proposed | user-authored`. Free text was rejected because it would dilute the audit trail and tempt drift ("ai-assisted", "human-with-llm-help", etc.). If new channels emerge, expansion is an ADR amendment, not a config change.

### D3 — Soundness-review gate is **synchronous** on approve, not on emit

Hermes auto-promotes on emit. Harness does not. The trade-off:

- **Sync on emit** would let the queue show pre-gated proposals only — but it bottlenecks emit on a multi-minute LLM-driven review, and agents would either block work or silently lose proposals when review times out.
- **Sync on approve** is the choice. The queue lists raw proposals immediately; soundness-review fires when the reviewer hits approve. Status is shown inline (`gate: not-run | passed | failed`). If the gate fails, the reviewer sees the findings and can iterate the proposal text in-place, then re-approve.

### D4 — Refinement deltas use unified-diff format

Stored as a string in `proposal.refinement.diff`, computed by the agent or by the dashboard before submission. We do not parse or auto-apply the diff in v1; the reviewer applies it manually via the edit action. Reason: text diffs are robust to YAML/Markdown structural drift; auto-application requires per-format parsers we don't want to ship until volume justifies it.

### D5 — Promotion writes to `agents/skills/claude-code/<name>/` only in v1

The harness skill catalog ships across multiple hosts (claude-code, cursor, codex, gemini, opencode). We promote to claude-code first because:

- It's the primary host
- Re-emission to other hosts is mechanical (the existing `harness generate-slash-commands` pipeline already handles this)
- Cross-host promotion timing creates schema-drift risk; one-host-first removes that risk for v1

Post-promotion, the existing slash-command generator picks up the new skill on next regeneration. Multi-host promotion in one shot can be added when telemetry shows it's needed.

### D6 — Webhook events use the existing fanout (Phase 0/3 machinery)

`proposal.*` events publish through the gateway event bus. Phase 3 sinks (Slack) automatically receive them via the webhook-subscription wildcard pattern (`proposal.*`). No new transport. The envelope deriver is added in this phase but follows the same shape as `interaction.created` etc.

### D7 — `manage-proposals` is a new token scope

The existing scope vocabulary doesn't fit. `modify-roadmap` and `trigger-job` are both wrong shape. New scope: `manage-proposals` (covers list / approve / reject / edit). Read-only listing falls under `read-status` (status reads remain ungated by a proposal-specific scope to make the dashboard work without a privileged token).

Scope additions are ADR-gated per Phase 0's discipline. This phase ships ADR for the scope alongside the workflow ADR.

### D8 — Usage telemetry is _derived_, not _emitted_

The proposal originally read as "per-skill usage telemetry (already partially in adoption telemetry; surface explicitly)". Concretely: `skill_invocation` events already exist (Phase 0/A4 telemetry exporter consumes them). We add a small derivation layer that, given a skill name, returns usage counts over the last 7/30/90 days. No new emission. The dashboard surfaces this on each catalog entry and on each proposal that targets an existing skill (so reviewers can see if the refinement is touching a hot skill).

### D9 — Reviewer UX target: < 30 seconds per proposal

Spec'd as the success criterion. Concrete UX implications:

- Diff (for refinements) and full content (for new skills) rendered inline, no modal-toggling
- Soundness gate status visible at a glance with a single-click "run gate" trigger
- Approve / reject / edit buttons fixed at the bottom of the visible viewport, not at the bottom of the scrolled content
- Edit opens an inline editor (textarea-based for v1; richer editing is a follow-up)
- Reject requires a one-line reason (free text; stored but not parsed)

---

## Technical Design

### Data shapes

```ts
// packages/types/src/proposals.ts (new)

export const SkillProvenanceSchema = z.enum(['community', 'agent-proposed', 'user-authored']);

export const ProposalKindSchema = z.enum(['new-skill', 'refinement']);

export const ProposalStatusSchema = z.enum([
  'open',
  'gate-running',
  'gate-failed',
  'approved',
  'rejected',
]);

export const SkillProposalSchema = z.object({
  id: z.string(), // randomUUID()
  createdAt: z.string().datetime(),
  kind: ProposalKindSchema,
  targetSkill: z.string().optional(), // present when kind === 'refinement'
  proposedBy: z.string(), // agent-id, e.g. 'claude-code:harness-execution'
  source: z.object({
    sessionId: z.string().optional(), // .harness/sessions/<id> if present
    taskId: z.string().optional(), // maintenance task id if present
    justification: z.string().min(20).max(2000),
  }),
  // For new-skill: full content. For refinement: diff against current.
  content: z.object({
    name: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .max(64),
    description: z.string().min(20).max(280),
    skillYaml: z.string().optional(), // full YAML for new-skill
    skillMd: z.string().optional(), // full MD for new-skill
    diff: z.string().optional(), // unified diff for refinement
  }),
  status: ProposalStatusSchema,
  gate: z
    .object({
      lastRunAt: z.string().datetime().optional(),
      findings: z
        .array(
          z.object({
            severity: z.enum(['error', 'warning']),
            title: z.string(),
            detail: z.string(),
          })
        )
        .optional(),
    })
    .optional(),
  decision: z
    .object({
      decidedAt: z.string().datetime(),
      decidedBy: z.string(),
      action: z.enum(['approved', 'rejected']),
      reason: z.string().optional(),
    })
    .optional(),
});

export type SkillProposal = z.infer<typeof SkillProposalSchema>;
```

A new field is added to the existing skill `skill.yaml` schema:

```yaml
provenance: user-authored # or 'agent-proposed' / 'community'
originatingProposalId: <id> # present only when provenance !== 'user-authored'
```

Backfill: existing skills get `provenance: user-authored` written by a one-shot migration at `packages/cli/src/commands/backfill-skill-provenance.ts`, invoked from a maintenance task `proposal-provenance-backfill` that the integration tier runs once.

### File layout

```
.harness/proposals/
  <proposal-id>.json
  index.json                  # optional fast-read index of {id, status, kind, targetSkill}

packages/types/src/proposals.ts                              # NEW — schemas above
packages/core/src/proposals/store.ts                         # NEW — read/write/list/get
packages/core/src/proposals/usage.ts                         # NEW — D8 derivation
packages/core/src/proposals/index.ts                         # NEW — barrel
packages/cli/src/mcp/tools/skill-proposal.ts                 # NEW — emit_skill_proposal
packages/cli/src/commands/backfill-skill-provenance.ts       # NEW — one-shot migration
packages/cli/src/commands/proposals.ts                       # NEW — CLI surface (list / show / reject / approve via gate)
packages/orchestrator/src/proposals/gate.ts                  # NEW — invokes harness:soundness-review
packages/orchestrator/src/proposals/promote.ts               # NEW — writes promoted skill files
packages/orchestrator/src/proposals/events.ts                # NEW — emits proposal.* gateway events
packages/orchestrator/src/server/routes/proposals.ts         # NEW — v1 API route handlers
packages/orchestrator/src/server/v1-bridge-routes.ts         # EDIT — register Phase 4 routes
packages/orchestrator/src/auth/scopes.ts                     # EDIT — add 'manage-proposals'
packages/orchestrator/src/gateway/webhooks/events.ts         # EDIT — recognise proposal.* event-types
packages/orchestrator/src/notifications/envelope.ts          # EDIT — deriver for proposal.*

packages/dashboard/src/server/routes/proposals.ts            # NEW — proxy / list for dashboard's own API
packages/dashboard/src/server/index.ts                       # EDIT — mount router
packages/dashboard/src/client/pages/Proposals.tsx            # NEW — review queue page
packages/dashboard/src/client/components/layout/ThreadView.tsx  # EDIT — register systemPage 'proposals'
packages/dashboard/src/client/main.tsx                       # EDIT — legacy redirect (/proposals → /s/proposals)

docs/knowledge/cli/skill-proposals.md                        # NEW — knowledge node
docs/knowledge/cli/skill-provenance.md                       # NEW — knowledge node
docs/knowledge/decisions/0015-skill-proposal-workflow.md     # NEW — ADR
docs/knowledge/decisions/0016-manage-proposals-scope.md      # NEW — ADR
```

### MCP tool — `emit_skill_proposal`

Tier 1 (standard). Definition follows the `emit_interaction` pattern in `packages/cli/src/mcp/tools/interaction.ts:19`.

Signature:

```ts
emit_skill_proposal({
  path: string,                       // project root
  kind: 'new-skill' | 'refinement',
  targetSkill?: string,               // required when kind === 'refinement'
  proposedBy: string,                 // agent-id
  justification: string,              // why this skill / refinement is worth promoting
  sessionId?: string,
  taskId?: string,
  content: {
    name: string,
    description: string,
    skillYaml?: string,
    skillMd?: string,
    diff?: string,
  },
})
```

Returns `{ id, path: '.harness/proposals/<id>.json', queueUrl: '/s/proposals' }`. Writes the proposal file and emits the `proposal.created` gateway event. Does not run the soundness gate on emit (D3).

Validation:

- `kind === 'new-skill'` ⇒ `skillYaml` and `skillMd` required, `targetSkill` and `diff` forbidden
- `kind === 'refinement'` ⇒ `targetSkill` and `diff` required, `skillYaml` and `skillMd` forbidden
- `content.name` must be unique within open proposals for `new-skill` (collides on existing catalog name only with reviewer override)

### Soundness gate invocation

`packages/orchestrator/src/proposals/gate.ts` exposes `runGate(proposalId): Promise<GateResult>`. Implementation:

1. Read proposal JSON.
2. Materialize the proposed skill content into a scratch directory `.harness/proposals/<id>/.scratch/` (so the existing skill-aware checks can be reused).
3. Invoke `harness skill run harness-soundness-review --mode skill --target .harness/proposals/<id>/.scratch/` via the orchestrator's existing skill-run machinery.
4. Parse the soundness-review JSON output (findings array).
5. Patch the proposal JSON with `gate: { lastRunAt, findings }` and `status: 'gate-failed'` (any errors) or `status: 'gate-running' → cleared on next step` if all pass.
6. Clean up the scratch directory.

`--mode skill` does not yet exist in `harness:soundness-review`; until it does, the gate runs `--mode spec` against the proposal's `skillMd` content. This is a known degradation noted in **Non-goals** and the spec ADR; it produces useful signal (description coherence, requirement completeness) while skill-mode checks are pending.

### Promotion

`packages/orchestrator/src/proposals/promote.ts` exposes `promote(proposalId)`. Pre-condition: `proposal.status === 'gate-running'` and most recent gate run has no `error`-severity findings.

Steps:

1. Re-read the latest proposal JSON (race-safe).
2. Verify gate is fresh (`lastRunAt` within the last 24h; otherwise re-run).
3. For `kind === 'new-skill'`:
   - Create `agents/skills/claude-code/<content.name>/skill.yaml` and `SKILL.md` from proposal content.
   - Inject `provenance: agent-proposed` and `originatingProposalId: <id>` into the YAML.
4. For `kind === 'refinement'`:
   - Locate `agents/skills/claude-code/<targetSkill>/`.
   - Reviewer is expected to have already applied the diff via the edit action (D4). Promote step verifies non-empty edits exist; otherwise rejects with a clear error.
   - Update `provenance` to `agent-proposed` (it was `user-authored` before; we mark refinements as agent-proposed too), patch `originatingProposalId`.
5. Update proposal status to `approved`, write `decision` block.
6. Emit `proposal.approved` event.
7. Trigger `harness generate-slash-commands` regeneration via the existing maintenance pipeline so plugin manifests pick up the change.

### Dashboard page — `/s/proposals`

Single-column list, each entry collapsible. For each proposal:

- Header row: kind badge, target-skill (if refinement), proposedBy, age, status
- Body: justification, content (full YAML+MD for new-skill, diff for refinement)
- Sidebar (right): soundness gate panel, action buttons (run-gate / approve / reject / edit)

Action buttons call `/api/v1/proposals/<id>/{approve,reject,edit,run-gate}`. Approve disabled until gate has run with no errors.

Edit flow: textarea-replaces-content. On save, proposal JSON is updated; gate status resets to `not-run`. No history kept in v1 (kept simple; git of `.harness/proposals/` covers it).

### Gateway routes

```
GET    /api/v1/proposals                    → read-status
GET    /api/v1/proposals/<id>               → read-status
POST   /api/v1/proposals                    → (internal — emit_skill_proposal writes directly)
POST   /api/v1/proposals/<id>/run-gate      → manage-proposals
POST   /api/v1/proposals/<id>/approve       → manage-proposals
POST   /api/v1/proposals/<id>/reject        → manage-proposals
PATCH  /api/v1/proposals/<id>               → manage-proposals  (edit)
```

Registered in `packages/orchestrator/src/server/v1-bridge-routes.ts` under "── Phase 4 bridge primitives ──" alongside the existing webhook stat route.

### Gateway events

Three new types:

- `proposal.created` — payload `{ id, kind, targetSkill?, proposedBy }`
- `proposal.approved` — payload `{ id, kind, targetSkill?, decidedBy }`
- `proposal.rejected` — payload `{ id, reason }`

Recognised in `packages/orchestrator/src/gateway/webhooks/events.ts`; envelope derivers added in `packages/orchestrator/src/notifications/envelope.ts` so Phase 3 sinks render them sensibly. Slack envelope for `proposal.created`:

- Title: `New skill proposal: <content.name>`
- Summary: justification (truncated to 240 chars)
- Severity: `info`
- Actions: single button `Review` → `<dashboardOrigin>/s/proposals` (anchor to `id` via fragment in v1.1; v1 lands without the anchor)

### CLI surface

`harness proposals` subcommand:

- `harness proposals list [--status open|all]`
- `harness proposals show <id>`
- `harness proposals approve <id>` (runs gate then promotes; fails if gate fails)
- `harness proposals reject <id> --reason <text>`

Useful for CI dogfood + scripted workflows. Dashboard is the primary surface.

### Provenance backfill

Maintenance task `proposal-provenance-backfill` (one-shot, `type: housekeeping`):

- Walks `agents/skills/<host>/<skill>/skill.yaml`
- If `provenance` field missing, writes `provenance: user-authored`
- Idempotent; safe to re-run
- Registered as a one-shot task in `packages/orchestrator/src/maintenance/built-ins.ts`, invoked once during the Phase 4 integration tier

---

## Integration Points

### Entry Points

**New MCP tool:** `emit_skill_proposal` (registered in `packages/cli/src/mcp/server.ts`; tiered as STANDARD in `tool-tiers.ts`).

**New CLI commands:** `harness proposals` (list / show / approve / reject) — registered via `packages/cli/src/commands/_registry.ts`.

**New dashboard page:** `/s/proposals` — registered in `packages/dashboard/src/client/components/layout/ThreadView.tsx:SYSTEM_PAGE_COMPONENTS` and via legacy redirect in `main.tsx`.

**New API routes:** seven routes under `/api/v1/proposals/*`, listed in §Gateway routes above.

**New webhook event types:** `proposal.created`, `proposal.approved`, `proposal.rejected` — picked up by existing Phase 3 sinks via wildcard subscription pattern.

**New maintenance task:** `proposal-provenance-backfill` (one-shot housekeeping) — registered in `packages/orchestrator/src/maintenance/built-ins.ts`.

**New token scope:** `manage-proposals` — added to `SCOPE_VOCABULARY` in `packages/orchestrator/src/auth/scopes.ts:9` and to `TokenScopeSchema` in `packages/types/src/auth.ts`.

### Registrations Required

| Registry                                                         | Update                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/types/src/index.ts`                                    | Re-export proposals schemas under `// --- Skill Proposals (Hermes Phase 4) ---`   |
| `packages/cli/src/commands/_registry.ts`                         | Add `createProposalsCommand`, `createBackfillSkillProvenanceCommand`              |
| `packages/cli/src/mcp/server.ts`                                 | Register `emit_skill_proposal` tool + handler                                     |
| `packages/cli/src/mcp/tool-tiers.ts`                             | Add `emit_skill_proposal` to `STANDARD_EXTRA`                                     |
| `packages/orchestrator/src/server/v1-bridge-routes.ts`           | Register seven Phase 4 routes under "── Phase 4 bridge primitives ──"             |
| `packages/orchestrator/src/auth/scopes.ts`                       | Append `'manage-proposals'` to `SCOPE_VOCABULARY`; map proposal routes' scopes    |
| `packages/types/src/auth.ts`                                     | Extend `TokenScopeSchema` with `'manage-proposals'`                               |
| `packages/orchestrator/src/maintenance/built-ins.ts`             | Register `proposal-provenance-backfill` one-shot task                             |
| `packages/orchestrator/src/notifications/envelope.ts`            | Add derivers for `proposal.*` event-types                                         |
| `packages/orchestrator/src/gateway/webhooks/events.ts`           | Add `proposal.*` to recognised event-type matcher                                 |
| `packages/dashboard/src/server/index.ts`                         | Mount `buildProposalsRouter` (proxy/list endpoint)                                |
| `packages/dashboard/src/client/components/layout/ThreadView.tsx` | Add `'proposals': Proposals` to `SYSTEM_PAGE_COMPONENTS`                          |
| `packages/dashboard/src/client/main.tsx`                         | Add legacy redirect `/proposals` → `/s/proposals`                                 |
| `agents/skills/claude-code/<skill>/skill.yaml` (all existing)    | Backfill `provenance: user-authored` (done by the backfill task, not hand-edited) |
| Slash-command generator output                                   | Re-run after promotion to refresh plugin manifests                                |

### Documentation Updates

- `AGENTS.md` — add a "Skill Proposals" subsection describing `emit_skill_proposal` and the `harness proposals` command
- `CHANGELOG.md` — entry under Unreleased (or next minor) summarising the Phase 4 surface
- `README.md` — one Key-Features bullet ("Agents can propose skills; humans approve via the dashboard queue")
- `docs/knowledge/cli/skill-proposals.md` — knowledge node describing the proposal lifecycle (emit → queue → gate → promote)
- `docs/knowledge/cli/skill-provenance.md` — knowledge node describing the provenance taxonomy
- `docs/knowledge/decisions/0015-skill-proposal-workflow.md` — ADR for the workflow (corresponds to the meta-spec's "Skill proposal/refinement workflow" ADR)
- `docs/knowledge/decisions/0016-manage-proposals-scope.md` — ADR for the new token scope (per Phase 0's scope-vocabulary-change-requires-ADR discipline)

### Architectural Decisions

**ADR 0015 — Skill proposal/refinement workflow.** Agent-emitted proposals routed through `harness:soundness-review` before promotion; provenance recorded on every skill; refinements use unified-diff in the proposal and are applied manually by the reviewer in v1. Rationale: enables self-improvement (Hermes parity) consistent with harness's mechanical-enforcement ethos. Trade-off accepted: agents do not get free promotion; this is the deliberate divergence from Hermes.

**ADR 0016 — `manage-proposals` token scope.** New scope added to the pinned vocabulary. Required for list/get reads of dashboards beyond `read-status` (proposals contain in-progress reviewer notes that aren't pure status), and for all mutating actions. Rationale: existing `modify-roadmap` and `trigger-job` shapes do not fit; conflating them would dilute scope semantics.

### Knowledge Impact

**New `business_concept` nodes:**

- Skill proposal — what gets emitted, where it lives, what fields it carries
- Skill provenance taxonomy — closed enum, with backfill discipline
- Skill proposal queue — review surface, status transitions

**New `business_process` nodes:**

- Skill proposal lifecycle — emit → queue → gate → promote-or-reject
- Provenance backfill — one-shot housekeeping task that runs once at Phase 4 integration

**New `business_rule` nodes:**

- A skill proposal cannot be promoted without a passing soundness-review run within the last 24 hours
- Refinement proposals cannot be promoted without reviewer-applied edits (no auto-apply in v1)
- Provenance values are constrained to the closed enum `community | agent-proposed | user-authored`

**New relationships:**

- Skill Proposal _gated by_ Soundness Review
- Skill Proposal _produces_ Catalog Skill (on approve)
- Catalog Skill _records_ Skill Provenance
- Catalog Skill _references_ Originating Proposal (when provenance ≠ user-authored)
- Proposal Created Event _delivered to_ Notification Sink (via Phase 3 fanout)

All nodes are written into `docs/knowledge/cli/skill-proposals.md` and `docs/knowledge/cli/skill-provenance.md`; the knowledge pipeline picks them up on next ingestion.

---

## Success Criteria

### Functional

1. An agent can call `emit_skill_proposal` with a valid payload and receive a proposal id; the corresponding `.harness/proposals/<id>.json` exists with `status: open`.
2. The `Proposals` dashboard page renders all open proposals; clicking `Run gate` triggers `harness:soundness-review` and surfaces findings inline within 60s for a small proposal.
3. With a passing gate, `Approve` writes the skill files under `agents/skills/claude-code/<name>/` with the correct `provenance` and `originatingProposalId` fields.
4. `Reject` with reason transitions the proposal to `rejected` and emits `proposal.rejected`.
5. A refinement proposal stores the diff and surfaces it inline; the reviewer can edit the target skill via the inline editor; promotion verifies edits are present.
6. The existing catalog has `provenance: user-authored` on every skill after the backfill task runs once.
7. The `harness proposals` CLI lists / shows / approves / rejects proposals; output matches the dashboard state.

### Non-functional

1. Emit-to-queue latency < 200ms p95 (file write + event emission only).
2. Reviewer can process a proposal in < 30s (subjective UX criterion, measured by reviewer time-on-page in a 5-proposal dogfood test).
3. `harness validate` passes after every artifact added in this phase.
4. `harness check-arch` and `harness check-deps` pass — proposal storage in core, MCP tool in cli, promotion logic in orchestrator (layer-respecting).
5. `harness:verification` three-tier (EXISTS / SUBSTANTIVE / WIRED) passes on the full phase scope.

### Phase-readiness gates (from the meta-spec)

| Gate                                                            |     |
| --------------------------------------------------------------- | --- |
| `harness validate` passes                                       | ✓   |
| `harness:verification` three-tier passes                        | ✓   |
| `harness check-arch` clean                                      | ✓   |
| `harness check-deps` clean                                      | ✓   |
| ADRs 0015 + 0016 merged                                         | ✓   |
| Knowledge graph nodes ingested via `harness:knowledge-pipeline` | ✓   |
| AGENTS.md updated                                               | ✓   |
| CHANGELOG entry                                                 | ✓   |
| `harness:soundness-review` passed on this spec                  | ✓   |

### Anti-success criteria (red flags)

If any of these surface during implementation, **stop and re-spec**:

1. Soundness-review skill-mode design grows beyond one follow-up spec (overflow into multiple specs ⇒ the gate is too ambitious for v1; defer to spec-mode degradation noted above).
2. Reviewer-UX test shows > 60s median time-on-page (UX failure; defer ship until simplified).
3. Backfill task corrupts an existing skill (data-loss; restore from git, ship the rest without backfill, plan remediation).
4. `proposal.*` events flood Phase 3 sinks (signal-to-noise failure; consider gating event emission to approved+rejected only).

---

## Implementation Order

(High-level; full per-task plan in `plans/main.md` after this spec is approved.)

1. **Types + storage** — `packages/types/src/proposals.ts`, `packages/core/src/proposals/`. No external dependencies; unit-testable in isolation.
2. **MCP tool + CLI** — `emit_skill_proposal`, `harness proposals` subcommand. Depends on (1).
3. **Soundness-gate wiring** — `packages/orchestrator/src/proposals/gate.ts`. Depends on (1).
4. **Promotion** — `packages/orchestrator/src/proposals/promote.ts`. Depends on (1) + (3).
5. **Gateway routes + scope + events** — server routes, v1-bridge registrations, scope vocabulary update. Depends on (1) – (4).
6. **Notification envelopes** — `notifications/envelope.ts` derivers + webhook event recognition. Depends on (5).
7. **Dashboard page** — `Proposals.tsx`, ThreadView registration, dashboard route. Depends on (5).
8. **Backfill task** — `proposal-provenance-backfill` maintenance task. Independent of (2) – (7); can land in parallel.
9. **Knowledge nodes + ADRs** — `docs/knowledge/cli/skill-{proposals,provenance}.md`, ADRs 0015 + 0016.
10. **AGENTS.md + CHANGELOG + README** — final doc sweep.
11. **Verification + integration tier** — `harness validate`, `harness:verification`, knowledge pipeline ingestion, slash-command regeneration.
