# Reference: packages / cli / 16

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/comprehension/invalidation.ts

[`packages/cli/src/comprehension/invalidation.ts`](/packages/cli/src/comprehension/invalidation.ts)

Maps a git-diff file surface onto the set of owning module directories to recompile, so incremental comprehension cost scales with the diff rather than the repo; also walks the project to enumerate every module directory for an `--all` backfill.

**Exports:** `filesToModules`, `enumerateModules`

## packages/cli/src/comprehension/policy.ts

[`packages/cli/src/comprehension/policy.ts`](/packages/cli/src/comprehension/policy.ts)

The single-writer policy predicate behind ADR 0116: decides whether the current invocation is the `main`-branch main-pass and may therefore write the committed semantic half of a comprehension unit, resolving the branch from CI env vars before falling back to git and defaulting unknown contexts to "not the writer".

**Exports:** `MAIN_BRANCH`, `MainPassDeps`, `resolveComprehensionBranch`, `isMainPassContext`, `committedSemanticAllowed`

## packages/cli/src/comprehension/refresh-gate.ts

[`packages/cli/src/comprehension/refresh-gate.ts`](/packages/cli/src/comprehension/refresh-gate.ts)

Pure decision seam for the opt-in, token-gated CI comprehension refresh: ANDs three signals (refresh mode configured, this is the main-pass, a provider credential resolved) in cheapest-first order so the reported reason names the first missing prerequisite, and explains an inactive gate as a clean no-op rather than a build failure.

**Exports:** `ComprehensionCiMode`, `RefreshJobGateDeps`, `RefreshJobGateReason`, `RefreshJobGate`, `resolveRefreshJobGate`, `explainInactiveRefreshGate`

## packages/cli/src/config/analysis-schema.ts

[`packages/cli/src/config/analysis-schema.ts`](/packages/cli/src/config/analysis-schema.ts)

Standalone zod schemas and best-effort loaders for the cross-cutting config blocks that analysis commands need on hot paths — project-wide analysis excludes, design excludes, the design token path, and dependency excludes — readable without pulling in the full harness config schema and its transitive imports.

**Exports:** `AnalysisConfigSchema`, `AnalysisConfig`, `loadAnalysisExclude`, `loadDesignExclude`, `loadDesignTokenPath`, `DepsConfigSchema`, `DepsConfig`, `loadDepsExclude`

## packages/cli/src/config/stripped-keys.ts

[`packages/cli/src/config/stripped-keys.ts`](/packages/cli/src/config/stripped-keys.ts)

Walks a parsed zod schema alongside the raw config JSON to find keys the schema silently dropped as unknown or mis-nested, suggests the closest known sibling for likely typos, and formats them as warnings — while deliberately staying quiet about namespaces reserved for co-tenant tools so a shared config file is not policed.

**Exports:** `StrippedKey`, `collectStrippedKeys`, `formatStrippedKeyWarnings`

## packages/cli/src/docs-publish/connectors/adf.ts

[`packages/cli/src/docs-publish/connectors/adf.ts`](/packages/cli/src/docs-publish/connectors/adf.ts)

Builders for Atlassian Document Format media nodes, holding the invariant that media is always emitted in the figure form and never as a media group — the latter stores without error but silently renders as a cropped thumbnail card instead of an inline figure.

**Exports:** `AdfNode`, `MediaAttrs`, `mediaSingle`, `mediaInline`

## packages/cli/src/docs-publish/connectors/confluence.ts

[`packages/cli/src/docs-publish/connectors/confluence.ts`](/packages/cli/src/docs-publish/connectors/confluence.ts)

The Confluence implementation of the docs-publish connector interface — draft creation, page-tree resolution, and DOM render verification over an injectable HTTP client, plus the manual-step payload that documents the browser-session attachment upload recipe because the provider exposes no headless attachment API.

**Exports:** `ConfluenceConnector`

## packages/cli/src/git/comprehension-merge-driver.ts

[`packages/cli/src/git/comprehension-merge-driver.ts`](/packages/cli/src/git/comprehension-merge-driver.ts)

The git merge driver that auto-resolves comprehension shard conflicts: it keeps the "ours" shard when its source hash still matches the working-tree source, and otherwise recompiles the static half as a stale fallback — never blocking a merge, since any failure leaves ours in place and still resolves.

**Exports:** `moduleFromShardPath`, `MergeDriverIO`, `MergeDriverResult`, `runComprehensionMergeDriver`

## packages/cli/src/output/prompt.ts

[`packages/cli/src/output/prompt.ts`](/packages/cli/src/output/prompt.ts)

Minimal readline-backed question helper that asks on stdin/stdout and resolves the trimmed, lower-cased answer; shared by the interactive confirmation flows in the `update` and `install` commands.

**Exports:** `prompt`

## packages/cli/src/persona/generators/repo-workflows.ts

[`packages/cli/src/persona/generators/repo-workflows.ts`](/packages/cli/src/persona/generators/repo-workflows.ts)

Turns the CI triggers declared in persona YAML files into committed, runnable GitHub Actions workflow files, and provides the drift guard that fails when a declared trigger has no up-to-date committed workflow. Only the CLI-command tier of each persona is emitted; agent/LLM-driven persona reviews are served elsewhere.

**Exports:** `PERSONA_WORKFLOW_PREFIX`, `PersonaWorkflowTarget`, `getPersonaWorkflowTargets`, `PersonaWorkflowRenderOptions`, `DEFAULT_RENDER_OPTIONS`, `renderPersonaWorkflowFile`, `WorkflowDriftIssue`, `WorkflowSyncResult`, `resolveWorkflowsDir`, `checkPersonaWorkflows`, `writePersonaWorkflows`

## packages/cli/src/registry/freshness-checker.ts

[`packages/cli/src/registry/freshness-checker.ts`](/packages/cli/src/registry/freshness-checker.ts)

Background staleness probe for installed skill sources: persists a per-provider freshness state under the user's home directory, decides when the interval has elapsed, builds and spawns a detached, budget-capped probe script against GitHub and npm sources, and renders the resulting "update available" notification.

**Exports:** `FreshnessProvider`, `FreshnessState`, `isFreshnessCheckEnabled`, `shouldRunFreshnessCheck`, `readFreshnessState`, `writeFreshnessState`, `invalidateFreshnessState`, `evaluateEntry`, `getFreshnessNotification`, `MAX_PROVIDERS`, `PROBE_BUDGET_MS`, `buildProbeScript`, `spawnBackgroundFreshnessCheck`

## packages/cli/src/responsive/probe.ts

[`packages/cli/src/responsive/probe.ts`](/packages/cli/src/responsive/probe.ts)

Mechanical, LLM-free responsive gate that turns caller-supplied rendered layout metrics at a mobile viewport into a pass/fail verdict — catching horizontal overflow and unreachable primary navigation, which are layout facts a screenshot cannot answer — for the design-craft award bar to compose with its aesthetic verdict.

**Exports:** `ResponsiveDefectKind`, `ResponsiveDefect`, `ResponsiveStatus`, `ResponsiveGateResult`, `ResponsiveMetrics`, `ResponsiveGateConfig`, `DEFAULT_RESPONSIVE_GATE_CONFIG`, `NOT_EVALUATED_RESPONSIVE`, `resolveResponsiveGateConfig`, `computeResponsiveGate`

## packages/cli/src/setup/clients.ts

[`packages/cli/src/setup/clients.ts`](/packages/cli/src/setup/clients.ts)

The registry of supported agent clients — detection directory, internal client key, MCP config target, and whether harness installs via plugin marketplace or npm — shared by `harness setup` and the agent-setup prompt generator so registering a new client happens in exactly one place.

**Exports:** `SetupClient`, `SETUP_CLIENTS`

## packages/cli/src/setup/print-clients.ts

[`packages/cli/src/setup/print-clients.ts`](/packages/cli/src/setup/print-clients.ts)

Tiny executable script, run under tsx by the agent-setup prompt generator, that writes the client registry and the required Node version to stdout as JSON — the bridge that lets a plain `.mjs` build script consume these TypeScript sources without duplicating them.

## packages/cli/src/shared/craft/diagnostics.ts

[`packages/cli/src/shared/craft/diagnostics.ts`](/packages/cli/src/shared/craft/diagnostics.ts)

One canonical diagnostic formatter for the craft skill family, so an empty findings list always states why — naming the resolved provider and mode, and reporting how many units were analyzed versus skipped — instead of reading like a passing grade when no analysis actually ran.

**Exports:** `describeCraftResolution`, `CraftScanTally`, `CraftDiagnosticInput`, `formatCraftDiagnostic`

## packages/cli/src/shared/craft/fenced-json.ts

[`packages/cli/src/shared/craft/fenced-json.ts`](/packages/cli/src/shared/craft/fenced-json.ts)

Nesting-aware extractor that pulls the JSON payload out of a raw LLM response: it anchors on the opening code fence then does a string- and escape-aware brace-balanced scan, so a finding whose message quotes an inner fence is recovered intact rather than truncated and silently dropped, while two separate blocks are never merged.

**Exports:** `extractFencedJsonPayload`

## packages/cli/src/test-craft/emit.ts

[`packages/cli/src/test-craft/emit.ts`](/packages/cli/src/test-craft/emit.ts)

Projects test-craft's flat per-rubric findings into a stable per-test verdict document — worst tier, finding count, and a machine-readable promotability signal — and writes it to JSON so a downstream test-promotion gate has a real seam to read instead of scraping chat output.

**Exports:** `TEST_CRAFT_REPORT_SCHEMA`, `TEST_CRAFT_REPORT_VERSION`, `TestVerdict`, `TestCraftReport`, `toTestVerdicts`, `buildTestCraftReport`, `emitTestCraftReport`

## packages/cli/src/test-craft/extract/python-tests.ts

[`packages/cli/src/test-craft/extract/python-tests.ts`](/packages/cli/src/test-craft/extract/python-tests.ts)

Light-parse pytest extractor: an indentation- and regex-driven walk that recovers every test function with its enclosing test-class nesting, skip markers, and verbatim body text, deliberately avoiding a full Python AST because the critique layer needs nothing more.

**Exports:** `isPythonTestFile`, `ExtractPythonTestsInput`, `extractPythonTests`

## packages/cli/src/test-craft/extract/test-file-exts.ts

[`packages/cli/src/test-craft/extract/test-file-exts.ts`](/packages/cli/src/test-craft/extract/test-file-exts.ts)

Single source of truth for which filenames count as TypeScript/JavaScript test files, covering both test and spec infixes across the ESM- and CJS-explicit extensions — consolidating two divergent copies that between them made entire suites invisible while still reporting a confident zero.

**Exports:** `isTsJsTestFileName`

## packages/cli/src/utils/env-flag.ts

[`packages/cli/src/utils/env-flag.ts`](/packages/cli/src/utils/env-flag.ts)

One-line truthiness test for environment-variable switches, accepting `1`, `true`, `yes`, or `on` case-insensitively so every feature flag in the CLI agrees on what "enabled" means.

**Exports:** `envEnabled`

## packages/cli/src/utils/guardian-context.ts

[`packages/cli/src/utils/guardian-context.ts`](/packages/cli/src/utils/guardian-context.ts)

Reads the project's archived guardian diff-coverage records and renders them as an advisory markdown block for the code-review pipeline. It lives at the CLI layer so the lower core package need not depend on intelligence, imports intelligence dynamically to avoid eagerly loading its heavy barrel, and degrades to `undefined` on any absent or malformed archive.

**Exports:** `loadGuardianCoverage`

## packages/cli/src/utils/version-guard.ts

[`packages/cli/src/utils/version-guard.ts`](/packages/cli/src/utils/version-guard.ts)

Decides whether the running CLI is too far out of step with the workspace it is pointed at to be trusted to emit findings, and installs that decision as a pre-action hook. It gates only the findings-producing commands and MCP tools — never `doctor`, `setup`, or `init`, since a guard that blocks its own remedy is a trap — and keeps the evaluation a pure function so it stays directly unit-testable.

**Exports:** `GUARDED_COMMANDS`, `GUARDED_MCP_TOOLS`, `VersionGuardStatus`, `ExpectedVersionSource`, `ExpectedVersion`, `VersionGuardResult`, `resolveCommandPath`, `findProjectRoot`, `resolveExpectedVersion`, `evaluateVersionGuard`, `installVersionGuard`
