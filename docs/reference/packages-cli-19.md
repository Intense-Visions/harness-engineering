# Reference: packages / cli / 19

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/commands/context-dictionary/corpus.ts

[`packages/cli/src/commands/context-dictionary/corpus.ts`](/packages/cli/src/commands/context-dictionary/corpus.ts)

Corpus adapter for trained context dictionaries: walks the compiled comprehension units under `.harness/comprehension/**` and mines each unit's invariant bullets and fenced import lines as candidate recurring spans, labelling every span by its own normalized text. Read-only, and returns an empty corpus rather than throwing when the repo has never compiled comprehension.

**Exports:** `readComprehensionCorpus`

## packages/cli/src/commands/docs-publish/attach-media.ts

[`packages/cli/src/commands/docs-publish/attach-media.ts`](/packages/cli/src/commands/docs-publish/attach-media.ts)

Backs `harness docs-publish attach-media`, which asks the configured publishing connector to attach a local media file to a draft page. Headless upload is not automatable for every provider, so a `manual-step-required` response is treated as a successful run: the command prints the instructions plus a verification command and still exits zero.

**Exports:** `runDocsPublishAttachMedia`, `createAttachMediaCommand`

## packages/cli/src/commands/docs-publish/draft.ts

[`packages/cli/src/commands/docs-publish/draft.ts`](/packages/cli/src/commands/docs-publish/draft.ts)

Backs `harness docs-publish draft`, creating or updating a page in DRAFT state only — it never publishes. Body content can come from a raw storage-format file or an ADF JSON file, and unreadable or malformed body files are converted into a clean validation error instead of an uncaught stack trace.

**Exports:** `runDocsPublishDraft`, `createDraftCommand`

## packages/cli/src/commands/docs-publish/page-tree.ts

[`packages/cli/src/commands/docs-publish/page-tree.ts`](/packages/cli/src/commands/docs-publish/page-tree.ts)

Backs `harness docs-publish page-tree`, creating and ordering a set of draft child pages beneath a draft parent from a JSON array of child nodes supplied via `--children-file`. Space id, parent id, and the children file are all mandatory.

**Exports:** `runDocsPublishPageTree`, `createPageTreeCommand`

## packages/cli/src/commands/docs-publish/verify-render.ts

[`packages/cli/src/commands/docs-publish/verify-render.ts`](/packages/cli/src/commands/docs-publish/verify-render.ts)

Backs `harness docs-publish verify-render`, the only authority on whether a published page actually renders. It asserts against a live http(s) or `file://` URL and reports loaded images, media node counts, and media-card errors; a failing verdict exits non-zero while the underlying op itself always succeeds.

**Exports:** `runDocsPublishVerifyRender`, `createVerifyRenderCommand`

## packages/cli/src/commands/fleet/budget-check.ts

[`packages/cli/src/commands/fleet/budget-check.ts`](/packages/cli/src/commands/fleet/budget-check.ts)

Backs `harness fleet budget-check`, the dispatch-time spend gate for fleet runs. It reads observed spend from burn's existing per-skill attribution, compares it against a global and optional per-fleet envelope, and reports `within | exhausted | unconfigured` — overlaying dollar figures when a burn cost price table is configured. An exhausted verdict exits with the dedicated code 10 so a fleet can distinguish "budget spent" from a command error; a failed burn rescan falls back to the cached summary rather than faking a green.

**Exports:** `BUDGET_EXHAUSTED_EXIT_CODE`, `BudgetCheckOptions`, `observedSpendFromSummary`, `envelopeFromOptions`, `BudgetCostOverlay`, `costOverlayFromSummary`, `runBudgetCheck`, `createBudgetCheckCommand`

## packages/cli/src/commands/fleet/clump-dispatch.ts

[`packages/cli/src/commands/fleet/clump-dispatch.ts`](/packages/cli/src/commands/fleet/clump-dispatch.ts)

Backs `harness fleet clump-dispatch`, the runnable surface of clumping's execution seam. It exists because the four members whose lane unit a clump becomes — `roadmap-fleet`, `bug-fleet`, `cleanup-fleet`, `craft-fleet` — are SKILL.md files with nothing scheduling their lanes, so without a callable the one-PR-per-clump contract would be prose nothing could be held to. `--input` reads the clump set a run emitted (a craft run's own JSON output, a `clump-issues --json` dump, or a bare `ClumpResult`) and prints one PR plan per clump with one commit per member; the `clumps` field is shape-CHECKED rather than cast, so a payload whose members are not objects with an `id` is refused with its own exit code instead of planning commits subjected `undefined`. A findings-only input is refused too, with a different code, because an empty plan list is also what a run that genuinely grouped nothing produces. `--verdict` settles ONE verdict per clump under D10 and exits non-zero only when a clump's post-drop remainder is empty or no longer builds. Read-only. See `docs/changes/clumping/proposal.md`, Phase 5.

**Exports:** `CLUMP_FAILED_EXIT_CODE`, `NO_CLUMPS_INPUT_EXIT_CODE`, `VERDICT_PARTITION_BREACH_EXIT_CODE`, `MALFORMED_CLUMP_INPUT_EXIT_CODE`, `ClumpDispatchOptions`, `ClumpInputGap`, `extractClumps`, `describeMember`, `VerdictFile`, `runClumpDispatch`, `createClumpDispatchCommand`

## packages/cli/src/commands/fleet/clump-issues.ts

[`packages/cli/src/commands/fleet/clump-issues.ts`](/packages/cli/src/commands/fleet/clump-issues.ts)

Backs `harness fleet clump-issues`, the runnable surface of clumping's intake seam and `issue-fleet`'s fifth triage axis. It enumerates the open-issue backlog (`gh issue list`, or a dump via `--input`), forms the clump set through the shared `formClumps` primitive, and prints the clump table, every shed count, and the conservation arithmetic — the exact rows `issue-fleet` carries onto its single CONFIRM round. `--json` emits the dispatchable dump (`intakeClumpDump`): each clump member is `{ id, ref: { number, title } }`, the shape `clump-dispatch` reads, not a bare issue number. Read-only; a missing `gh` auth reports the gap and simulates nothing, and a conservation breach exits with its own code rather than printing a clean-looking report.

**Exports:** `CONSERVATION_BREACH_EXIT_CODE`, `BACKLOG_UNAVAILABLE_EXIT_CODE`, `ClumpIssuesOptions`, `buildGhArgs`, `BacklogGap`, `readBacklog`, `policyFromOptions`, `checkConservation`, `renderHuman`, `ClumpIssuesDeps`, `IntakeClumpDumpMember`, `IntakeClumpDumpUnit`, `IntakeClumpDump`, `intakeClumpDump`, `runClumpIssues`, `createClumpIssuesCommand`

## packages/cli/src/commands/fleet/clumpable-issues.ts

[`packages/cli/src/commands/fleet/clumpable-issues.ts`](/packages/cli/src/commands/fleet/clumpable-issues.ts)

The intake half of clumping's three forming seams: normalizes an open-issue backlog into core's seam-neutral `ClumpableItem`. Scope is the directory of the first repository path the issue names (rendered with a trailing slash so it can never collide with the `unscoped` family), kind is the issue's single type label, the conflict keys are every path it names, and weight is the prioritize axis's existing pilot score. Paths that are not work targets are dropped first — the tracker's own roadmap shards, and build artifacts under `dist/`, `node_modules/`, `coverage/` or `.turbo/` that arrive in pasted stack traces — because a path nobody edits was otherwise supplying both the scope and the conflict keys. An issue that names no path gets its OWN `unscoped#<item id>` scope, so it is structurally ungroupable and lands in `solo` with the count reported; grouping on the absence of a signal is not grouping. An issue with no single type label is terminal — reported, never clumped — and the floor sheds nothing here by construction, because an issue at intake is already filed. See `docs/changes/clumping/proposal.md`, Phase 4.

**Exports:** `UNSCOPED`, `unscopedScope`, `isUnscoped`, `DEFAULT_ISSUE_TYPE_LABELS`, `DEFAULT_NON_TARGET_PATH_PREFIXES`, `IssueLabel`, `IntakeIssue`, `IntakeAdapterOptions`, `labelNames`, `mentionedPaths`, `issueScope`, `issueKind`, `issueWeight`, `toClumpableIssues`, `IntakeClumpReport`, `IntakeClumpOutcome`, `INTAKE_CLUMP_POLICY`, `clumpIssues`

## packages/cli/src/commands/golden-build/runners.ts

[`packages/cli/src/commands/golden-build/runners.ts`](/packages/cli/src/commands/golden-build/runners.ts)

The three shared operations behind `harness golden-build`: `promote` snapshots the working tree as the new known-good reference (stamped with the git commit and branch, and byte-stable when the fingerprint is unchanged), `verify` compares the tree against the latest golden and errors when none exists, and `diff` runs the same comparison advisorily so it can be invoked speculatively before any golden is captured.

**Exports:** `GoldenCommandOptions`, `GoldenPromoteResult`, `GoldenVerifyResult`, `runGoldenPromote`, `runGoldenVerify`, `runGoldenDiff`

## packages/cli/src/commands/graph/bench-judge.ts

[`packages/cli/src/commands/graph/bench-judge.ts`](/packages/cli/src/commands/graph/bench-judge.ts)

The opt-in answer-quality judge for `harness graph bench`. Where the benchmark's other two axes measure retrieval cost, this one grades whether a retrieved payload actually suffices to answer the query, reusing the shared analysis-provider seam that `outcome_eval` and `acceptance_eval` use. Both strategies' payloads are truncated to the same character budget so the judgments stay comparable, and any provider rejection or malformed response yields an INCONCLUSIVE grade rather than a fabricated score.

**Exports:** `BenchStrategy`, `QualityGrade`, `BenchJudge`, `JUDGE_PAYLOAD_CHAR_BUDGET`, `buildBenchJudge`, `resolveBenchJudge`

## packages/cli/src/commands/graph/bench.ts

[`packages/cli/src/commands/graph/bench.ts`](/packages/cli/src/commands/graph/bench.ts)

Implements `harness graph bench`, a reproducible benchmark measuring tokens and tool calls for graph-scoped retrieval (driven through the real shipped MCP tool handlers) against the naive file-by-file exploration a graph-less agent must fall back on. Scenarios are generated per structural family; the optional `--judge` flag adds the advisory answer-quality axis. The measured number is reported truthfully against the published comparator figure rather than the flattering README one.

**Exports:** `estimateBenchTokens`, `StrategyMetrics`, `ScenarioQuality`, `ScenarioResult`, `QualityAggregate`, `AnswerQualityAxis`, `FamilyAggregate`, `GraphBenchResult`, `GraphBenchOptions`, `benchQueryFor`, `runGraphBench`, `formatBenchReport`, `formatAnswerQuality`, `createBenchCommand`

## packages/cli/src/commands/graph/deprecated-aliases.ts

[`packages/cli/src/commands/graph/deprecated-aliases.ts`](/packages/cli/src/commands/graph/deprecated-aliases.ts)

Keeps the legacy top-level `harness scan`, `harness query`, and `harness ingest` commands working after their move into the `graph` group. Each alias reuses the canonical subcommand's own factory, is registered hidden so it stays out of `--help`, and prints a one-line deprecation notice to stderr — never stdout, so `--json` consumers are unaffected — suppressed under `--quiet`.

**Exports:** `registerDeprecatedGraphAliases`

## packages/cli/src/commands/graph/integrity.ts

[`packages/cli/src/commands/graph/integrity.ts`](/packages/cli/src/commands/graph/integrity.ts)

Inspects a persisted knowledge graph for content that cannot be trusted, joining the full `sync-metadata.json` (including connector errors and counts, which the narrower reader in `status.ts` discards) with the store's extractor-derived nodes. The renderer always leads with what was examined and prints an explicit ABSTAINED result when there were no connectors and no extracted nodes, so a zero denominator can never be misread as a clean bill of health.

**Exports:** `GraphIntegrityResult`, `runGraphIntegrity`, `printGraphIntegrity`

## packages/cli/src/commands/knowledge/mdl.ts

[`packages/cli/src/commands/knowledge/mdl.ts`](/packages/cli/src/commands/knowledge/mdl.ts)

Implements `harness knowledge mdl`, scoring the knowledge store by Minimum Description Length — each entry's description cost against its measured compression value — and emitting reversible prune and merge recommendations. Strictly report-only: it never deletes an entry. An optional `--telemetry` file supplies the inclusion and outcome ledgers that ground measured value; without it every entry scores as insufficient-evidence.

**Exports:** `createMdlCommand`

## packages/cli/src/commands/persona/sync-workflows.ts

[`packages/cli/src/commands/persona/sync-workflows.ts`](/packages/cli/src/commands/persona/sync-workflows.ts)

Implements `harness persona sync-workflows`, regenerating (or, under `--check`, verifying) the committed GitHub Actions workflow files that honour a project's persona-declared CI triggers. `--check` is the drift guard and exits non-zero on a missing, stale, or orphaned workflow. Defaults target adopters — the published CLI invoked via npx, blocking on findings — while `--runner workspace --advisory` builds from source and emits non-blocking jobs. It resolves the project's own personas directory and never falls back to the CLI's bundled personas.

**Exports:** `createSyncWorkflowsCommand`

## packages/cli/src/commands/rules/provenance.ts

[`packages/cli/src/commands/rules/provenance.ts`](/packages/cli/src/commands/rules/provenance.ts)

Implements `harness rules provenance`, joining each rule in the typed registry with the compound solution docs that declare they enforce it, then reporting unexplained constraints and candidate dead rules. Advisory by design (ADR 0100): it always exits zero regardless of findings, leaving authority with the real enforcement gates.

**Exports:** `RulesProvenanceOptions`, `computeRulesProvenance`, `formatProvenanceReport`, `runRulesProvenanceCommand`, `createRulesProvenanceCommand`

## packages/cli/src/commands/skill/provider-update.ts

[`packages/cli/src/commands/skill/provider-update.ts`](/packages/cli/src/commands/skill/provider-update.ts)

Probes the installed skill lockfiles for outdated providers and re-pulls the ones the operator approves, reconstructing a github install spec from the recorded owner/repo/ref or reinstalling by npm package name. Source fields that git or npm would parse as a flag, or that carry embedded spec delimiters, are rejected as unsafe so a re-pull cannot be silently redirected elsewhere. Updates are per-provider confirmed (default no) unless `--yes`, best-effort so one failure does not abort the rest, and the cached freshness state is invalidated only when at least one provider actually updated.

**Exports:** `LockfileRef`, `ProbedProvider`, `SourcelessEntry`, `ProbeResult`, `probeProviders`, `UpdateOptions`, `UpdateOutcome`, `updateProviders`

## packages/cli/src/commands/telemetry/synthesize.ts

[`packages/cli/src/commands/telemetry/synthesize.ts`](/packages/cli/src/commands/telemetry/synthesize.ts)

Implements `harness telemetry synthesize`, composing the adoption, effectiveness, usage, insights, and outcome telemetry sources into a single local report as Markdown or as a machine-readable object. Usage records are read and priced exactly the way `harness usage` does so the two surfaces cannot report different cost totals; sections can be dropped with repeatable `--skip` flags and the source window bounded with `--window`.

**Exports:** `createSynthesizeCommand`
