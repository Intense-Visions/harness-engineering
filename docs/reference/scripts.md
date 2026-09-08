# Reference: scripts

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## scripts/assert-baseline-only-diff.mjs

[`scripts/assert-baseline-only-diff.mjs`](/scripts/assert-baseline-only-diff.mjs)

CI guard for the baseline-refresh self-approval step: reads changed paths on stdin (from `gh pr diff --name-only`), takes the permitted baseline paths as arguments, and exits non-zero when the PR touches anything outside them. Fails closed — an empty diff is refused too, so a phantom diff can never self-approve.

## scripts/assert-diff-scope.mjs

[`scripts/assert-diff-scope.mjs`](/scripts/assert-diff-scope.mjs)

The general-purpose sibling guard used by the roadmap auto-done self-approval step: same stdin-plus-arguments contract, but a pattern ending in `/` is treated as a directory prefix rather than an exact path. Exits non-zero on any out-of-scope or empty diff.

## scripts/audit-exceptions.mjs

[`scripts/audit-exceptions.mjs`](/scripts/audit-exceptions.mjs)

Runs `pnpm audit --json` and reconciles every active advisory against the `auditExceptions` register in the root `package.json`, failing when an advisory has no register entry or when its covering entry has lapsed. A missing `expires` date is treated as already lapsed, so a time-boxed deferral cannot quietly become a permanent exemption. Importing the module has no side effects; only `main()` touches the network.

**Exports:** `extractAdvisories`, `lapseReason`, `reconcile`

## scripts/benchmark-check.mjs

[`scripts/benchmark-check.mjs`](/scripts/benchmark-check.mjs)

Benchmark regression gate: runs the core and graph package benchmarks and compares them against `benchmark-baselines.json`. The threshold is a deliberately wide 100%, because microsecond-scale means swing by 50-65% on shared CI runners. With `--update` it rewrites only the entries that moved past the threshold, so routine jitter no longer produces conflicting baseline diffs.

**Exports:** `mergeBenchmarkBaselines`

## scripts/check-changesets.mjs

[`scripts/check-changesets.mjs`](/scripts/check-changesets.mjs)

Fails a PR that modifies a publishable package (anything under `packages/<pkg>/src/`, or a `package.json` edit) without a matching entry under `.changeset/`. An empty changeset counts as a deliberate no-release acknowledgement, and the frontmatter is parsed line-by-line so prettier reformatting the empty marker does not trip the gate.

**Exports:** `parseChangesetFrontmatter`

## scripts/clean.mjs

[`scripts/clean.mjs`](/scripts/clean.mjs)

Cross-platform stand-in for `rm -rf <path>` in package scripts, so build cleanup works identically on Windows. Refuses any argument that resolves outside the project root.

## scripts/coverage-ratchet.mjs

[`scripts/coverage-ratchet.mjs`](/scripts/coverage-ratchet.mjs)

Enforces that per-package test coverage never falls below `coverage-baselines.json`. Four modes: the default authoritative CI check, `--allow-missing` to skip packages with no fresh coverage during pre-push, `--clean` to drop stale summaries before an affected-only run, and `--update` to record new baselines. A 0.5% tolerance absorbs non-deterministic V8 coverage variance.

**Exports:** `pruneCoverageSummaries`, `evaluateCoverage`, `mergeCoverageBaselines`

## scripts/generate-agent-setup-prompt.mjs

[`scripts/generate-agent-setup-prompt.mjs`](/scripts/generate-agent-setup-prompt.mjs)

Emits `docs/agent-setup/prompt.md` — the fetchable "install and init harness" instruction file — from the same client descriptors the `harness setup` command uses, loading them through a tsx emitter because an `.mjs` file cannot import TypeScript. `--check` fails when the committed prompt has drifted from the CLI.

## scripts/generate-barrel-exports.mjs

[`scripts/generate-barrel-exports.mjs`](/scripts/generate-barrel-exports.mjs)

Scans `packages/cli/src/commands/` for files exporting a `createXxxCommand()` function and writes the `_registry.ts` barrel that `createProgram()` imports, removing manual import churn from the CLI entry point. `--check` verifies the committed registry is fresh.

## scripts/generate-core-barrel.mjs

[`scripts/generate-core-barrel.mjs`](/scripts/generate-core-barrel.mjs)

Regenerates the public barrel at `packages/core/src/index.ts` by star-exporting every directory that has an `index.ts`. Directories listed in the hand-maintained selective-export table are excluded from auto-discovery and get explicit export blocks instead — a new symbol in one of those modules is not exported until that table is edited. `--check` gates freshness in CI.

## scripts/generate-docs.mjs

[`scripts/generate-docs.mjs`](/scripts/generate-docs.mjs)

Owns three generated reference pages — `cli-commands.md`, `mcp-tools.md`, and `skills-catalog.md` — rebuilding them from live command, tool, and skill metadata; hand edits to those files are overwritten on the next run. `--check` is the staleness gate wired into CI and the pre-push hook. Every ordering decision uses raw code-point comparison rather than `localeCompare`, because locale-dependent sorting produced platform-varying bytes and spurious stale-docs failures.

## scripts/generate-persona-workflows.mjs

[`scripts/generate-persona-workflows.mjs`](/scripts/generate-persona-workflows.mjs)

Thin tsx wrapper that regenerates the committed `.github/workflows/` files backing persona-declared triggers by invoking `harness persona sync-workflows` from source. This repo dogfoods the workspace runner and wires the persona jobs as advisory; adopters get the npx and blocking defaults. `--check` is the drift guard.

## scripts/generate-plugin.mjs

[`scripts/generate-plugin.mjs`](/scripts/generate-plugin.mjs)

Regenerates the marketplace plugin artifacts for one target tool named by `--target` — the slash-command wrappers, the persona subagent definitions, and `hooks.json`. `--check` renders each artifact into a staging directory, formats it with prettier, and diffs against the committed tree so silent plugin drift fails the build.

## scripts/generate-tool-catalog.mjs

[`scripts/generate-tool-catalog.mjs`](/scripts/generate-tool-catalog.mjs)

Boots the live MCP tool definitions from the built CLI dist together with every `skill.yaml` contract and serializes their complete JSON schemas into `docs/reference/tool-catalog.md`. This is the schema-level counterpart to the shallow one-line-per-parameter rendering in `mcp-tools.md`, which cannot see drift inside a nested object, an enum, array items, or the required set. `--check` regenerates to a temp location and exits non-zero on any diff.

## scripts/lib/baseline-diff-guard.mjs

[`scripts/lib/baseline-diff-guard.mjs`](/scripts/lib/baseline-diff-guard.mjs)

The pure, unit-testable decision behind the baseline-refresh self-approval guard. It delegates to the shared scope check as a pure exact-match case, because two of the baseline files are bare `baselines.json` paths that a glob pattern would wrongly exclude. The allowlist is passed in by the workflow so there is a single source of truth.

**Exports:** `assertBaselineOnly`

## scripts/lib/diff-scope-guard.mjs

[`scripts/lib/diff-scope-guard.mjs`](/scripts/lib/diff-scope-guard.mjs)

The shared pure predicate both CI self-approval guards are built on. An allowed entry ending in `/` matches that directory and everything beneath it; any other entry must match exactly. The result is `ok` only when at least one file changed and every changed path was permitted, so an empty diff never approves.

**Exports:** `assertDiffScope`

## scripts/lib/plugin-config.mjs

[`scripts/lib/plugin-config.mjs`](/scripts/lib/plugin-config.mjs)

Per-target configuration table for the marketplace plugin generators, describing for each AI tool where its artifacts live and which of skills, commands, agents, and hooks to render. The plugin and marketplace manifests themselves stay hand-maintained. The standard hook list here mirrors the CLI's own hook profiles and must be kept in step with them.

**Exports:** `PLUGIN_CONFIGS`, `STANDARD_HOOKS`, `getConfig`

## scripts/main-health-check.mjs

[`scripts/main-health-check.mjs`](/scripts/main-health-check.mjs)

Scheduled alarm for the CI health of `main`, written after the build job sat red for eight days with nothing watching. It reads recent push-triggered runs, ignores cancelled and skipped ones as indecisive, and alarms only on a transition: opening a tracking issue on green-to-red, updating that same issue while red, and closing it as an all-clear on red-to-green. When too few decisive runs resolve it exits indeterminate rather than healthy, and a computed verdict whose issue upsert failed exits with its own code so undelivered silence never reads as health. A step summary is written on every run.

**Exports:** `EXIT`, `ALARM_MARKER`, `ALARM_LABEL`, `selectDecisiveRuns`, `evaluateHealth`, `decideAction`, `renderIssueBody`, `renderSummary`, `fetchRuns`, `findOpenAlarmIssue`, `deliverAlarm`

## scripts/refresh-model-candidates.mjs

[`scripts/refresh-model-candidates.mjs`](/scripts/refresh-model-candidates.mjs)

Rebuilds the frozen local-model candidate snapshot from the live HuggingFace API. Deliberately not wired into CI or release: the list steers which models the orchestrator recommends and installs, so it stays human-run and human-reviewed. Fail-closed — any fetch error or empty parse aborts without overwriting the committed snapshot, and it requires the local-models package to be built first.

## scripts/summarize-test-failures.mjs

[`scripts/summarize-test-failures.mjs`](/scripts/summarize-test-failures.mjs)

Reads the per-package vitest JSON reports written during the pre-push gate and prints a concise summary of which tests failed and why. Purely informational: it always exits 0 and never throws on a missing report, because the pre-push hook itself owns the decision to block the push.

**Exports:** `findReportPaths`, `extractFailures`, `formatSummary`, `main`

## scripts/sync-lockfile.mjs

[`scripts/sync-lockfile.mjs`](/scripts/sync-lockfile.mjs)

Cross-platform lockfile sync for the lint-staged hook. It runs a lockfile-only workspace install and accepts no arguments at all, so the staged file paths lint-staged appends cannot leak into the install command.

## scripts/sync-plugin-pin.mjs

[`scripts/sync-plugin-pin.mjs`](/scripts/sync-plugin-pin.mjs)

Keeps the pinned CLI version that each marketplace manifest uses to launch the MCP server in lockstep with the published CLI version. Wired into the root `version` script so the changesets release PR carries the manifest bump in the same commit. The rewrite surgically replaces only the version token in the raw file text rather than round-tripping through JSON, which would reformat the inline arrays and fail the format check; it is idempotent and reports when already in sync.

**Exports:** `MANIFEST_PATHS`, `readCliVersion`, `findPinnedVersion`, `syncManifestContent`, `syncPluginPins`

## scripts/vitest-prepush-reporter.mjs

[`scripts/vitest-prepush-reporter.mjs`](/scripts/vitest-prepush-reporter.mjs)

Supplies a vitest test-config fragment that adds a machine-readable JSON reporter alongside the normal console output, but only when the pre-push gate has set its environment flag. Under a plain test run or in CI it returns an empty object, so there is zero behaviour change outside pre-push.

**Exports:** `prepushTestOptions`
