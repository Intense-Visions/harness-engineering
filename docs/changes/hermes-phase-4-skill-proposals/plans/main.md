# Hermes Phase 4 — Implementation Plan

**Spec:** `docs/changes/hermes-phase-4-skill-proposals/proposal.md`

## Task graph

```
T1 (types: proposals.ts + auth scope addition)
  ├→ T2 (core: proposals store + usage derivation)
  │    ├→ T3 (cli: emit_skill_proposal MCP tool)
  │    ├→ T4 (cli: harness proposals subcommand)
  │    ├→ T5 (orchestrator: proposals/gate.ts)
  │    │    └→ T6 (orchestrator: proposals/promote.ts)
  │    │         └→ T7 (orchestrator: proposals/events.ts + envelope derivers)
  │    │              └→ T8 (orchestrator: gateway routes + v1-bridge + scopes)
  │    └→ T9 (orchestrator: backfill maintenance task)
  └→ T10 (dashboard: proxy router + Proposals page) — depends on T8

T11 (docs: ADRs 0015 + 0016)
T12 (docs: knowledge nodes — skill-proposals.md, skill-provenance.md)
T13 (docs: AGENTS.md + CHANGELOG)
T14 (verify: harness validate + check-arch + check-deps)
T15 (verify: harness:verification three-tier)
T16 (integration: knowledge-pipeline + slash-command regeneration)
```

## Tasks

### T1 — Types: proposals + auth scope

**Files:**

- `packages/types/src/proposals.ts` (new)
- `packages/types/src/auth.ts` (edit — extend `TokenScopeSchema`)
- `packages/types/src/index.ts` (edit — re-export)

Add Zod schemas:

- `SkillProvenanceSchema = z.enum(['community', 'agent-proposed', 'user-authored'])`
- `ProposalKindSchema = z.enum(['new-skill', 'refinement'])`
- `ProposalStatusSchema = z.enum(['open', 'gate-running', 'gate-failed', 'approved', 'rejected'])`
- `SkillProposalSchema` per spec §Data shapes
- `SkillProposalPublicSchema` — omits any future secret/internal fields (parity with `WebhookSubscriptionPublic`)

Add `'manage-proposals'` to `TokenScopeSchema` in `auth.ts`.

Re-export under `// --- Skill Proposals (Hermes Phase 4) ---` in `index.ts`.

**Test:** `packages/types/tests/proposals.test.ts` — valid + invalid parse cases (new-skill missing skillYaml, refinement missing targetSkill, kind mismatch).

### T2 — Core: proposals store + usage derivation

**Files:**

- `packages/core/src/proposals/store.ts` (new)
- `packages/core/src/proposals/usage.ts` (new)
- `packages/core/src/proposals/index.ts` (new)
- `packages/core/src/index.ts` (edit — barrel)

`store.ts` exports:

- `createProposal(projectPath, input): Promise<SkillProposal>` — writes `.harness/proposals/<uuid>.json`
- `listProposals(projectPath, opts?): Promise<SkillProposal[]>` — reads dir, optional status filter
- `getProposal(projectPath, id): Promise<SkillProposal | null>`
- `updateProposal(projectPath, id, patch): Promise<SkillProposal>` — atomic via write-temp-then-rename
- `proposalsDir(projectPath): string` — `path.join(projectPath, '.harness', 'proposals')`

`usage.ts` exports:

- `deriveSkillUsage(projectPath, skillName, windowDays = 30): Promise<{ count: number; lastUsed?: string }>` — reads existing `skill_invocation` events from `.harness/adoption.jsonl`, filters by name + time window.

`index.ts` barrels both.

**Test:** `packages/core/tests/proposals.store.test.ts` — round-trip create/get/update/list. `packages/core/tests/proposals.usage.test.ts` — fixture-based derivation.

### T3 — CLI: emit_skill_proposal MCP tool

**Files:**

- `packages/cli/src/mcp/tools/skill-proposal.ts` (new)
- `packages/cli/src/mcp/server.ts` (edit — import + register)
- `packages/cli/src/mcp/tool-tiers.ts` (edit — add to `STANDARD_EXTRA`)

`skill-proposal.ts` follows the pattern of `tools/interaction.ts:19`:

- `export const emitSkillProposalDefinition = { name: 'emit_skill_proposal', description: ..., inputSchema: {...} }`
- `export async function handleEmitSkillProposal(input)` — sanitises path, validates payload via Zod, calls `createProposal`, emits `proposal.created` event (via dynamic import of the orchestrator events module — see T7).

Validation matrix (kind=new-skill ⇒ skillYaml+skillMd required, no targetSkill/diff; kind=refinement ⇒ targetSkill+diff required, no skillYaml/skillMd). Reject duplicate `content.name` against the open proposals + existing catalog.

Returns `{ id, path, queueUrl }`.

**Test:** `packages/cli/tests/mcp/skill-proposal.test.ts` — happy paths + validation matrix.

### T4 — CLI: harness proposals subcommand

**Files:**

- `packages/cli/src/commands/proposals.ts` (new)
- `packages/cli/src/commands/_registry.ts` (regenerated barrel)

Subcommands:

- `harness proposals list [--status open|all|approved|rejected]`
- `harness proposals show <id>`
- `harness proposals approve <id>` — POST to orchestrator approve endpoint
- `harness proposals reject <id> --reason <text>`

All four call the orchestrator HTTP endpoints (T8) with the locally cached admin token (existing token-loader helpers). Show/list also have a fallback that reads `.harness/proposals/` directly when the orchestrator is offline.

**Test:** `packages/cli/tests/commands/proposals.test.ts` — list-from-disk fallback only (HTTP paths covered in T8 e2e).

### T5 — Orchestrator: proposals/gate.ts

**Files:**

- `packages/orchestrator/src/proposals/gate.ts` (new)
- `packages/orchestrator/src/proposals/index.ts` (new — barrel)

`runGate(projectPath, proposalId): Promise<GateResult>`:

1. Load proposal via core store.
2. Materialise content into `.harness/proposals/<id>/.scratch/` (write `SKILL.md` from `content.skillMd`; for refinement, render the diff inline as a placeholder + reference original).
3. Set status to `gate-running` and persist.
4. Invoke `harness skill run harness-soundness-review --mode spec` against the scratch directory via existing skill-runner. (Skill-mode degrades to spec-mode in v1 per spec D5.)
5. Parse findings JSON; persist into `gate: { lastRunAt, findings }`.
6. If any `error`-severity finding: status → `gate-failed`, retain findings. Else status → `gate-running` (cleared on next approve).
7. Clean scratch directory.

**Test:** `packages/orchestrator/tests/proposals/gate.test.ts` — fixture proposal with passing + failing soundness output; assertions on status + findings persistence.

### T6 — Orchestrator: proposals/promote.ts

**File:** `packages/orchestrator/src/proposals/promote.ts` (new)

`promote(projectPath, proposalId, decidedBy): Promise<{ skillPath: string }>`:

1. Re-load proposal.
2. Verify status === `gate-running` and `gate.lastRunAt` within 24h with no errors. Otherwise throw `GateNotReadyError`.
3. New-skill path: write `agents/skills/claude-code/<content.name>/skill.yaml` and `SKILL.md` from proposal; inject `provenance: agent-proposed` and `originatingProposalId`.
4. Refinement path: open `agents/skills/claude-code/<targetSkill>/`; verify content differs from git-HEAD (reviewer must have edited); patch `provenance` to `agent-proposed`, write/update `originatingProposalId`.
5. Patch proposal: `status: 'approved'`, `decision: { decidedAt, decidedBy, action: 'approved' }`.
6. Return new skill path for caller to display.

Caller (T8 route handler) emits the `proposal.approved` event after a successful `promote`.

**Test:** `packages/orchestrator/tests/proposals/promote.test.ts` — both kinds, idempotency, GateNotReadyError.

### T7 — Orchestrator: proposals/events.ts + envelope derivers

**Files:**

- `packages/orchestrator/src/proposals/events.ts` (new)
- `packages/orchestrator/src/notifications/envelope.ts` (edit — add three derivers)
- `packages/orchestrator/src/gateway/webhooks/events.ts` (edit — recognise `proposal.*`)

`events.ts` exports `emitProposalCreated`, `emitProposalApproved`, `emitProposalRejected` — thin wrappers around the existing gateway event bus that prevent unstructured payloads from leaking.

Envelope derivers per spec §Gateway events:

- `proposal.created` → `{title: 'New skill proposal: <name>', summary: <justification 240ch>, severity: 'info', actions: [{label: 'Review', url: '<dashboardOrigin>/s/proposals'}]}`
- `proposal.approved` → `{title: 'Skill proposal approved: <name>', summary: 'by <decidedBy>', severity: 'success'}`
- `proposal.rejected` → `{title: 'Skill proposal rejected', summary: <reason 240ch>, severity: 'warning'}`

Webhook event recognition: extend the existing event-name matcher so `proposal.*` wildcard subscriptions resolve.

**Test:** `packages/orchestrator/tests/notifications/envelope.test.ts` (edit — three new table rows). `packages/orchestrator/tests/proposals/events.test.ts` — emitter wiring.

### T8 — Orchestrator: gateway routes + v1-bridge + scopes

**Files:**

- `packages/orchestrator/src/server/routes/proposals.ts` (new)
- `packages/orchestrator/src/server/v1-bridge-routes.ts` (edit — register 7 routes)
- `packages/orchestrator/src/auth/scopes.ts` (edit — append `'manage-proposals'` + route mappings)
- `packages/orchestrator/src/server/http.ts` (edit — mount router)

Route handlers per spec §Gateway routes:

- `GET /api/v1/proposals` → list, scope `read-status`
- `GET /api/v1/proposals/:id` → get, scope `read-status`
- `POST /api/v1/proposals/:id/run-gate` → invokes T5 `runGate`, returns updated proposal, scope `manage-proposals`
- `POST /api/v1/proposals/:id/approve` → invokes T6 `promote`, emits `proposal.approved`, scope `manage-proposals`
- `POST /api/v1/proposals/:id/reject` → marks status `rejected`, emits `proposal.rejected`, scope `manage-proposals`
- `PATCH /api/v1/proposals/:id` → edit content + reset gate, scope `manage-proposals`
- (note: `POST /api/v1/proposals` is **not** exposed; emit is MCP-tool-only)

Register all in `V1_BRIDGE_ROUTES` under `── Phase 4 bridge primitives ──`.

`scopes.ts`:

- `SCOPE_VOCABULARY` += `'manage-proposals'`
- No explicit branch needed in `requiredScopeForRoute` because `requiredBridgeScope` already covers v1 bridge routes; the listing-by-path `if (path.startsWith('/api/proposals'))` is added only if a legacy alias is needed (not for this phase).

**Test:** `packages/orchestrator/tests/server/proposals-routes.test.ts` — happy path for each route + scope enforcement. `packages/orchestrator/tests/auth/scopes.test.ts` (edit — assert new scope resolves correctly for all 7 routes).

### T9 — Orchestrator: backfill maintenance task

**Files:**

- `packages/orchestrator/src/maintenance/built-ins.ts` (edit — register task)
- `packages/cli/src/commands/backfill-skill-provenance.ts` (new — implements the migration logic, callable directly and from the maintenance task)

Migration logic:

- Walk `agents/skills/*/*/skill.yaml`
- For each file missing the `provenance` key, append `provenance: user-authored` (preserve formatting, use a YAML-AST library or naive append if no key exists)
- Idempotent

Task definition: id `proposal-provenance-backfill`, type `housekeeping`, runs once (`schedule: 'manual'`).

**Test:** `packages/cli/tests/commands/backfill-skill-provenance.test.ts` — fixture skills dir, before/after assertions; second-run idempotency.

### T10 — Dashboard: proxy router + Proposals page

**Files:**

- `packages/dashboard/src/server/routes/proposals.ts` (new — thin proxy to `/api/v1/proposals*`)
- `packages/dashboard/src/server/index.ts` (edit — mount router)
- `packages/dashboard/src/client/pages/Proposals.tsx` (new)
- `packages/dashboard/src/client/components/layout/ThreadView.tsx` (edit — `'proposals': Proposals`)
- `packages/dashboard/src/client/main.tsx` (edit — legacy redirect)

Dashboard server route only adds a `/api/proposals` listing endpoint that hits the orchestrator proxy when an orchestrator is configured, falling back to disk reads otherwise (consistent with how `Webhooks.tsx` uses both `/api/v1/...` and `/api/...`).

Page UI per spec §Dashboard page. Inline editor uses a `<textarea>` (no Monaco bundle to keep size down). Action buttons disabled appropriately based on gate state.

**Test:** No dedicated test for the page; covered indirectly by integration in T15.

### T11 — ADRs

**Files:**

- `docs/knowledge/decisions/0015-skill-proposal-workflow.md` (new)
- `docs/knowledge/decisions/0016-manage-proposals-scope.md` (new)

ADRs follow the existing decision-record template (look at `docs/knowledge/decisions/0013-*.md` for prior shape).

### T12 — Knowledge nodes

**Files:**

- `docs/knowledge/cli/skill-proposals.md` (new) — `business_concept` + `business_process` for the lifecycle
- `docs/knowledge/cli/skill-provenance.md` (new) — `business_concept` for the taxonomy + the constraint rule

Both files follow the frontmatter pattern documented in the spec (yaml header with `type`, `domain`, `tags`).

### T13 — Doc sweep

**Files:**

- `AGENTS.md` (edit — add "Skill Proposals" subsection)
- `CHANGELOG.md` (edit — Unreleased entry)
- `README.md` (edit — one Key Features bullet)

### T14 — Mechanical verification

Run, in order:

- `pnpm run build`
- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run lint`
- `harness validate`
- `harness check-arch`
- `harness check-deps`

All must pass. Fix any drift before T15.

### T15 — `harness:verification` three-tier

Run `harness:verification` against this phase scope. EXISTS / SUBSTANTIVE / WIRED tiers all green.

### T16 — Integration tier

- `harness:knowledge-pipeline` to ingest the new knowledge nodes
- `harness generate-slash-commands` to refresh plugin manifests (only relevant once a real promotion happens; safe to run with zero promotions)
- Run the backfill maintenance task once and verify all existing skills carry `provenance: user-authored`

## Risk register

| Risk                                                                      | Mitigation                                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Soundness-review skill-mode not yet designed → gate signal is weak in v1  | Run as `--mode spec` against `SKILL.md` (degraded but useful). Track as follow-up spec when queue surfaces real patterns.                   |
| Provenance backfill corrupts existing YAML                                | Backfill task is idempotent; uses append-only writes; covered by a unit test with fixture skills. Manual git-revert is the rollback.        |
| Refinement diff stored but not applied → proposal flow stalls             | D4 makes manual edit explicit; promote step verifies edits exist, fails loudly otherwise. Reviewer UX surfaces a clear "edit then approve". |
| Webhook fanout of `proposal.*` events floods Phase 3 sinks during dogfood | Default sink subscriptions in the dashboard config exclude `proposal.*` unless explicitly opted in; can be flipped later.                   |
| Test cost: orchestrator routes test require running orchestrator          | Use the existing in-process test pattern (look at `packages/orchestrator/tests/server/v1-bridge-routes.test.ts` for shape).                 |
