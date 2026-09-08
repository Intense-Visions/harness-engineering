# Reference: packages / cli / 18

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/commands/burn/calibrate.ts

[`packages/cli/src/commands/burn/calibrate.ts`](/packages/cli/src/commands/burn/calibrate.ts)

`harness burn calibrate <pct>` — turns the local usage proxy into a calibrated gauge by deriving units-per-percent from this week's measured burn against the percentage `/usage` currently reports, then persisting the implied 100% as the weekly budget. Rejects a zero week-to-date denominator as an abstention rather than calibrating against nothing, and prints the rounding-error caveat instead of absorbing it.

**Exports:** `calibrate`, `createCalibrateCommand`

## packages/cli/src/commands/burn/format.ts

[`packages/cli/src/commands/burn/format.ts`](/packages/cli/src/commands/burn/format.ts)

Presentation helpers shared across the burn report surfaces: renders a UTC ISO stamp in the account's reset timezone so times line up with what `/usage` shows, draws a progress bar that turns red past 100% rather than silently clamping, and pads labels to a fixed column width.

**Exports:** `localTime`, `bar`, `pad`

## packages/cli/src/commands/burn/metabolism.ts

[`packages/cli/src/commands/burn/metabolism.ts`](/packages/cli/src/commands/burn/metabolism.ts)

`harness burn metabolism` — classifies token spend into basal (maintenance burn that produced no new artifact, decision, or fact) versus anabolic, with an explicit unattributable bucket, and reports the basal-share metric plus a ranked maintenance-waste list. Reads adoption telemetry joined with the usage ledger rather than the transcript summary, and returns `null` when there is no telemetry so callers render an absent block instead of a misleading zero. Read-only; wired into no budget or governor gate.

**Exports:** `MetabolismResult`, `loadMetabolism`, `renderMetabolism`, `metabolismSection`, `createMetabolismCommand`

## packages/cli/src/commands/burn/per-pr.ts

[`packages/cli/src/commands/burn/per-pr.ts`](/packages/cli/src/commands/burn/per-pr.ts)

`harness burn per-pr` — renders cost-per-merged-PR in burn units, deliberately showing the dispatched-lane denominator alongside the merged-PR one so the success-only figure never travels alone. A degraded run (spend observed but no lane linked to a PR) is reported as a headline, and `--write` persists the cost report.

**Exports:** `printPerPr`, `createPerPrCommand`

## packages/cli/src/commands/burn/reset-day.ts

[`packages/cli/src/commands/burn/reset-day.ts`](/packages/cli/src/commands/burn/reset-day.ts)

`harness burn reset-day` — reads or rewrites the weekday, time, and timezone anchor of the burn week window, then rescans and reports what moved. Mutates the persisted burn config; time-of-day is load-bearing, since a midnight-UTC assumption against a real mid-week local reset understated week-to-date burn by orders of magnitude.

**Exports:** `parseWeekday`, `setResetDay`, `createResetDayCommand`

## packages/cli/src/commands/burn/weeks.ts

[`packages/cli/src/commands/burn/weeks.ts`](/packages/cli/src/commands/burn/weeks.ts)

`harness burn weeks` — prints up to twelve weeks of request, output-token, and unit history bucketed against the same anchored reset the live report uses, so the history table and the headline report cannot disagree about where a week begins. Exits non-zero when no usage records exist rather than rendering an empty-but-confident table.

**Exports:** `printWeeks`, `createWeeksCommand`

## packages/cli/src/commands/roadmap/install-hook.ts

[`packages/cli/src/commands/roadmap/install-hook.ts`](/packages/cli/src/commands/roadmap/install-hook.ts)

`harness roadmap install-hook` — wires a roadmap aggregate-regeneration step into an adopter's git `pre-commit` hook, composing safely with an existing husky or raw `.git/hooks` setup via fenced begin/end markers so re-runs replace the managed block rather than duplicating it. Writes to the adopter's hook file; it is a git hook, not a Claude Code tool-use hook, because only the former fires on `git commit`.

**Exports:** `HOOK_BLOCK_BEGIN`, `HOOK_BLOCK_END`, `DEFAULT_REGEN_COMMAND`, `HookMechanism`, `InstallHookAction`, `RoadmapInstallHookOptions`, `InstallHookReport`, `buildRegenBlock`, `mergeHookContent`, `runRoadmapInstallHook`, `runInstallHookAction`, `createRoadmapInstallHookCommand`

## packages/cli/src/commands/roadmap/referenced-issues.ts

[`packages/cli/src/commands/roadmap/referenced-issues.ts`](/packages/cli/src/commands/roadmap/referenced-issues.ts)

`harness roadmap referenced-issues` — reads PR title and body text from stdin and prints each referenced issue number on its own line. A read-only backstop for the auto-done path when a PR's closing keyword is malformed.

**Exports:** `runReferencedIssues`, `createRoadmapReferencedIssuesCommand`

## packages/cli/src/commands/roadmap/sync-deps.ts

[`packages/cli/src/commands/roadmap/sync-deps.ts`](/packages/cli/src/commands/roadmap/sync-deps.ts)

Environment resolution for `harness roadmap sync`: loads the tracker config and constructs the tracker adapter (GitHub Issues by default, Pnyon otherwise), reading `.env` so a token stored there is visible. Every unresolvable path returns an actionable `Err` rather than a silent no-op, and the config diagnosis names which of the four failure reasons applied instead of reporting them all as a missing block.

**Exports:** `SyncDepsOptions`, `resolveConfig`, `resolveAdapter`

## packages/cli/src/commands/roadmap/sync-report.ts

[`packages/cli/src/commands/roadmap/sync-report.ts`](/packages/cli/src/commands/roadmap/sync-report.ts)

The result shape of a `harness roadmap sync` run and how it is rendered — the `--json` payload and the prose log. Projects a core `SyncResult` into an always-serializable report carrying the examined denominators, writes performed, changes planned in dry-run, execution fields pulled back from the tracker, and the changes a guard deliberately withheld, so a withheld inbound write is visible rather than silently dropped.

**Exports:** `RoadmapSyncReport`, `buildReport`, `logSyncReport`

## packages/cli/src/commands/roadmap/sync-verdict.ts

[`packages/cli/src/commands/roadmap/sync-verdict.ts`](/packages/cli/src/commands/roadmap/sync-verdict.ts)

Turns a sync report into the command's exit status via the shared denominated-metrics API: 0 when a non-zero denominator converged, `ExitCode.ERROR` on misconfiguration or per-feature sync errors, and `ExitCode.ZERO_DENOMINATOR` when the run examined nothing. A failed ticket fetch becomes an unknown population rather than a zero one, which keeps a broken token from reading like an empty label selector.

**Exports:** `syncMetrics`, `verdictFor`

## packages/cli/src/commands/roadmap/triage-approve.ts

[`packages/cli/src/commands/roadmap/triage-approve.ts`](/packages/cli/src/commands/roadmap/triage-approve.ts)

The pure core behind `harness roadmap triage approve`: derives the candidates eligible for a human go/no-go (brainstorms that completed with a written spec and re-scored as dispatchable), detects each one's scope tier with the same detector the orchestrator uses, resolves the effective ratchet stage, and partitions an approval into approved and withheld. Marks only — the orchestrator dispatches on its next tick through unchanged gating; no new dispatch path is opened here.

**Exports:** `ReadyCandidate`, `deriveReadyCandidates`, `ApprovalPlan`, `resolveEffectiveStage`, `buildApprovalPlan`

## packages/cli/src/commands/roadmap/triage-feature.ts

[`packages/cli/src/commands/roadmap/triage-feature.ts`](/packages/cli/src/commands/roadmap/triage-feature.ts)

The shared leaf for the triage command surface: decides which roadmap features are actionable for triage (`planned` or `backlog` only), maps a `RoadmapFeature` onto the unified `Issue` model the probe wiring consumes, and defines the brainstorm report-row shape. Extracted to break the value-import cycle between `triage.ts` and `triage-approve.ts`; imports only external packages, never a sibling command module.

**Exports:** `isActionable`, `featureToIssue`, `BrainstormReportRow`

## packages/cli/src/commands/roadmap/triage-pool.ts

[`packages/cli/src/commands/roadmap/triage-pool.ts`](/packages/cli/src/commands/roadmap/triage-pool.ts)

Pool-first local-model selection for the one-shot CLI triage path, so the CLI picks the same model the live orchestrator would instead of being pinned to the first entry of a hand-maintained config list. Ranks candidates from the persisted local-model pool, then intersects them with what the endpoint's OpenAI-compatible `/v1/models` route is actually serving; any probe failure returns `undefined` and the static config list remains the documented fallback.

**Exports:** `PoolSnapshotStore`, `ResolvePreferredLocalModelDeps`, `resolvePreferredLocalModel`

## packages/cli/src/commands/roadmap/triage-provider.ts

[`packages/cli/src/commands/roadmap/triage-provider.ts`](/packages/cli/src/commands/roadmap/triage-provider.ts)

Resolves the analysis provider the CLI brainstorm and approve path runs on, mirroring how the orchestrator resolves its SEL layer so the two agree on one backend. A free local backend is the default; a cloud/paid model is reachable only through an explicit `intelligence.provider` opt-in, never silently. Pure over the injected config and environment, and returns `null` when nothing resolves so the caller halts every item to a human rather than passing without a model.

**Exports:** `TriageProviderConfig`, `resolveTriageProvider`

## packages/cli/src/commands/roadmap/triage.ts

[`packages/cli/src/commands/roadmap/triage.ts`](/packages/cli/src/commands/roadmap/triage.ts)

`harness roadmap triage` and its subcommands — the read-only triage report ranks every actionable roadmap item by the four-lever scoping probe and the pilot score (human table or `--json`), the brainstorm report runs the wired brainstorm per plausible item, and `triage approve` records the human go/no-go. Gated behind `roadmap.autoTriage.enabled` and inert when off; the report itself never writes to the roadmap or to code, and degrades to holding items for a human when no analysis provider is wired.

**Exports:** `TriageReportRow`, `buildPrecedentLookup`, `buildShapeHistory`, `selectActionableFeatures`, `isPlausibleForModel`, `runTriageReport`, `renderHuman`, `renderJson`, `runBrainstormReport`, `renderBrainstormHuman`, `renderBrainstormJson`, `runApproveCommand`, `createTriageApproveCommand`, `createRoadmapTriageCommand`, plus re-exports of `featureToIssue`, `isActionable`, and `BrainstormReportRow`
