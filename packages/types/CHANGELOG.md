# @harness-engineering/types

## 0.31.0

### Minor Changes

- 6ba006f: Add the per-leaf context-replay budget enforcement primitive for the -fleet
  family (#1524), with a live enforcement caller in the orchestrator dispatch
  governor. A leaf's estimated context load is checked against a budget at
  dispatch and fails loudly when over rather than silently spending.
  - `@harness-engineering/core` (`fleet/context-budget`): `DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS`
    (200000), `resolveContextBudget`, `enforceLeafContextBudget`, `formatBudgetFailure`,
    `summarizeLeafSpend`, and the fail-loud consult helper `assertLeafWithinBudget`
    (throws `ContextBudgetExceededError` when over budget). Pure and offline.
  - `@harness-engineering/types`: `LeafContextEstimate` / `ContextBudget` /
    `LeafContextSpend` / `LeafBudgetVerdict` shapes, plus `AgentContextBudgetConfig`
    and the optional `agent.contextBudget` field on `AgentConfig`.
  - `@harness-engineering/orchestrator`: `assertIssueWithinContextBudget` consulted
    in the state machine's dispatch loop before each leaf is claimed; over-budget
    leaves emit a loud error effect and are skipped. Configured via
    `agent.contextBudget = { maxTokens, perFleet? }`. **Absent ⇒ unlimited** —
    dispatch behavior is byte-identical when unconfigured.

- d64e63b: Spend-govern the skill/fleet-command dispatch path, not just the orchestrator engine
  (#1600). #1525's per-period token spend envelope previously enforced only inside the
  orchestrator engine's `state-machine.ts` dispatch loop; skill-driven fleet fan-out
  (`/harness:roadmap-fleet`, `fleet-command`) was bounded by a leaf-SLOT cap only, never a
  spend cap, so a single coordinated run could burn unbounded tokens.

  The spend-vs-envelope comparison is now a shared, pure primitive in
  `@harness-engineering/core` (`fleet/spend-budget`: `isGlobalEnvelopeExhausted`,
  `isFleetAllocationExhausted`, `evaluateSpendEnvelope`), with its shapes in
  `@harness-engineering/types` (`fleet-spend-budget.ts`) — mirroring how the per-leaf
  context budget spans both paths. The orchestrator's `budget-governor` delegates its
  exhaustion predicates to it, and a new concrete callable, `harness fleet budget-check`,
  is the DISPATCH-time consult the fleet-family / `fleet-command` contract invokes before
  scheduling each lane: it reads observed spend from burn's existing per-fleet/per-lane
  attribution (#1270) and reports `within | exhausted | unconfigured` (exit `10` on
  exhausted), stopping clean at a lane boundary when the envelope is spent. No-op and
  byte-identical when unconfigured.

- 4eb2da5: feat(fleet): cross-run advisory work-claim lease for the ID-based members

  Adds a GitHub-backed advisory work-claim lease so two people running an ID-based
  fleet (`roadmap-fleet`, `issue-fleet`, `pr-fleet`) on different clones auto-partition
  the backlog instead of duplicating work. New `FleetClaim` type in
  `@harness-engineering/types` and a pure, offline `fleet/claims` module in
  `@harness-engineering/core` (`buildClaimBody` / `parseClaimComment` / `isLeaseLive` /
  `resolveClaimWinner` / `classifyClaim` / `selectUnclaimed` + constants). Soft
  reservation with a TTL+heartbeat lease measured off the GitHub server clock; the open
  PR is the durable claim. The `cli` bump is an incidental command-registry regeneration.

- eafbd15: fleet: assemble a dispatched leaf's context graph-scoped by default (#1524 deferred slice)

  Every dispatched-leaf stage prompt now carries a directive to retrieve existing
  code via `code_outline` / `code_unfold` / `find_context_for` first and read raw
  whole-file source only for the region under edit — attacking the dominant
  context-replay cost term (the assembled context size fleet fan-out multiplies)
  without losing correctness. Graph-scoped is the default (`DEFAULT_RETRIEVAL_MODE`);
  `agent.retrievalMode: 'raw'` is the explicit, byte-identical opt-out. Refs #1524.

- 32a104c: Rate-limit-aware fan-out (#1532): add a per-resource API budget primitive
  (`RateBudget` + `sharedRateBudget` in `@harness-engineering/core` `fleet/rate-budget`)
  with shared cross-leaf backoff and typed `ThrottledFetchError` / `TruncatedFetchError`.
  The GitHub HTTP layer (`GitHubHttp`) now acquires the shared budget before every
  fetch, penalizes it on 403/429, and FAILS the leaf on a terminal throttle or a
  server-truncated page instead of returning partial/silent-zero data. Adopters tune
  budgets via the new `AgentConfig.resourceBudgets` config key (defaulted in
  `getDefaultConfig`, applied to the shared budget at orchestrator startup).
- 97c3b03: Rule-to-failure provenance linking (ADR 0100) — link every enforced constraint to the
  incident that motivated it.

  Additive, optional, and advisory by design: nothing gates on it, and every existing
  document and rule stays valid with no provenance (fill-forward).
  - `@harness-engineering/types` + `@harness-engineering/core`: optional `enforces?: string[]`
    on the solution-doc frontmatter (`SolutionDocFrontmatter` / `SolutionDocFrontmatterSchema`)
    — the rule ids a `harness-compound` solution produced or hardened.
  - `@harness-engineering/core`: optional `origin?: string` on the `StrengthRule` type (the
    reciprocal back-pointer to a solution slug or issue ref), plus a new `provenance` module
    (`buildProvenanceReport`, `collectSolutionEnforcements`) that joins the two sides.
  - `@harness-engineering/cli`: `harness rules provenance` — an advisory reporter that flags
    unexplained constraints (enforced rules with no origin) and candidate dead rules (a rule
    whose origin resolves to no known solution, or a solution enforcing a STRENGTH id absent
    from the registry). Never exits non-zero on findings; supports `--json`.
  - Producer wiring (ADR 0100 Action Item #4): the `harness-compound` capture phase (Phase 4
    ASSEMBLE, all platform mirrors) now captures the optional `enforces:` list when a fix
    produced or hardened an enforced rule — advisory, fill-forward, never blocks capture. The
    resolution template and human schema mirror document the field.

- 3646500: Add a budget governor for unattended dispatch (#1525). A per-period spend
  envelope (`agent.budget`) is enforced on the real dispatch path: global envelope
  exhaustion stops dispatch cleanly at a lane boundary (in-flight lanes are never
  interrupted), and per-fleet sub-allocations let fleets sharing an envelope
  respect their split under contention. The remaining-budget signal is exposed via
  the orchestrator snapshot (`getSnapshot().budget`). The governor is off when
  `agent.budget` is not configured.

## 0.30.0

### Minor Changes

- 4cbb45b: feat(types): add the canonical bounded fleet-worker handoff record. New `FleetHandoffRecord` (zod `FleetHandoffRecordSchema`) plus `validateFleetHandoffRecord`/`parseFleetHandoffRecord` helpers give every fleet-family worker (bug-fleet, roadmap-fleet, pr-fleet, cicd-fleet, cleanup-fleet, security-fleet, test-fleet, issue-fleet, adr-fleet) ONE shared, bounded report shape — `status` (`done|parked|blocked|failed`), `summary`, `evidence`, `next_steps`, `blocker`, plus `fleet`/`item` provenance — modeled on a Ralph-loop bounded structured report. The record is bounded: `.strict()` rejects unknown keys and the validator rejects any non-`done` status that omits a `blocker`, so `fleet-command` can parse any fleet's worker output uniformly instead of special-casing each ad hoc shape. This PR both **defines** the primitive and **adopts** it across the fleet family: every fan-out member's `SKILL.md` now requires each worker to return this record, `fleet-command` validates each lane's worker output uniformly via `validateFleetHandoffRecord`, and `docs/reference/fleet-family.md` codifies it as the family standard. The adoption is doc/prose-level (no runtime parses fleet worker output today); only the `@harness-engineering/types` primitive is a publishable change, hence the single `types` bump.

## 0.29.0

### Minor Changes

- 56f68f3: Scope `manage_roadmap add` to the row it adds, and link that row to its own
  tracking issue.

  Adding one roadmap row used to trigger a whole-repository bidirectional
  reconcile against the tracker, so a local one-row write rewrote _other_ rows
  with tracker state — and the new row itself was serialized without the
  `Assignee` / `Priority` / `External-ID` triple, so nothing joined it to the
  issue that had just been created for it. The two faults were opposite ends of
  the same seam: added rows only looked healthy because the full sync
  subsequently stamped `externalId` onto them, so excluding `add` from external
  sync outright would have made the second fault fire on every add.

  `add` now performs a row-scoped push instead. New core export
  `syncRowToExternal(projectRoot, adapter, config, featureName, options?)`:
  push-only, single row, dedup-aware, and fail-closed — if `fetchAllTickets`
  fails it performs no create, because degrading to an empty dedup index would
  mint exactly the duplicate issue this fix prevents. It runs no inbound pull
  and does not stamp `last_synced`: a one-row push is not a reconcile.

  It returns the new `RowSyncResult` — a `SyncResult` plus the post-push
  `feature.externalId`. That field, not `created` / `updated`, is what answers
  "is this row linked?": a row that dedup-links to an existing ticket has its id
  stamped and written to disk even when the follow-up patch fails, leaving both
  arrays empty. A writeback failure is reported under the `'*'` envelope, so
  "linked at the tracker but not persisted" stays distinguishable from a
  tracker-side error, and the `add` response can name the orphaned ticket.

  **Types is a minor bump, not a patch:** `SyncResult` gained a required member
  (`suppressedInbound`), which is source-breaking for anyone constructing one.

  Inbound sync is hardened independently, because `sync --apply` and state
  transitions still run the full reconcile:
  - An absent tracker assignee no longer clears a local one. An unassigned issue
    is the default state of every issue, not an authoritative empty value.
  - Consequently, any inbound status change on an _assigned_ row now routes
    through `setStatus`, so the assignee is released through the lifecycle
    authority and `assignee ≠ null ⟺ in-progress` still holds. This also repairs
    an already-invalid row (assigned but not `in-progress`), and the release is
    reported: `assignmentChanges` now describes the assignee that actually landed
    on disk rather than the intermediate value the pull computed.
  - A merely-`OPEN` issue no longer overwrites a local `backlog` status. The
    guard is gated on the absence of the label naming the status the write would
    produce, rather than on the resolved status, because a direct open-to-planned
    mapping resolves a bare issue and an explicitly `planned`-labelled one
    identically. An explicit `planned` label still promotes; a `blocked` label
    does not, since a direct `open` key discards its opinion anyway.
  - Both suppressions are reported in the new `SyncResult.suppressedInbound`,
    which `harness roadmap sync` now surfaces in both its `--json` payload
    (`skipped.inbound`) and its warn output, rather than silently dropping.

  The `add` response gains a `link` key describing the outcome. A missing token
  or a failed link is reported in the response text but does **not** mark the
  response as an error: the row was written and is locally valid, and flagging a
  failure would invite a retry that mints a duplicate issue. The failure message
  names the recovery that works — `sync` with `apply=true`, which links the row
  that already exists — and warns against re-running `add`, which cannot work
  because the row is already persisted and the second add collides on slug.

  The roadmap serializer is unchanged. Stamping `externalId` alone flips the
  extended-field predicate, so all three lines appear because the fields are
  real — not because the serializer pads them.

  Refs #1285, #1286.

- def9dc6: Support thematic grouping / narrative sections in a roadmap milestone.

  An `### H3` whose heading text begins with the literal marker `Group: ` is now parsed as a narrative grouping section rather than a strict feature row: its body is captured verbatim on the new optional `RoadmapMilestone.groups` field (`RoadmapGroup`) and is never feature-validated, so free-form bullets, prose, blockquotes, and links no longer make the whole roadmap fail to parse. `serializeRoadmap` re-emits every group, so the serializer no longer flattens the narrative away.

  The marker is explicit: a plain `### <name>` with no `- **Status:**` bullet still fails to parse, so real work is never silently skipped. A feature that genuinely needs a name starting with `Group: ` is authored as `### Feature: Group: <name>` — the explicit `Feature: ` prefix wins over the group marker, and the serializer emits it automatically for such names, so no tracked row is ever reclassified as narrative. Group names are trimmed (so `Group: Themes` and `Group: Themes   ` are one group), and a bare `### Group: ` with no name is rejected with an error naming the milestone and line rather than emitting a heading that a trim-on-save editor would silently break. Strict roadmaps are unaffected: `groups` is attached only when a milestone actually has one, so their parsed shape is byte-identical to before, and feature validation, `milestone.features`, and sharded mode are unchanged.

  **A grouped roadmap is edited by hand, by convention.** The automated write paths do not maintain group sections. `harness roadmap shard` refuses outright to shard a roadmap that carries groups. The single-file writer (`manage_roadmap` update/promote/sync) will _usually_ refuse too, with a "cannot preserve" error — but that guard is **not group-aware**: it only asks whether the file contains a line the model cannot represent. A prose narrative body trips it; a group body made only of modeled `- **Key:**` bullets does not, so the rewrite proceeds and the group is relocated to after that milestone's features. Nothing is lost in either case, but do not rely on the refusal to protect a group's position. In sharded mode, do not add groups to `docs/roadmap.md` at all — it is a derived aggregate rebuilt from `docs/roadmap.d/` with no preservation guard, so a group added there is dropped on the next `harness roadmap regen`.

- 8559d5e: Preserve the roadmap's preamble — the block between `# Roadmap` and the first
  milestone heading — through `shard` → `regen`.

  That block is where a roadmap carries instructions to the tooling and humans
  downstream of it: a `<!-- markdownlint-disable-file MD013 -->` directive that
  keeps a required docs-lint check green against a schema that mandates one
  physical line per field, and the note recording why the file is formatter-exempt
  and must not be reflowed. It entered neither `_meta.md` nor any shard, so `regen`
  faithfully rebuilt an aggregate the block had never been part of and it was gone
  — at exit code 0, with nothing warning. The tooling erased the note documenting
  its own contract, and erased it silently (#1328).

  `Roadmap` gains an optional `preamble`, captured verbatim by `parseRoadmap` and
  re-emitted by `serializeRoadmap` under the title — the same
  never-silently-drop-it contract the narrative `### Group:` sections already have.
  `RoadmapMeta` carries it in the `_meta.md` body ahead of any
  `## Assignment History` section, because it is roadmap-level and not derivable
  from shards, exactly like the assignment history. It therefore also survives the
  `_meta.md` rewrites of `stampLastSynced` and `patchAssignmentHistory`, and the
  `shard` command's pre-write round-trip assertion now covers it: dropping it is a
  detected failure that aborts the migration rather than a silent strip.

  The field is attached only when a roadmap actually has a preamble, so a
  preamble-free roadmap parses to the same shape and serializes to the same bytes
  as before, and `_meta.md` is byte-identical for every existing shard directory.
  The H1 title line is not part of the preamble (the serializer still canonicalizes
  it to `# Roadmap`); content authored above the title is kept and re-emitted below
  it, so a second parse of the serialized form returns the same string and regen
  stays byte-stable.

  Scope is deliberately the preamble only. Everything after the first `##` heading
  — continuation lines of a wrapped field, unmodeled `- **Key:**` bullets,
  section-intro blockquotes — is still unmodeled and still lost on a rewrite; the
  `findUnpreservedLines` guard continues to report it and `MonolithStore` continues
  to refuse those writes. What changes there is that the guard no longer reports
  preamble lines, which the serializer now keeps: it was blocking single-file
  roadmap writes over content that is no longer at risk.

- 23de83f: feat(telemetry): add `harness telemetry synthesize` — a unified local telemetry report

  Ships the in-repo slice of #563: a read-only, local, single-project command that
  COMPOSES the five telemetry surfaces that already accrue — skill adoption
  (`readAdoptionRecords`/`aggregateBySkill`), Bayesian skill effectiveness
  (`computeSkillEffectiveness`/`detectFailingSkills`/`detectAbandonedSkills`), usage/cost
  (the usage aggregator), composite code-health insights (`composeInsights`), and
  `execution_outcome` graph verdicts — into one report. Markdown by default; `--json`
  emits a machine-readable `TelemetrySynthesis` object designed so a future dashboard can
  consume it unchanged.

  It collects nothing new — no hooks, event types, or storage — and is pure composition
  over existing readers, mirroring the `harness adoption retrospective` precedent.
  `--skip <section>` omits a source, `--window <days>` bounds the adoption/usage/outcome
  sources, and `--out <path>` writes to a file (default: stdout). A missing source
  contributes an explicit "no data" note in a "Sources with no data" footer — never a
  fabricated zero and never a crash.

  The cross-adopter public dashboard from the shard stays out of scope (it needs a
  PostHog aggregate + privacy review + hosting decision that do not exist in-repo); this
  is the buildable, testable per-project data layer that dashboard would render.

  `core` gains a `telemetry-synthesis` module (pure composer + Markdown renderer); the CLI
  is the composition root, keeping `core` free of any `intelligence`/`graph` dependency.

## 0.28.0

### Minor Changes

- 5d6436c: ULID identity for sessions and worktree-isolated tasks (#603)

  Add immutable ULID identity for sessions and worktree-isolated tasks. Every
  session and worktree task now gets a collision-free, lexicographically sortable
  ULID at creation (recorded in an additive `identity.json`), plus a human-friendly
  sequential number assigned at completion (session archive / worktree ship). Fully
  backward-compatible and best-effort — the existing slug remains the display label
  and on-disk directory name.

## 0.27.0

### Minor Changes

- 21df39b: Add failure-reason categorization to `.harness/metrics/adoption.jsonl`.

  Adoption records previously captured `outcome: completed | failed | abandoned` —
  the _what_ of a skill run without the _why_. A new optional `failureCategory`
  field records the reason a run did not complete, drawn from a small closed
  taxonomy (`FailureCategory`): `prerequisite-missing`, `gate-rejected`,
  `user-cancelled`, `timeout`, `dependency-failure`, `agent-error`, and
  `inconclusive`.

  The category is derived by the adoption-tracker hook at the failure/gate points
  already present in the skill-event stream: an `error` event's `failureType` is
  mapped through a keyword table (defaulting to `agent-error`), and a failed
  `gate_result` yields `gate-rejected`. It is only emitted when a reason is
  determinable — completed runs and reason-less abandonments carry no category, so
  the field is never guessed.

  The field is optional and additive: records written before it existed still
  parse, and the reader drops any unrecognized value. Downstream consumers now use
  it — the skill-effectiveness scorer (`detectFailingSkills`) reports a
  per-skill `failureCategories` breakdown, and the catalog retrospective adds a
  per-skill breakdown, a catalog-wide `failureCategoryTotals`, and a rendered
  "Failure categories" section — so failing skills can be grouped by _why_ they
  fail, not just how often.

- 7369e11: Add opt-in constraint packs — named bundles of blocking rules a project chooses
  to enforce per lifecycle stage rather than all-or-nothing.

  A project opts in via `constraintPacks: [...]` in `harness.config.json`. Each
  pack maps onto the existing security rule sets and elevates a set of rules to
  blocking at the stage(s) it declares (`pre-commit`, `pre-merge`, `pre-release`).
  Three built-in packs ship: `secrets-and-injection` (secrets + injection, at
  pre-merge and pre-release), `ai-agent-safety` (unsafe AI-agent/MCP config, at
  pre-merge), and `web-hardening` (XSS, path traversal, unsafe network, weak
  crypto, at pre-release).

  Packs are a thin overlay on the existing check machinery, not a new enforcement
  engine: `runCIChecks` resolves the opted-in packs and merges their rule
  elevations into the security check's config before it runs, so opting in
  genuinely turns the rules on. A project's own explicit `security.rules` entry
  always wins over a pack overlay (a per-rule escape hatch). `harness ci check`
  gains a `--stage <stage>` flag to enforce only the packs that apply at that
  stage, and the check report carries a per-pack, per-stage compliance summary
  (`compliant` / `non-compliant` / `n/a`). Empty or absent `constraintPacks`
  leaves all existing behavior unchanged.

  Opting into a pack is scoped to exactly that pack's rule prefixes:
  - When a pack force-enables a scanner that was `security.enabled: false`, a
    `'SEC-*': 'off'` base is injected before the pack's elevations, so only the
    pack's own prefixes block — opting into one pack no longer turns on every
    default-error rule in the scanner. Wildcard rule resolution now prefers the
    most-specific (longest-prefix) match, so a narrow elevation is never shadowed
    by that broad base.
  - `web-hardening` no longer promotes every warning/info rule via a global
    `strict` flag (the `securityStrict` pack field is removed); it blocks only its
    four named prefixes (`SEC-XSS-*`, `SEC-PTH-*`, `SEC-NET-*`, `SEC-CRY-*`).
  - Per-pack compliance is attributed by rule prefix: a stage is `non-compliant`
    only when a failing security finding's rule id is covered by that pack's own
    prefixes, so an unrelated finding no longer marks every pack non-compliant.
    `CICheckIssue` gains an optional `ruleId` to carry this attribution.
  - `harness ci check` rejects an unrecognized `--stage` instead of silently
    running every stage, and warns when packs are opted in but the security check
    was skipped.

- de52864: Add an orchestrator gateway policy envelope + subprocess env air-gap.

  Every agent subprocess dispatch now carries a `PolicyMetadata` envelope
  (`approvalMode`, `sandboxMode`, `networkMode`, `dangerousFlags[]`, `agentFamily`,
  `agentVersion`) that is stamped as a one-line-per-dispatch governance record into
  `.harness/audit.log` (alongside the existing gateway auth records, discriminated
  by `event: "agent_dispatch"`). The record logs the NAMES of any parent-env vars
  withheld from the subprocess — never their values, never the prompt/payload.

  The load-bearing control: the `claude` backend no longer spawns with
  `env: process.env` (which leaked the orchestrator's ENTIRE environment — every
  unrelated secret — into the agent subprocess). It now spawns with an
  allowlisted environment (`buildSubprocessEnv`) that forwards well-known-safe
  plumbing (PATH/HOME/SHELL/locale/TLS/proxy/temp), the harness runtime + session
  vars (`HARNESS_*`), the agent CLI's own config (`CLAUDE_*`/`ANTHROPIC_*`), git
  tooling (`GIT_*`/`GH_*`/`GITHUB_*`), and cloud model-provider credentials
  (prefix-matched providers plus any `*_API_KEY`), while dropping arbitrary
  unrelated secrets. The allowlist is extensible per-call and via the
  `HARNESS_SUBPROCESS_ENV_ALLOW` escape hatch, with a
  `HARNESS_SUBPROCESS_ENV_UNSAFE_PASSTHROUGH` kill-switch for advisory-only mode.

### Patch Changes

- fc20e42: Auto-triggered retrospection with applyable proposals.

  Archiving a session — the session terminus — now optionally fires a
  retrospection over the archived session corpus and emits _applyable_ skill
  proposals into `.harness/proposals/`, rather than requiring a manual retro run.

  The trigger reuses the existing session-archive lifecycle: `buildArchiveHooks()`
  gains a third `onArchived` step (alongside summary and search-index) that runs a
  new `retrospectArchivedSession()` in `@harness-engineering/orchestrator`. It is
  opt-in and safe — it fires only when a `sessions.retrospection` config block is
  present (`enabled !== false`) and an analysis provider is available, and every
  step remains individually non-fatal. The `manage_state` `archive_session` MCP
  action activates it live when `HARNESS_SESSION_RETROSPECTION` is set and a
  provider resolves; otherwise behaviour is unchanged.

  Emitted proposals are ordinary `SkillProposal` records — the same shape produced
  by `emit_skill_proposal` — so they carry the target (`targetSkill` for
  refinements), the change (`content.diff`, or `content.skillYaml` + `skillMd` for
  new skills), and the rationale (`justification`), and they surface, gate, and
  promote through the unchanged review pipeline. New in
  `@harness-engineering/types`: `RetrospectionProposalDraftSchema` /
  `RetrospectionProposalsResponseSchema` (a projection of the emit input, no
  parallel proposal type) and a `RetrospectionConfig` on `SessionsConfig`.

  Emission only — nothing is auto-applied. Approval and promotion stay a separate,
  human-gated step.

- 5c72805: Give maintenance checks a standard machine-parseable findings contract (#691).

  `harness maintenance run` (and the cron orchestrator) previously recovered each
  task's findings COUNT by regex-scanning free-text check output
  (`N findings|issues|violations|errors`, plus a keyword fallback). That is
  fragile: checks like `check-docs` (doc-drift) and `cleanup` (entropy) emit no
  clean count — so doc-drift reported a uniform "1 finding" — and any wording
  change could silently break the count.

  A new shared envelope (`@harness-engineering/types`:
  `MaintenanceFindingsContract` + `formatFindingsContract` / `parseFindingsContract`)
  lets a check subcommand emit its count as structured data
  (`{"findings":N,"check":"...","v":1}`) under a `--findings-json` flag. The
  runner's shared spawn/parse core (`runHarnessCheck`) now prefers that envelope
  over the regex on both clean and non-zero exits, and labels the source
  (`findingsSource: 'contract' | 'regex'`). The legacy regex remains the fallback
  for checks not yet migrated.

  Migrated built-in checks: `check-arch`, `check-deps`, `check-docs`, `cleanup`,
  `check-security`, `cross-check` (their registry `checkCommand`s now pass
  `--findings-json`). Fully additive and backward-compatible — the flag defaults
  off for interactive CLI use and unmigrated checks are unchanged.

- a766cda: Define the `owns:[paths]` owned-files declaration on plan tasks (#601). Adds a cheap, deterministic, graph-free pre-execution conflict forecast: `forecastOwnershipConflicts` and glob-aware `pathsOverlap` (via minimatch) flag task pairs whose declared owned paths overlap and so may conflict if run in parallel. `buildTaskGraph`/`planParallelization` now compute footprint overlap glob-aware and surface an `ownershipForecast` field on `ParallelizationPlan`. Fully additive — absent `owns` preserves current behavior.

## 0.26.0

### Minor Changes

- 0921ca1: feat(roadmap): `harness roadmap sync` CLI with CI-safety guards and zero-denominator exit

  The full bidirectional roadmap↔tracker sync was reachable only through the
  `manage_roadmap action:"sync"` MCP tool. CI could therefore only ever flip rows
  **to `done`** (via `roadmap reconcile`) — every other transition and the whole
  tracker-label push depended on a human remembering to run an MCP tool. In one
  downstream repo that left `last_synced` 22 days behind `last_manual_edit` and 22
  issues with no tracker labels at all, invisible to a tracker scoped by a
  selector label.

  `harness roadmap sync` closes the loop, and is **dry-run by default** — `--apply`
  is required to write anything. Two guards make an unattended run safe by
  switching off the two destructive powers:
  - `--no-state-change` (`syncIssueState: false`) omits the issue `state` field
    from every patch body, so labels converge but no issue is ever closed or
    reopened. The `statusMap` maps `done → closed`, so one mis-set roadmap row was
    otherwise enough to close a live issue.
  - `--no-create` (`allowCreate: false`) never creates a ticket for a row lacking
    an `External-ID`, and reports each skipped row rather than dropping it. A cron
    that invents issues is unacceptable.

  Both defaults preserve today's behaviour exactly; CI turns them off explicitly.
  `--force` maps to the existing `forceSync` and is documented as unsafe
  unattended (it overrides the human-always-wins rule).

  `ExternalSyncOptions` gains `dryRun`, `allowCreate`, and `syncIssueState`,
  threaded through `syncToExternal` / `syncFromExternal` to the adapter write path
  (`TicketWriteOptions` on `TrackerSyncAdapter.updateTicket`; a `syncIssueState`
  constructor option on `GitHubIssuesTrackerAdapter`). `SyncResult` gains
  `dryRun`, `planned`, `skippedCreates`, `skippedStateChanges`, and `examined`.
  The label-preservation logic in `buildIssuePatchBody` — skip the labels field
  entirely when the refresh GET fails, so a transient blip cannot wipe the
  `harness-managed` selector — is unchanged on both guard settings.

  Denominator discipline: every run reports what it examined (rows compared,
  tickets fetched), and the new `ExitCode.ZERO_DENOMINATOR` (3) fires when it
  examined nothing. A sync that matched nothing has abstained, not succeeded, and
  must never read as a pass.

  Intended consumer pattern: a nightly
  `harness roadmap sync --apply --no-create --no-state-change` converges labels
  safely, while issue closure stays with the PR-merge auto-done path.

### Patch Changes

- 0f64b7d: fix(orchestrator): support `reasoningEffort: 'none'` so the codex backend can drive local coder models

  The codex backend passed `-c model_reasoning_effort` only for `'low' | 'medium' | 'high'`,
  and omitting it fell through to codex's own default — which still sends a reasoning
  request. Newer ollama builds REJECT a reasoning request for a model that does not
  support one, rather than ignoring it: `"qwen3-coder:30b" does not support thinking`
  (`invalid_request_error`). That failed EVERY codex turn against such a model (0 tokens,
  0 turns), silently breaking the entire codex-drives-local-coder path.

  `reasoningEffort: 'none'` is now a first-class value (type, Zod schema, and the codex
  argv builder). It emits `model_reasoning_effort="none"`, which tells codex to omit the
  reasoning field entirely. Verified against ollama `qwen3-coder:30b`: `low` and omission
  both fail the turn; `none` completes it cleanly.

## 0.25.0

### Minor Changes

- bb4de5e: feat: surgical-edit path for local/codex agents + apply the ollama-campaign lessons

  A local model driven through Codex has no working `apply_patch` (freeform variant is
  grammar-constrained / GPT-5-only; the function variant is not offered to third-party
  OSS models), so it falls back to shell redirection that clobbers files — observed live
  deleting a barrel `index.ts`. This adds the missing pieces:
  - **`edit_file` MCP tool** (`@harness-engineering/cli`) — exact `old_string` → `new_string`
    surgical replace with a unique-match guard and clear, recoverable errors; refuses
    ambiguous/missing matches instead of guessing. Ships in `harness-mcp`; opt-in via a
    server's `tools` allowlist.
  - **Staged-workflow prompt** now steers local agents to PREFER an exact-edit tool
    (`harness__edit_file` or equivalent) **if present**, and otherwise to edit surgically
    and never rewrite whole files or use `cat >`/`echo >>`/`apply_patch` — degrades
    gracefully for adopters who don't enable the tool.
  - **`reasoningEffort`** on the `codex` backend (`-c model_reasoning_effort`) — a hands-on
    coder wants `'low'`.
  - **Docs:** a codex-backend + `edit_file` section in the multi-backend-routing guide,
    including the sampling constraint (Codex owns the request and auto-pulls the model, so
    sampling params cannot be injected the way endpoint backends do).

  Also locks in the within-run worktree-preservation contract (a gate-block re-dispatch
  reuses the ONE worktree so the agent's uncommitted progress survives) with a regression
  test — the earlier ollama-path bug wiped the worktree every re-dispatch.

## 0.24.0

### Minor Changes

- 1de3ce4: feat(orchestrator): add a `codex` backend that drives a local model via Codex CLI

  A controlled experiment (2026-07) showed the bottleneck for local-model convergence
  was our bespoke scaffold, not the model: same model (qwen3-coder:30b), same task,
  Codex's apply_patch scaffold shipped a clean multi-file change where the OllamaBackend
  tool loop went needs-human 5×. Confirmed across two models (qwen3-coder 266 tests green,
  qwen3.6 270 green).

  This adds a `codex` backend type — `{ type: 'codex', model, localProvider?, command?,
timeoutMs? }` — that drives a local model through `codex exec --oss --local-provider
<provider> -m <model>`. Unlike the endpoint backends it owns no turn loop: `codex exec`
  runs the whole agentic session in one invocation and the backend reports success on
  exit 0, surfacing codex's `--json` events as status events for the recorder/black-box.
  Foundational piece; wiring the enforced local gate + per-phase routing to treat a codex
  execution stage as local-execution is a follow-up.

- 84bd986: feat(orchestrator): expose MCP servers (context7 + curated harness tools) to the codex backend

  The `codex` execution backend drove the local model with only Codex's built-in
  tools — no context7 (live library docs) and no harness MCP tools — unlike the
  ollama path, which curates a lifecycle tool set. A local coder therefore had no
  way to look up how existing code narrows a type or handles an API, and stalled on
  fixes that hinge on that context.

  `CodexBackendDef` (and `CodexBackendOptions`) now accept `mcpServers?: McpServerSpec[]`.
  Each spec is injected per-invocation via `codex exec -c mcp_servers.<name>.command/
args/env/enabled_tools/startup_timeout_sec` — so the codex path reaches tool-parity
  with the ollama path WITHOUT mutating the user's global `~/.codex/config.toml`. A
  spec's `tools` allowlist maps to codex's per-server `enabled_tools`, keeping a broad
  server (e.g. harness-mcp's ~95 tools) narrowed to a high-value set the local model
  can navigate.

- 77815a8: Make `ollama` the default local backend and add `disableReasoning`. The scaffolded configs (`harness.orchestrator.md`, `harness.config.json`, templates) now route the `local` backend to `type: ollama` (the native OllamaBackend that actually drives tool-calling models) instead of `type: pi`. A new `disableReasoning?: boolean` option on the ollama backend appends ` /no_think` to each user turn so Qwen3-family reasoning models skip `<think>` traces — Ollama's `/v1` ignores the `reasoning:false` knob, so without this a reasoning model burns its output budget thinking and never emits a tool call. With it, a stock `qwen3:32b` config is productive out of the box (no custom Modelfile needed).

  Also fixes three release blockers found in a live local-dispatch e2e that made autonomous local dispatch unsafe:
  - **`ollama` is now recognized as a local backend everywhere.** A shared `isLocalEndpointBackend` guard (true for `local` | `pi` | `ollama`) replaces the inline `type === 'local' || type === 'pi'` checks that silently excluded the new native backend. A `type: ollama` dispatch now (a) renders the LOCAL bash-shaped shim prompt template instead of the Claude template, (b) runs the enforced local workflow gate instead of a no-op, and (c) is discovered by local-model detection so outcome-eval can find a local model. Resolver-model wiring covers `ollama` too.
  - **TASK_COMPLETE completion semantics.** `OllamaBackend.runTurn` no longer treats a no-tool-call final message as success unconditionally. It returns `success: true` only when the final message signals completion via a distinctive `TASK_COMPLETE` marker (matched as a whole token); otherwise it returns `success: false` so the runner re-prompts the model to continue. This prevents a model that stopped after doing nothing from ending the workflow. `DEFAULT_SYSTEM_PROMPT` now instructs the model accordingly.
  - **Empty-diff gate halt.** The local workflow gate now halts BEFORE verify when the agent produced no workspace changes, returning `no changes produced — the agent completed without implementing anything`. This stops an empty diff from trivially passing verify and being marked done.

- c4c1dd3: feat(local-models): harness-fit probe — empirical agentic evidence for model recommendation

  The local-model recommender ranks candidates by benchmark evidence plus a thin
  agentic probe that only checks _"can the model emit a `tool_call`?"_ and _"is one
  turn fast enough?"_. A live 3-way head-to-head proved this necessary-but-insufficient
  for autonomous coding: `llama3.3:70b` **passes** the tool-calling gate and is fast,
  yet it **narrated instead of acting** (one tool call, no artifact, gate never green),
  while the smaller `gpt-oss:20b`/`qwen3.6:27b` **acted and converged**. No benchmark or
  thin-probe signal predicted that — only running the real harness did.

  The **harness-fit probe** supplies the missing empirical evidence. It runs a
  benchmark-shortlisted candidate through a small contained coding task **on the real
  harness**, judges convergence (the task's own acceptance command) plus act-vs-narrate
  metrics from the recording stream, and maps them to a coarse `buildQuality ∈ [0, 1]`
  (converged → HIGH, acted-not-converged → MID, narrated → LOW). That number feeds the
  **already-wired** `buildQuality` slot in the `agenticScore` composition — **no
  ranker-math change** — so at equal benchmark score an act-and-converge model out-ranks
  a narrate-only one for autonomous dispatch, while the default `score` ordering is
  untouched.
  - **Pure policy + injected runner (dependency inversion).** `local-models` owns the
    pure parts — the `buildQuality` mapping (`scoreBuildQuality`), the cost-gating policy
    (`selectProbeTargets` / `isProbeDue` / `isCacheFresh` / `probeCacheKey`), the portable
    task-suite schema + `DEFAULT_HARNESS_FIT_TASKS`, and the `HarnessFitRunner` interface.
    The concrete single-dispatch runner (Ollama backend + throwaway workspace + acceptance
    gate, reading the stream for act-vs-narrate metrics) is implemented in the orchestrator
    and injected at the composition root, so `local-models` never depends on the orchestrator.
  - **Single-dispatch convergence micro-probe.** The act-vs-narrate signal is decisive in
    one dispatch; best-of-1, cheapest real signal.
  - **Cost-gated (opt-in, top-N, cadence, cache, prefilter).** Disabled by default
    (`localModels.harnessFit.enabled`). When enabled, only the benchmark top-N are probed
    (never the full set), on a cadence (not every refresh), with `buildQuality` cached by
    model+version and VRAM-unfit / `toolCalling:false` candidates prefiltered out.
  - **Fail-open everywhere.** Any probe error/timeout/pull-failure leaves `buildQuality`
    undefined ⇒ no ranking effect; the refresh is never broken and the pool is never blocked.
  - **Config surface.** New optional `localModels.harnessFit` block (added to both the TS
    type and the Zod schema so it survives config parse) — `enabled`, `topN`, `cadenceMs`,
    `cacheTtlMs`, optional `taskIds`. Adopter-portable probe tasks self-describe their
    acceptance command, so a probe runs in any adopter project.
  - **Wired at the composition root (the probe actually fires).** `startRefreshScheduler`
    constructs the `HarnessFitProbeRunner`, a persistent `HarnessFitCacheFileStore` under
    `~/.harness/local-models/` (buildQuality cache + cadence timestamp), and a
    `reRankWithBuildQuality` binding that re-runs the SAME ranker over the held candidate
    set with probed `buildQuality` threaded in — passing them as the tick's `harnessFit`
    deps ONLY when `localModels.harnessFit.enabled` (config→deps translation:
    `cadenceMs → intervalMs`, `taskIds → tasks`). Disabled/absent ⇒ no deps are passed and
    the tick is byte-identical to before.
  - **Bounded (no hangs).** The runner enforces an overall per-probe wall-clock timeout
    (default 5 min) around both the dispatch and the acceptance-command spawn — `maxTurns`
    bounds turn count but not wall time, so a hung model or hanging acceptance is aborted
    into a fail-open `error` result instead of blocking the refresh tick.
  - **Converged-without-artifact is suspect.** A converged verdict only scores HIGH when the
    model actually touched a file; a trivially-passing acceptance with no artifact drops to
    MID/LOW rather than earning the top band.

  See ADR 0081 (harness-fit probe: benchmarks pre-filter, the harness judges agentic fitness).

- fac4261: Local backend runs the full harness workflow (gated). A `local`/`pi` dispatch now renders a backend-specific dispatch template (`harness.orchestrator.local.md`). Rather than paraphrasing the workflow inline, that template is a thin indirection shim that delivers the REAL skills over bash: the pi agent runs `harness skill run <name> --autonomous` (which prints the verbatim `SKILL.md`, no MCP required) and follows a `/harness:X` → `harness skill run harness-X` redirect. The new `--autonomous` flag on `harness skill run` prepends an autonomous-decider preamble so a headless agent runs each skill (including brainstorming) at full rigor but decides every fork itself and records it in the spec — with a PR-flag safety valve for low-confidence and strategy-contradiction forks, and no mid-run human pause; absent the flag, skill-run output is byte-identical to before. The orchestrator ENFORCES the verify + outcome-eval gates itself (`runLocalWorkflowGate` in `finalizeNormalCompletion`): a red verify or a high-confidence `NOT_SATISFIED` verdict routes through the existing `emitWorkerExit('error')` retry branch (re-prompt on retry, `needs-human` on budget exhaustion) so poor local output halts rather than ships. Template selection (`resolvePromptTemplate`) falls back to the default Claude template when the local file is absent, and the Claude/AMR completion path is unchanged (the gate is a no-op for non-local backends). A config flag `agent.routing.workflowGates: local | primary` routes the local outcome-eval gate to a stronger provider (default local SEL; the AMR caller is unaffected). See ADRs 0070/0071/0072.
- 3e5f0ca: Add a per-server MCP tool allowlist for the local `ollama` agent. A broad
  MCP server floods a local model with tools — in a live e2e the harness MCP
  alone exposed 95 tools and `qwen3-coder:30b` over-explored without cleanly
  signalling completion. `mcpServers[].tools?: string[]` narrows a server to
  named tools (filtered on the server's own pre-namespacing tool name);
  unset ⇒ all tools (byte-identical to before). Requested-but-unexposed names
  warn once and are skipped (graceful). When the aggregated tool set
  (built-ins + MCP) exceeds a threshold, the backend logs a one-line advisory
  pointing at `tools` — no hard cap. The scaffolded local configs narrow the
  harness example to a read-oriented set (`code_search`, `ask_graph`,
  `review_changes`, `outcome_eval`, `gather_context`).
- a0ef808: feat(orchestrator): add native Ollama agentic backend

  Add a production `OllamaBackend` (`type: 'ollama'`) that owns its
  `/v1/chat/completions` tool loop instead of embedding the pi-coding-agent SDK.
  `startSession` seeds conversation state with a system prompt; `runTurn` drives
  the inner agentic loop (call model → execute native `tool_calls`
  [`bash`/`write_file`/`read_file`, sandboxed to the workspace with
  path-traversal rejection] → append tool results → repeat until the model stops
  calling tools), yielding `tool_execution_start`/`tool_execution_end`/`usage`
  events and accumulating token usage. Wired through the config schema, the
  backend factory, and the analysis-provider factory. This drives Ollama-served
  tool-calling models (e.g. qwen3) that the pi/codex SDKs fail against.

- 545e818: Give the local `ollama` backend agent access to MCP-server tools. The
  `OllamaBackend` previously drove the model with only three built-in tools
  (`bash`, `read_file`, `write_file`), so a local model coded from stale
  training memory — in a live e2e it wrote a deprecated
  `@typescript-eslint/utils` `RuleTester` import when the current API lives at
  `@typescript-eslint/rule-tester`. A new opt-in `mcpServers?: McpServerSpec[]`
  field on the ollama backend def (`{ name, command, args?, env?, cwd? }`) lets
  the agent use tools from any configured MCP server alongside its built-ins.
  - The backend hosts one in-process `@modelcontextprotocol/sdk` `Client` per
    configured server over `StdioClientTransport`, connected concurrently (with
    a bounded timeout) at session start and closed at session end.
  - Each server's tools are merged into the model's tool set **namespaced** as
    `<server>__<tool>`; the MCP `inputSchema` passes through as the OpenAI
    function `parameters` unchanged, and a built-in name wins on collision.
  - Tool calls forward to `client.callTool`, heartbeat-wrapped so a slow MCP
    call never trips the stall detector; an `isError` result is surfaced with an
    `ERROR:` prefix so the model can self-correct.
  - **Graceful degradation:** a server that fails to connect or list is skipped
    with a warning — the session still runs on the built-ins plus every server
    that did start, so one flaky server never breaks a dispatch.
  - `harness-mcp` (and any server without an explicit `cwd`) is spawned with
    `cwd =` the agent's workspace, so harness's own code-intelligence tools
    operate on the code the agent is editing.

  With `mcpServers` unset the backend is byte-identical to before (built-ins
  only). The scaffolded local configs ship a commented `context7` + `harness`
  example; see `docs/guides/multi-backend-routing.md#mcp-tools` and ADR 0073.

- 3b2b8ba: OllamaBackend now drives the model over native `/api/chat` (honors `num_ctx`/`think`/`keep_alive`), autosizes `num_ctx` from the model's declared max and available hardware, sends native `think:false` for reasoning-off (retiring the `/no_think` hack), and adds optional `numCtx`/`maxContextTokens`/`numPredict`/`keepAlive` config.
- f460e42: feat(orchestrator): configurable sampling params (temperature/top_p/top_k) for the Ollama backend

  The Ollama backend previously sent only `num_ctx` in the native `/api/chat` `options`,
  so every local model ran at Ollama's default sampling (~temp 0.8) — too hot for precise
  agentic coding. `OllamaBackendDef` now accepts optional `temperature`, `topP`, and `topK`,
  threaded into the request `options` (unset ⇒ model default, byte-identical to before).

  Motivation: current Qwen guidance for thinking-mode / precise coding is temp 0.6 /
  top_p 0.95 / top_k 20; running a coder at default temperature measurably increases
  error rate. This lets an operator tune each local backend for its role.

- 84bd986: feat(orchestrator): resume-from-failed-stage checkpoint for staged workflows

  Previously, when the enforced local gate blocked a staged unit, the re-dispatch re-ran
  the ENTIRE lifecycle from stage 0 — regenerating the spec + plan (non-deterministically)
  on every execution failure. That both wastes the slow reasoner and, worse, moves the
  target: the execution stage never iterates against a stable spec/plan + accumulated
  feedback, because the whole design resets underneath it each retry. This mirrors the
  cloud autopilot's own retry model, which re-runs the failed task against a plan approved
  once — not the whole lifecycle.

  Adds a `checkpoint?: boolean` stage flag: once a `checkpoint: true` stage passes, its
  output is checkpointed per unit and REUSED on later gate-block re-dispatches instead of
  regenerated. Mark the design stages (brainstorm/plan) `checkpoint: true` so an execution
  gate failure retries only execution onward against a FIXED spec/plan. The checkpoint is
  cleared on every terminal (ship or needs-human), so a fresh pickup regenerates. Default
  false — omit for byte-identical prior behavior.

- f8c9dd9: Staged local units now converge instead of looping. A staged workflow whose last stage routes to a local-endpoint backend (`local`/`pi`/`ollama`) previously marked itself "done" after every stage merely ran, then wiped its worktree at settle — destroying real-but-incomplete work before any retry, and, because the row never shipped a PR to reach `done`, re-dispatching forever.

  The staged settle now reuses the single-dispatch enforced gate:
  - **Real acceptance gate.** `settleWorkflowSuccess` routes a local last-stage unit through the same `runLocalWorkflowGate` (empty-diff → verify/acceptance → outcome-eval) the single-dispatch path uses — one convergence contract, not a diff-only heuristic. The #886 empty-diff halt is subsumed as step 0. A new optional `StagedWorkflowDecl.acceptance` shell command overrides the default `verify` mechanical step (exit 0 ⇒ pass; nothing project-specific is baked in).
  - **Convergent retry.** On gate FAIL the workspace is preserved (no wipe, no `success → in_review`), the failure reason is threaded into the next prompt, and the unit re-dispatches through the same retry seam (lane `blocked`, so `blocked → claimed` re-claims). Work accumulates across preserved retries. Bounded by the new optional `agent.routing.maxLocalStageRetries` (default 5); on exhaustion the unit escalates to the `needs-human` terminal and the tick stops re-selecting it.
  - **Deterministic ship.** On gate PASS the orchestrator commits the accumulated work, pushes an `orchestrator/<identifier>` branch, and opens a PR (`shipWorkspace`), then takes the existing success finalize so `cleanWorkspaceWithGuard` preserves the branch + PR and the PR merge auto-dones the row. The shipped unit is recorded in `completed` — the same guard the single-dispatch normal exit uses — so it is not re-dispatched (double-shipped) while its `in_review` row is still in-progress.

  Non-local/primary staged units and the single-dispatch path are byte-identical (`success → in_review` human-review semantics unchanged; the gate is a no-op off the local path). The #886 empty-diff halt still fires. Adds `StagedWorkflowDecl.acceptance` and `RoutingConfig.maxLocalStageRetries` to `@harness-engineering/types` (both wired into the orchestrator Zod config schema). See ADR 0079/0080.

## 0.23.0

### Minor Changes

- ef62251: Local backend runs the full harness workflow (gated). A `local`/`pi` dispatch now renders a backend-specific dispatch template (`harness.orchestrator.local.md`). Rather than paraphrasing the workflow inline, that template is a thin indirection shim that delivers the REAL skills over bash: the pi agent runs `harness skill run <name> --autonomous` (which prints the verbatim `SKILL.md`, no MCP required) and follows a `/harness:X` → `harness skill run harness-X` redirect. The new `--autonomous` flag on `harness skill run` prepends an autonomous-decider preamble so a headless agent runs each skill (including brainstorming) at full rigor but decides every fork itself and records it in the spec — with a PR-flag safety valve for low-confidence and strategy-contradiction forks, and no mid-run human pause; absent the flag, skill-run output is byte-identical to before. The orchestrator ENFORCES the verify + outcome-eval gates itself (`runLocalWorkflowGate` in `finalizeNormalCompletion`): a red verify or a high-confidence `NOT_SATISFIED` verdict routes through the existing `emitWorkerExit('error')` retry branch (re-prompt on retry, `needs-human` on budget exhaustion) so poor local output halts rather than ships. Template selection (`resolvePromptTemplate`) falls back to the default Claude template when the local file is absent, and the Claude/AMR completion path is unchanged (the gate is a no-op for non-local backends). A config flag `agent.routing.workflowGates: local | primary` routes the local outcome-eval gate to a stronger provider (default local SEL; the AMR caller is unaffected). See ADRs 0070/0071/0072.

## 0.22.0

### Minor Changes

- eb74585: feat(triage): roadmap auto-triage — four-gate closed-loop autonomous dispatch (default-off)

  Adds an opt-in system that scores roadmap items, autonomously dispatches the ones it
  can confidently and cheaply scope, and routes everything needing human judgment to a
  human. Entirely default-off (`roadmap.autoTriage.enabled`, byte-identical when off).

  Four gates, ascending in evidence:
  - **Scoping probe** (`intelligence/triage`): four corroborating levers (graph-grounded
    scope / semantic read / open-decisions / precedent). Fail-closed — any `unknown`
    lever holds to a human.
  - **Autonomous brainstorm**: compact fork-loop on the local SEL model; halts unless
    per-fork `confidence==='high'`, hardened with N-sample self-consistency (unstable
    recommendation → forced low). Produces a spec or a halt handoff; executes nothing.
  - **Dispatch + ratchet stage 1**: marks items for the existing orchestrator pickup
    (no new dispatch path); nothing executes without an explicit human go.
  - **Post-diff retrospective**: extends the AMR 4c quality feeder — grades the actual
    diff against the pre-dispatch prediction, blocks+escalates mispredicts, records the
    outcome. Closes the loop; the precedent lever and evidence-gated ratchet (capped at
    v1 stage 2 — no auto-merge) self-calibrate from recorded outcomes.

  New CLI: `harness roadmap triage` (read-only report), `--brainstorm`, and
  `triage approve`. New config section `roadmap.autoTriage`.

## 0.21.0

### Minor Changes

- 681e173: feat(adaptive-model-routing): provider-neutral capability-tier routing (AMR Phases 1–4)

  Adds Adaptive Model Routing — provider-neutral, capability-tier-based backend
  selection driven by task complexity — behind a **default-off** gate. It is fully
  **opt-in**: with no `routing.policy` in `harness.config.json`, `AdaptiveRouter`
  is never constructed, the complexity classifier never runs, and routing is
  byte-identical to the shipped `BackendRouter` (no new spans, LLM calls, or latency).
  - **types**: additive `BackendCapabilities`, `ComplexityVerdict`, `RoutingRequest`,
    `RoutingPolicy`, `RoutingError` (codes `privacy-no-match` / `escalation-exhausted`);
    optional `capabilities?` on `BackendDef`; optional `complexity` / `tierRequired` /
    `estCostUsd` on `RoutingDecision`. `RoutingValue` is **not** widened — tier resolution
    lives entirely in the AMR layer (backward-compatible). `RoutingError` is now the single
    error family for AMR routing failures: the orchestrator's `PrivacyNoMatch` extends it
    (carrying `code: 'privacy-no-match'`), so it is catchable/narrowable as either — a
    backward-compatible refinement (`PrivacyNoMatch` is still an `Error` with the same
    `name`/`code`).
  - **intelligence**: a complexity cascade (static pass → `fast` LLM tie-break →
    confidence-gated `standard` escalation) emitting a `ComplexityVerdict`, plus pure
    `deriveRequiredTier` resolution (matrix → D5 blast-radius `strong` veto →
    low-confidence up-bump → D8 budget clamp → D10 escalation floor). The LLM never
    influences the final tier.
  - **orchestrator**: `AdaptiveRouter` wraps `BackendRouter` (which is unchanged), a
    capability registry + cheapest-qualifying selection that fails **closed** on
    privacy/allowlist exclusion, enriched `routing:decision` telemetry, and a vertical
    `EscalationState` (D10/SC16) that climbs a coherence unit's floor tier on repeated
    quality failures (monotonic, `strong`-capped). Live dispatch routes through
    `AdaptiveRouter` only when a `routing.policy` is present. Both routing hard-fails now
    **surface to a human** via the `needs-human` interaction queue (not just a log): a
    fail-closed `PrivacyNoMatch` at the dispatch boundary emits a distinct
    `routing:no-tier-match` steward escalation (never recorded as a transport failure, never
    fed to escalation) and, because it is deterministic (config-driven privacy floor /
    allowlist that cannot succeed on re-dispatch), is **terminal** — the unit moves to the
    `canceled` lane with no retry enqueued rather than looping through escalate-then-retry.
    An exhausted `strong`-ceiling re-crossing emits `routing:escalation-exhausted`
    (D10 hard-fail-to-human).
  - **cli**: `harness routing trace --complexity <level> --risk <band>` dry-runs a
    routing decision (prints derived tier + chosen backend without dispatching), with
    client-side enum validation.

  Split-routing (D6/SC4) and the live quality-gate fan-in into escalation (Phase 4c)
  are deferred — see `docs/changes/adaptive-model-routing/proposal.md` "Deferred
  follow-ups". No behavior changes for existing single-backend or multi-backend
  configs.

- f004f04: feat(orchestrator): opt-in LLM spec-satisfaction verdict for single-agent escalation (4c v2)

  Adds the second sound quality-verdict source named in ADR 0069 — an LLM
  spec-satisfaction (outcome-eval) judgment — behind a new **default-off** flag
  `routing.policy.acceptanceEval.enabled`. It complements the always-on
  baseline-relative security-defect feeder shipped earlier.
  - On a normal single-agent exit, **after** the cheap security scan comes back clean
    (so a defect never wastes a model call), the orchestrator runs the shared
    `OutcomeEvaluator` over the introduced diff vs the spec's success-criteria
    section and feeds `quality-fail` **only** on a high-confidence NOT_SATISFIED
    verdict (`authority === 'blocking'`, derived in TypeScript — an LLM-forged
    `authority` is stripped at the evaluator's strict-parse boundary).
  - **Conservative + guarded:** SATISFIED / INCONCLUSIVE / lower-confidence /
    no-spec / no-provider / empty-diff / any error → neutral (never a premature
    `quality-pass`). Fully no-op when AMR is off or the flag is unset.
  - **No new model plumbing:** reuses the SEL-layer `AnalysisProvider` the live
    complexity classifier already builds inline (ADR 0069's "orchestrator can't run a
    model inline" no longer holds). New surface is minimal: a `WorkspaceManager.getIntroducedDiffText`
    raw-diff accessor (merge-base relative, seeded overlay excluded via git pathspec),
    a pure `outcomeVerdictToQualityFail` mapper, and the `acceptanceEval` policy field.

  Still deferred: escalation on general logic quality beyond security defects +
  spec-satisfaction. `RoutingPolicy` gains `acceptanceEval?: { enabled; model? }`
  (also accepted on `PUT /api/v1/routing/policy`).

- ec649e6: feat(adaptive-model-routing): D8 hard budget cap — force `fast` / surface to a steward at the cap

  Turns the AMR budget from a purely soft, single-step degrade into a cap that
  actually bites at 100% of `capUsd`, while staying **opt-in / default-off** (no
  `routing.policy.budget` ⇒ dispatch is byte-identical).
  - **Hard floor (`degrade`/`pause`):** at/above `capUsd`, the tier is forced all the
    way to `fast` (not just one step). Sound because it only ever routes _cheaper_
    than the existing soft clamp, and it sits **below** the D5 blast-radius veto, so a
    security-forced `strong` task still stays `strong`. `pause` behaves as `degrade`
    here — true blocking admission remains deferred.
  - **`human` mode:** at/above the cap, `AdaptiveRouter.route()` throws a fail-closed
    `RoutingError('budget-exhausted')` **before** selecting a backend (an un-routed
    dispatch spends nothing). The dispatch boundary surfaces the unit once to a
    steward as `routing:budget-exhausted` and drives it terminal — no auto-retry into
    the same cap (mirrors the `privacy-no-match` terminal path). Raise `capUsd` via
    `PUT /api/v1/routing/policy` and re-queue to resume.
  - **Observability:** `RoutingBudgetStatus` gains an `exhausted` flag; `harness
routing status` shows an `EXHAUSTED` state once spend crosses the cap.

  Behavior change to note in release notes: existing `budget` policies that were
  only ever degrading one step will now force `fast` (or surface to a steward, for
  `human`) once spend reaches the cap. It remains a lagging cap under concurrency —
  not an admission gate.

- abbaa89: AMR operator observability. Adds a live routing status surface so operators
  running adaptive routing can see spend, degradation, and escalation — previously
  only routing _decisions_ were inspectable.
  - **`GET /api/v1/routing/status`** (`read-telemetry`) — the live operator view:
    whether AMR is active, budget **spend-vs-cap** (using the monotonic accumulator
    that actually drives the D8 clamp, not the telemetry ring sum), the coherence
    units that have climbed their escalation floor, and the active provider
    allowlist. Always 200; an inactive payload when AMR is off.
  - **`harness routing status`** — renders that payload (budget bar, `DEGRADING`
    flag, escalated-unit table, allowlist).
  - **`harness routing telemetry`** — renders the existing `/routing/telemetry`
    projection with a per-tier distribution and per-decision cost breakdown.

  New: `AdaptiveRouter.getStatus()`, `Orchestrator.getRoutingStatus()`,
  `EscalationState.climbedUnits()`, and the `RoutingStatus` / `RoutingBudgetStatus`
  / `RoutingEscalationUnit` types. Read-only; no dispatch behavior change.

- ea36b3c: AMR Phase 5 — orchestrator routing endpoints (closes the Shuttle mutual-deferral seam).

  Adds the harness side of the routing control-plane contract so the Shuttle SaaS
  control plane can push per-container policy and drain telemetry against a real
  orchestrator (was mock-only):
  - **`PUT /api/v1/routing/policy`** (`admin` scope) — Zod-validates a `RoutingPolicy`
    and hot-swaps the live `AdaptiveRouter` via `Orchestrator.ingestRoutingPolicy`,
    preserving accumulated `EscalationState` climbed floors across the update. An
    empty `{}` policy restores default-off. Returns 204.
  - **`GET /api/v1/routing/telemetry`** (`read-telemetry` scope) — projects the
    enriched routing-decision ring into the Shuttle wire shape
    (`{ decisions, spentUsd }`, `RoutingTelemetry`/`RoutingTelemetryDecision`),
    fixing the cross-repo `RoutingDecision` mismatch that would have drained zero rows.
  - **`RoutingPolicy.allowedProviders`** — new optional provider-type allowlist; wires
    the previously-dormant `selectCheapestQualifying` allowlist branch (fail-closed).

  Default-off is preserved: with no policy pushed, `adaptiveRouter` stays `null` and
  dispatch is byte-identical. All additive — existing routing/dispatch behavior is
  unchanged.

- 787e033: Complete split-routing (4b): real per-stage prompt rendering + prior-output
  threading. The workflow stage-execution engine previously passed each stage the
  bare **skill name** as its prompt and threaded nothing between stages (`priorOutputs`
  returned `{}`). Now:
  - Each stage gets a **rendered prompt** (the work item + the stage's skill/role +
    the outputs of prior stages) via a pure `PromptRenderer` bound in
    `buildWorkflowContext` (no layer-cycle). The engine falls back to the skill name
    only when no renderer is present (fake/legacy contexts), so behavior is
    byte-identical there.
  - Each stage's **final assistant message** is captured (from the runner's last
    `result` event, the same extraction the single-agent path uses) into a new
    `StageRun.output`, and threaded to later stages keyed by the stage's `produces`
    label (D4 **text**-artifact threading).

  File-artifact threading (`produces`/`expects` as workspace paths) remains a
  separate, deferred contract — the text channel covers the common case.

- 0c8e2ac: feat(split-routing): workflow stage-execution engine with per-stage AMR routing (AMR Phase 4b)

  Adds split-routing — a declarative multi-stage workflow engine that runs a
  coherence unit's stages sequentially on one worktree, routing each stage
  independently through Adaptive Model Routing — behind a **doubly-opt-in,
  default-off** gate. With no `>= 2`-stage workflow declared in `agent.workflows`
  _and_ no `routing.policy` set, `dispatchIssue` is **byte-identical** to the shipped
  single-agent path (SC4): `workflowFor` is a pure, side-effect-free matcher, so
  calling it on every dispatch cannot change non-workflow behavior.
  - **types**: additive `WorkflowStep` / `WorkflowExecutionPlan` / `StageRun`
    (per-stage `sessionId` + `tokens` for per-stage cost capture) and
    `StagedWorkflowDecl` / `WorkflowConfig.workflows` (the declarative producer with
    optional `match` grain and per-stage `stageDeadlineMs`). No existing type is
    widened.
  - **orchestrator**: the `executeWorkflow` engine (`execute-workflow.ts`) driving
    `AgentRunner.runSession` per stage with engine-owned per-stage
    session/recorder/abort/tokens; per-stage `route()` sharing one `coherenceUnit`
    with a **cumulative** `EscalationState` floor; separated failure mechanisms
    (retry cap-1 at a bumped tier, mid-workflow transport error = terminal without
    wiping completed-stage artifacts, per-stage deadline); an atomic single-exit
    lifecycle guaranteeing exactly one claim / lane entry / terminal transition per
    unit for every exit path (all-pass, stage terminal-fail, engine throw) with no
    orphaned `running`/`claimed` (SC5). Live dispatch enters the engine only when a
    `>= 2`-stage workflow matches and a `routing.policy` is present; `workflowFor` is
    the single match authority (returns the plan plus the matched decl's
    `stageDeadlineMs`). `AdaptiveRouter` / `BackendRouter` remain byte-unchanged (SC8).

  Per-stage prompt rendering and D4 `produces → expects` artifact-context threading
  are **stubbed** in this phase — `runStageSession` passes the bare `step.skill` as
  the prompt and `priorOutputs` returns `{}`, so stages currently operate off the
  shared worktree file-state with a skill-name prompt. Real per-stage `PromptRenderer`
  invocation + structured output threading, plus parallel stages, stage-local
  retry-in-place, partial-resume, and rich auto-producers are follow-ups — see
  `docs/changes/split-routing/proposal.md` "Deferred follow-ups". No behavior changes
  for existing single-agent or single-stage configs.

## 0.20.0

### Minor Changes

- db24d89: fix(lmlm): async model install with WebSocket download progress

  Operator model install (`POST /api/v1/local-models/pool/install`) now returns
  `202 { disposition: 'installing' }` as soon as the pull is accepted and streams
  byte-level download progress plus the terminal outcome over a new
  `local-models:install` WebSocket topic, instead of blocking the HTTP response for
  the entire `ollama pull`.

  This fixes the `502 Orchestrator proxy error: fetch failed (cause: Headers Timeout
Error)` that a multi-GB pull triggered — the dashboard reverse-proxy's undici
  `headersTimeout` (~5 min) fired because no response headers were sent until the
  pull completed. The Recommendations panel now renders a live download progress bar
  and surfaces retryable install errors.

  Approving an `add`/`swap` model **proposal** (`POST /api/v1/proposals/:id/approve`)
  also installs the target, so it shares the same async treatment: it returns `202`
  and streams the download over `local-models:install`, and the Pending Proposals row
  shows the same progress bar instead of hanging the Approve button until the proxy
  times out. (`evict` approvals and rejects stay synchronous.)

  The Recommendations panel also gains a **Refresh** button that triggers a
  force-refresh tick (`POST /api/v1/local-models/refresh`) to recompute
  recommendations on demand and refetch the panel.

  Fixes a refresh-tick ordering bug where the pool was diffed against the ranking
  **before** the re-ranked scores were written back. A freshly-installed member
  enters the pool at `currentScore: 0` until its first re-rank, so diffing first
  produced phantom swap proposals justified as "replace a pool member scoring 0"
  (and inflated `scoreDelta`s). The tick now re-scores the pool before diffing.

- eb8435f: fix(lmlm): resilient model installs — resumable pulls, restart recovery, and lineage scoring

  Three follow-ups to the async operator install (#775):
  - **Resumable pulls.** `OllamaInstallAdapter` gains opt-in retry-with-resume
    (`maxPullRetries` / `pullRetryBackoffMs` / `pullRetryMaxBackoffMs`; the
    orchestrator enables 5). A multi-GB `ollama pull` that loses its `/api/pull`
    stream mid-download — most often the host sleeping mid-install — re-issues the
    pull (ollama resumes from cached blobs) instead of dead-ending in an error. The
    budget counts consecutive non-progressing attempts, so any forward byte progress
    resets it; a canceled request or a missing model still fails fast.
  - **Restart recovery.** A model add/swap approval marks its proposal `installing`
    (new `ModelProposalStatus`) for the duration of the pull. If the orchestrator
    restarts mid-download, startup finds the `installing` proposals and re-drives them
    — `onApproveModelProposal` is idempotent, so ollama resumes the pull (or no-ops if
    it already finished) and progress streams to a reconnecting dashboard. The status
    reverts to `open` on a retryable failure, and the approve route rejects a
    re-approve while `installing`.
  - **Lineage score interpolation.** A candidate with no direct benchmark used to
    floor to `score: 0` while labelled `evidence: 'interpolated'` (a misnomer), so real
    models like `Qwen/Qwen3-8B-GGUF` showed "score 0 · interpolated" and churned the
    pool once installed. The ranker now infers a score from same-series siblings by
    parameter count (linear in size, clamped to the measured range, dampened by `'low'`
    benchmark confidence so it never outranks a direct measurement); only a series with
    no measured sibling still scores 0.

- be3c714: feat(lmlm): consume pooled models freshly — event-driven refresh, live analysis model, score-seed, runtime feedback, task-aware selection, warming

  The pool install side was fast, but consumption was pull-based and static: a
  newly installed model wasn't used by agents for up to a poll cycle and by the
  analysis pipeline never (until restart), a fresh entry sat at `currentScore: 0`,
  runtime outcomes didn't feed back, and selection ignored the ranker's per-task
  profiles. This wires the pool through to inference.
  - **Freshness loop** — `LocalModelResolver.refresh()` debounce-re-probes on a
    `local-models:pool` mutation, so an install/swap is resolvable in seconds. The
    analysis provider reads its model live per request (`getModel` seam) instead of
    snapshotting once at construction, unless the operator pinned a layer model.
  - **Score-seed** — an installed pool entry seeds `currentScore` from its ranked
    score rather than `0`, so an explicitly-installed model isn't buried until the
    next re-rank.
  - **Runtime feedback** — `lastUsedAt` is stamped on real inference; a model that
    fails N consecutive inferences is deprioritized until it recovers.
  - **Task-aware selection** — per-profile pool scoring (general/coding/reasoning)
    routes each use-case to its best-fit pooled model, degrading to composite score
    when the benchmark snapshot lacks profile tags.
  - **Warming** — the resolver best-effort warms a newly selected model
    (`keep_alive`) so the next dispatch isn't a cold start.

  See `docs/changes/lmlm-pool-consumption/proposal.md` and the task-aware selection
  ADR under `docs/knowledge/decisions/`.

## 0.19.0

### Minor Changes

- bae23ad: feat(lmlm): install & remove models directly from the dashboard panel

  Adds operator-initiated pool mutation to the LMLM dashboard — an **Install**
  action on Recommendations rows and a **Remove** action on Pool-card members — so
  the operator no longer has to hand-edit config or use the CLI.
  - **Backend:** two convenience routes, `POST /api/v1/local-models/pool/install`
    and `POST /api/v1/local-models/pool/remove`, gated by the same
    `manage-proposals` scope as approve/reject. Both are modeled as user-initiated
    **auto-approved model proposals**, reusing the existing `onApproveModelProposal`
    core — so the pool guards (`not_allowed`/`budget_exceeded` → `409`), the
    in-use evict-deferral (`202 deferred`), and the audit trail all apply, and
    proposals remain the single pool-mutation channel (ADR 0011).
  - **Dashboard:** an Install button per recommendation (an already-pooled model
    shows "installed"), a Remove button per pool member (with a "removes after the
    current run" note when the model is in use). Byte-level pull progress over WS
    is a deferred enhancement; install shows an indeterminate "Installing…" state.
  - **Types:** `PoolInstallRequest`, `PoolRemoveRequest`, `PoolMutationDisposition`,
    `PoolMutationResult`.

## 0.18.0

### Minor Changes

- 965cfd3: Local Model Lifecycle Manager (LMLM) backend: hardware-aware ranking + pool
  manager + Ollama installer in the new `@harness-engineering/local-models`
  package; generalized discriminated `ProposalSchema` (`kind: 'skill' | 'model'`,
  backward-compatible on read) in types + the shared proposal store in core;
  background refresh scheduler with silent drift reconciliation, the
  `/api/v1/local-models/*` read routes, kind-aware approve/reject, and
  `local-models:{pool,proposal}` WS topics in the orchestrator; and the
  `harness models {status,suggest,pool,proposals,approve,reject,install,evict,refresh}`
  CLI. Opt-in via `localModels.enabled`; default-off behavior is unchanged.

## 0.17.0

### Minor Changes

- 3d772e9: Standardize parallel execution as an automatic part of the build loop. Adds a `PlanTask.dependsOn` schema (`@harness-engineering/types`), a `planParallelization` planner in `@harness-engineering/core` that composes the existing `findParallelGroups` wave-grouper and `predict_conflicts` into a `ParallelizationPlan` (dependency-DAG waves with risk-tiered firing — `auto-dispatch`/`confirm`/`serialize` — a cross-bucket ordering cap, and deterministic narration), and a `plan_parallelization` MCP tool (`@harness-engineering/cli`). The autopilot/execution/planning/parallel-agents skills now consume it to dispatch sound parallel waves without being asked, announce-and-proceed for clean waves and pausing only for genuinely uncertain ones. See ADRs 0056 (risk-tiered non-blocking dispatch) and 0057 (dependsOn plan-task schema).

## 0.16.2

### Patch Changes

- 4df8934: Add an on-demand maintenance pipeline: `harness maintenance run [taskId...]` and the `/harness:maintenance-pipeline` skill.

  The command runs the maintenance that is actually **overdue** (computed from each task's cron schedule + `history.json`) in a **report-first**, infra-free sweep — no orchestrator, gateway, or `ClaimManager` required. `--all`/`--only`/`--skip` scope selection, `--json` emits a consolidated `ConsolidatedReport` (also written to `.harness/maintenance/last-run-summary.json`), and exit codes are CI-friendly (`0` completed, `1` a task failed to execute, `2` invalid invocation).

  Built on a single shared executor: a `mode: 'report' | 'fix'` parameter on `TaskRunner` (default `fix` leaves cron unchanged), a `selectTasks` overdue/eligibility selector with an `excludeFromHumanSweep` flag on task definitions, and a shared `runHarnessCheck` core used by both the CLI and the cron scheduler. `--fix` dispatches the real maintenance agent dispatcher when an `agent.backends` backend is configured, and skips honestly otherwise.

  This work also corrected pre-existing bugs that affected the cron scheduler too: maintenance check commands now resolve through the harness binary (previously ENOENT), check-execution failures are reported as `failure` instead of being masked as `success`, and two misconfigured built-in checks (`cross-check`, `stale-constraints`) gained real read-only CLI subcommands. ADRs 0049 (one executor, two callers) and 0050 (report-first on-demand) document the design.

- 863df8f: Phase 4 of the roadmap shard store: route every roadmap writer and content
  reader through `RoadmapStore`.

  In sharded mode (`docs/roadmap.d/` present) each logical mutation now rewrites
  exactly one shard file (conflict-free by construction) and regenerates the
  aggregate; in monolith mode the on-disk `docs/roadmap.md` is byte-for-byte
  unchanged. Every writer captures `before = structuredClone(roadmap)` and
  persists via `applyRoadmapDiff(store, before, after)`, so only the rows that
  actually changed are written.

  Migrated onto the store:
  - `manage_roadmap` (add / update / remove / promote / sync / groom) and the
    show/query readers, preserving the unblock-only cascade, async external sync,
    and first-claim-wins refusal.
  - `autoSyncRoadmap` and `sync-engine` `fullSync` (now takes a project root) with
    per-shard writeback; the assignee-lifecycle invariant holds on every write.
  - Content readers: `prediction-engine`, `publish-analyses`, `sync-analyses`.
  - Dashboard roadmap reader (`gather/roadmap`) and content writers
    (`routes/actions` claim + status).
  - Orchestrator roadmap writers (`/api/roadmap/append` and the
    `RoadmapTrackerAdapter` claim / release / mark-complete), preserving
    compare-and-set, idempotency, and the RMH005 assignee invariant.

  Behavioral note — prediction engine: routing the roadmap read through the store
  also corrected the path it reads from (`<root>/roadmap.md` →
  `<root>/docs/roadmap.md`). Previously `computeSpecImpacts` always failed to load
  and returned no impacts, so spec-impact adjustments were effectively dead; the
  engine now folds spec impacts into the adjusted forecasts (and warning
  severities) as originally designed.

  New core APIs: `RoadmapStore.removeFeature`, `resolveRoadmapStore` /
  `resolveRoadmapStoreForFile` (mode-detection factories), `applyRoadmapDiff`,
  `roadmapAggregatePath`, and a node-fs roadmap IO adapter.

  The read-source guard (invariant R) is tightened to also catch DYNAMIC-path
  readers/writers — code that threads a `roadmapPath`/`roadmapFile` variable into a
  raw filesystem read/write rather than spelling the `roadmap.md` literal — and its
  allowlist has shrunk to its permanent floor (store + regenerator + factory, the
  git/merge tooling, and non-content path references).

## 0.16.1

### Patch Changes

- 8e8e7c1: fix(orchestrator): seed brainstorm handoff artifacts into fresh worktrees

  New worktrees are checked out from a committed remote ref (e.g. `origin/main`),
  so they did not inherit the uncommitted artifacts of the brainstorm →
  orchestrator handoff — the proposal under `.harness/proposals/` and the promoted
  row in `docs/roadmap.md`. A dispatched agent saw the roadmap entry (the tracker
  reads the live working tree) but could not find its proposal and stalled.

  `WorkspaceManager.ensureWorkspace` now seeds those paths from the root working
  tree into each fresh worktree (best-effort: missing sources skipped, copy
  failures swallowed). Seed paths default to `['.harness/proposals',
'docs/roadmap.md']`, are overridable via the new `WorkspaceConfig.seedPaths`,
  and the orchestrator derives the roadmap entry from the configured tracker
  `filePath` so a non-default roadmap location is still carried over.

## 0.16.0

### Minor Changes

- 5f9ed8c: Scaffolds the Local Model Lifecycle Manager (LMLM) — Phase 0.
  - New package `@harness-engineering/local-models` (empty barrel, no business logic yet).
  - New types in `@harness-engineering/types`: `LocalModelsConfig`, `LocalModelsPoolConfig`, `LocalModelsRefreshConfig`, `LocalModelsInstallerConfig`, `LocalModelsHardwareOverride`, plus platform/installer unions.
  - New optional `localModels` block on `HarnessConfigSchema` in the CLI, with Zod defaults that match the spec (24h refresh, 100GB budget, Ollama installer, opt-in disabled by default).

  Disabled by default; `harness validate` on existing configs remains green. Hardware detection, ranking, pool management, installer, proposal lifecycle, scheduler, HTTP/WS surfaces, CLI commands, and dashboard panel land in subsequent phases per `docs/changes/local-model-lifecycle-manager/proposal.md`.

- 318b878: Add `STRATEGY.md` schema and validator (strategic-anchor phase 1 of 8 in the compound-engineering-adoption initiative).
  - `packages/types` exports `StrategyFrontmatter`, `StrategyDoc`, `StrategySection`, `REQUIRED_STRATEGY_SECTIONS`, `OPTIONAL_STRATEGY_SECTIONS`.
  - `packages/core/strategy` exports `StrategyDocSchema`, `StrategyFrontmatterSchema`, `parseStrategyDoc`, `asStrategyDoc`.
  - `packages/core/validation` exports `validateStrategy(cwd)` consumed by `harness validate`.
  - CLI `harness validate` now reports a `strategyConfig` check: soft-passes when STRATEGY.md is absent; fails with a precise per-section message when present and malformed (missing required section, unfilled template placeholder, malformed frontmatter).

  Scope: schema + validator only. The `harness-strategy` skill, the `harness-ideate` skill, init wiring, brainstorming/roadmap-pilot grounding, knowledge-graph integration, and ADRs ship in follow-up PRs (one per phase, matching the feedback-loops cadence).

## 0.15.0

### Minor Changes

- dcca2ce: Spec B (Granular Task→Backend Routing): per-skill + per-cognitive-mode routing axes with fallback chains, BackendRouter chain-walk emitting RoutingDecision records, config validator (hard error + warn semantics), dispatch-site wiring with `HARNESS_BACKEND_OVERRIDE` env hint, RoutingDecisionBus with bounded ring buffer, 3 HTTP routes + WS topic `routing:decision`, `harness routing {config,trace,decisions}` CLI + `harness skill run --backend`, dashboard `/routing` panel (4 cards + WS + polling fallback), 5 ADRs (0029-0033). RoutingValue schema widening is additive/non-breaking (scalar form preserves byte-identical pre-Spec-B behavior).

## 0.14.0

### Minor Changes

- 4aa241f: Hermes Phase 2: Custom maintenance jobs + pre-launch OSV malware guard + disk hygiene

  Extends `MaintenanceScheduler` beyond the 21 built-in tasks with user-defined
  `customTasks` in `harness.orchestrator.md`. Adds a pre-launch OSV malware
  guard via `harness mcp-guard check`, and broadens `harness cleanup-sessions`
  into a per-target `.harness/` disk-hygiene sweep.

  **New surfaces:**
  - `CustomTaskDefinition` + `CheckScriptDefinition` + `OutputRetentionConfig` +
    `CleanupConfig` + `OsvGuardConfig` types (`@harness-engineering/types`).
  - `RunResult.origin: RunOrigin` discriminated provenance tag set by the
    scheduler / CLI / API / chain entry point.
  - `TaskOutputStore` persists per-run outputs to
    `.harness/maintenance/<task-id>/outputs/<iso>.json` with last-N + maxAgeDays
    retention. Default 50 runs / 30 days, overridable per-task.
  - `CheckScriptRunner` spawns arbitrary executables and parses a JSON status
    envelope (`{status, findings?, wakeAgent?, message?, outputs?}`) from the
    last non-empty stdout line.
  - `ContextResolver` injects `## Upstream context` (from `contextFrom`) and
    `## Reference skills` (from `inlineSkills`) into the agent prompt, with a
    warn-then-truncate token budget.
  - `validateCustomTasks` runs at orchestrator boot: cycle detection across the
    merged `contextFrom` graph, per-type required-field checks, skill / script
    existence (when injected), kebab-case task IDs, no-collision with built-ins.
  - `createOsvClient` (`@harness-engineering/core`) — OSV.dev REST client with
    24h disk cache (`.harness/cache/osv/`), fail-open default, `strict` mode.
  - `harness mcp-guard check [--strict] [--json]` CLI subcommand. Exits 2 on any
    `MAL-*` advisory match against an `.mcp.json` `mcpServers` `npx`-launched
    package. Suitable as a `pre-mcp-launch` hook from host plugin manifests.
  - `harness mcp-guard cache clear` subcommand.
  - `harness cleanup-sessions --all` / `--include` / `--exclude` extension.
    Default no-flag behavior unchanged. Registered targets: `sessions` (24h),
    `cache` (7d), `maintenance` (30d), `dashboard-state` (14d), `snapshots`
    (14d), `analyzer-output` (7d).
  - `harness maintenance list` / `harness maintenance show <task-id>` CLI
    subcommands.

  **Backwards compatibility:** All 21 built-in tasks run through the legacy
  `CheckCommandRunner` + `CommandExecutor` paths unchanged. New fields on
  `TaskDefinition` / `RunResult` / `MaintenanceConfig` are optional. The
  `harness maintenance run <task-id>` CLI subcommand and `/api/v1/jobs/maintenance/{id}/*`
  routes are deferred to a follow-up that lands alongside the Phase 0 Gateway API.

  **Knowledge artifacts:**
  - ADR 0015 — Custom maintenance task model.
  - `docs/knowledge/orchestrator/custom-maintenance-jobs.md`.
  - `docs/knowledge/cli/pre-launch-osv-guard.md`.

- c3653ff: Hermes Phase 4: Skill proposal / refinement loop with provenance + soundness gate

  Agent-emitted skill proposals routed through a review queue gated by a
  mechanical soundness check before promotion to the catalog. Closes the
  K1 killer-adoption row from the Hermes adoption meta-spec.

  **New surfaces:**
  - MCP tool `emit_skill_proposal` (tier `standard`) — writes
    `.harness/proposals/<id>.json` and emits `proposal.created`. Emit is
    non-blocking; the soundness gate fires on approve, not on emit.
  - CLI `harness proposals list|show|approve|reject` for queue management
    plus one-shot `harness backfill-skill-provenance` migration that
    stamps `provenance: user-authored` on every pre-Phase-4 catalog skill.
  - Dashboard `/s/proposals` page with inline content, gate findings,
    approve / reject / edit / run-gate actions; reviewer-UX budget < 30s
    per proposal.
  - Seven gateway routes under `/api/v1/proposals/*` (list / get /
    run-gate / approve / reject / edit) — reads use `read-status`,
    mutations require the new `manage-proposals` scope (8th entry in
    `SCOPE_VOCABULARY` and `TokenScopeSchema`).
  - Three lifecycle events (`proposal.created` / `approved` / `rejected`)
    fan out via the Phase 0 webhook bus and Phase 3 notification sinks
    with envelope derivers.
  - Maintenance task `proposal-provenance-backfill` (housekeeping #4,
    Feb 31 cron so the loop never fires automatically).

  **Strict invariants:** `kind` ↔ content shape (new-skill ⇒
  skillYaml+skillMd; refinement ⇒ targetSkill+diff); gate freshness
  < 24h before promotion; refinement edits must diverge from git HEAD
  before approval stamps provenance; provenance enum is closed
  (`community | agent-proposed | user-authored`, expansion requires ADR
  amendment).

  **Skills-mode soundness review degradation:** v1 ships mechanical
  structural checks (kebab-case name, parseable skill.yaml, SKILL.md
  bounds, unified-diff well-formedness). The full
  `harness:soundness-review --mode skill` vocabulary is a follow-up spec;
  both implementations share the same finding shape so the swap is
  purely additive.

  **Test coverage:** 75 new tests across five packages (types schema 15,
  core store + usage 9, MCP tool 8, CLI subcommand 6 + backfill 6,
  orchestrator gate 6 + promote 7 + events 4 + routes 10, envelope
  derivers 4 new rows). Existing scopes test passes with the new
  vocabulary entry.

  ADRs: 0016 (workflow), 0017 (token scope). Knowledge nodes:
  `skill-proposals.md`, `skill-provenance.md`. Spec + plan at
  `docs/changes/hermes-phase-4-skill-proposals/`.

  **Incidental fix:** Replaces a fixed 150ms wait in
  `packages/orchestrator/src/server/webhooks-integration.test.ts` with a
  poll loop. The fixed wait flaked under coverage instrumentation and
  blocked the Phase 4 pre-push hook.

## 0.13.0

### Minor Changes

- 3d6e340: Hermes Phase 1: Session Search + Insights

  Adds a SQLite FTS5 full-text index over `.harness/sessions/` and
  `.harness/archive/sessions/`, plus an LLM-generated retrospective summary
  written to `<archive>/llm-summary.md` when a session is archived, plus a
  composite `harness insights` aggregator covering health / entropy / decay /
  attention / impact.

  **New CLI:**
  - `harness search "<query>"` — FTS5 + BM25 over indexed session memory.
  - `harness insights` — composite project report.

  **New MCP tools:**
  - `search_sessions` (tier: core)
  - `summarize_session` (tier: standard — LLM-spend implication)
  - `insights_summary` (tier: core)

  **New config (optional, all defaults are sensible):**

  ```jsonc
  {
    "sessions": {
      "search": { "indexedFileKinds": [...], "maxIndexBytesPerFile": 262144 },
      "summary": { "enabled": true, "inputBudgetTokens": 16000, "timeoutMs": 60000 }
    }
  }
  ```

  **Backwards compatible:** existing `harness.config.json` files validate
  unchanged; `archiveSession()`'s second argument is optional.

  Dashboard Search + Insights pages are deferred to follow-up roadmap item
  `hermes-phase-1.1-dashboard-ui`. See
  `docs/changes/hermes-phase-1-session-search/proposal.md` and the
  companion ADR
  `docs/knowledge/decisions/0013-hermes-phase-1-session-memory-architecture.md`.

- 2481e59: Hermes Phase 3: Multi-sink notifications + doctor hardening

  Generalizes `CINotifier` into a `NotificationSink` interface, ships Slack
  (incoming-webhook) as the first concrete in-tree adapter, adds a
  `wrap_response` envelope formatter for platform-shape delivery, and extends
  `harness doctor` with four content-aware checks (hook syntax, baseline
  freshness, session-taint corruption, live pings).

  **New surfaces:**
  - `NotificationSink` interface + `eventTypeMatches` glob matcher
    (`@harness-engineering/core`).
  - `wrapResponse(event)` envelope formatter with per-event-type handlers
    (`@harness-engineering/core`).
  - `SlackSink` and `CIGithubSink` adapters
    (`@harness-engineering/core`).
  - `SinkRegistry` + `wireNotificationSinks` orchestrator wiring
    (`@harness-engineering/orchestrator`).
  - New config block on `WorkflowConfig.notifications` with Zod schemas
    exposed from `@harness-engineering/types`.
  - `harness notifications test` CLI subcommand
    (`@harness-engineering/cli`).
  - `harness doctor` gains hook-syntax, baseline-freshness, session-taint,
    and `--live` ping checks.

  **Backwards compatible:** existing `harness.config.json` files validate
  unchanged; orchestrator boot constructs the registry only when
  `notifications.sinks` is non-empty.

  See `docs/changes/hermes-phase-3-notifications/proposal.md` for the
  full design.

- 2602530: Hermes Phase 5 — Dispatch Hardening.
  - Adds `IsolationTier` (`'none' | 'container' | 'remote-sandbox'`) as the fourth routing axis on `BackendRouter`. Configs may declare `routing.isolation.{none,container,remote-sandbox}` and tasks may issue `{ kind: 'isolation', tier }` queries.
  - Adds two new backend types: `SshBackendDef` (key-based SSH agent dispatch) and `ServerlessBackendDef` with the first `'oci'` adapter (`OciServerlessBackend` — cold-starts OCI images via `docker`/`podman`).
  - Adds per-task cost ceiling: `TaskDefinition.costCeiling = { maxUsd, warnAtPct? }` with abort-on-exceed. `RunResult.costUsd` records cumulative spend. `CostCeilingMonitor` (singleton, telemetry-driven) emits `'abort'` at the turn boundary when cumulative cost exceeds the ceiling; the dispatched task fails with `error === 'cost_ceiling_exceeded'`.
  - ADRs `0013-dispatch-isolation-tier` and `0014-cost-ceiling-policy` document the decisions.
  - Knowledge docs added under `docs/knowledge/orchestrator/` for dispatch-isolation, cost-ceiling, backends-ssh, and backends-serverless.

  No breaking changes. All existing routing use cases (`tier`, `intelligence`, `maintenance`, `chat`) resolve identically; configs without `routing.isolation` fall through to `routing.default`. Tasks without `costCeiling` execute as before.

## 0.12.0

### Minor Changes

- 48e0b5b: Publish exports that landed in source without a corresponding version bump. `@harness-engineering/types@0.11.0` shipped without these symbols even though commits between 0.11.0 and now (`0db97708`, `40246b06`, `d1493fe6`, `9ba567b6`) added them to `src/index.ts`. Downstream packages (notably `@harness-engineering/orchestrator@0.4.3`) compiled their dist against the new exports and pinned `@harness-engineering/types@0.11.0`, so `npm install -g @harness-engineering/cli` resolves both at incompatible versions and the CLI fails at module load with `SyntaxError: The requested module '@harness-engineering/types' does not provide an export named 'AuthAuditEntrySchema'`.

  New exports made available in this release:
  - `AuthTokenSchema`, `AuthTokenPublicSchema`, `AuthAuditEntrySchema`, `TokenScopeSchema` and accompanying types (added in `0db97708`)
  - `WebhookSubscriptionSchema`, `WebhookSubscriptionPublicSchema`, `GatewayEventSchema` (added in `40246b06`)
  - `WebhookDeliverySchema`, `WebhookDeliveryStatusSchema` (added in `d1493fe6`)
  - `TrajectoryMetadataSchema`, `PromptCacheStatsSchema`, `OTLPSpanSchema`, `OTLPKeyValueSchema` (added in `9ba567b6`)

  Because `updateInternalDependencies` is `patch` in `.changeset/config.json`, every package that depends on `@harness-engineering/types` will receive a patch bump and a fresh dist when this release publishes, repairing the broken installs.

## 0.11.0

### Minor Changes

- 8825aee: Local model fallback (Spec 1)

  `agent.localModel` may now be an array of model names; `LocalModelResolver` probes the configured local backend on a fixed interval and resolves the first available model from the list. Status is broadcast via WebSocket (`local-model:status`) and exposed at `GET /api/v1/local-model/status`. The dashboard surfaces an unhealthy-resolver banner on the Orchestrator page via the `useLocalModelStatus` hook.
  - **`@harness-engineering/types`** — `LocalModelStatus` type; `localModel` widened to `string | string[]`.
  - **`@harness-engineering/orchestrator`** — `LocalModelResolver` (probe lifecycle, idempotent loop, request timeout, overlap guard); `getModel` callback threaded through `LocalBackend` and `PiBackend` so backends read the resolved model at session/turn time instead of from raw config; `createAnalysisProvider` local branch routed through the resolver; `GET /api/v1/local-model/status` route and `local-model:status` WebSocket broadcast.
  - **`@harness-engineering/dashboard`** — `useLocalModelStatus` hook (WebSocket primary, HTTP fallback); `LocalModelBanner` rendered on the Orchestrator page when the resolver reports unhealthy.

- 8825aee: Multi-backend routing (Spec 2)

  The orchestrator now accepts a named `agent.backends` map and a per-use-case `agent.routing` map, replacing the single `agent.backend` / `agent.localBackend` pair. Routable use cases: `default`, four scope tiers (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`), and two intelligence layers (`intelligence.sel`, `intelligence.pesl`). Multi-local configurations are supported with one `LocalModelResolver` per backend. A single-runner dispatch path replaces the dual-runner split.
  - **`@harness-engineering/types`** — `BackendDef` union (`local` | `pi` | external types), `RoutingConfig`, `NamedLocalModelStatus`.
  - **`@harness-engineering/orchestrator`** — `BackendDefSchema` and `RoutingConfigSchema` (Zod); `migrateAgentConfig` shim for legacy `agent.backend` / `agent.localBackend` (warn-once at startup); `createBackend` factory; `BackendRouter` (use-case → backend resolution with intelligence-layer fallback); `AnalysisProviderFactory` (routed `BackendDef` → `AnalysisProvider`, distinct PESL provider); `OrchestratorBackendFactory` wrapping router + factory + container; `validateWorkflowConfig` SC15 enforcement; `Map<name, LocalModelResolver>` with per-resolver `NamedLocalModelStatus` broadcast; `GET /api/v1/local-models/status` array endpoint (singular `/local-model/status` retained as deprecated alias); `PiBackend` `timeoutMs` plumbed via `AbortController`.
  - **`@harness-engineering/intelligence`** — `IntelligencePipeline` accepts a distinct `peslProvider` so the SEL and PESL layers can resolve to different backends.
  - **`@harness-engineering/dashboard`** — `useLocalModelStatuses` (renamed from singular) consumes `/api/v1/local-models/status` and merges `NamedLocalModelStatus[]` by `backendName`; the Orchestrator page renders one `LocalModelBanner` per unhealthy backend.

  **Deprecation:** `agent.backend` and `agent.localBackend` continue to work via the migration shim, which synthesizes `agent.backends.primary` / `agent.backends.local` plus a `routing` map mirroring `escalation.autoExecute`. Hard removal lands in a follow-up release per ADR 0005.

## 0.10.1

### Patch Changes

- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6
- f62d6ab: Resolve V8 coverage race and Windows perf timeout in CI

## 0.10.0

### Minor Changes

- fix(telemetry): use `distinct_id` (snake_case) for PostHog batch API

  PostHog requires `distinct_id` but the code sent `distinctId` (camelCase), causing all telemetry events to be silently rejected with HTTP 400. Added identity fallbacks from `harness.config.json` name and `git config user.name`. Added `harness telemetry test` command for verifying PostHog connectivity.

### Patch Changes

- fix(ci): cross-platform CI fixes for Windows test timeouts and coverage scripts

## 0.9.2

### Patch Changes

- Document usage types (UsageRecord, ModelPricing, DailyUsage, SessionUsage) and external tracker types (ExternalTicket, ExternalTicketState, SyncResult, TrackerSyncConfig) in API reference

## 0.9.1

### Patch Changes

- Reduce Tier 2 structural violations and fix exactOptionalPropertyTypes errors

## 0.9.0

### Minor Changes

- Add `title` field to `ExternalTicketState` interface for title-based dedup during push sync. Prevents duplicate GitHub issues when externalIds are missing from the roadmap.

## 0.8.0

### Minor Changes

- `TrackerSyncAdapter` interface extended with `getAuthenticatedUser()` method for retrieving the token owner's GitHub username. Enables auto-population of assignee fields during sync.

## 0.7.0

### Minor Changes

- Roadmap sync, auto-pick, and assignment
  - **External tracker sync** — Bidirectional sync between roadmap.md and GitHub Issues via `TrackerSyncAdapter` interface. Split authority: roadmap owns planning fields, GitHub owns execution/assignment. Sync fires on every state transition (task-start, task-complete, phase-start, phase-complete, save-handoff, archive_session).
  - **Auto-pick pilot** — New `harness-roadmap-pilot` skill with AI-assisted next-item selection. Two-tier scoring: explicit priority first (P0-P3), then weighted position/dependents/affinity score. Routes to brainstorming (no spec) or autopilot (spec exists).
  - **Assignment with affinity** — Assignee, Priority, and External-ID fields on roadmap features. Assignment history section in roadmap.md enables affinity-based routing. Reassignment produces audit trail (unassigned + assigned records).
  - **New types** — `Priority`, `AssignmentRecord`, `ExternalTicket`, `ExternalTicketState`, `SyncResult`, `TrackerSyncConfig` in @harness-engineering/types.
  - **Config schema** — `TrackerConfigSchema` and `RoadmapConfigSchema` added to `HarnessConfigSchema` for validated tracker configuration.

## 0.6.0

### Minor Changes

- Multi-platform MCP expansion, security hardening, and release readiness fixes

  **@harness-engineering/cli (minor):**
  - Multi-platform MCP support: add Codex CLI and Cursor to `harness setup-mcp`, `harness setup`, and slash command generation
  - Cursor tool picker with `--pick` and `--yes` flags using `@clack/prompts` for interactive tool selection
  - TOML MCP entry writer for Codex `.codex/config.toml` integration
  - Sentinel prompt injection defense hooks (`sentinel-pre`, `sentinel-post`) added to hook profiles
  - `--tools` variadic option for `harness mcp` command
  - Fix lint errors in hooks (no-misleading-character-class, unused imports, `any` types)
  - Fix cost-tracker hook field naming (snake_case → camelCase alignment)
  - Fix test gaps: doctor MCP mock, usage fetch mock, profiles/integration hook counts

  **@harness-engineering/core (minor):**
  - Usage module: Claude Code JSONL parser (`parseCCRecords`), daily and session aggregation
  - Security scanner: session-scoped taint state management, `SEC-DEF-*` insecure-defaults rules, `SEC-EDGE-*` sharp-edges rules
  - Security: false-positive verification gate replacing suppression checks, `parseHarnessIgnore` helper
  - Fix lint: eslint-disable for intentional zero-width character regex in injection patterns

  **@harness-engineering/types (minor):**
  - Add `DailyUsage`, `SessionUsage`, `UsageRecord`, and `ModelPricing` types for cost tracking
  - Export aggregate types from types barrel

  **@harness-engineering/orchestrator (patch):**
  - Integrate sentinel config scanning into dispatch pipeline
  - Fix conditional spread for optional line property

## 0.5.0

### Patch Changes

- No public API changes — version bump to align with downstream consumers

## 0.4.0

### Minor Changes

- **Session-scoped accumulative state types** — New types for session section state management: `SessionSection`, `SessionSectionEntry`, `SessionSectionStatus`, and related interfaces. Re-exported from package index.

## 0.3.1

### Patch Changes

- Add optional `created` and `updated` fields to `RoadmapFrontmatter` interface for roundtrip preservation

## 0.3.0

### Minor Changes

- # Orchestrator Release & Workspace Hardening

  ## New Features
  - **Orchestrator Daemon**: Implemented a long-lived daemon for autonomous agent lifecycle management.
    - Pure state machine core for deterministic dispatch and reconciliation.
    - Multi-tracker support (Roadmap adapter implemented).
    - Isolated per-issue workspaces with deterministic path resolution.
    - Ink-based TUI and HTTP API for real-time observability.
  - **Harness Docs Pipeline**: Sequential pipeline for documentation health (drift detection, coverage audit, and auto-alignment).

  ## Improvements
  - **Documentation Coverage**: Increased project-wide documentation coverage to **84%**.
    - Comprehensive JSDoc/TSDoc for core APIs.
    - New Orchestrator Guide and API Reference.
    - Unified Source Map reference for all packages.
  - **Workspace Stability**: Resolved all pending lint errors and type mismatches in core packages.
  - **Graceful Shutdown**: Added signal handling and centralized resource cleanup for the orchestrator daemon.
  - **Hardened Security**: Restricted orchestrator HTTP API to localhost.

## 0.2.0

### Minor Changes

- Add Roadmap, Milestone, Feature, and FeatureStatus types for project roadmap management

## 0.1.0

### Minor Changes

- Add CI/CD integration commands and documentation
  - New `harness ci check` command: runs all harness checks (validate, deps, docs, entropy, phase-gate) with structured JSON output and meaningful exit codes
  - New `harness ci init` command: generates CI config for GitHub Actions, GitLab CI, or a generic shell script
  - New CI types: `CICheckReport`, `CICheckName`, `CIPlatform`, and related interfaces
  - Core `runCIChecks` orchestrator composing existing validation into a single CI entrypoint
  - 4 documentation guides: automation overview, CI/CD validation, issue tracker integration, headless agents
  - 6 copy-paste recipes: GitHub Actions, GitLab CI, shell script, webhook handler, Jira rules, headless agent action

## 0.0.1

### Patch Changes

- dc88a2e: Codebase hardening: normalize package scripts, deduplicate Result type, tighten API surface, expand test coverage, and fix documentation drift.

  **Breaking (core):** Removed 6 internal helpers from the entropy barrel export: `resolveEntryPoints`, `parseDocumentationFile`, `findPossibleMatches`, `levenshteinDistance`, `buildReachabilityMap`, `checkConfigPattern`. These were implementation details not used by any downstream package. If you imported them directly from `@harness-engineering/core`, import from the specific detector file instead (e.g., `@harness-engineering/core/src/entropy/detectors/drift`).

  **core:** `Result<T,E>` is now re-exported from `@harness-engineering/types` instead of being defined separately. No consumer-facing change.

  **All packages:** Normalized scripts (consistent `test`, `test:watch`, `lint`, `typecheck`, `clean`). Added mcp-server to root tsconfig references.

  **mcp-server:** Fixed 5 `no-explicit-any` lint errors in architecture, feedback, and validate tools.

  **Test coverage:** Added 96 new tests across 13 new test files (types, cli subcommands, mcp-server tools).

  **Documentation:** Rewrote cli.md and configuration.md to match actual implementation. Fixed 10 inaccuracies in AGENTS.md.
