# Changelog

## 0.40.0

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

- 0498381: Fix `check-arch --update-baseline` rewriting the committed arch snapshot on a feature branch
  when the base ref is unreadable (closing a gap in the per-PR allowance feature).

  The allowance feature routed `--update-baseline` to the snapshot-rewriting whole-snapshot path
  for EVERY resolution that was not `base-ref`. But a feature branch resolves to `working-tree`
  not only in the legitimate single-writer contexts (on the base branch, in a non-git dir, under
  `HARNESS_ARCH_FORCE_WORKING_TREE`) — it also falls back to `working-tree` whenever the base ref
  is merely unreadable: an unfetched worktree, a shallow clone, or a moved/unreadable base copy.
  In that case `--update-baseline` REWROTE `.harness/arch/baselines.json` on the branch (and
  without `--allow-regress` refused with "it WORSENS N metric(s)"), silently reintroducing the
  exact `baselines.json` merge cascade the allowance mechanism exists to prevent, so a legitimate
  value regression (e.g. `dependency-depth`, `module-size`) could never be acknowledged
  conflict-free.

  The whole-snapshot (snapshot-rewriting) path is now restricted to the contexts where it is
  actually correct — the base branch, a non-git dir, `HARNESS_ARCH_FORCE_WORKING_TREE` (the
  post-merge refresh-baselines job), and a genuine bootstrap where the base branch has no
  baseline at all. A feature branch whose base ref was unreadable but which already has a
  committed baseline now writes a per-PR allowance against the working-tree baseline instead,
  leaving `baselines.json` byte-identical. Aggregate category value regressions and warning-level
  new violations are both allowanceable; error-severity new violations are still never
  allowanceable — a genuine threshold breach must be fixed.
  - `resolveArchBaseline` now reports a `fallback` reason (`forced` / `non-git` / `base-branch` /
    `base-ref-unreachable` / `base-ref-absent` / `base-ref-invalid`) on every non-`base-ref`
    resolution, and a new `isWholeSnapshotContext(resolution)` helper encodes which contexts may
    rewrite the committed snapshot. Both are re-exported from `@harness-engineering/core`.

- 59590da: Arch baseline gating is now delta-vs-base with per-PR allowance files, ending the
  `.harness/arch/baselines.json` merge cascade.

  Previously a PR that added complexity failed the arch gate, and the only way to pass was
  `check-arch --update-baseline`, which REWROTE the shared `baselines.json` snapshot on the
  branch. The `merge=ours` attribute only resolves LOCAL merges, so GitHub's server-side
  3-way merge conflicted, and every merge into the trunk re-conflicted all other open PRs.

  Two additive changes fix it:
  - **Base-aware resolution** (`resolveArchBaseline`): in a PR context the gate compares
    current metrics against the base ref's committed baseline
    (`git show origin/main:…`, overridable via `HARNESS_ARCH_BASE_REF`) rather than the
    working-tree file — a true delta-vs-base. It is strictly fail-open: on the base branch,
    a fresh/detached checkout with no reachable base ref, a non-git directory, or an
    absent/invalid base copy, it falls back to today's working-tree behavior and never
    produces a false failure.
  - **Per-PR allowance files** (`.harness/arch/allowances/<branch>.json`): an intentional
    regression is acknowledged with a uniquely-named per-PR file (the same conflict-free
    one-file-per-PR pattern as changesets), so two branches never touch the same file. In a
    PR context `check-arch --update-baseline --reason "…"` WRITES an allowance instead of
    rewriting the snapshot; on the trunk it keeps the whole-snapshot behavior. The gate
    accepts a regression only when a present allowance covers it. Genuine NEW error-severity
    threshold violations are NEVER allowanced and still hard-fail — only the
    snapshot-commit requirement is removed, not the gate itself.

  The committed snapshot is now single-writer: only the post-merge baseline-refresh job
  advances it, and it also folds in and deletes consumed allowance files.

- e294b1d: check-deps no longer fails on cycles inside vendored `node_modules`: the CLI
  `findFiles` helper now applies core's shared `DEFAULT_FIND_FILES_IGNORE`. Adds a
  `deps.exclude` config block (minimatch globs) to suppress additional paths from
  check-deps discovery, threads it through both the layer-validation and
  circular-detection paths, attributes circular findings to their first-cycle
  file, and prints the analyzed-module denominator — failing rather than
  reporting clean when layers are configured but zero modules are analyzed.
  Exports `DEFAULT_FIND_FILES_IGNORE` from `@harness-engineering/core`. (#1188)
- 1e5db59: Promote two domain skills from advisory prose to load-bearing mechanical checks. `owasp-injection-prevention` gains `SEC-INJ-004`, which flags Prisma `$queryRawUnsafe`/`$executeRawUnsafe` called with interpolated or concatenated input (enforced by `harness-security-scan`). `a11y-aria-patterns` gains a new `AriaScanner` (`A11Y-014` aria-hidden on a focusable element, `A11Y-042` positive tabindex), invoked by `harness-accessibility`. Both checks fire only on statically-decidable values to keep false positives near zero. The CSRF, rate-limiting, and idempotency-key skills remain advisory — a low-false-positive mechanical check is not achievable for them without framework-aware data-flow analysis.
- 991adce: Add `harness check-deployment` — an enforcing pre/post-deploy gate backed by a
  pure `packages/core/src/deployment` engine. It verifies deployment readiness and
  exits non-zero on unambiguous, incident-causing violations so CI can gate a deploy:
  a hardcoded secret in a pipeline or committed env file (`DEPLOY-SEC001`,
  non-waivable), a deploy target with no rollback path wired (`DEPLOY-RB001`), and a
  direct-to-production deploy with no promotion/approval gate (`DEPLOY-ENV001`).
  Maturity gaps (missing stages, weak env separation, no health check, pipeline
  smells) are surfaced as non-blocking advisories. On a repo with no deployment
  configuration the gate abstains loudly (exit 3, never a false green); `enabled:
false` opts out explicitly (exit 0). The rollback requirement is satisfied by a
  `rollback` config block, a revert/rollback workflow or script, or a documented
  runbook, tying the pre-ship gate to the post-ship rollback circuit breaker. The
  gate is standalone and opt-in via `deployment.enabled` — it is not added to the
  default `ci check`.

  The `@harness-engineering/core` bump ships the new `deployment` engine module
  (detect + evaluate + exit-code) reused by the command.

- a6fb723: Add the `harness golden-build` reference-state primitive.

  A golden build is the canonical known-good reference state of the repo — an
  immutable, tag-like snapshot, distinct from the per-metric baselines (arch,
  coverage, benchmark) which are moving numeric ratchets. It answers "is the repo
  still the exact known-good shape we last trusted?" rather than "did metric X
  regress?".

  The snapshot is a composite fingerprint (SHA-256 per reference file) over a
  configurable set of reference files — by default the three metric-baseline files
  plus dependency/config identity anchors (`package.json`, the lockfile, the
  harness config). Hashing the baseline files means a golden sits _above_ them:
  a baseline rewrite moves the golden fingerprint too.

  Three subcommands:
  - `harness golden-build promote` — snapshot the working tree to
    `.harness/golden/manifest.json`. Byte-stable: a re-promote whose fingerprint
    is unchanged leaves the manifest untouched (informational provenance —
    `promotedAt`/`commit`/`branch` — is ignored by comparison and only refreshed
    when the fingerprint actually changes).
  - `harness golden-build verify` — compare the working tree against the golden
    and exit non-zero on any drift (changed, missing, or added reference file).
  - `harness golden-build diff` — explain what has drifted since the last golden
    (advisory; always exits 0).

  Configurable via an optional `golden` config block (`manifestPath`,
  `referencePaths`) and a repeatable `--path` override on every subcommand.

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

- d5760a7: Ship agent-rehearsal fixtures and the `harness rehearse` skill/command.

  `templates/rehearsal-fixtures/` now carries a set of tiny, self-contained,
  deliberately-broken fixtures — each planting exactly one failure mode that a
  real harness check is designed to catch: a hardcoded secret (`check-security`),
  an architectural layer violation and a circular import (`check-arch`), and a
  broken documentation link (`check-docs`). Each fixture ships a `rehearsal.json`
  manifest — the ground truth for what was planted, the check that should catch
  it, the expected fix, and a four-dimension scoring rubric.

  A new `harness rehearse` command drives them: `list` enumerates the fixtures,
  `show <id>` prints a manifest + rubric, and `score --fixture <id> --recovery
<record.json>` grades a structured recovery record with a deterministic,
  IO-free, LLM-free scorer (0-100 across `detected` / `correctCheck` / `fixed` /
  `noCollateral`, with pass/partial/fail tiers). The `harness:rehearse` skill
  (all four platforms) orchestrates the loop — stage a scratch copy, detect and
  repair the planted defect, assemble the record, and score. Use it to train
  personas before production trust, to regression-test the harness's own gates
  against known failure shapes, and to let adopters verify their gates fire.

  The scoring engine, catalogue loader, and contracts (`scoreRecovery`,
  `loadCatalog`, `findFixture`, `RehearsalManifest`, `RecoveryRecord`,
  `RehearsalScore`) are exported from `@harness-engineering/core`.

- 3aec4bd: Make the two skill required-section gates read one source of truth.

  The `harness skill validate` CLI validator and the `agents/skills` vitest
  structure test each maintained their own copy of the required-section lists,
  and they had drifted: the validator required `## Rationalizations to Reject`
  on behavioral skills while the structure test did not, so skills missing that
  section passed CI on the weaker gate.

  `@harness-engineering/core` now exports the canonical lists —
  `BEHAVIORAL_REQUIRED_SECTIONS`, `KNOWLEDGE_REQUIRED_SECTIONS`, and
  `RIGID_SECTIONS` — from a new `skills/required-sections` module. The CLI
  validator (`harness skill validate`) imports them instead of its former inline
  copies, so both gates derive their rules from the same constant and cannot
  silently diverge again. Validator behavior is unchanged; this is an
  internal dedup plus a new public export.

### Patch Changes

- 88ea428: Add `harness roadmap install-hook` — an adopter-facing installer for the roadmap
  aggregate-regeneration git hook (#688).

  Projects that shard their roadmap (`docs/roadmap.d/`) keep the generated
  `docs/roadmap.md` aggregate fresh with a `pre-commit` step that runs `harness
roadmap regen`. This command installs that step into an adopter's own hook,
  composing safely with an existing husky (`.husky/pre-commit`) or raw
  `.git/hooks/pre-commit` setup. It is idempotent (a fenced managed block is
  replaced in place, never duplicated, and never clobbers the adopter's own hook
  steps) and degrades gracefully when the project is not sharded (skips unless
  `--force`). CI (`harness validate`) remains the authoritative freshness contract;
  this hook is a local developer convenience.

  The `@harness-engineering/core` bump is the read-source invariant-R allowlist
  entry for the new command (the generated hook block names `docs/roadmap.md` as a
  git path, not a content read); no runtime behavior changes in core.

- 22c2686: Fix `check-docs` / `cleanup` file-discovery blind spots (#1146).

  Three independent blind spots made these gates report on an unrepresentative
  slice of a repo — and, in the degenerate case, a confident 100% green over zero
  files:
  - **`.mjs` / `.cjs` were invisible.** `checkDocCoverage` discovered source with
    `**/*.{ts,js,tsx,jsx}`; it now includes `.mjs`/`.cjs`, matching the entropy
    analyzer. Every ESM-first repo was previously invisible to docs coverage.
  - **Dot-directories were never traversed.** The shared `findFiles` now passes
    `dot: true`, so first-party source under a dot-directory (`.canary/`,
    `.config/`, …) is discovered. The genuine ignore list (`.git`,
    `node_modules`, the `.harness` runtime, virtualenvs, build/tooling caches)
    stays excluded. This also cures false `NOT_FOUND` drift findings from
    `cleanup --type drift`, whose exports index is built from the same discovery.
  - **A zero-file scan reported 100%.** `checkDocCoverage` now reports a `scanned`
    denominator and never returns a confident 100% when it read nothing; the
    `check-docs` command surfaces the abstention explicitly (distinct exit code,
    `x/y files documented` denominator on every run), mirroring the
    `check-security` precedent.

  Additionally, `check-docs` now honors `entropy.excludePatterns` from
  `harness.config.json` (previously hardcoded), so config governs it identically
  to the `harness ci check` path.

- 9255687: Deflake timing-sensitive tests that fail intermittently under `test:coverage`.

  Several suites spawn real git/node subprocesses (`baseline-resolver`,
  `derive-repo`, `git-scan`, `hotspot`, event-sourcing `concurrency` in core;
  `claim-coordination` and `orchestrator` integration in orchestrator) and one
  exercises a real HTTP receiver with a retry/backoff path (the core OTLP
  exporter). Under v8 coverage instrumentation plus parallel workers, those
  subprocess spawns are starved of CPU on loaded runners and intermittently blew
  tight timeouts — failing green code and blocking the pre-push gauntlet for every
  PR touching core (orchestrator is `--affected` by any core change).

  The fix is test-only and deterministic:
  - **core**: raise the global vitest `testTimeout` and the separately-budgeted
    `hookTimeout` (git init/cleanup runs in `beforeEach`) to a generous 60s
    ceiling, and widen the OTLP exporter's `vi.waitFor` budgets with a small poll
    interval.
  - **orchestrator**: the package `vitest.config` already sets a generous 90s
    `testTimeout`/`hookTimeout` for exactly this reason, but four
    `claim-coordination` tests and two `orchestrator` integration tests carried
    per-test `{ timeout: 15000 }` overrides that capped them _below_ that global,
    defeating the protection. Those caps are removed so the tests inherit the 90s
    ceiling.

  A larger ceiling only tolerates slow/loaded runners; a genuine hang still fails,
  so it cannot mask a real bug. No assertions were weakened, no tests skipped, and
  coverage is unchanged.

- 29bdefe: Speed up entropy/cleanup API-signature drift detection (~2.7x faster `harness cleanup`). Fuzzy export matching now builds the lowercased export index once per drift check instead of per unresolved reference, skips the edit-distance DP when a candidate's length differs by more than the max distance, and uses a bounded (diagonal-band) Levenshtein with an exact early exit. Detection output is unchanged.
- f91c9c4: Fix documentation-coverage scanner self-excluding when the checkout's own
  absolute path contains a skip-dir segment (notably `.claude`).

  `checkDocCoverage` matched its exclude globs against each file's absolute path
  as well as its scan-root-relative path. When the default skip-dir globs include
  `**/.claude/**` and the checkout lives under `<repo>/.claude/worktrees/<agent>/`
  (where `isolation: worktree` agents run), every file's absolute path contained
  `/.claude/` and matched, dropping all files. The denominator collapsed to zero,
  which — since the zero-denominator became a loud failure — produced
  deterministic false "stale docs" failures on those checkouts (CI was unaffected
  because CI checkouts are not nested under a skip-dir).

  The exclude globs now match the scan-root-relative path only, so the checkout's
  own path prefix can no longer self-match. A skip directory that genuinely lives
  inside the scanned tree is still excluded.

- af8b56f: Make the knowledge graph work inside git worktrees. `.harness/graph/` is
  gitignored, so `git worktree add` never copies it into a linked worktree and
  every graph read reported "No graph found". A new `resolveGraphDir` in
  `@harness-engineering/graph` lets reads borrow the main worktree's graph (located
  via git's `commondir` metadata) when the worktree has none, while writes stay
  worktree-local so a scan never clobbers the main graph and a worktree-local scan
  still takes precedence. All graph read paths (graph query/export/status,
  traceability, impact-preview, freshen, pre-merge-brief, signals, and the whole
  MCP graph surface via the shared loader) are routed through it.
- a766cda: Define the `owns:[paths]` owned-files declaration on plan tasks (#601). Adds a cheap, deterministic, graph-free pre-execution conflict forecast: `forecastOwnershipConflicts` and glob-aware `pathsOverlap` (via minimatch) flag task pairs whose declared owned paths overlap and so may conflict if run in parallel. `buildTaskGraph`/`planParallelization` now compute footprint overlap glob-aware and surface an `ownershipForecast` field on `ParallelizationPlan`. Fully additive — absent `owns` preserves current behavior.
- 2f5d572: Sharded roadmap: `groom` now archives `done` rows into a sharded archive
  (`docs/roadmap.d/archive/<slug>.md`) instead of the monolith
  `docs/roadmap-archive.md` when the project is in sharded mode. Each done shard is
  MOVED byte-for-byte (full frontmatter + body preserved), so the motion is lossless
  and reversible. The active read path already excludes the `archive/` subdirectory,
  so archived shards drop out of `load()`, the regenerated aggregate `docs/roadmap.md`,
  and active `show`/`query` — the archive is history, not active state. The monolith
  `groom` path is unchanged.

  New core store helpers: `archiveShards`, `restoreShards`, `readArchivedShards`,
  `archiveShardDir`, `ARCHIVE_SUBDIR`, and the project-level `archiveDoneShardsForProject`.

- e69f401: Fix two roadmap-sync writeback bugs that silently corrupted GitHub sync in sharded mode.
  - **#1036 (writeback aborted on title-slug ≠ frontmatter-slug):** `applyRoadmapDiff`
    addresses each shard by `slugifyFeatureName(feature.name)`, but a shard's real file
    identity is its frontmatter `slug` — frequently a hand-shortened / length-truncated
    form of the title. For rows where the two diverge, the writeback ENOENT'd and aborted
    the _entire_ batch, dropping every external-ID backfill and the `last_synced` stamp,
    and (worst case) re-creating a duplicate tracker issue on the next run. `ShardStore`
    now resolves the real shard by name-slug when the direct path misses, so `patchFeature`
    / `removeFeature` address the correct file without aborting.
  - **#1037 (`last_synced` never stamped on success):** `fullSync` never wrote
    `last_synced` on a clean apply — `applyRoadmapDiff`'s frontmatter branch only fires
    when before/after frontmatter differ (never here) and is a no-op in sharded mode — so
    `_meta.md` drifted arbitrarily stale even with zero errors. Added a `stampLastSynced`
    store operation (writes `_meta.md` in sharded mode, the aggregate frontmatter in
    monolith mode) and `fullSync` now stamps it on every successful non-dry-run writeback.

- 97ddd1c: Stop the CWE-798 secret detector flagging command-substitution values as
  hardcoded secrets.

  The reference-vs-literal guard already suppressed variable references
  (`$NAME`, `${NAME}`, `${NAME:-default}`) and CI expressions
  (`${{ secrets.X }}`). It still flagged a quoted **command substitution**, whose
  value is produced by running a command at runtime rather than embedded in
  source, e.g. `GH_TOKEN="$(gh auth token)"` or the backtick form. That fired a
  blocking `critical` on the ordinary, shellcheck-clean way to pass a token to a
  subcommand in a CI workflow.

  `isReferenceOnlySecretValue` now strips single-level `$( ... )` and backtick
  `` ` ... ` `` substitutions before its literal-residue check, so both the
  heuristic review-tier detector and the deterministic `SEC-SEC-*` rules stop
  mis-firing. Genuine literals — including a command substitution mixed with a
  literal suffix (`"$(id)-sk-live-..."`) and nested substitutions — are still
  detected.

- 817e40c: Extract secret values to the matching close quote, so shell env plumbing stops
  reporting as a hardcoded secret.

  The reference-vs-literal guard added for the `${{ secrets.X }}` false positive
  works, but the value handed to it was truncated. Both extractors used a
  character class excluding _both_ quote types — `["']([^"']{8,})` in the
  review-tier detector and `['"]([^'"]*)['"]` in `extractQuotedSecretValue` — and
  neither understood backslash escapes, so any value containing an inner quote
  came back as a fragment:

  ```sh
  GITHUB_TOKEN="$(sed -n 's/^GITHUB_TOKEN=//p' .env)"   # -> $(sed -n
  GITHUB_TOKEN="${GITHUB_TOKEN#\"}"                     # -> ${GITHUB_TOKEN#\
  ```

  Neither fragment parses as a command substitution or a brace expansion, so
  `isReferenceOnlySecretValue` saw literal residue and reported `critical`. Only
  values with no inner quote (`"${TOKEN:-}"`) were suppressed correctly — which is
  why the workflow-YAML class looked fixed while the shell class was not.

  Extraction is now quote-type aware and escape aware, so the value runs to the
  matching close quote. The closing quote stays optional in the review-tier
  pattern, so an unterminated string is still scanned rather than skipped.

  Verified against a real `.husky/pre-push`: 5 findings → 0. Literal secrets still
  fire, including a literal containing an escaped quote.

  Refs Capillary/capwell#1372, Capillary/capwell#1216.

- ad21769: Fix `check-security` scanning no `.mjs`/`.cjs` files, and report the scan
  denominator (#1084).

  The scan glob was `**/*.{ts,tsx,js,jsx,go,py,java,rb}`, so an ESM-only Node
  project got a scan that matched none of its source and a gate that passed because
  it read nothing — indistinguishable, in the output, from a genuinely clean run. In
  the repo where this surfaced, 144 tracked `.mjs` sources went unread while a
  security ledger recorded `securityScore: 100`; a planted AWS key was detected in
  `.ts` and `.py` and invisible in the byte-identical `.mjs`.

  The glob was duplicated across `check-security`, the CI check-orchestrator, and
  the dashboard's security gatherer, and the copies had drifted (the orchestrator's
  also omitted `java`/`rb`). It now has one home,
  `core/src/security/scan-targets.ts` (exported as `SECURITY_SCAN_GLOB` /
  `SECURITY_SCAN_EXTENSIONS` / `SECURITY_SCAN_DEFAULT_IGNORE`), with `mts`/`cts`
  added alongside `mjs`/`cjs`.

  `check-security` now also reports what it read: text output appends the
  files-scanned and rules-applied counts, JSON output gains `scannedNothing` and
  `stats`, and a zero-file scan emits an explicit ABSTAINED issue instead of
  presenting as clean. New `--fail-on-empty` makes that abstention blocking for CI
  gates; the default stays non-blocking so repos with legitimately no scannable
  source are not reddened by the upgrade.

  Behaviour change to expect: projects containing `.mjs`/`.cjs`/`.mts`/`.cts`
  sources will see findings that were previously invisible, including in
  `harness ci check` and the dashboard's security panel.

- d3e725d: Stop the security review flagging secret **references** as hardcoded secrets.

  Both the deterministic secret rules (`SEC-SEC-*`) and the heuristic review-tier
  secret detector match assignment shapes like `TOKEN="..."`. When the right-hand
  side is a variable or expression reference rather than a literal, nothing is
  embedded in source — the real value is resolved at runtime — so a
  "Hardcoded secret or API key detected" finding there is a false positive.

  The detectors now extract the matched value and suppress the finding when it is
  composed solely of references:
  - shell/env variables: `$NAME`, `${NAME}`, `${NAME:-default}`
  - CI expressions: `${{ secrets.X }}`, `${{ env.X }}`, `${{ vars.X }}`, and any
    `${{ ... }}`

  This mis-fired on essentially every pull request touching a CI workflow file
  (e.g. `GH_TOKEN="$AUTOAPPROVE_PAT"`, `TOKEN: "${{ secrets.FOO }}"`), and in
  floor-only review mode it produced a blocking request-changes verdict. Genuine
  hardcoded literals — including values with a variable-only prefix such as
  `"${PREFIX}sk-live-..."` — are still detected. The shared reference check lives
  in `security/secret-reference.ts` so both detection tiers benefit.

- 5a454d5: Make the architecture baseline file (`.harness/arch/baselines.json`) a pure
  function of its metrics, eliminating spurious merge-conflict churn.

  `ArchBaselineManager.update` now preserves the `updatedAt`/`updatedFrom` stamps
  when a refresh does not actually change any metric, and `capture` sorts each
  category's `violationIds`. A no-op regeneration therefore produces a
  byte-identical file, so a PR that moves no metric never touches the baseline —
  and no longer conflicts with `main` on every merge. (The `merge=ours` git
  attribute only resolves this file for _local_ merges; GitHub's server-side merge
  cannot run a custom driver, so any diff here surfaces as a conflict there.)
  Genuine metric changes still bump the stamps and update the values as before.

- c9076aa: Fix STRENGTH-005 (`tier-default`) false positive in toolkit mode.

  The toolkit-mode detector matched any line where `basic` merely co-occurred with
  `default`/`recommend`, so after the init skill began recommending
  `load-bearing-minimum` as the default (with `basic` offered as an explicit
  opt-down), the audit falsely reported that the init skill "recommends the `basic`
  tier by default" — the opposite of the truth.

  The regex now fires only when `basic` sits adjacent (within ~40 non-newline
  characters, in either direction) to a `default`/`recommend` token, so a line that
  names `basic` as an opt-down far from the recommendation no longer trips the rule
  while a genuine "defaults to basic" still does. The init skill's wording is also
  adjusted so `basic` and `default`/`recommend` no longer share a line, giving the
  fix defense in depth. A regression test pins both the real-world opt-down phrasing
  (must not fire) and a literal default-to-basic line (must fire).

- 0922728: Tier the skill catalog with first-class curation metadata and surface it.

  Skills now carry a first-class `catalog_tier` field in `skill.yaml` (`0` =
  load-bearing gear, `1` = library / on-demand reference — the default, `2` =
  deprecated / retire candidate). This is distinct from the existing `tier` field,
  which governs slash-command/catalog _loading_; the new axis names how
  load-bearing a skill is. The premise: a senior engineer can hold ~12 skills in
  their head, not hundreds — so the twelve load-bearing gear skills are marked and
  surfaced first.

  The tier is genuinely wired through the surfaces a reader sees:
  - **Skills Catalog** (`docs/reference/skills-catalog.md`) leads with a
    "Load-Bearing Gear (Tier-0)" section and annotates non-default entries with
    their curation tier.
  - **README** gains a "Load-bearing skills (Tier-0)" table mapping each gear skill
    to its slash command.
  - **Dashboard command palette** pins the load-bearing skills in their own section
    above the category groups and badges each card (`@harness-engineering/dashboard`).

  The `@harness-engineering/cli` bump adds the `catalog_tier` field to the skill
  metadata schema. The `@harness-engineering/core` bump tracks the
  `initialize-harness-project` → `harness-initialize-project` skill rename in the
  harness-strength init-skill path (the STRENGTH-005 rule and context loader); no
  runtime behavior changes.

  The load-bearing init skill is renamed from `initialize-harness-project` to
  `harness-initialize-project` so it sorts with the rest of the workflow gear. The
  slash command is unchanged — it stays `/harness:initialize-project`.

- Updated dependencies [21df39b]
- Updated dependencies [fc20e42]
- Updated dependencies [b83b45b]
- Updated dependencies [af8b56f]
- Updated dependencies [d6c160c]
- Updated dependencies [5c72805]
- Updated dependencies [7369e11]
- Updated dependencies [de52864]
- Updated dependencies [a766cda]
  - @harness-engineering/types@0.27.0
  - @harness-engineering/graph@0.12.0

## 0.39.0

### Minor Changes

- 931cca0: feat(review): enforce finding-integrity invariants at the emission seam (#984)

  `harness review-ci`'s floor tier emitted a `critical` / `domain: security` /
  `CWE-89` finding whose entire evidence was a file-length measurement, blocking a
  PR on a fabricated SQL injection. Two structural invariants now run at the single
  aggregation point (pipeline Phase 5.75, plus a matching pass over LLM-tier
  findings in the CI orchestrator) rather than inside each agent:
  1. **Evidence/class consistency** — a finding claiming a vulnerability class (a
     `cweId`, an `owaspCategory`, or `domain: 'security'` at `critical`) must carry
     evidence consistent with that class. Each class declares what its evidence
     must minimally reference (CWE-89 needs a query shape, not a line count).
     Failures are **downgraded to `suggestion`** with the mismatch recorded on the
     finding — never silently dropped, so a real vulnerability described in unusual
     language survives. Configurable to `drop` via
     `findingIntegrity.onEvidenceMismatch`.
  2. **Confidence reconciliation** — `confidence` may not exceed the ceiling implied
     by `validatedBy` (heuristic caps at `medium`) and `trustScore`. Severity is
     untouched by default, so detection is not weakened; the stricter
     "no heuristic criticals" rule is opt-in via
     `findingIntegrity.capHeuristicSeverity`.

  Both surfaces report a **denominator**: `integrityReport.examined` plus the
  per-invariant counts, and `abstained: true` when the layer examined nothing — an
  empty run can no longer read as verification.

  `deduplicateFindings` now carries `integrityViolations` through a merge; it
  previously rebuilt findings field-by-field and would have dropped the audit
  trail.

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

- 52e42cb: fix(core): check-harness-strength honors core.hooksPath and never reads partial coverage as solid

  Two companion defects in the STRENGTH auditor:

  **Hook discovery ignored `core.hooksPath` (#1012).** `buildProjectContext` read a
  single hardcoded `.husky/pre-commit` and `resolveHookFiles` searched only
  `.husky` / `.claude/hooks` / `.harness/hooks`. A repo wiring hooks via
  `.githooks/` + `git config core.hooksPath .githooks` (a common non-husky
  convention) therefore had `ctx.preCommit === null`, silently disabling
  **STRENGTH-002 (regression-baseline)** and **STRENGTH-003 (skip-discipline)** —
  the two patterns most specifically about pre-commit behavior — while still
  scoring `solid`. Discovery now resolves `core.hooksPath` from the repo-local
  `.git/config` (file-based, so the auditor stays child_process-free and
  unit-testable), includes that directory in `resolveHookFiles`, and sets
  `ctx.preCommit` from `<resolvedHooksDir>/pre-commit` (falling back to `.husky`
  then `.git/hooks`).

  **Non-evaluable patterns scored as a clean solid (#1013).** When a rule could
  not be evaluated (required input absent) it contributed nothing to the score and
  nothing to the output, so "we could not audit this" read identically to "we
  audited this and it was clean" — a repo where every pattern abstained scored
  100/100 `solid`. The auditor now:
  - reports `summary.rulesApplicable` (the coverage denominator) and
    `summary.skipped: [{ id, gearPiece, reason }]` (the named abstentions);
  - withholds `solid` when coverage is partial, using a new `incomplete` tier so a
    clean score across only some applicable patterns no longer reads as a full
    pass (weaker tiers already signal detected problems and are unchanged);
  - the CLI prints `coverage: N/M patterns evaluated` and lists each skipped
    pattern, so the gap is visible and actionable rather than invisible.

- bc96342: fix(review): stop the security floor tier emitting fabricated criticals (#984)

  The no-LLM security floor was reporting blocking `critical` findings for strings
  that cannot reach any sink. Three false-positive classes, all observed on real PRs:
  - **Prose using a SQL keyword as an English word.** A `commander` help string —
    `'never create a ticket for a row lacking an externalId … ' +` — was reported
    as critical CWE-89 because "create" whole-word-matches `CREATE` and the
    literal is followed by `+`. Same class as issue #657, whose string-boundary
    fix was necessary but not sufficient.
  - **Test fixtures.** A test proving a detector fires must contain the vulnerable
    shape as data, so any PR touching a security test self-flagged.
  - **Comment bodies.** A JSDoc documenting the shape a rule detects necessarily
    contains it; the rule's own JSDoc was reported as a critical CWE-89.

  The fixes:
  - **SQL: ordered statement shapes.** A statement keyword alone is not evidence
    of SQL. The pattern now requires an ordered shape (`SELECT … FROM`,
    `INSERT INTO`, `UPDATE … SET`, `DELETE FROM`, `CREATE/ALTER/DROP TABLE`,
    `UNION SELECT`) inside a concatenated string literal or an interpolated
    template literal. The vocabulary deliberately mirrors `SQL_QUERY_SHAPE` in
    `finding-integrity.ts`, so nothing the floor emits is downgraded by the
    Phase 5.75 integrity invariant (#989) — one definition of "looks like SQL",
    not two. The template alternative does not require a closing backtick, so the
    opening line of a multi-line template query still fires.
  - **Comment-only lines are skipped; comment PREFIXES are not.** `/**/ eval(x)`,
    `*/ eval(x)`, and generator members (`*run() { … }`) execute and are scanned;
    a trailing `//` comment is stripped without truncating at a URL's `://`.
  - **Guards are code-scoped.** Test-file markers (`.test.`, `.spec.`, …) and JS
    comment syntax apply only to files with code extensions, so `.env.test.local`
    and a key in a Markdown bullet are still scanned. The secrets detector keeps
    its deliberately wider file scope.

  Known, test-pinned limitations (a heuristic floor, not a proof of absence): a
  SQL shape split across concatenated literals or lines does not fire (loosening
  to line level would resurrect the prose class), nested quotes are not spanned
  (pre-existing), and a bare clause fragment (`` `WHERE id = ${id}` ``) no longer
  fires. The LLM review tier above the floor covers those shapes.

  50 tests pin both directions — every guard has a must-fire case proving it
  cannot over-suppress, plus a cross-layer test asserting detector output
  survives `enforceFindingIntegrity` undowngraded.

- 0f2ab19: fix(harness-strength): STRENGTH-003 resolves a variable skip list (`--skip "$SKIP"`)

  The skip-list auditor matched only a literal `--skip a,b,c`, so a hook using the drift-free
  `SKIP="a,b,c"` + `--skip "$SKIP"` single-source form went unaudited — silencing the review-time
  signal that flags a growing/hollow local gate. The matcher now captures quoted/bare/variable
  tokens and, for a `$VAR`/`${VAR}` reference, resolves the matching `VAR="a,b,c"` assignment in
  the same file (unresolvable → skipped gracefully). Literal-match path unchanged.

- Updated dependencies [0f64b7d]
- Updated dependencies [21325cf]
- Updated dependencies [0921ca1]
  - @harness-engineering/types@0.26.0
  - @harness-engineering/graph@0.11.12

## 0.38.1

### Patch Changes

- Updated dependencies [bb4de5e]
  - @harness-engineering/types@0.25.0
  - @harness-engineering/graph@0.11.11

## 0.38.0

### Minor Changes

- 809d327: feat(analysis): repo-shape awareness — `analysis.exclude` config + pytest support in test-craft (#898)

  Analysis tooling assumed a JS/single-app repo shape. On toolset/overlay repos
  (mixed Python + TS, vendored dirs, flat script sets) the entropy/graph
  scanners were noise-dominated and test-craft silently skipped whole Python
  test suites. Two changes:

  **Project-wide `analysis.exclude` config (precedent: `design.exclude`):**
  - New optional top-level `analysis.exclude` glob list in `harness.config.json`,
    applied ON TOP of each scanner's own excludes so vendored/generated paths
    are declared once. Honored by `detect_entropy`, `run_security_scan`, graph
    code ingestion (`harness graph scan` / `ingest` and the `ingest_source` MCP
    tool — the latter previously ignored `ingest.*` config entirely), and the
    CI check orchestrator (docs, entropy, and security checks).
  - `runEntropyCheck` in the CI orchestrator now passes `entropy.excludePatterns`
    through to the analyzer (previously dropped on that path).
  - `DEFAULT_FIND_FILES_IGNORE` (core `findFiles`) is now sourced from the
    shared `DEFAULT_SKIP_DIRS` walker skip-list instead of a drifted 4-entry
    copy — `.venv`, `venv`, `__pycache__`, `vendor`, caches, and AI-agent
    sandboxes are excluded consistently across every scanner sharing the walker.

  **test-craft learns pytest (fifth framework):**
  - Discovery now matches `test_*.py` / `*_test.py` (skipping `__pycache__`,
    `venv`, `vendor`); extraction is a light-parse (regex + indentation) walk
    capturing `def test_*` functions, `class Test*` nesting, and
    `@pytest.mark.skip/skipif` markers into the same `ExtractedTest` shape the
    critique pipeline already consumes — the 8 seed rubrics are
    language-agnostic and apply unchanged.
  - Source pairing understands Python conventions (`tests/test_foo.py` →
    `src/foo.py`, sibling, and flat-package layouts).
  - `pytest` joins the `frameworks` filter on the CLI (`--frameworks pytest`),
    the MCP tool enum, and `frameworksDetected` in the summary — so Python
    suites are critiqued instead of silently reporting an empty pass.

### Patch Changes

- c14320e: fix(arch): give the architecture ratchet a noise tolerance so merging `main` stops forcing `baselines.json` rewrites

  The architecture baseline flagged a regression on _any_ aggregate increase
  (strict `agg.value > baselineValue` in `diff()`), while the coverage and
  benchmark ratchets already absorb run-to-run jitter with a tolerance. That
  asymmetry made `baselines.json` a constant merge-conflict source: when a branch
  merged `main`, main's legitimately-grown totals (e.g. total complexity 283→284,
  module size +119 bytes) counted as _the branch's_ regression against its now
  stale baseline, so the pre-commit gate forced `check-arch --update-baseline`.
  Every concurrent PR rewrote the file to slightly different values and they
  conflicted with each other — and because `.gitattributes` `merge=ours` is inert
  on GitHub's server-side merge, they conflicted there too.

  `ArchConfig` now carries a `regressionTolerance` (fraction, default `0.01`).
  `diff()` accepts it and allows `baselineValue + floor(baselineValue * tolerance)`
  before reporting a regression, so sub-tolerance merge drift no longer trips the
  gate. It self-scales: 1% of a ~300 complexity total is ~3, but 1% of a max-depth
  of 5 floors to 0, so shallow-integer metrics stay strict. Genuine regressions
  (which move the aggregate far past the tolerance) still fail. `diff()` defaults
  to a strict `>` when no tolerance is supplied, so the pure-function contract is
  unchanged.

  Also makes the no-release changeset marker robust to prettier: the empty-marker
  detector in `scripts/check-changesets.mjs` now parses frontmatter by line and
  accepts both `---\n\n---` and prettier's collapsed `---\n---`, so no-release
  markers no longer need a per-PR `.prettierignore` entry (those entries were
  themselves a recurring conflict source).

- 4bd325b: feat(analyses): consume guardian diff-coverage findings from `.harness/analyses/` (#914)

  Define a harness-owned, tolerant, advisory `GuardianAnalysis` contract
  (`schema: harness.guardian.diff-coverage`) plus a degrade-safe reader that lists
  `.harness/analyses/`, selects guardian records by discriminator, validates with
  zod, and skips unknown/malformed shapes without ever throwing. Wire it into three
  review consumers:
  - `outcome_eval` folds the guardian signal into the verdict rationale (never
    affects TS-derived authority).
  - `pre-merge-brief` surfaces a Guardian diff-coverage section and adds flagged
    records to "Worth your eyes".
  - `harness-code-review` (the 7-phase `runReviewPipeline`) surfaces the guardian
    summary as an advisory context file on every review bundle the agents receive.
    Read caller-side at the CLI layer (`run_code_review` MCP tool + `agent review`
    command) and passed in as plain data, so `@harness-engineering/core` never
    depends on `@harness-engineering/intelligence`.

  A missing/empty/malformed archive leaves every consumer byte-identical to today.

- d965516: Tighten the review division-by-zero heuristic so it no longer flags
  path-like slashes. The detector matched any `x/y`, so a scoped-package
  import (`@harness-engineering/types`) read as a division — reddening the
  floor-only (no-LLM) required-review tier on essentially every code PR.
  It now skips `import`/`export` lines, comment/URL slashes, and requires a
  real spaced division shape (`a / b`) with a variable/paren divisor — which
  is how division always appears in a prettier-formatted codebase. Real
  division is still detected; scoped imports and paths are not.
- afd1099: fix: four downstream-consumer papercuts (#902)

  Repos that consume the harness CLI as a dev-dependency and layer their own
  skills on top (downstream overlay repos) hit four generator/tooling gaps:
  1. **doctor remedy typo** — the architecture-baseline remedy said
     `harness check-arch --update`; the real flag is `--update-baseline`.
  2. **`roadmap.tracker.repo` default** — when `roadmap.tracker.kind` is
     `github` but `repo` is unset, both tracker-config loaders now derive
     `owner/repo` from `git remote get-url origin` (https, ssh, and scp-style
     URLs, with or without `.git`). Explicit config still wins; with no origin
     remote the previous missing-repo handling applies, with a clearer error.
  3. **skills-index provenance + overlay skills** — `buildIndex` labeled
     entries by array position, so a repo without project skills had the entire
     bundled catalog labeled `source:"project"`, and the `projectRoot` argument
     was ignored, so a downstream repo's own `agents/skills/<platform>/` skills
     were never indexed when cwd was elsewhere. Provenance now travels with each
     directory (`resolveAllSkillsDirsWithSource`) and `projectRoot` is honored.
  4. **generated-hook clobber guard** — `initHooks` now records install-time
     content hashes in `.harness/hooks/profile.json` and, on regeneration,
     preserves (and warns about) hook files whose content no longer matches the
     recorded hash instead of silently overwriting hand-edits. `harness hooks
init --force` restores the old overwrite behavior. Installs predating hash
     recording keep the legacy refresh behavior.

- 7d05321: fix(entropy): stop the doc-drift detector flooding docs-heavy repos with false positives (#816)

  `harness cleanup --type drift` (and the `detect-doc-drift` skill) treated every
  backtick-quoted markdown token as a reference to a top-level TypeScript export,
  producing ~100% false positives on prose- and spec-heavy repos — 36,697
  findings on this repo alone, essentially all noise, which buried real drift and
  made the `harness-docs-pipeline` DETECT phase unusable.

  Reference extraction and resolution are now discriminating:
  - **Extraction requires a code signal.** A backtick token is only kept when its
    base identifier segment carries a structural marker (uppercase, digit, or
    underscore) or it is written as a call (`foo()`). Bare prose words (`done`,
    `local`, `grep`) and lowercase-headed code-example fragments (`db.query`,
    `hooks.afterCreate`) are dropped. The non-TS source-file extension list is
    expanded (`.py`, `.rs`, `.go`, …) so cited files from other languages are not
    mistaken for symbols. This stays language-agnostic: `snake_case` and
    `SCREAMING_SNAKE` tokens are kept because they are real symbols in
    Python/Rust/Go.
  - **Change specs are forward-looking.** `docs/changes/**` (proposals and phase
    plans that describe proposed/illustrative code) join
    `docs/architecture|decisions|proposals|adr` in the default forward-looking
    suppression set.
  - **Dotted references resolve by their head.** `User.email` is validated
    against `User` (the only symbol the export map actually tracks) instead of the
    full dotted path, so genuine member accesses are no longer flagged.
  - **Convention suppression is language-aware.** `snake_case` / `SCREAMING_SNAKE`
    doc tokens are suppressed only when the codebase exports nothing of that
    convention — a TS project (no snake_case exports) stops flagging MCP tool
    names and config keys, while a Python/Rust/Go project keeps flagging genuinely
    removed snake_case symbols.

  On this repo the detector drops from 36,697 to ~2,600 findings (94% fewer
  api-signature findings) with zero regressions to the existing #492 and #723
  multi-language coverage. The residual (camelCase parameter names, env vars,
  broken links) is the class that only graph `documents`-edge detection can fully
  resolve, tracked separately.

- bad5b81: fix(review): SQL_CONCAT_PATTERN no longer flags prose as CWE-89 (#657)

  The security floor reviewer's `SQL_CONCAT_PATTERN` matched a bare SQL keyword
  followed anywhere on the line by `+ <word>`, so arithmetic-style prose such as
  the markdown heading `UPDATE (medium + large tiers)` fired a `critical` CWE-89
  "SQL injection" finding. Because `required-review` blocks on `critical` and the
  floor tier runs without LLM adjudication when no `ANTHROPIC_API_KEY` is present,
  a single prose false positive hard-blocked unrelated PRs (hit PR #656).

  The pattern now requires the SQL keyword to live **inside a quoted string
  literal or template literal** that is actually concatenated (`… " + userId`) or
  interpolated (`` `SELECT … ${userId}` ``) — the genuine injection shape. Prose
  keyword-plus-`+` no longer matches, while genuine
  `db.query("SELECT * FROM users WHERE id = " + userId)` still flags CWE-89. As a
  bonus the template-literal alternative now also catches a keyword that precedes
  its `${…}` interpolation (previously only keyword-after-interpolation matched).

- 5038b56: The review bug-detection heuristics (division-by-zero, empty-catch) now only
  scan code files. They read raw lines and match code patterns, so running them
  on non-code files produced false positives — most notably a `/` in a scoped
  package name inside a Markdown changeset (`@scope/pkg`) read as a division,
  flagging every publishable PR's changeset as "potential division by zero" in
  the floor-only (no-LLM) review tier. Gated both detectors to
  `.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts` via an `isCodeFile` check.
- e203b5e: Sharpen the floor-tier review heuristics so they stop firing on benign code
  and docs (they were reddening the required-review gate on ordinary PRs):
  - **SQL injection**: match SQL keywords as whole words, so prose like
    `was updated` / `files created` in a log line or template literal no longer
    reads as an `UPDATE`/`CREATE` query; and skip non-code files (a Markdown
    table with the word "updated" was flagged as SQL injection).
  - **Division-by-zero**: only flag a lowercase variable (or parenthesised)
    divisor — a SCREAMING_CASE constant (`/ DAY_MS`) or numeric literal cannot
    be zero at runtime.

  Real SQL concatenation and real variable division are still detected.

- dc3c932: fix(roadmap): stop `manage_roadmap` write actions from destructively re-serializing a hand-authored monolith (#839)

  In single-file mode, every `manage_roadmap` write (`promote`, `add`, `update`,
  etc.) persisted through `MonolithStore.write()`, which unconditionally
  re-serializes the whole `docs/roadmap.md` from a model that captures only a fixed
  set of single-line fields. Any hand-authored content the model does not model was
  silently discarded on the round-trip: multi-line `- **Summary:**` bodies
  truncated to their first line, `- **Issue:**` links dropped, `>` blockquote
  intros and HTML comments deleted. On a ~1100-line hand-maintained roadmap this
  lost ~957 lines.

  `MonolithStore.write()` now refuses rather than destroys: before overwriting it
  scans the on-disk file with a new `findUnpreservedLines` guard and returns a
  `write-failed` error (never writing) when the file carries content a whole-file
  rewrite would drop, pointing the user to shard the roadmap (`docs/roadmap.d/`,
  which does surgical per-row writes) or remove the unmodeled content. Cosmetic
  normalizations the serializer legitimately makes — canonicalizing the H1 title to
  `# Roadmap`, stripping `Milestone:`/`Feature:` heading prefixes, and bumping
  frontmatter timestamps — are tolerated, so canonically-formatted and real-world
  roadmaps still write normally. The sharded backend and aggregate regeneration are
  unaffected; the guard is single-file-only.

- bd850a8: chore(security): suppress self-referential SEC-\* scanner false positives

  Reword comment-only false positives and add inline `harness-ignore`
  suppressions for the security scanner's own definitional patterns
  (`injection-patterns.ts`) and the anti-bypass hooks that necessarily name the
  flags they block. Comment/suppression-only — no runtime behavior change.

- Updated dependencies [1de3ce4]
- Updated dependencies [84bd986]
- Updated dependencies [77815a8]
- Updated dependencies [0c9a304]
- Updated dependencies [c4c1dd3]
- Updated dependencies [af503e4]
- Updated dependencies [fac4261]
- Updated dependencies [3e5f0ca]
- Updated dependencies [a0ef808]
- Updated dependencies [545e818]
- Updated dependencies [3b2b8ba]
- Updated dependencies [f460e42]
- Updated dependencies [e3bd99e]
- Updated dependencies [84bd986]
- Updated dependencies [f8c9dd9]
  - @harness-engineering/types@0.24.0
  - @harness-engineering/graph@0.11.10

## 0.37.1

### Patch Changes

- Updated dependencies [ef62251]
  - @harness-engineering/types@0.23.0
  - @harness-engineering/graph@0.11.9

## 0.37.0

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

### Patch Changes

- Updated dependencies [eb74585]
  - @harness-engineering/types@0.22.0
  - @harness-engineering/graph@0.11.8

## 0.36.0

### Minor Changes

- d8df71d: AMR single-agent quality escalation is now live (completes ADR 0069). The
  escalation mechanism + seam were already complete; this adds the _sound_
  quality-verdict source that was missing: a **baseline-relative** security scan of
  the diff a single-agent dispatch introduced.

  On a normal single-agent exit, when AMR is active, the orchestrator scans only the
  **added lines** of the agent's changes (working-tree diff vs the merge-base of the
  worktree and the base ref, so a base branch that advanced mid-dispatch never
  attributes other merges to the agent; the seeded handoff overlay is excluded). A
  **new error-severity** security finding on an added line → `quality-fail`, which
  climbs the coherence unit's escalation floor. This is sound (not approximate)
  because every security rule is single-line, so per-added-line matching yields
  exactly the findings the agent introduced — pre-existing patterns never count.

  Success stays escalation-neutral (never a premature `quality-pass`, per ADR 0069).
  Fully guarded — any git/scan error degrades to neutral, never breaking completion —
  and a **no-op when AMR is off** (dispatch stays byte-identical). Staged workflows
  already escalate on their per-stage gate; this is the single-agent equivalent.

  Adds `WorkspaceManager.getIntroducedDiff` and `SecurityScanner.scanFileContent`
  (fileGlob-aware in-memory scanning).

### Patch Changes

- Updated dependencies [681e173]
- Updated dependencies [f004f04]
- Updated dependencies [ec649e6]
- Updated dependencies [abbaa89]
- Updated dependencies [ea36b3c]
- Updated dependencies [787e033]
- Updated dependencies [0c8e2ac]
  - @harness-engineering/types@0.21.0
  - @harness-engineering/graph@0.11.7

## 0.35.0

### Minor Changes

- 7527285: Add the `harness:rollback` post-ship revert primitive (roadmap #533). When a merged PR crosses a tracked signal threshold, the engine classifies revert-readiness (clean in-memory `git merge-tree` revert + no dependent later merge) and opens a full-context revert PR — **propose-only in v1; it never auto-merges** (ADR 0063). Adds `classifyRevert`/`RollbackDecision` to core, the `harness rollback evaluate` and `harness rollback sweep` CLI commands, the propose-only `rollback-propose.yml` workflow, a `rollback` config block, and a flag-gated dark eval arm (activates once outcome-eval runs post-merge, #31).

### Patch Changes

- Updated dependencies [db24d89]
- Updated dependencies [eb8435f]
- Updated dependencies [be3c714]
  - @harness-engineering/types@0.20.0
  - @harness-engineering/graph@0.11.6

## 0.34.1

### Patch Changes

- Updated dependencies [bae23ad]
  - @harness-engineering/types@0.19.0
  - @harness-engineering/graph@0.11.5

## 0.34.0

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

### Patch Changes

- Updated dependencies [965cfd3]
  - @harness-engineering/types@0.18.0
  - @harness-engineering/graph@0.11.4

## 0.33.0

### Minor Changes

- fc0220f: feat(adoption): add `harness:catalog-retrospective` skill and `harness adoption retrospective` command. Reads `.harness/metrics/adoption.jsonl` and reports top-invoked, top-failing, and abandoned-mid-workflow skills, flags ever-invoked stale skills, and surfaces catalog telemetry coverage, writing a dated report to `docs/retrospectives/<date>.md`. Core adds `getCatalogRetrospectiveReport` / `renderRetrospectiveMarkdown` / `isAbandonedMidWorkflow`.
- 3d772e9: Standardize parallel execution as an automatic part of the build loop. Adds a `PlanTask.dependsOn` schema (`@harness-engineering/types`), a `planParallelization` planner in `@harness-engineering/core` that composes the existing `findParallelGroups` wave-grouper and `predict_conflicts` into a `ParallelizationPlan` (dependency-DAG waves with risk-tiered firing — `auto-dispatch`/`confirm`/`serialize` — a cross-bucket ordering cap, and deterministic narration), and a `plan_parallelization` MCP tool (`@harness-engineering/cli`). The autopilot/execution/planning/parallel-agents skills now consume it to dispatch sound parallel waves without being asked, announce-and-proceed for clean waves and pausing only for genuinely uncertain ones. See ADRs 0056 (risk-tiered non-blocking dispatch) and 0057 (dependsOn plan-task schema).

### Patch Changes

- Updated dependencies [3d772e9]
  - @harness-engineering/types@0.17.0
  - @harness-engineering/graph@0.11.3

## 0.32.1

### Patch Changes

- abcd026: fix(roadmap): make merge-triggered auto-done resilient to malformed closing keywords

  Roadmap rows stayed `planned` after their PR merged when the PR body's closing
  keyword was malformed (e.g. `Closes roadmap #569` — the intervening word breaks
  GitHub's parser), leaving `closingIssuesReferences` empty so auto-done had nothing
  to reconcile.
  - **Backstop:** `roadmap-auto-done.yml` now, when the formal closing references are
    empty, parses issue references from the PR body+title, keeps only those closed as
    completed, and feeds the existing `roadmap reconcile --from-refs` (rows flip only
    on a matching `External-ID`; unmatched refs are ignored).
  - **New pure parser** `parseReferencedIssues` (`@harness-engineering/core`) and a
    testable `harness roadmap referenced-issues` CLI subcommand back the fallback.
  - **Prevention:** autopilot's PR-creation guidance now emits a bare `Closes #<N>`
    (keyword immediately before the ref) derived from the roadmap row's External-ID.

- 52a2410: fix(entropy): honor `entropy.drift` config on the entropy/CI paths and resolve Python symbols

  The api-signature doc-drift detector flooded non-TS projects with false
  positives and offered no honored way to scope or disable it.
  - **Config now threaded (issue #723).** `detect_entropy` (MCP), `run_ci_checks
entropy`, and `harness cleanup` previously built the analyzer with
    `analyze.drift` as a boolean, so it always fell back to
    `DEFAULT_DRIFT_CONFIG`. The CLI config schema also had no place to put drift
    settings. A new `entropy.drift` block (`checkApiSignatures`, `ignorePatterns`,
    `forwardLookingPaths`, `checkStructure`, `docPaths`) is now validated and
    threaded into `analyze.drift` at all three call sites. The MCP handler now
    loads `harness.config.json`, which also fixes `assess_project`.
  - **Python symbols now resolve.** The tree-sitter Python export extractor
    matched raw node types on `module.children`, missing decorated classes
    (`@dataclass`), top-level constants, and all class-body members (dataclass
    fields, enum members, methods) — so documented references to them were
    wrongly flagged as api-signature drift. Extraction now unwraps
    `decorated_definition` / `expression_statement` and descends one level into
    class bodies. Underscore-prefixed members stay private.

- 0c3d8ed: fix: make `harness graph scan` the canonical graph command and deprecate the top-level aliases

  `scan`/`query`/`ingest` are now canonical under the `graph` group
  (`harness graph scan`, etc.) — the form the post-update hook, fallback hints,
  and docs already reference. All user-facing hints now point at
  `harness graph scan`.

  The bare top-level `harness scan`/`query`/`ingest` commands are retained as
  hidden, deprecated aliases: they still run (so existing scripts, CI jobs, and
  muscle memory keep working) but print a one-line deprecation notice to stderr
  directing users to the `harness graph <op>` form. They will be removed in the
  next major. No command is removed in this release, so the change is
  non-breaking.

## 0.32.0

### Minor Changes

- 854b142: Event-sourced state model with a deterministic reducer (#598).

  Replaces the mutated `.harness/state.json` with an append-only event log
  (`state.events.jsonl`) + a deterministic reducer composed of pure projections
  (`coreState` / `lanes` / `audit`) + a materialized snapshot (`state.snapshot.json`).
  Concurrent writers append lock-free with a collision-free `(seq, writerId)` total
  order, eliminating the last-write-wins clobbering of the previous read-modify-write
  model. Legacy `state.json` is migrated via a one-time `state_imported` genesis event.

  Adds an explicit guarded lane state machine for orchestrator/autopilot task lanes
  (`planned → claimed → in_progress → in_review → done`, plus `blocked`/`canceled`)
  with dependency, evidence-for-terminal, and forced-transition guards; the
  orchestrator persists lane transitions durably via the core log.

  Subsumes the Append-Only Session Audit Trail (GH-580): verbatim user input and
  approval prompt/response pairs are captured as audit events. The born-deduplicated
  `events.jsonl` is retired — the observability timeline now derives from the audit
  projection, and skill-lifecycle telemetry is relocated to
  `.harness/metrics/skill-events.jsonl`.

  BREAKING (internal): the deprecated `saveState`/`loadState` exports are removed;
  all state reads/writes now flow through the event-sourced store.

- 09524aa: Reconcile health-snapshot `passed` flags with active signals (#528). A captured snapshot could report a check as `passed: true` while `signals[]` listed a contradicting problem, so the harness's own self-model — consumed by skill dispatch, recommendation, and insights — reported false-green.

  `core` gains a canonical `health-signals` contract: a single `SIGNAL_REGISTRY` from which `CHECK_SIGNAL_MAP`, `SIGNAL_CATEGORY_MAP`, `SignalName`, and `HEALTH_SIGNAL_NAMES` are all derived, plus a pure `reconcilePassed` (conjunction, monotonic toward fail). `cli` wires `reconcilePassed` into `captureHealthSnapshot` so a check's `passed` can no longer be `true` against an active contradicting signal, and unifies `HEALTH_SIGNALS`/`SIGNAL_CATEGORIES` onto the registry. The `strength-007` strength rule now consumes the derived map, closing a silent entropy/deps/docs false-negative.

  Behavior change: health snapshots and the dispatch/recommendation output they feed will now surface failures that were previously hidden behind false-green flags.

- c68b780: Add a `linear` roadmap tracker kind — a `LinearTrackerAdapter` implementing the full `RoadmapTrackerClient` interface over Linear's GraphQL API, wired into `createTrackerClient({ kind: 'linear', teamId, token })` (falls back to `LINEAR_API_KEY`). This builds on the standalone Linear GraphQL client added earlier; the adapter ships its own transport because `core` cannot depend on `orchestrator`.

  Mapping: `externalId` is `linear:<issue-uuid>`; `status` maps via Linear's fixed workflow-state **type** enum (`backlog|unstarted|started|completed`) rather than team-defined state names; `spec`/`plans`/`blockedBy`/`priority`/`milestone`/`summary` round-trip through the shared `<!-- harness-meta -->` body block (same encoding as the GitHub adapter); priority maps P0–P3 ↔ Linear 1–4; history events are stored as marked issue comments. Writes resolve the team's workflow states and assignee user ids on demand, and `update` supports optimistic-concurrency via `ifMatch` (→ `ConflictError`).

  ⚠️ **Best-effort, not yet validated against a live Linear workspace.** Query/mutation shapes follow Linear's documented schema and the mapping is unit-tested with a mocked transport, but field-level behavior (custom workflow states, priority semantics, user resolution) should be verified against a real workspace before production use. `blocked`/`needs-human` statuses have no native Linear state type and are treated as `started` on write.

- 863df8f: Roadmap-shard follow-ups: correctness + CLI parity.
  - **Offline reconcile honors `state_reason` (correctness).** `harness roadmap
reconcile` no longer flips a row whose linked issue was closed as
    `not_planned`/`wontfix` — only a `completed` close (or a close whose reason the
    tracker does not report, a conservative back-compat default) drives an auto-done
    flip. `ExternalTicketState` now carries an optional `stateReason`, populated by
    the GitHub adapter.
  - **Cross-repo issue mis-map fixed (correctness).** A PR can close an issue in a
    different repo; the prior path built External-IDs from bare numbers against the
    configured repo, so a colliding number could flip the wrong local row. New
    `harness roadmap reconcile --from-refs owner/repo#number` builds each External-ID
    from the ref's own `owner/repo` and matches the full External-ID; the auto-done
    Action now fetches `repository.nameWithOwner` per closing issue and passes refs
    through. `--from-issues` (configured-repo numbers) is retained.
  - **`regen`/`unshard` gain `--dry-run` and `--format json`** for parity with
    `shard` (unshard can now preview before the destructive shard-dir deletion).
  - **Internal cleanup:** the `github:owner/repo#NNN` parser is consolidated into one
    canonical module (`roadmap/external-id.ts`); `roadmapSourceExists` shares the
    shard-dir probe with the storage-mode detector.

- 863df8f: Roadmap shard store — Phase 3 (git and hook integration). Make `docs/roadmap.md`
  a self-healing, conflict-free generated aggregate of the per-row shards under
  `docs/roadmap.d/`:
  - **Regen git hooks (husky):** a pre-commit block regenerates and re-stages
    `docs/roadmap.md` whenever any shard is staged (no-op otherwise), and a new
    `.husky/post-merge` clears `merge=ours` staleness by regenerating after a
    merge. Both are thin wrappers over the deterministic `harness roadmap regen`.
    These are intentionally git hooks, not Claude Code tool-use hooks (those
    registries cannot model `git commit` / `git merge`).
  - **`merge=ours` declaration:** `.gitattributes` now declares
    `docs/roadmap.md merge=ours` so disjoint row edits never re-conflict.
  - **Merge-driver setup + doctor:** `harness init` now runs
    `git config merge.ours.driver true` (non-fatal if git is unavailable), and
    `harness validate` warns when `merge=ours` is declared but the driver is unset
    in the current clone (the one-time per-clone fix).
  - **Read-source invariant (R):** a new core detector
    (`findRoadmapReadSourceViolations` + `ROADMAP_READ_ALLOWLIST`) plus a repo
    guard test fail when any new source file starts reading the generated
    `docs/roadmap.md` aggregate instead of the shard store. The allowlist enumerates
    today's legacy readers and shrinks as writers migrate onto `RoadmapStore`.

- 863df8f: Phase 6 of the roadmap shard store: make sharding discoverable, documented, and
  the default for new projects.
  - **Single detection authority.** `detectRoadmapStorageMode` (and the
    `RoadmapStorageMode` type) now live in `packages/core/src/roadmap/load-mode.ts`
    as the one place that decides `monolith` vs `sharded` (by the presence of
    `docs/roadmap.d/`). `store/factory.ts` delegates to it instead of carrying its
    own inline existence check, so the formal storage mode and the chosen store
    backend can never disagree. Storage mode is modelled as an axis orthogonal to
    `RoadmapMode` (file-backed vs file-less), so the ~28 existing mode consumers are
    unaffected.
  - **Sharded-by-default `harness init`.** A brand-new project is scaffolded with an
    empty `docs/roadmap.d/_meta.md` (emitted via the core `serializeMeta` serializer
    for byte-stable round-tripping) and NO monolith `docs/roadmap.md`. Existing
    projects are left untouched and opt in via `harness roadmap shard`.
  - **Aggregate-drift doctor.** `harness validate` now warns when `docs/roadmap.d/`
    exists but the committed aggregate is stale versus `regenerate(shards)` — the
    CI-checkable freshness contract for adopters, fixed by `harness roadmap regen`.
    No-ops for monolith projects.
  - **Documentation.** ADRs 0050 (read-source invariant R) and 0051 (slug identity +
    External-ID sync key), knowledge entries for the roadmap-store abstraction,
    read-source invariant, slug↔issue identity, and merge-triggered auto-done, an
    adoption/rollout guide, the AGENTS.md roadmap section, and the harness skills
    (agents stop hand-marking rows; promote stages shard + regenerated aggregate).

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

- 863df8f: Phase 5 of the roadmap shard store: auto-done reconciler (D6).

  When a merged PR closes a roadmap row's linked GitHub issue
  (`External-ID: github:owner/repo#NNN`), the matching row is flipped to `done`
  automatically — conflict-free, idempotent, and store-routed.
  - **Core:** `reconcileDoneFromClosedIssues(store, closedExternalIds)` — a pure,
    store-routed function that maps each closed `External-ID` to its row and flips
    non-`done` matches to `done` via `setStatus` (the assignee-lifecycle authority,
    which auto-clears a live assignee and appends one `unassigned` history record),
    persisting through `applyRoadmapDiff` (one shard per matched issue; `_meta.md`
    only when an assignee was cleared). Already-`done` rows are no-ops; unmatched
    ids are reported, not written. Works in both sharded and monolith modes and
    adds no new `roadmap.md` reader (invariant R untouched). Also re-exports the
    `parseExternalId` / `buildExternalId` `External-ID` helpers.
  - **CLI:** `harness roadmap reconcile` — an offline fallback that fetches issue
    state from the configured tracker and reconciles closed issues, plus an
    authoritative `--from-issues <n,...>` path that reconciles exact issue numbers
    with no network fetch. (Offline mode treats any closed issue as done; it cannot
    distinguish a `completed` close from a `not planned`/`wontfix` close — the
    PR-merge workflow path is authoritative.)
  - **CI:** a `pull_request: closed` workflow that, only when the PR is merged,
    resolves the PR's `closingIssuesReferences`, no-ops when none are
    roadmap-linked, runs `harness roadmap reconcile --from-issues`, and commits the
    changed shard(s) + regenerated aggregate back to the base branch.

  Both surfaces share the one store-routed core function.

### Patch Changes

- 645f21e: Wire the `pulse.qualityScoring` runtime path, which was accepted in config but silently ignored (a `TODO(phase-4.5)` no-op in the orchestrator). When `qualityScoring` is enabled and `qualityDimension` is set, `runPulse` now aggregates that dimension's distribution across every successfully-queried source into a `QualitySummary` (`dimension`, merged bucket→count `distribution`, `total`, contributing `sources`) on the orchestrator result, and the pulse report adds a `quality[<dimension>]: <total> sampled across <n> source(s)` headline. When no source reports the dimension the summary is empty (`total: 0, sources: 0`) rather than crashing. The aggregation deliberately surfaces what the data says about the dimension without imposing a good/bad verdict — the consuming skill or human interprets the distribution. When `qualityScoring` is off, behavior is unchanged (`quality` is absent). Exposes `computeQuality` and the `QualitySummary` type.
- Updated dependencies [4df8934]
- Updated dependencies [863df8f]
  - @harness-engineering/types@0.16.2
  - @harness-engineering/graph@0.11.2

## 0.31.0

### Minor Changes

- 32bc061: feat(roadmap): assignee means "who is executing" — set at execution, not selection

  Establish the invariant **`assignee ≠ null ⟺ status == in-progress`**, owned by a
  single core authority (`packages/core/src/roadmap/assignee-lifecycle.ts`), so the
  roadmap assignee always names the _current executor_ (human or machine) and never a
  future-intended owner.
  - **New core authority** exports `isMachineAssignee`, `assigneeInvariantHolds`,
    `isClaimableBy`, `claim` (compare-and-set, first-claim-wins), `release`, and
    `setStatus` (auto-clears the assignee on any transition away from in-progress).
  - **roadmap-pilot** no longer writes the assignee at selection; **harness-execution**
    claims at execution start (stopping cleanly when identity is unresolvable). This fixes
    the orchestrator silently skipping pilot-touched items.
  - **Machine claims never use the GitHub assignee field**: outbound sync drops the
    authenticated-user launder, inbound sync never clobbers a live `orchestrator-*` claim.
    The dead `getAuthenticatedUser` path is removed.
  - **Enforcement:** new health rule **RMH005** fails `harness validate` on any
    non-in-progress row carrying an assignee; `groom` auto-clears such rows.
  - The orchestrator completion path and inbound status sync now route status changes
    through `setStatus()`, so a completed/synced row releases its machine claim instead of
    leaving an invariant-violating `done`+`orchestrator-*` row. `manage_roadmap update`
    surfaces a refused claim explicitly (`claimed: false`, `isError`) under first-claim-wins.

  See ADR-0045 (`docs/knowledge/decisions/0045-assignee-is-an-execution-claim.md`).

## 0.30.1

### Patch Changes

- Updated dependencies [8e8e7c1]
  - @harness-engineering/types@0.16.1
  - @harness-engineering/graph@0.11.1

## 0.30.0

### Minor Changes

- 8128981: Add `harness:audit-harness-strength` — a self-audit skill + `harness check-harness-strength` command that mechanically audits a project's own harness setup against the seven v5.0 failure patterns and reports a 0–100 strength score, a tier (`solid`/`at-risk`/`theatre`), and per-pattern remediation.
  - New `packages/core/src/harness-strength/` module: `HarnessStrengthAuditor` over a 7-rule registry (`StrengthRule` with an optional `evaluable?()` so absent input is never a false pass), a once-built `ProjectContext` (config, hooks resolved from `.husky/`/`.claude/hooks/`/`.harness/hooks/` + settings.json, workflows, health snapshot, and toolkit-mode templates/init-skill), and a pure deterministic `rollupScore`. Findings carry severity applied by the auditor (config-overridable via `audit.harnessStrength.severities`); `finding.file` is always root-relative.
  - Detects STRENGTH-001..007: non-blocking hooks, pre-commit auto-baseline-on-regression, oversized `--skip` lists, empty `architecture.thresholds`, lowest-tier defaults, PAT-gated auto-approve without independent review (incl. commands inside `run:` blocks), and `passed:true` health-snapshot entries that contradict active signals.
  - New `harness check-harness-strength` command (`@harness-engineering/cli`) mirroring `check-security`: `--mode adopter|toolkit` (auto-detects toolkit), `--severity`, `--report-only`, and `--json` (raw `AuditResult` for downstream dashboard/health-snapshot consumers). Gates non-zero on surviving error-severity findings unless `--report-only`.
  - Ships the rigid `harness:audit-harness-strength` skill (4 platforms) that orchestrates the command rather than re-grepping configs. ADR 0039 documents the decision that self-audit skills must be mechanically enforced, not prose.

- d11e2e6: Add roadmap maintenance: health checks, grooming, an `Intake` lane, and a split archive.

  Encodes one principle in code — **a milestone is a theme, a status is a lifecycle stage** — so the roadmap stays tidy over time instead of decaying into an undifferentiated backlog dump.
  - **`@harness-engineering/core`** gains `packages/core/src/roadmap/health.ts`: `checkRoadmapHealth` (read-only diagnostics — RMH001 done-outside-archive, RMH002 unactionable `planned` rows with no spec & no plan, RMH003 lifecycle catch-all milestones `[error]`, RMH004 oversized active milestones) and `groomRoadmap` (pure transform: demote unactionable `planned` to `backlog`, lift `done` features out for archival). The not-found create path in `promoteFeature` now lands new rows in an **`Intake`** lane instead of recreating a `Current Work` catch-all.
  - **`@harness-engineering/cli`** wires `checkRoadmapHealth` into `harness validate` as a `roadmapHealth` check (RMH003 fails validation; others are warnings), and adds a `groom` action to the `manage_roadmap` MCP tool that demotes unactionable `planned` rows and moves completed features into `docs/roadmap-archive.md` under a `Shipped` milestone, keeping the orchestrator's parsed `docs/roadmap.md` lean.
  - The `harness-roadmap` skill documents a `--groom` mode.
  - The `initialize-harness-project` skill now seeds the deferred "Set up design system" entry under the `Intake` lane instead of a `Current Work` catch-all, so freshly-initialized projects start tidy and pass the `roadmapHealth` guard.

- 07c399b: Add `manage_roadmap` action `promote` and the `promoteFeature` core function for the brainstorm-driven roadmap loop (sub-project 1 of 4).

  `promoteFeature` (exported from `@harness-engineering/core`) is a pure, IO-free state-transition over `(Roadmap, { feature, spec, summary? }) → { result, nextRoadmap }`. It advances an existing backlog row to `planned` and links its spec in place — instead of appending a duplicate `planned` row — applying a state-conditional rule set: `backlog → planned`; `planned`/`blocked`/`needs-human` update the spec link while preserving status; `in-progress` and `done` refuse; a genuine lookup miss creates a new `planned` row under "Current Work" (`transitioned: 'created'`, matching the legacy `add` behavior the action replaced), while a probable typo of an existing heading instead returns `not-found` with Levenshtein-ranked `closestMatches`; same-name rows across milestones return `ambiguous` with milestone-qualified matches. A non-`backlog` row already linked to the same spec is an idempotent `noop`. A human-authored summary and the `Plan`/`Assignee`/`Priority`/`External-ID`/`Blockers`/`Milestone` fields are never overwritten. The per-row decision is exposed as `decidePromotionForRow` so the file-less handler shares the same rules.

  The `manage_roadmap` MCP tool (`@harness-engineering/cli`) gains `action: 'promote'` (inputs `feature`, `spec`, optional `summary`), wired in both file-backed and file-less modes, returning the structured `RoadmapPromoteResult` envelope. `harness-brainstorming` Phase 4 now calls `promote` instead of `add` and commits `proposal.md`, `SKILLS.md`, and `roadmap.md` together so the promotion is atomic with the spec. See ADRs 0042 (structured envelopes) and 0043 (rules-in-core).

- ca706f5: feat(review-ci): multi-client required-review CI gate (#541)

  Adds `harness review-ci` and its contract. Core gains a versioned `CiReviewVerdict`
  schema, a two-kind runner-preset registry (`agent-cli` + `endpoint`), per-runner
  verdict parsers, and the `runCiReview` orchestrator — a tiered gate (client-agnostic
  heuristic floor always runs; a secret-gated LLM multi-persona tier runs per runner
  and degrades gracefully) with an anti-theatre `block-on` threshold where a required
  runner that fails to execute blocks even under `block-on none`. The CLI gains the
  `harness review-ci` command wiring it, including the local openai-compatible adapter.

  Runners verified against the real CLIs: claude, codex, antigravity (`agy`). `gemini`
  is superseded by antigravity; `cursor`, `local` live verification, and the
  full-agentic-local path are deferred. Adopter templates ship under `templates/ci/`
  (workflow + config-as-code ruleset). See docs/changes/required-review-ci/proposal.md.

### Patch Changes

- 4b2f910: Harden the CI review verdict trust boundary (Phase 1 code-review fixes, ahead of the live local provider in Phase 2).
  - **Validate-then-derive:** all five verdict parsers (claude, codex, antigravity, gemini, local) now schema-validate raw findings FIRST via a shared `buildCiReviewVerdict` helper, then DERIVE `blockingFindings` (severity `critical`) and `exitCode` from the validated findings — instead of computing them from an unchecked `as CiReviewVerdict['findings']` cast before validation.
  - **Schema invariants:** `CiReviewVerdictSchema` gained a `superRefine` enforcing (a) every `blockingFindings` entry is present in `findings` (by id, else deep-equal) and equals exactly the critical-severity findings, (b) every blocking finding is `critical`, and (c) assessment/exitCode/blockingFindings consistency (non-empty blockers => `request-changes` + non-zero exit; `request-changes` => non-zero exit; otherwise exit 0).
  - **Domain contract:** the finding `domain` is tightened from `z.string().min(1)` to a zod enum mirroring the core `ReviewDomain` union, pinned with a compile-time sync assertion. Producers must emit valid `ReviewDomain` values at the CI boundary.

## 0.29.0

### Minor Changes

- 7353b60: Add review depth calibration + adversarial / framework-aware reviewers to `harness-code-review`. New `Phase 3.5: CALIBRATE DEPTH` selects Quick / Standard / Deep from diff size and a canonical risk-keyword list, then dispatches three conditional subagents alongside the existing 4 base agents:
  - `adversarial` — assumption violations, composition failures, abuse cases (and at Deep, cascade chains)
  - `typescript-strict` — type holes that disable the checker, refactor regression, complexity growth
  - `frontend-races` — lifecycle cleanup gaps, hook timing, concurrent interactions, stale-response races

  `ReviewFinding` gains two optional additive fields: `subagent` (which subagent produced it) and a widened `confidence` union that accepts both the legacy `'high'|'medium'|'low'` and new numeric anchors `25|50|75|100`. Phase 6 dedup uses confidence as a tiebreaker when severity ties. New `--depth quick|standard|deep` CLI/MCP flag overrides calibration. Reference files: `references/confidence-rubric.md`, `references/risk-keywords.md`. ADR-0034.

- 318b878: Add `STRATEGY.md` schema and validator (strategic-anchor phase 1 of 8 in the compound-engineering-adoption initiative).
  - `packages/types` exports `StrategyFrontmatter`, `StrategyDoc`, `StrategySection`, `REQUIRED_STRATEGY_SECTIONS`, `OPTIONAL_STRATEGY_SECTIONS`.
  - `packages/core/strategy` exports `StrategyDocSchema`, `StrategyFrontmatterSchema`, `parseStrategyDoc`, `asStrategyDoc`.
  - `packages/core/validation` exports `validateStrategy(cwd)` consumed by `harness validate`.
  - CLI `harness validate` now reports a `strategyConfig` check: soft-passes when STRATEGY.md is absent; fails with a precise per-section message when present and malformed (missing required section, unfilled template placeholder, malformed frontmatter).

  Scope: schema + validator only. The `harness-strategy` skill, the `harness-ideate` skill, init wiring, brainstorming/roadmap-pilot grounding, knowledge-graph integration, and ADRs ship in follow-up PRs (one per phase, matching the feedback-loops cadence).

- af56053: Ship the `harness-strategy` skill and the `writeStrategyDoc` writer (strategic-anchor phase 2 of 8 in the compound-engineering-adoption initiative).
  - `packages/core/strategy` exports `writeStrategyDoc(doc, { cwd, skipBackup? })` — atomic disk write of `STRATEGY.md` with schema-validation-rejects-disk-write, an idempotent `.bak` on first overwrite, H1 preservation across re-writes, and `tmp-<pid>` + `rename` semantics that mirror `writePulseConfig`. Composes a pure `serializeStrategyDoc(doc, opts?)` (also exported) so the serializer is unit-testable without filesystem fixtures.
  - `agents/skills/{claude-code,gemini-cli,cursor,codex}/harness-strategy/` ships the rigid skill (Phase 0 file-state routing; Phase 1 first-run interview in template order; Phase 2 per-section update flow; Phase 3 downstream handoff). `references/interview.md` documents the three pushback rules (fluff detection, goal-as-strategy, feature-list-as-strategy) with detection signals, repair scripts, anti-pattern fixtures, and the hard 2-round-per-section cap.
  - CLI emits `/harness:strategy` via `generate-slash-commands` (and the per-platform plugin generators); the slash command appears in `.claude-plugin/commands/strategy.md`, `.gemini-extension/commands/strategy.toml`, `.cursor-plugin/commands/strategy.md`, plus the `agents/commands/*` mirrors. Skill listed in the auto-generated skills catalog.

  Scope: writer + skill prose only. Init wiring, `harness-ideate`, brainstorming/roadmap-pilot grounding, knowledge-graph integration, and ADRs ship in follow-up PRs (one per phase).

### Patch Changes

- c17ad8b: Reduce `harness cleanup --type drift` false positives on ADR-heavy projects (chat-492):
  - Inline-reference extractor now rejects BCP-47 locale codes (`vi`, `cs`, `pt-BR`, `zh-Hant-CN`) and file-name backticks (`AGENTS.md`, `harness.config.json`, `.gitignore`) so they no longer surface as "symbol not found" drift.
  - API-signature drift detection skips refs inside forward-looking docs by default: `docs/architecture/`, `docs/decisions/`, `docs/proposals/`, `docs/adr/`. These describe intended future code and shouldn't drift-check against the current codebase. Configurable via `DriftConfig.forwardLookingPaths`.
  - Markdown link parser splits `file.md#anchor` before the file-existence check, eliminating false-positive structure drift on anchor links. When the file exists, the anchor is validated against the target file's GFM-slugged headings — surfacing as `link-anchor` context with `medium` confidence so real typos (e.g. em-dash slug mistakes) still get caught.

- Updated dependencies [99b5cbf]
- Updated dependencies [7c66168]
- Updated dependencies [5f9ed8c]
- Updated dependencies [318b878]
- Updated dependencies [aaefe1b]
  - @harness-engineering/graph@0.11.0
  - @harness-engineering/types@0.16.0

## 0.28.2

### Patch Changes

- 39bfd73: Fix `harness recommend` crashing with `Unexpected token 'E', "Error: Max"... is not valid JSON` on repos with very large drift reports.

  Root cause: `generateSuggestions` in `@harness-engineering/core` spread sub-arrays into `Array.push` (`suggestions.push(...subList)`), exceeding V8's argument-count limit (~65k) on a 322k-entry drift report and throwing `RangeError: Maximum call stack size exceeded`. The cli's `parseToolResult` then JSON-parsed the resulting error text and crashed the recommend pipeline.

  Core: switched spread-push to `concat` so the suggestion accumulator scales with report size. Cli: made `parseToolResult` honor `isError`, catch parse failures, warn via logger, and fall back to `{}` so a single failing sub-check degrades gracefully instead of taking the whole pipeline down. Both layers gained regression tests with revert-and-fail verified.

## 0.28.1

### Patch Changes

- bbc164f: Make harness skills and personas discoverable in Codex CLI, and fix a long-standing scanner false-positive flood.

  **@harness-engineering/cli** (minor): the Codex slash-command adapter now writes to `~/.codex/skills/<name>/SKILL.md` with the YAML frontmatter Codex's skill discovery requires; all 50 harness skills are reachable via `$harness-debugging`, `/skills`, and auto-trigger. The agent-definitions adapter emits real Codex subagent TOMLs at `~/.codex/agents/<name>.toml` (12 personas) so they appear in `/agent`. Both surfaces previously wrote dead files Codex ignored.

  **@harness-engineering/core** (patch): `SecurityScanner` now honors `// harness-ignore SEC-XXX: justification` on the line above the flagged code, matching the convention already in use across the repo. Previously only same-line annotations were recognized, so every prior-line annotation silently re-fired the suppressed rule.

  **@harness-engineering/orchestrator** / **@harness-engineering/dashboard** (patch): annotate the previously-flagged `JSON.parse` and `writeFile` sites with the explanatory `// harness-ignore` comments the scanner now reads correctly. No runtime behavior change.

  Also includes an infra fix to `.husky/pre-push` so nvm's Node takes precedence over Homebrew's on PATH (otherwise `better-sqlite3` fails to load under a newer Homebrew Node and blocks every push).

- 573c23b: Clear all 9 Tier 2 structural perf violations (`harness check-perf --structural`) in `packages/core`. Behavior-preserving refactors of `validateBranchName`, `isSanitizedResult`, `gatherDecayBlock`, `attributesToOTLP`, `OTLPExporter` constructor, `spansToOTLPJSON`, `metaToPatch`, `formatDiff`, and `metaFromFeatureFields`. Each function drops below its threshold (cyclomatic ≤ 10, nesting ≤ 4) via extract-method or destructuring-defaults; no API or wire-format changes; 2864/2864 core tests pass.
- Updated dependencies [d1c9bda]
- Updated dependencies [0eac8eb]
- Updated dependencies [dcca2ce]
  - @harness-engineering/graph@0.10.0
  - @harness-engineering/types@0.15.0

## 0.28.0

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

### Patch Changes

- Updated dependencies [4aa241f]
- Updated dependencies [c3653ff]
  - @harness-engineering/types@0.14.0

## 0.27.0

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

### Patch Changes

- Updated dependencies [3d6e340]
- Updated dependencies [2481e59]
- Updated dependencies [2602530]
  - @harness-engineering/types@0.13.0

## 0.26.4

### Patch Changes

- 2724dfe: Tighten `INJ-REROL-003` injection regex to require an explicit override verb so plain documentation headings and YAML keys no longer trip the high-severity blocking guard.

  The previous pattern `(?:new\s+)?(?:system\s+)?(?:instruction|directive|role|persona)\s*[:=]\s*` made both leading-verb groups optional, so any colon-terminated heading containing `instruction`, `directive`, `role`, or `persona` matched at high severity. Because `INJ-REROL-*` is on the orchestrator's `BLOCKING_INJECTION_PREFIXES` list (`packages/orchestrator/src/workspace/config-scanner.ts`), the false positive blocked dispatch with no medium-severity fallback. The repo's own `AGENTS.md:416` contains `_Agent & Persona:_` as a markdown italic category heading listing skill names — copied into every workspace, this aborted every orchestrator dispatch with `Config scan blocked dispatch ... INJ-REROL-003: Injection pattern detected`.

  The pattern now requires one of `new|override|replace|set|reassign|reset|switch( to)?|update|change` before the keyword, so true overrides (`new system instruction:`, `override directive:`, `set role: admin`, `reassign persona:`) still fire high while documentation headings (`_Agent & Persona:_`, `## Instructions:`, `Directive: ship by Friday`) and YAML keys (`role: developer`) no longer match. Four negative and three positive regression tests in `packages/core/tests/security/injection-patterns.test.ts` pin the behavior.

## 0.26.3

### Patch Changes

- 1796528: `findFiles` now applies a default ignore list (`node_modules`, `dist`, `build`, `coverage`) so callers stop crawling into nested dependency trees.

  Before this fix, the shared `findFiles` helper at `packages/core/src/shared/fs-utils.ts` called glob with no ignore option, so all 40 of its callers — architecture collectors (complexity, coupling, module-size, etc.), entropy detectors, knowledge map, doc coverage, code-nav, dependency analysis — crawled into every nested `node_modules`. The most visible symptom was `harness check-arch` on a workspace that contained a standalone example (`examples/slack-echo-bridge/`) scanning the example's bundled `typescript/lib/lib.dom.d.ts` and emitting ~700 false-positive `cyclomaticComplexity`/`nestingDepth`/`functionLength` violations against TypeScript's own DOM type defs. Reproducible before the fix as `harness check-arch 2>&1 | grep -c node_modules` → 661.

  `findFiles` now passes `ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**']` to glob. The exported constant `DEFAULT_FIND_FILES_IGNORE` lists them. A new optional `extraIgnore` third parameter lets callers add patterns without re-implementing the defaults; existing call sites are source-compatible.

  Three new test cases pin the behavior: defaults exclude all four directories, `extraIgnore` extends rather than replaces the defaults, and `extraIgnore` of an unrelated pattern leaves the defaults intact.

## 0.26.2

### Patch Changes

- Updated dependencies [48e0b5b]
  - @harness-engineering/types@0.12.0

## 0.26.1

### Patch Changes

- 7ae0561: Fix `harness update` reporting "All packages are up to date" while a stale background notification simultaneously printed "Update available". The post-command notification is now suppressed during the `update` subcommand (its fresh `npm view` is authoritative), and the cached check state is invalidated after a successful update so subsequent invocations don't display pre-upgrade data.

  `harness update` also now detects every `harness` binary on `PATH` (`which -a` / `where`) and warns when more than one global install is present. If the user opts in, npm-style installs are uninstalled from their respective prefixes; pnpm/yarn installs are surfaced with the exact command to run manually. This prevents the case where `npm install -g` lands in one prefix while the shell continues resolving an older binary from another prefix.

## 0.26.0

### Minor Changes

- 56176cd: feat(compliance): branch naming convention and `harness verify` command (closes #319)

  Adds a project-wide branch naming convention with optional `harness.config.json`
  override under `compliance.branching`, and a `harness verify` command that
  checks the current branch against the convention.
  - **Core:** New `validateBranchName` export from `@harness-engineering/core`
    with `BranchingConfig` type. Enforces prefix list, strict kebab-case slugs
    (no leading/trailing or doubled hyphens), optional ticket-ID pattern
    (`feat/PROJ-123-desc`), slug length cap, and ignore globs for long-lived
    branches.
  - **CLI:** New `harness verify` command. Works without a `harness.config.json`
    by falling back to schema defaults. Supports `--branch <name>` and reads
    `HARNESS_BRANCH` / `GITHUB_HEAD_REF` / `CI_COMMIT_REF_NAME` /
    `BUILDKITE_BRANCH` so CI runners in detached-HEAD state can still verify
    the PR source branch. `--json` emits a machine-readable result.
  - **Config:** Adds `compliance.branching` to `HarnessConfigSchema` with
    fields `prefixes`, `enforceKebabCase`, `customRegex`, `ignore`, and
    `maxLength` (default 60; set to 0 to disable). Defaults declared in the
    schema are the single source of truth.

  Defaults: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`; ignore
  `main`, `release/**`, `dependabot/**`, `harness/**`. `customRegex` is a full
  override -- when set, the prefix, kebab-case, and length checks are bypassed.

### Patch Changes

- bed30c4: fix(deps): bump `@typescript-eslint/typescript-estree` to `^8.29.0` (closes #318)

  The bundled `@typescript-eslint/typescript-estree@7.18.0` capped supported
  TypeScript at `<5.6.0`, so every CLI invocation that parsed TS on a modern
  TypeScript (5.6+ / 6.x) emitted a noisy "you are running a version of
  TypeScript which is not officially supported" warning to stderr. The warning
  cluttered CI logs and hook output and falsely implied a project misconfig.

  Bumps both `@harness-engineering/cli` and `@harness-engineering/core` to
  `^8.29.0`. The 8.x line supports TS 5.6+ and has experimental support for
  newer versions; parser behavior for valid TS is unchanged.

## 0.25.0

### Minor Changes

- 38fa742: fix(dashboard,orchestrator): surface `err.cause` in proxy 502s and reject WHATWG bad ports at startup (#287)

  The dashboard proxy was returning opaque `Orchestrator proxy error: fetch failed` 502s for every request when the orchestrator listened on a port the WHATWG fetch spec marks as "bad" (e.g. `10080`, `6000`, `6666`). `curl` does not enforce the bad-ports list, so the port appeared reachable from the shell — turning a one-line config fix into a multi-hour goose chase (see issue #287).

  **`@harness-engineering/core`:**
  - New `shared/port.ts` exports `WHATWG_BAD_PORTS` (frozen canonical list from [the fetch spec](https://fetch.spec.whatwg.org/#port-blocking)), `isBadPort(port)`, and `assertPortUsable(port, label?)`. `assertPortUsable` throws a clear, actionable error directing the user to choose a different port and linking the spec.

  **`@harness-engineering/dashboard`:**
  - `orchestrator-proxy.ts`: extracted `formatProxyErrorMessage(err)` that surfaces `err.cause.message` / `err.cause.code` alongside the base message. A `fetch failed` from a bad port now reads `Orchestrator proxy error: fetch failed (cause: bad port)`; `ECONNREFUSED`, `ENOTFOUND`, etc. are visible the same way.
  - `getOrchestratorTarget()` logs a one-time `console.error` at resolution time if the configured target port is on the bad-ports list, so the failure mode is announced at startup rather than only per-request.
  - `serve.ts`: calls `assertPortUsable(port, 'dashboard API')` before `serve()` so the dashboard refuses to start on an unreachable port.

  **`@harness-engineering/orchestrator`:**
  - `server/http.ts#start()`: calls `assertPortUsable(this.port, 'orchestrator')` before `httpServer.listen()` so the orchestrator refuses to start on a bad port. The `harness orchestrator start` flow now fails loudly with a clear message instead of starting, appearing healthy to `curl`, and silently breaking every dashboard request.

### Patch Changes

- bb7658b: fix(graph/ingest): materialize general Markdown as `document` nodes (#302); consolidate skip-dir usage across walkers and glob excludes

  **`@harness-engineering/graph`:**
  - Issue #302 — `KnowledgeIngestor.ingestAll()` only ran `ingestADRs`, `ingestLearnings`, and `ingestFailures`. Top-level `README.md`/`AGENTS.md` and `docs/**/*.md` (non-ADR) were silently skipped, so no `document` nodes existed and no `documents` edges were created for general docs. The `detect-doc-drift` skill's graph-enhanced traversal was a no-op on any project without a `docs/adr/` directory.
  - New `KnowledgeIngestor.ingestGeneralDocs(projectPath)` materializes `document` nodes for top-level `*.md` (non-recursive) and `docs/**/*.md` (recursive), skipping subdirs owned by sibling ingestors (`docs/adr` → `ingestADRs`, `docs/knowledge` → `BusinessKnowledgeIngestor`, `docs/changes` → `RequirementIngestor`, `docs/solutions` → solutions pipeline). Node id format: `doc:<rel-path>`. Title parsed from the first H1, falling back to the filename. Runs `linkToCode(content, nodeId, 'documents')` so mentioned code symbols get `documents` edges automatically. Wired into `ingestAll()`, so both the MCP `ingest_source` (knowledge|all) handler and the CLI `harness ingest --source knowledge` path benefit without further changes.
  - New `skipDirGlobs(skipDirs?)` helper exported from `@harness-engineering/graph`. Converts a skip-dirs set (default: `DEFAULT_SKIP_DIRS`) into minimatch glob patterns of the form `**/<name>/**`. Use this for tools that exclude via globs (security scan, doc coverage, entropy snapshot) instead of by reading directory names during traversal — the previously hand-maintained `['**/node_modules/**', '**/dist/**']` mini-lists across packages now derive from the canonical 60+ entry set automatically.
  - Consolidated all hand-rolled skip-dir lists inside the graph package around `DEFAULT_SKIP_DIRS`: `KnowledgeIngestor.findMarkdownFiles`, `BusinessKnowledgeIngestor.findMarkdownFiles` (the byte-identical twin of the #302 bug), `DiagramParser.findDiagramFiles`, `ExtractionRunner.walkSources`. Each picks up the full coverage from #274 (Python `__pycache__`/`.venv`, JS framework caches `.next`/`.turbo`/`.vite`, AI agent sandboxes `.claude`/`.cursor`/`.codex`, etc.) for free, and any future addition to `DEFAULT_SKIP_DIRS` propagates everywhere.

  **`@harness-engineering/core`:**
  - `architecture/collectors/module-size.ts` and `architecture/collectors/dep-depth.ts`: `isSkippedEntry` now combines `name.startsWith('.')` with `DEFAULT_SKIP_DIRS.has(name)`. Preserves the existing broad dotfile heuristic and adds curated non-dotfile names (`vendor`, `out`, `target`, `build`, `coverage`, etc.).
  - `entropy/detectors/size-budget.ts:dirSize`: skip-set widened from `{node_modules, .git}` to the full `DEFAULT_SKIP_DIRS`. Size budgets now exclude `dist`, `build`, `.turbo`, etc., matching intent.
  - `performance/critical-path.ts`: source-file walker uses `DEFAULT_SKIP_DIRS`.
  - `security/types.ts:DEFAULT_SECURITY_CONFIG.exclude` and `security/config.ts:SecurityConfigSchema.exclude`: default exclude list is now `[...skipDirGlobs(), '**/*.test.ts', '**/fixtures/**']` — file-type/fixture filters preserved, dir-skip portion derives from the canonical set.
  - `ci/check-orchestrator.ts`: same treatment for the two `excludePatterns` defaults (doc-coverage fallback and security-scan ignore fallback).
  - `entropy/snapshot.ts`: `excludePatterns` fallback now derives from `skipDirGlobs()`. Also corrects a latent bug — the previous `'node_modules/**'` (no leading `**/`) only matched top-level `node_modules`, missing nested ones in monorepos.

  **`@harness-engineering/cli`:**
  - `commands/migrate.ts:walk`: skip-set uses `DEFAULT_SKIP_DIRS`.
  - `commands/install.ts`: skill-scan walker combines `startsWith('.')` with `DEFAULT_SKIP_DIRS.has(name)`.
  - `config/schema.ts:EntropyConfigSchema.excludePatterns`: default is now `[...skipDirGlobs(), '**/*.test.ts']`.

  **Tests:**
  - New `general docs ingestion (issue #302)` block in `packages/graph/tests/ingest/KnowledgeIngestor.test.ts`: 5 cases covering top-level README/AGENTS creation, `documents`-edge linking to mentioned code symbols, ADR non-duplication, ownership-aware subdir skipping (`docs/{adr,knowledge,changes,solutions}`), and `.harness/*.md` exclusion. Revert-and-fail check confirms 3 of the 5 fail without the fix; the remaining 2 guard against future over-ingestion.
  - Updated `packages/cli/tests/commands/install.test.ts` `child_process` mock to use `importOriginal()` partial pattern so transitively-loaded code from `@harness-engineering/graph` resolves correctly.

- Updated dependencies [bb7658b]
  - @harness-engineering/graph@0.9.0

## 0.24.0

### Minor Changes

- 287ca16: feat(roadmap): tracker-only roadmap mode (file-less)

  Adds opt-in file-less roadmap mode where the configured external tracker is canonical, eliminating `docs/roadmap.md` as a multi-session conflict surface. See [`docs/changes/roadmap-tracker-only/proposal.md`](https://github.com/Intense-Visions/harness-engineering/blob/main/docs/changes/roadmap-tracker-only/proposal.md) and ADRs 0008–0010.

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

## 0.23.8

### Patch Changes

- ba8da2e: fix(core, cli): preserve tracked categories on `check-arch --update-baseline` (#268)

  `harness check-arch --update-baseline` rewrote `.harness/arch/baselines.json` from scratch using only the categories present in the current `runAll()` output. Any tracked category that the run did not emit — for example because a collector silently returned `[]` after a transient failure or a filtered run — was permanently dropped from the baseline. Combined with the `.husky/pre-commit` hook that auto-stages the regenerated file, this could erase tracked `complexity`, `layer-violations`, and `circular-deps` allowlists in a normal commit without surfacing as a diff worth reviewing.

  **`@harness-engineering/core`:**
  - `packages/core/src/architecture/baseline-manager.ts` — adds `ArchBaselineManager.update(results, commitHash)`. It captures fresh metrics, merges them onto the on-disk baseline (categories present in `results` overwrite, categories absent are preserved), and saves atomically. This mirrors the merge-on-write pattern already used by `packages/core/src/performance/baseline-manager.ts :: BaselineManager.save`.
  - `capture()` and `save()` keep their existing pure / overwrite-only contracts.

  **`@harness-engineering/cli`:**
  - `packages/cli/src/commands/check-arch.ts` — the `--update-baseline` branch now calls `manager.update(results, commitHash)` instead of `manager.capture(results, commitHash)` followed by `manager.save(baseline)`. No CLI surface changes.

  **Tests:**
  - `packages/core/tests/architecture/baseline-manager.test.ts` — three new cases under `describe('update()')`: preserves existing categories when results omit them (the literal #268 reproduction), overwrites categories present in both, writes a fresh baseline when none exists. Each was verified to fail when `update()` is reverted to plain `capture()`+`save()`.
  - `packages/cli/tests/commands/check-arch.test.ts` — adds an integration smoke test that pre-seeds all seven categories and asserts every category is still present after `--update-baseline`, guarding against future regressions in the wiring.

- 54d9494: fix(core): resolve `.js` imports to `.ts`/`.jsx` source files (#279)

  Three resolvers in `packages/core` (dead-code reachability, dependency-graph construction, review-context scoping) silently dropped edges when an import specifier wrote a runtime extension different from the on-disk source extension. On TS NodeNext / "Bundler" projects this caused ~75% false-positive dead-code findings; the same bug class affects Babel/webpack JSX projects (`./Foo.js` → `Foo.jsx`).

  **`@harness-engineering/core`:**
  - `packages/core/src/entropy/detectors/dead-code.ts :: resolveImportToFile` — was the proximate cause of the reported symptom. Appended `.ts` to a `.js` path producing non-existent `foo.js.ts` lookups; now strips the JS-style extension and tries each TS/JSX equivalent before falling back.
  - `packages/core/src/constraints/dependencies.ts :: resolveImportPath` — `hasKnownExt` flat-union accepted `.js` as already-resolved, so dependency-graph edges pointed to non-existent nodes. Now async; verifies file existence before returning. The previous `fromLang === 'typescript'` gate was dropped — Babel/JSX projects need the same swap.
  - `packages/core/src/review/context-scoper.ts :: resolveImportPath` — candidate list never tried stripping `.js` first; now does, with `index.{ts,tsx,jsx}` directory fallbacks.
  - New shared `JS_EXT_FALLBACKS` map (`.js → [.ts, .tsx, .jsx]`, `.jsx → [.tsx]`, `.mjs → [.mts]`, `.cjs → [.cts]`) covers both real-world conventions: TS NodeNext and Babel/webpack JSX.

  **`@harness-engineering/cli`:**
  - `harness cleanup --type dead-code` no longer flags files imported via NodeNext-style `.js` extensions (or Babel-style `.js → .jsx`) as dead. Symptom regression on this monorepo: total findings **1480 → 1016 (-31%)**, dead files **394 → 185 (-53%)**.
  - Downstream commands that consume the dependency graph (`harness fix-drift`, `harness check-perf` coupling/fan-in, `harness knowledge-pipeline`) now see complete edges for `.js`-imported files.

  **Tests:**
  - `packages/core/tests/entropy/detectors/dead-code.test.ts` — 4 NodeNext cases (file, subdirectory, folder-index, full-report).
  - `packages/core/tests/constraints/dependencies.test.ts` — TS NodeNext + Babel JSX cases via `buildDependencyGraph`.
  - `packages/core/tests/review/context-scoper.test.ts` — TS NodeNext + Babel JSX cases via `scopeContext` import fallback.
  - New fixtures under `packages/core/tests/fixtures/{entropy/dead-code-nodenext,nodenext-imports,jsx-imports}/`.
  - Each new test was verified to fail when the corresponding source fix is reverted.

- a1df67e: fix(core, cli): track `.harness/hooks/` and `.harness/security/timeline.json` by default (#270)

  Two pieces of harness state are team-shared but were ignored by the `.harness/.gitignore` that `harness init` scaffolds, so a fresh clone ran without policy enforcement and with no shared security-trend history until someone re-ran `harness init`:
  - **`.harness/hooks/`** — the per-profile policy scripts (`block-no-verify.js`, `protect-config.js`, `quality-gate.js`, `pre-compact-state.js`, `adoption-tracker.js`, `telemetry-reporter.js`, plus `profile.json` for `standard`; `cost-tracker.js`, `sentinel-pre.js`, `sentinel-post.js` add for `strict`). Treat the directory like a tracked lockfile: review CLI-upgrade diffs.
  - **`.harness/security/timeline.json`** — append-only security trend ledger keyed by commit hash. Tracking it surfaces score deltas in PR diffs and gives `findingLifecycles` a real audit trail.

  **`@harness-engineering/cli`:**
  - `packages/cli/src/templates/post-write.ts` — `ensureHarnessGitignore` no longer emits `hooks/`, and replaces `security/` with `security/*` + `!security/timeline.json`.
  - `packages/cli/tests/templates/post-write.test.ts` — adds two assertions that pin the new semantics so future edits cannot silently revert them.

  **`@harness-engineering/core`:**

  `security/timeline.json` was not actually share-safe before this change: `findingLifecycles[].file` stored whatever path the scanner emitted, which is absolute (`packages/cli/src/commands/check-security.ts:90` globs with `absolute: true`). Committing it would have leaked every developer's home-directory username and produced near-guaranteed merge conflicts whenever two developers scanned. The CLI default flip is paired with a normalization fix at the timeline boundary:
  - `packages/core/src/security/security-timeline-manager.ts` — `capture()` and `updateLifecycles()` now relativize `finding.file` against `rootDir` before computing `findingId` and persisting, so IDs are rootDir-independent (two clones agree). Paths that escape `rootDir` (relative starts with `..`) are passed through unchanged so we never silently misattribute findings outside the project.
  - `load()` migrates legacy absolute paths under `rootDir` to repo-relative form on first read and re-saves the file. One-shot fixup; subsequent reads are no-ops.
  - `packages/core/tests/security/security-timeline-manager.test.ts` — six new cases under `describe('path normalization (issue #270)')` covering: absolute→relative on write, no-double-strip on already-relative, rootDir-independent IDs across two managers, escape-paths preserved, on-load migration with re-save, and no-op when paths are already clean.

  **Repo dogfood:**
  - `.gitignore`, `.harness/.gitignore`, `packages/cli/.harness/.gitignore` — flipped to the new template form.
  - `.harness/security/timeline.json`, `packages/cli/.harness/security/timeline.json` — migrated from absolute to relative paths and now tracked.
  - `.harness/hooks/` — now tracked (7 standard-profile entries).

## 0.23.7

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.8.0

## 0.23.6

### Patch Changes

- Updated dependencies [8825aee]
- Updated dependencies [8825aee]
  - @harness-engineering/types@0.11.0

## 0.23.5

### Patch Changes

- Updated dependencies [18412eb]
  - @harness-engineering/graph@0.7.1

## 0.23.4

### Patch Changes

- Updated dependencies [3bfe4e4]
  - @harness-engineering/graph@0.7.0

## 0.23.3

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.6.0

## 0.23.2

### Patch Changes

- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
  - @harness-engineering/graph@0.5.0
  - @harness-engineering/types@0.10.1

## 0.23.1

### Patch Changes

- chore: auto-generate `src/index.ts` barrel via `scripts/generate-core-barrel.mjs` with `--check` mode for CI staleness detection. New modules with `index.ts` are auto-discovered; selective exports are maintained inline in the script.

## 0.23.0

### Minor Changes

- feat(review): enhance trust scoring with graph enrichment and exported constants
- fix(telemetry): use `distinct_id` (snake_case) for PostHog batch API

  PostHog requires `distinct_id` but the code sent `distinctId` (camelCase), causing all telemetry events to be silently rejected with HTTP 400. Added identity fallbacks from `harness.config.json` name and `git config user.name`. Added `harness telemetry test` command for verifying PostHog connectivity.

### Patch Changes

- fix(ci): cross-platform CI fixes for Windows test timeouts and coverage scripts
- Updated dependencies
- Updated dependencies
  - @harness-engineering/types@0.10.0

## 0.22.0

### Minor Changes

- f1bc300: Add `harness validate --agent-configs` for hybrid agent-config validation.
  - Preferred path shells out to the [agnix](https://github.com/agent-sh/agnix) binary when it
    is installed (385+ rules across CLAUDE.md, hooks, agents, skills, MCP).
  - When agnix is unavailable (or disabled via `HARNESS_AGNIX_DISABLE=1`), the command runs a
    built-in TypeScript fallback rule set (`HARNESS-AC-*`) covering broken agents, invalid
    hooks, unreachable skills, oversize CLAUDE.md, malformed MCP entries, persona references,
    and `.agnix.toml` sanity.
  - `harness init` now ships a default `.agnix.toml` so the agnix path works with no extra
    configuration.
  - Supports `--strict`, `--agnix-bin`, `--json`, and `HARNESS_AGNIX_BIN` env override.

### Patch Changes

- Harden orchestrator, rate limiter, and container security defaults.

  **@harness-engineering/orchestrator:**
  - Extract PR detection from `Orchestrator` into standalone `PRDetector` module
  - Fix rate-limiter stack overflow risk by replacing `Math.min(...spread)` with `reduce`
  - Ensure rate limit delays are always >= 1ms
  - Default container network to `none` and block privileged Docker flags
  - Fix stale claim detection: missing timestamp now treated as stale
  - Fix scheduler to only record `lastRunMinute` on task success
  - Add error handling for `ensureBranch`/`ensurePR`/agent dispatch in task-runner
  - Add resilient `rebase --abort` recovery in pr-manager

  **@harness-engineering/core:**
  - Fix `contextBudget` edge cases (zero total tokens, zero `originalSum` during redistribution)
  - Parse `npm audit` stdout on non-zero exit in `SecurityTimelineManager`
  - Add security rule tests (crypto, deserialization, express, go, network, node, path-traversal, react, xss)

  **@harness-engineering/cli:**
  - Break `StepResult` type cycle between `setup.ts` and `telemetry-wizard.ts` via `setup-types.ts`

## 0.21.4

### Patch Changes

- 802a1dd: Fix `search_skills` returning irrelevant results and compaction destroying skill content.
  - Index all non-internal skills regardless of tier so the router can discover Tier 1/2 skills
  - Add minimum score threshold (0.25) to filter noise from incidental substring matches
  - Fix `resultToMcpResponse` double-wrapping strings with `JSON.stringify`, which collapsed newlines and caused truncation to drop all content
  - Truncate long lines to fit budget instead of silently skipping them; cap marker cost at 50% of budget
  - Exempt 12 tools from lossy truncation (run_skill, emit_interaction, manage_state, etc.) — use structural-only compaction for tools whose output must arrive complete

## 0.21.3

### Patch Changes

- Sync VERSION constant to match package.json
- Document adoption, compaction, caching, and telemetry modules in API reference
- Updated dependencies
  - @harness-engineering/types@0.9.2

## 0.21.2

### Patch Changes

- Reduce Tier 2 structural violations and fix exactOptionalPropertyTypes errors across core modules
- Updated dependencies
- Updated dependencies
  - @harness-engineering/graph@0.4.2
  - @harness-engineering/types@0.9.1

## 0.21.1

### Patch Changes

- **Fix blocked status corruption** — `syncFromExternal` no longer overrides manually-set `blocked` status with `planned` during external sync. GitHub Issues "open" status mapped to "planned" via `reverseStatusMap`, and `STATUS_RANK` lateral equivalence (both rank 1) allowed the directional guard to pass. Added explicit `blocked → planned` guard in `syncFromExternal`.
- Reduce cyclomatic complexity in `prediction-engine` and `aggregator`
- Remove orphaned `impact-lab-generator` module
- Move misplaced `jsonl-reader.test.ts` from `src/` to `tests/`

## 0.21.0

### Minor Changes

- Fix roadmap sync mass-assignment and duplicate issue creation
  - **Remove auto-assignee from sync** — `syncToExternal` no longer auto-assigns the authenticated user to every unassigned feature. Assignment only happens through the explicit pilot workflow (`assignFeature`).
  - **Title-based dedup** — `syncToExternal` accepts pre-fetched tickets and checks for existing GitHub issues by title before creating new ones. Dedup is restricted to issues with configured labels (e.g., `harness-managed`) and prefers open issues over closed when titles collide.
  - **Dedup-linked issues get updated** — When a feature is linked to an existing issue via dedup, planning fields are synced immediately (not deferred to the next cycle).
  - **Single fetch per fullSync** — `fullSync` now calls `fetchAllTickets` once and passes the result to both `syncToExternal` and `syncFromExternal`, eliminating redundant paginated API calls.

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.9.0 — `ExternalTicketState.title` field addition

## 0.19.0

### Minor Changes

- GitHub sync assignee support and auto-population
  - **Push assignee on create** — `createTicket` now includes `assignees` in the GitHub Issues API payload when `feature.assignee` is set.
  - **Push assignee on update** — `updateTicket` sends assignee changes (set or clear) via the `assignees` field on issue PATCH.
  - **Auto-populate assignee** — `syncToExternal` fetches the authenticated user's GitHub login via `GET /user` and sets it as the default assignee for features with no assignee. Cached per adapter instance.
  - **`getAuthenticatedUser()`** — New method on `GitHubIssuesSyncAdapter` that calls `GET /user` and returns `@login` format, cached after first call.

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.8.0 — `TrackerSyncAdapter.getAuthenticatedUser()` interface addition

## 0.18.0

### Minor Changes

- GitHub Issues sync adapter: milestones, type labels, and rate limit handling
  - **GitHub milestones** — Roadmap milestones are now created as GitHub milestones. Issues are assigned to their corresponding milestone on both create and update. Milestones are cached per adapter instance to minimize API calls.
  - **Feature type labels** — All synced issues receive a `feature` label on create and update, enabling filtering by issue type.
  - **Milestone on update** — `TrackerSyncAdapter.updateTicket` interface extended with optional `milestone` parameter. Sync engine passes milestone name through on updates.
  - **Rate limit retry** — All API calls retry up to 5 times with exponential backoff and jitter on 403/429 responses. Respects `Retry-After` header when present.
  - **Close done issues on create** — Issues created for `done` features are automatically closed via follow-up PATCH.
  - **Configurable retry** — New `maxRetries` and `baseDelayMs` options on `GitHubAdapterOptions`.

## 0.17.0

### Minor Changes

- Roadmap sync, auto-pick, and assignment
  - **External tracker sync** — Bidirectional sync between roadmap.md and GitHub Issues via `TrackerSyncAdapter` interface. Split authority: roadmap owns planning fields, GitHub owns execution/assignment. Sync fires on every state transition (task-start, task-complete, phase-start, phase-complete, save-handoff, archive_session).
  - **Auto-pick pilot** — New `harness-roadmap-pilot` skill with AI-assisted next-item selection. Two-tier scoring: explicit priority first (P0-P3), then weighted position/dependents/affinity score. Routes to brainstorming (no spec) or autopilot (spec exists).
  - **Assignment with affinity** — Assignee, Priority, and External-ID fields on roadmap features. Assignment history section in roadmap.md enables affinity-based routing. Reassignment produces audit trail (unassigned + assigned records).
  - **New types** — `Priority`, `AssignmentRecord`, `ExternalTicket`, `ExternalTicketState`, `SyncResult`, `TrackerSyncConfig` in @harness-engineering/types.
  - **Config schema** — `TrackerConfigSchema` and `RoadmapConfigSchema` added to `HarnessConfigSchema` for validated tracker configuration.

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.7.0
  - @harness-engineering/graph@0.3.5

## 0.16.0

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

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.6.0
  - @harness-engineering/graph@0.3.4

## 0.15.0

### Minor Changes

- **Code navigation module** — AST-powered outline extraction, cross-file symbol search, and bounded unfold with tree-sitter parser cache. New `code_outline`, `code_search`, and `code_unfold` MCP tools.
- **Structured event log** — JSONL append-only event timeline with content-hash deduplication, integrated into `gather_context`.
- **Learnings enhancements** — Hash-based content deduplication for `appendLearning`, frontmatter annotations with hash and tags, progressive disclosure via `loadIndexEntries` and depth parameter, session learning promotion with `promoteSessionLearnings` and `countLearningEntries`.
- **Extended security scanner** — 18 new rules: 7 agent-config rules (SEC-AGT-001–007), 5 MCP rules (SEC-MCP-001–005), 6 secret detection rules (SEC-SEC-006–011). New `agent-config` and `mcp` security categories. `fileGlob` filtering for targeted rule application in `scanFile`.
- **Progressive disclosure in `gather_context`** — New `depth` parameter for layered context retrieval.

### Patch Changes

- Fix O(1) dedup and remove redundant I/O in events and learnings
- Fix `scanContent` docs, AGT-007 confidence, and regex precision in security scanner
- Fix promoted count and deduplicate budgeted learnings
- Add idempotency guard to `promoteSessionLearnings`
- Fix roadmap sync guard with directional protection and auto-sync
- Updated dependencies
  - @harness-engineering/types@0.5.0

## 0.14.0

### Minor Changes

- **Evidence gate for code review** — Coverage checking and uncited finding tagging in the review pipeline.
  - `tagUncitedFindings()` tags review findings lacking file:line evidence citations
  - `EvidenceCoverageReport` type with per-finding citation status
  - Coverage reporting integrated into output formatters
  - Pipeline orchestrator wired to run evidence gate after validation phase
- **Session section state management** — Read, append, status update, and archive operations for session-scoped accumulative state sections.
  - `readSessionSection()`, `appendSessionSection()`, `updateSessionSectionStatus()`
  - Session archival with date-suffixed directory move
  - Session state file and archive directory constants
  - Barrel file exports for session section and archive functions

### Patch Changes

- Fix evidence gate regex to support `@` in scoped package paths (e.g., `@org/package`)
- Fix `exactOptionalPropertyTypes` compliance in review conditional spread
- Fix cross-device session archive with copy+remove fallback
- Reduce cyclomatic complexity across check orchestrator and tool modules
- Fix CI check warnings for entry points and doc coverage
- Updated dependencies
  - @harness-engineering/types@0.4.0

## 0.13.1

### Patch Changes

- **Check orchestrator refactor** — Extracted 8 handler functions (`runValidateCheck`, `runDepsCheck`, `runDocsCheck`, `runEntropyCheck`, `runSecurityCheck`, `runPerfCheck`, `runPhaseGateCheck`, `runArchCheck`) from `runSingleCheck` switch statement, reducing cyclomatic complexity from 63 to ~10 per function.
- **VERSION constant fix** — Updated deprecated `VERSION` export from 0.11.0 to 0.13.0.
- **Cross-platform path normalization** — `path.relative()` outputs in architecture collectors, constraint validators, doc coverage, context generators, entropy detectors, and review scoper normalized to POSIX separators. New `toPosix()` helper in `fs-utils`.
- **`fs-utils` enhancement** — Added `toPosix()` for consistent cross-platform path separators.

## 0.13.0

### Minor Changes

- Efficient Context Pipeline: session-scoped state, token-budgeted learnings, session summaries, and learnings pruning
  - **Session-scoped state**: All state files (state.json, handoff.json, learnings.md, failures.md) can now be scoped to a session directory under `.harness/sessions/<slug>/`, enabling parallel Claude Code windows without conflicts
  - **Session resolver**: `resolveSessionDir()` and `updateSessionIndex()` for session directory management with path traversal protection
  - **Token-budgeted learnings**: `loadBudgetedLearnings()` with two-tier loading (session first, global second), recency sorting, relevance scoring, and configurable token budget
  - **Session summaries**: `writeSessionSummary()`, `loadSessionSummary()`, `listActiveSessions()` for lightweight cold-start context (~200 tokens)
  - **Learnings pruning**: `analyzeLearningPatterns()` groups entries by skill/outcome tags, `pruneLearnings()` archives old entries to `.harness/learnings-archive/{YYYY-MM}.md` keeping 20 most recent, `archiveLearnings()` for manual archival
  - **Roadmap parser fix**: Parser now accepts both `### Feature: X` and `### X` format, serializer outputs format matching actual roadmap files
  - All core state functions (`loadState`, `saveState`, `appendLearning`, `loadRelevantLearnings`, `appendFailure`, `loadFailures`, `saveHandoff`, `loadHandoff`) accept optional `session` parameter
  - `gather_context` threads session parameter to all core calls

### Patch Changes

- Fix circular dependency in entropy types module
- Fix `estimateTokens` usage in budget enforcement loop

## 0.12.0

### Minor Changes

- Add constraint sharing support and blueprint fixes
  - `removeContributions` function for lockfile-driven rule removal during constraint uninstall
  - Export `removeContributions` from sharing module index
  - Fix blueprint quiz generation that failed with mock LLM service
  - Fix content-pipeline test imports

## 0.11.0

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

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.3.0
  - @harness-engineering/graph@0.3.2

## 0.10.1

### Patch Changes

- Invalidate state cache on write to prevent stale hits in CI

## 0.10.0

### Minor Changes

- **GraphStore singleton cache** with mtime-based invalidation and pending-promise dedup for concurrent access (LRU cap: 8 entries)
- **Learnings/failures index cache** with mtime invalidation and LRU eviction in state-manager
- **Parallelized CI checks** — `check-orchestrator` runs validate first, then 6 remaining checks via `Promise.all`
- **Parallelized mechanical checks** — docs and security checks run in parallel with explicit findings-merge pattern

### Patch Changes

- Resolve stale `VERSION` constant (was `0.8.0`, should be `1.8.1`) causing incorrect update notifications
- Deprecate core `VERSION` export — consumers should read from `@harness-engineering/cli/package.json`

## 0.9.0

### Minor Changes

- **Review pipeline** — full 7-phase code review system
  - Mechanical checks with `runMechanicalChecks()` and `ExclusionSet` for file+line range matching
  - Context scoping with graph-aware and heuristic fallback change-type detection
  - Fan-out orchestrator with parallel agent dispatch (architecture, security, bug detection, compliance agents)
  - `ReviewFinding`, `ModelTierConfig`, and `ReviewAgentDescriptor` types
  - Validation and deduplication phases with security field preservation
  - Model tier resolver with provider defaults via `resolveModelTier()`
  - Eligibility gate for CI mode
  - Output formatters for terminal, GitHub comment, and summary
  - Assessment logic with exit code mapping
  - `runPipeline()` orchestrator for the complete 7-phase review pipeline
  - `PipelineContext`, `PipelineFlags`, and `PipelineResult` types
- **Roadmap module** — parse, serialize, and sync project roadmaps
  - `parseRoadmap()` with frontmatter and feature parsing
  - `serializeRoadmap()` with round-trip fidelity
  - `syncRoadmap()` with state inference logic
- **Update checker** — background update check system
  - `UpdateCheckState` type, `isUpdateCheckEnabled`, `shouldRunCheck`
  - `readCheckState` with graceful error handling
  - `spawnBackgroundCheck` with detached child process
  - `getUpdateNotification` with semver comparison
- **Entropy enhancements** — new fix types and cleanup finding classifier
  - Dead export, commented-out code, orphaned dependency, and forbidden import replacement fix creators
  - `CleanupFinding` classifier with hotspot downgrade and dedup
  - Expanded `FixType` union and `CleanupFinding` schema
- **Config schema additions**
  - `updateCheckInterval` in `HarnessConfigSchema`
  - `review.model_tiers` in `HarnessConfigSchema`
- **Transition system** — add `requiresConfirmation` and `summary` to `TransitionSchema`
- **Constraints** — add `ForbiddenImportRule` type with alternative field
- **Security** — add `harness-ignore` inline suppression for false positives
- Re-export interaction module from core index

### Patch Changes

- Fix `exactOptionalPropertyTypes` for suggestion field in `mergeFindings`
- Fix security agent strings from triggering SEC-INJ-001 scan
- Enforce path sanitization across all MCP tools and harden crypto
- Address code review findings for fan-out agents, context scoping, and review pipeline
- Resolve TypeScript strict-mode errors and platform parity gaps
- Updated dependencies
  - @harness-engineering/types@0.2.0

## 0.8.0

### Minor Changes

- Graph-enhanced context assembly (Phase 4)
  - `contextBudget()`: optional graph-density-aware token allocation
  - `contextFilter()`: optional graph-driven phase filtering
  - `generateAgentsMap()`: optional graph-topology generation
  - `checkDocCoverage()`: optional graph-based coverage analysis
  - Deprecation warnings on `validateAgentsMap()` and `validateKnowledgeMap()`
- Graph-enhanced entropy detection (Phase 5)
  - `EntropyAnalyzer.analyze()`: optional graph mode skips snapshot rebuild
  - `detectDocDrift()`: optional graph-based stale edge detection
  - `detectDeadCode()`: optional graph-based reachability analysis
- Graph-enhanced constraint checking (Phase 6)
  - `buildDependencyGraph()`: optional graph data bypasses file parsing
  - `validateDependencies()`: optional graph data skips parser health check and file globbing
  - `detectCircularDepsInFiles()`: optional graph data skips file parsing
  - New `GraphDependencyData` type in constraints
- Graph-enhanced feedback system (Phase 7)
  - `analyzeDiff()`: optional graph impact data for test coverage and scope analysis
  - `ChecklistBuilder.withHarnessChecks()`: optional graph data replaces placeholder harness checks
  - `createSelfReview()`: optional graph data passthrough to builder and analyzer
  - New `GraphImpactData` and `GraphHarnessCheckData` types

### Patch Changes

- Move `EntropyError` definition to `shared/errors.ts` to break circular import
- All graph enhancements use optional trailing parameters — existing behavior unchanged when not provided

## 0.7.0

### Minor Changes

- Add CI/CD integration commands and documentation
  - New `harness ci check` command: runs all harness checks (validate, deps, docs, entropy, phase-gate) with structured JSON output and meaningful exit codes
  - New `harness ci init` command: generates CI config for GitHub Actions, GitLab CI, or a generic shell script
  - New CI types: `CICheckReport`, `CICheckName`, `CIPlatform`, and related interfaces
  - Core `runCIChecks` orchestrator composing existing validation into a single CI entrypoint
  - 4 documentation guides: automation overview, CI/CD validation, issue tracker integration, headless agents
  - 6 copy-paste recipes: GitHub Actions, GitLab CI, shell script, webhook handler, Jira rules, headless agent action

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.1.0

## 0.6.0

### Minor Changes

- dc88a2e: Codebase hardening: normalize package scripts, deduplicate Result type, tighten API surface, expand test coverage, and fix documentation drift.

  **Breaking (core):** Removed 6 internal helpers from the entropy barrel export: `resolveEntryPoints`, `parseDocumentationFile`, `findPossibleMatches`, `levenshteinDistance`, `buildReachabilityMap`, `checkConfigPattern`. These were implementation details not used by any downstream package. If you imported them directly from `@harness-engineering/core`, import from the specific detector file instead (e.g., `@harness-engineering/core/src/entropy/detectors/drift`).

  **core:** `Result<T,E>` is now re-exported from `@harness-engineering/types` instead of being defined separately. No consumer-facing change.

  **All packages:** Normalized scripts (consistent `test`, `test:watch`, `lint`, `typecheck`, `clean`). Added mcp-server to root tsconfig references.

  **mcp-server:** Fixed 5 `no-explicit-any` lint errors in architecture, feedback, and validate tools.

  **Test coverage:** Added 96 new tests across 13 new test files (types, cli subcommands, mcp-server tools).

  **Documentation:** Rewrote cli.md and configuration.md to match actual implementation. Fixed 10 inaccuracies in AGENTS.md.

### Patch Changes

- Updated dependencies [dc88a2e]
  - @harness-engineering/types@0.0.1

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-12

### Added

- **Entropy Management Module** - Tools for detecting and fixing codebase entropy
  - `EntropyAnalyzer` - Main orchestrator for entropy analysis
  - `buildSnapshot()` - Build CodebaseSnapshot for efficient multi-pass analysis
  - `detectDocDrift()` - Documentation drift detection (API signatures, examples, structure)
  - `detectDeadCode()` - Dead code detection (files, exports, unused imports)
  - `detectPatternViolations()` - Pattern violation detection (config-based)
  - `createFixes()` - Generate safe, auto-applicable fixes
  - `applyFixes()` - Apply fixes with backup support
  - `generateSuggestions()` - Generate suggestions for manual fixes
  - `validatePatternConfig()` - Zod schema validation for pattern configs
- Levenshtein distance fuzzy matching for drift detection
- BFS reachability analysis for dead code detection
- Minimatch-based glob pattern matching

### Changed

- Updated VERSION to 0.4.0

## [0.3.0] - 2026-03-12

### Added

- **Architectural Constraints Module** - Tools for enforcing layered architecture
  - `defineLayer()` - Create layer definitions with dependency rules
  - `validateDependencies()` - Validate imports respect layer boundaries
  - `detectCircularDeps()` - Detect cycles using Tarjan's SCC algorithm
  - `detectCircularDepsInFiles()` - Standalone cycle detection from files
  - `createBoundaryValidator()` - Create Zod-based boundary validators
  - `validateBoundaries()` - Validate multiple boundaries at once
- **Parser Abstraction Layer** - Reusable AST parsing infrastructure
  - `TypeScriptParser` - Full AST parsing for TypeScript files
  - `LanguageParser` interface for multi-language support
  - Import/export extraction with type-only import detection
- Parser health checks with configurable fallback behavior

### Changed

- Updated VERSION to 0.3.0

## [0.2.0] - 2026-03-12

### Added

- **Context Engineering Module** - Tools for AGENTS.md validation and generation
  - `validateAgentsMap()` - Parse and validate AGENTS.md structure
  - `checkDocCoverage()` - Analyze documentation coverage for code files
  - `validateKnowledgeMap()` - Check integrity of all documentation links
  - `generateAgentsMap()` - Auto-generate AGENTS.md from project structure
  - `extractMarkdownLinks()` - Extract markdown links from content
  - `extractSections()` - Extract sections from markdown content
- Required sections validation for harness-engineering projects
- Documentation gap identification with importance levels
- Broken link detection with fix suggestions

### Changed

- Updated VERSION to 0.2.0

## [0.1.0] - 2026-03-12

### Added

- Core validation framework with extensible validator architecture
- Schema-based validation with Zod integration
- Composite validation with sequential and parallel execution
- Rule-based validation system
- File pattern matching with glob support
- Configuration validation
- Type definitions for all exports
- Comprehensive unit test coverage (>80%)
- ESM and CommonJS build outputs
- TypeScript type declarations

### Changed

- N/A (Initial release)

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- N/A

### Security

- N/A

[0.4.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.4.0
[0.3.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.3.0
[0.2.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.2.0
[0.1.0]: https://github.com/Intense-Visions/harness-engineering/releases/tag/@harness-engineering/core@0.1.0
