## 2026-06-27: protect-config fail-closed — hook fail-open is load-bearing under issue #619

Hardening a harness hook to "fail closed" on malformed input is NOT a blanket win — it interacts with a documented stability fix:

1. **All harness hooks fail OPEN on absent/partial stdin on purpose.** `protect-config.test.ts:8-10` records issue #619: under v8 coverage the `cat <file> | node` pipe intermittently delivers empty/truncated stdin, which trips the fail-open path. Every sibling hook (including the security hook `sentinel-pre.js:107,112,119`) exits 0 on unreadable/empty/unparseable stdin. A naive "make the security hook fail closed" would turn that coverage glitch into BLOCKED legitimate Write/Edit calls — a self-DoS. The fix that ships: fail closed only on a _well-formed-but-unresolvable_ request (valid JSON, missing/non-string `file_path`, or an unexpected post-parse throw); keep absent/partial stdin fail-open. The #619 glitch lands in the still-open branches, so stability is preserved.

2. **A PreToolUse Write|Edit hook flipping to exit 2 is near-zero false-positive risk for the missing-file_path branch** because Write/Edit always carry `file_path` by schema (matcher is `Write|Edit`, not `*` — `profiles.ts:29`). But pin it with tests (null / number / empty-string) since the branch now BLOCKS instead of allows.

3. **Behavior-only hook changes do NOT trigger the profiles.ts/plugin-config.mjs dual-source concern** — that only applies to hook-profile _membership_ changes. This change kept protect-config in the standard profile, so no STANDARD_HOOKS mirror edit was needed.

## 2026-06-04: init-design-roadmap-polish — autopilot resume and pre-push hook interactions

Three reusable observations from resuming a session at FINAL_REVIEW and shipping the PR:

1. **State files and review artifacts can drift.** `final-review.json` was written when the cross-phase review ran, but `autopilot-state.json` kept `finalReview.status: "pending"` because the state transition never landed (likely the prior session ended mid-DONE-transition). Always reconcile both on resume: trust the artifact if it exists and is internally consistent, then advance state.

2. **Pre-push hooks check on-disk state, not the push payload.** Unrelated uncommitted WT changes (e.g. `docs/roadmap.md` failing prettier; pre-existing platform-parity drift in `harness-ideate` + `harness-knowledge-pipeline` SKILL.md copies) blocked `git push` even though they were neither staged nor in the PR diff. Symptom: hooks run prettier/test against the whole working tree before allowing the push. Disposition: stash unrelated WT changes; fix or sync pre-existing drift on the same branch as a separate `chore:` commit (not folded into spec phase commits).

3. **Platform parity drift is silently re-introduced when only `claude-code` copies are edited.** The `tests/platform-parity.test.ts` failures pointed at exactly the right `cp` commands in their assertion messages. When syncing a batch of staged claude-code SKILL.md edits to other platforms, copy claude-code → codex/cursor/gemini-cli for each; some staged edits may turn out to be no-op (whitespace) and already in parity. Verify with `pnpm run test` before pushing.

## 2026-05-23: Architecture constraints discovered while spec'ing + scaffolding design-pipeline sub-projects #2 + #6

Three load-bearing facts about this codebase that the design-pipeline specs assumed wrong:

1. **`harness:autopilot` cannot run from inside a subagent.** Autopilot's whole architecture is `subagent_type` dispatch to harness-planner / harness-task-executor / harness-verifier / harness-code-reviewer. Spawned background agents do not have the Task tool — they hit autopilot's "Iron Law: delegates, never reimplements" gate at INIT and stop. Autopilot must run from the _primary_ Claude Code session (the one with Agent/Task access). Two parallel autopilots = me alternating dispatches from the primary session, not two background agents running autopilots.

2. **Skills are markdown-only and live at `agents/skills/<platform>/<name>/`, NOT `packages/cli/src/skills/<name>/src/`.** The `packages/cli/src/skill/` (singular) directory holds the skill SUBSYSTEM (dispatcher, schema, recommender). Individual skills are `SKILL.md` + `skill.yaml` only. Code that a skill INVOKES lives in conventional homes: MCP tools at `packages/cli/src/mcp/tools/`, graph adapters at `packages/graph/src/constraints/`, shared catalog data at `agents/skills/shared/design-knowledge/`. New specs should reflect this; existing design-pipeline specs got the layout wrong and need a path-correction amendment (see `docs/changes/design-pipeline/AMENDMENTS.md`).

3. **`packages/cli/src/skills/` does not exist.** When a plan or spec references that path, treat it as a red flag for the architecture mismatch in #2 above. Both planner agents that authored plans for design-pipeline #2 and #6 flagged this as concern #1 and built in escalation tasks.

## 2026-05-06: Graph ingest robustness — issues #274 + #276

Two independent crash modes on real-world monorepos, both fixed in this pass:

- **#274 (recursion / OOM)**: `CodeIngestor.findSourceFiles` shipped a 22-entry inline if-chain skip list and missed every modern JS-monorepo cache (`.turbo`, `.vite`, `.cache`, `.docusaurus`, `.wrangler`, `.svelte-kit`, `storybook-static`, etc.) plus AI agent sandbox dirs (`.claude`, `.cursor`, `.codex`). On heavy users, `.claude/worktrees/` (Claude Code's worktree clones) alone multiplied walker workload 50×. The walker was also recursive — one stack frame per directory level. Fix: extracted `DEFAULT_SKIP_DIRS` to a shared constant (60+ entries), rewrote the walker as iterative BFS, added `CodeIngestorOptions` for `skipDirs` / `additionalSkipDirs` / `excludePatterns` / `respectGitignore`, plumbed an `ingest` block through `harness.config.json` → `runScan` / `runIngest`.

- **#276 (V8 string-cap)**: `loadGraph` slurped `graph.json` into one string via `readFile` then `JSON.parse`. V8 hard-caps single strings at ~512 MB; production graphs exceed it. Fix: bumped on-disk schema v1 → v2 with NDJSON format (one record per line, `kind` discriminator), streaming reader via `readline`, `loadGraphMetadata` fast-path so `harness graph status` works on multi-GB graphs without ever opening `graph.json`. Old v1 graphs trigger the existing `schema_mismatch` path → automatic rebuild on next scan.

Lessons:

- For library packages, hand-roll a tiny `.gitignore` parser instead of pulling in the `ignore` package — the common subset (blank, comment, anchored, dir-only, glob) is ~25 lines; negation is the only feature worth deferring.
- Schema migrations are nearly free here because `GraphStore.load` already returns false on `schema_mismatch` and warns the caller to rerun scan. Bumping the version is cheaper than building a migration shim.
- When extracting sub-schemas from `HarnessConfigSchema`, give them their own files — the cli's command-test mocks of `@harness-engineering/graph` are incomplete by convention, and any transitive import dragged in by the schema breaks them.
- JSDoc inside TypeScript files cannot contain literal `**/` — the embedded `*/` ends the comment block and corrupts the parse. Keep glob examples in markdown docs, not JSDoc.

## 2026-04-23: Phase 5 Visual & Advanced — Cross-Layer Interface Re-declaration

When the `graph` package needs to accept an `AnalysisProvider` (from `intelligence`), re-declare a minimal interface locally rather than importing across layers. The `graph` → `intelligence` dependency would violate the layer architecture. The `ImageAnalysisExtractor` declares its own `AnalysisProvider` interface with matching shape, and callers (CLI, pipeline) inject the concrete provider.

## 2026-04-22: Default Directory Ignores for Code Scanning

When implementing directory traversal for code scanning/ingestion, ensure default ignore lists include common build output, dependency, and tool directories for all supported languages and ecosystems:

- **Node.js**: `node_modules`, `dist`, `.next`, `.turbo`
- **Java/Maven/Gradle**: `target`, `build`, `.gradle`, `.gradle-home`
- **Python**: `__pycache__`, `.venv`, `venv`
- **Go/PHP/Ruby/Elixir**: `vendor`, `deps`, `_build`
- **C#**: `bin`, `obj`
- **Rust**: `target`
- **Git**: `.git` (Crucial to avoid scanning internal git objects)
- **Tools**: `.vscode`, `.idea`, `.harness`
- **Test Artifacts**: `coverage`, `.nyc_output`

## CI Workflow Template (#540) — 2026-06-23

- When a generated CI workflow runs `harness ci check`, it MUST first install the CLI (`npm install -g @harness-engineering/cli`). GitHub-hosted ubuntu runners ship Node+npm for any project language, so a global install works universally; omitting it fails the gate with exit 127 (command-not-found), not a real check failure.
- In generated TS GitHub workflows, `pnpm/action-setup` must precede `actions/setup-node` — `setup-node`'s `cache: 'pnpm'` needs pnpm already on PATH. Mirror the dogfood `.github/workflows/ci.yml` ordering when disseminating it.
- Single-generator rule (ADR 0037): both `harness init` (scaffold-time) and `harness ci init` (on-demand) route through one `generateCIConfig`; never add a second `templates/ci/` YAML source — it drifts.

## Subprocess budgets: local vs network (2026-09-10, #2136)

A single `execFile` timeout constant shared by local (`git log`) and network (`gh`) commands
is a latent bug class. `packages/signals` applied a 5s local-process budget to a paginated
`gh pr list --limit 500 --json ...,reviews` call that really takes ~10-14s, killing it every
time. The budget belongs to the CALL SITE — if the injectable runner type cannot carry it,
the "callers may pass a wider value" escape hatch is decorative.

Diagnostic tell: Node's `execFile` timeout error message is `Command failed: <argv>\n<stderr>`
with an **empty** stderr tail. An empty tail means SIGTERM-kill (timeout); a real non-zero exit
carries stderr. Check the tail before believing a wrapper's asserted cause — here the wrapper
said `gh unavailable or not authenticated: ${anyError}`, a cause it never verified, and that
misdirection was the most expensive part of the investigation.

## 2026-09-24 autopilot: stats-explore-exploit (session changes--stats-explore-exploit--proposal)

- [skill:harness-autopilot] [outcome:pass] Pre-commit arch gate false REGRESSION (356>349 in untouched files) = stale packages/cli/dist; `pnpm turbo run build --filter=@harness-engineering/cli...` (cache hit) fixes it; never edit the baseline.
- [skill:harness-autopilot] [outcome:pass] Layer `allowedDependencies` are unenforced across packages: the validator skips bare `@harness-engineering/*` specifiers (dependencies.ts:100-103). Filed #2216. Declaring a layer records intent; the package.json pin is the real guarantee.
- [skill:harness-code-review] [outcome:pass] canary-cassandra mutant probes caught two real test gaps per-phase reviews missed (Thompson explore mode never observed; termination test unfalsifiable). Run a scratch mutant before trusting a statistical test.
- [skill:harness-autopilot] [outcome:pass] `outcome_eval` MCP tool takes the diff inline; a 171KB diff cannot be emitted by a subagent. Use `harness outcome-eval-ci --diff <range>`; the evaluator caps each field at 12,000 chars by design (prompts.ts PROMPT_FIELD_MAX_CHARS).
- [skill:harness-autopilot] [outcome:pass] Spec-vs-code defaults drift (BanditConfig halfLifeDays 30 / minEffectiveN 2) surfaced only at the docs phase; verifiers should diff the spec's type comments against the resolver defaults in the code phase.

## 2026-09-25 harness-execution: fix the StreamingIndicator rotation flake (#2225)

- [skill:harness-execution] [outcome:gotcha] A test can only pin a component's `Math.random` positionally if NOTHING ELSE in the render tree draws. `StreamingIndicator` renders `NeuralOrganism`, which draws 197 times during mount and ~195 more per 4500ms of fake time from self-rescheduling spark timers (`setTimeout(fire, 300 + Math.random() * 700)`). Measure the draw order with a spy before designing the sequence — the brief's assumed order (initial index, then period) was right only after the avatar was stubbed out.
- [skill:harness-execution] [outcome:gotcha] React's effect order is child-before-parent, so even the PARENT's period draw sits behind every descendant's draws. Verify by spying on `setInterval` and recording the draw count at each call: `[{delay:100,drawsBefore:197},{delay:6396,drawsBefore:199},{delay:1000,drawsBefore:199}]` named the period draw unambiguously.
- [skill:harness-execution] [outcome:decision] A pinned random sequence makes a no-repeat test pass VACUOUSLY unless the sequence deliberately repeats a value adjacently, forcing the component's `do { } while (next === prev)` guard to draw again. Pinning without that is how a flake fix quietly deletes the assertion. Confirmed by mutant: removing the guard fails the suite at rotation 2.
- [skill:harness-execution] [outcome:gotcha] `vi.advanceTimersByTime(n)` carries unconsumed time forward, so advancing by an interval's UPPER bound fires a shorter interval twice on some iterations. Advance by the exact period, never by a bound. Measured failure rate of the upper-bound form: 8/200 mounts (~4%).
- [skill:harness-execution] [outcome:gotcha] `packages/dashboard`'s `typecheck` excludes `tests/` (`tsconfig.json` `include: src/**/*`, `exclude: [..., tests]`), so `pnpm --filter ... typecheck` does NOT cover a test-only change. Typecheck it with a throwaway tsconfig that includes the file, or the gate is hollow.
- [skill:harness-execution] [outcome:decision] Test-only commits in this repo carry no changeset (15/15 of the most recent test-only commits have zero `.changeset/` files). Skipped it.
