# Learnings

## 2026-04-16 — Adoption & Usage Telemetry: Roadmap Closure

- [skill:harness-verification] [outcome:success] Verified all 13 spec success criteria satisfied against origin/main: types in `packages/types/src/adoption.ts`, core reader/aggregator in `packages/core/src/adoption/`, Stop hook `packages/cli/src/hooks/adoption-tracker.js` registered under `standard` profile, CLI `harness adoption skills|recent|skill` with `--json`, `/api/adoption` endpoint, dedicated `/adoption` dashboard page wired into route table and nav. `harness validate` passes.
- [skill:harness-verification] [outcome:observation] Issue #134 / roadmap entry remained `in-progress` after all underlying code landed across PRs #147 and #149. Roadmap closure (status flip to `done`) is a separate manual step from implementation landing — useful reminder that tracker state can lag behind the code.
- [skill:harness-verification] [outcome:decision] Scoped this PR to the roadmap status update only. Re-shipping code that is already merged on main would be churn; the honest completion of the issue is updating the tracking surface to reflect reality.

## 2026-04-16 — Adoption & Usage Telemetry: Dashboard UI Completion

- [skill:harness-execution] [outcome:success] Types, core reader/aggregator, Stop hook, CLI commands (`harness adoption skills/recent/skill`), and the `/api/adoption` route were already implemented (commit c2f57471). Proposal success criterion #9 ("adoption appears on the dashboard") was the only remaining gap: the API existed but no UI consumed it.
- [skill:harness-execution] [outcome:decision] Chose a dedicated `/adoption` page over an Overview section because the data model (ranked skill list with per-skill metrics) does not reduce cleanly to a KPI card and warrants its own surface. Pattern mirrors `Impact` page structure.
- [skill:harness-execution] [outcome:gotcha] Client code imports types via `@shared/types`, not `@harness-engineering/types` directly — vite alias is `@shared` only. Re-exported `AdoptionSnapshot` and `SkillAdoptionSummary` through `packages/dashboard/src/shared/types.ts` to keep the pattern consistent with `FeatureStatus`.

## 2026-03-24 — Constraint Sharing Merge Engine

- [skill:harness-execution] [outcome:gotcha] Zod inferred types with optional fields produce `string | undefined` which conflicts with `exactOptionalPropertyTypes: true` in tsconfig. When pushing Zod-inferred objects into typed arrays, construct the entry explicitly and conditionally assign optional fields only when defined.
- [skill:harness-execution] [outcome:success] All 8 tasks completed in a single session with no blockers. TDD rhythm worked smoothly — each section's tests caught the stub returning empty results, then implementation made them pass.

## 2026-03-24 — Orchestrator Phase 4: Observability & CLI

- [skill:harness-execution] [outcome:gotcha] ink-table@3.1.0 has a require() conflict with ESM top-level await in Ink 4.4.1. Swapped for a custom Ink-primitive table in AgentsTable.tsx for better control and ESM compatibility.
- [skill:harness-execution] [outcome:gotcha] exactOptionalPropertyTypes: true prevents passing { version: undefined } even if the property is optional. Use an empty object {} or omit the key entirely.
- [skill:harness-execution] [outcome:decision] Extended Orchestrator with EventEmitter instead of using a separate observer pattern to keep the dependency graph flat and the TUI integration simple.
- [skill:harness-execution] [outcome:success] Reconstructed missing core/sharing types and restored CLI exports, unblocking both the orchestrator and the community marketplace features.

## 2026-03-24 [skill:harness-verification] [outcome:pass]: Verified Orchestrator Phase 3 (Wiring). 4 artifacts checked at all 3 levels. Side effects, daemon lifecycle, and multi-turn runner confirmed functional.

- **2026-03-23 [skill:harness-debugging] [outcome:fixed CI failure on Windows due to stale cache hits in state-manager.]:** Manual cache invalidation on write is much more robust than relying on file system timestamps (mtimeMs), particularly for rapid operations or on systems with low timestamp resolution (Windows CI). Invalidate cache maps in all write-related functions (append, archive, save) rather than just relying on the load-time stat check.

## 2026-03-23 — Phase 2: MCP Tool for Task Independence Detection

- [skill:harness-execution] [outcome:success] All 4 tasks completed. check_task_independence tool registered as tool #42. 16 new tests, 325 total MCP tests pass across 38 files.
- [skill:harness-execution] [outcome:gotcha] Both server.test.ts and server-integration.test.ts have hardcoded tool counts (41->42). Same pattern noted in prior learnings for roadmap tool addition.

## 2026-03-23 — Phase 2: ConflictPredictor Unit Tests

- [skill:harness-execution] [outcome:success] All 5 tasks completed. 23 tests pass for ConflictPredictor covering validation, severity classification (high/medium/low), regrouping behavior, verdict/summary, and severity precedence.
- [skill:harness-execution] [outcome:gotcha] In small graphs, the coupling adapter's P80 threshold equals shared.ts's coupling (fanIn=2 from the import edges that create transitive overlap), causing transitive overlaps to classify as medium instead of low. Fix: add a triangle cluster of 3 mutually-importing files (coupling=4 each) to push the P80 threshold above shared.ts's value of 2.
- [skill:harness-execution] [outcome:gotcha] Hub-and-leaf patterns are inefficient for raising coupling P80: each hub adds 1 high-coupling file but N low-coupling leaves, diluting the percentile. Triangle/cycle patterns (3 files, 6 edges, zero new low-coupling nodes) are far more efficient.

## 2026-03-21 — Autopilot: Unified Code Review Pipeline

- [skill:harness-autopilot] [outcome:complete] Executed 8 phases, 59 tasks, 0 retries
- [skill:harness-autopilot] [outcome:observation] All 8 phases were medium complexity — auto-planning worked for all of them without needing interactive planning
- [skill:harness-autopilot] [outcome:observation] Code review consistently caught real issues: mutable module-level counters (Phase 4), unused interface fields (Phase 4), missing path normalization (Phase 2→5), undeclared flags (Phase 1). Review-then-fix cycle added ~10% time but caught bugs that would have compounded in later phases
- [skill:harness-autopilot] [outcome:observation] The gemini-cli harness-code-review is a symlink to claude-code, so platform parity is automatic — no separate copy needed
- [skill:harness-autopilot] [outcome:observation] Pure function design (eligibility gate, change-type detection, assessment) makes testing trivial and keeps the review module composable — zero mocking needed for 3 of 8 phases

## 2026-03-21 — Review Pipeline Phase 6: Output + Inline Comments

- [skill:harness-execution] [outcome:success] All 8 tasks completed in a single session with 6 atomic commits. 31 new tests (8 assessment + 10 terminal + 13 GitHub), 146 total review tests pass.
- [skill:harness-execution] [outcome:gotcha] Plan test for severity ordering used `indexOf('Suggestion')` which matched `Suggestion:` in finding blocks (formatFindingBlock output) before the `### Suggestion` section header. Fixed by searching for `### Suggestion` (with header prefix) to ensure correct ordering assertion.
- [skill:harness-execution] [outcome:gotcha] State.json was corrupted from a previous session (showed all tasks complete but output/ directory did not exist). Always verify file/directory existence before trusting state — corrupted state can cause skipped work.

## 2026-03-21 — Review Pipeline Phase 7: Eligibility Gate + CI Mode

- [skill:harness-execution] [outcome:success] All 5 tasks completed in a single session with 3 atomic commits. 11 new eligibility gate tests, 157 total review tests pass.
- [skill:harness-execution] [outcome:gotcha] State.json was stale from Phase 6 (showed 8/8 tasks complete for a 5-task plan). Verified artifact non-existence before resetting state — same pattern as Phase 6 learning about corrupted state.

## 2026-03-21 — Soundness Review Phase 7: Parent Skill Integration

- [skill:harness-execution] [outcome:success] Both tasks completed in a single session with 1 atomic commit. Brainstorming SKILL.md got new step 2, planning SKILL.md got new step 6 — both for soundness review invocation.
- [skill:harness-execution] [outcome:gotcha] Plan referenced `tests/skills` path that does not exist in packages/cli. Skill-related tests are distributed across tests/slash-commands, tests/commands/skill.test.ts, and tests/persona/builtins.test.ts.
- [skill:harness-execution] [outcome:gotcha] State.json was stale from a different plan (showed Task 1 complete with unrelated summary). Verified actual file contents before trusting state — same pattern as prior learnings about corrupted/stale state.

## 2026-03-21 — Soundness Review Phase 8: User Escalation UX

- [skill:harness-execution] [outcome:success] Both tasks completed in a single session with 1 atomic commit (88aeba8). Replaced the last "Not yet implemented" stub with 5-step SURFACE procedures + Clean Exit criteria. 150 lines added, 18 removed.
- [skill:harness-execution] [outcome:gotcha] State.json was stale from Phase 7 (showed both tasks complete). Grep for the stub confirmed it was still present — same recurring pattern of stale state across session-scoped state files.
- [skill:harness-execution] [outcome:success] Combined Tasks 1+2 into a single commit with both platform copies staged together, honoring the Prettier parity learning. Prettier reformatted both copies identically.

## 2026-03-21 — Review Pipeline Phase 8: Model Tiering Config (FINAL)

- [skill:harness-execution] [outcome:success] All 5 tasks completed in a single session with 5 atomic commits. 13 new core resolver tests, 14 new CLI schema tests. 170 total review tests, 63 CLI config tests pass.
- [skill:harness-execution] [outcome:success] State.json was stale from Phase 7 — same recurring pattern. Reset state before execution.
- [skill:harness-execution] [outcome:success] This was the FINAL phase of the unified code review pipeline (8 phases total). All phases complete: exclusion set, mechanical checks, context scoping, fan-out agents, validation, deduplication/output, eligibility gate, model tiering config.

## 2026-03-21 — Autopilot: Spec & Plan Soundness Review

- [skill:harness-autopilot] [outcome:complete] Executed 8 phases, 33 tasks, 0 retries
- [skill:harness-autopilot] [outcome:observation] Documentation-only phases (SKILL.md edits) are fast and clean — all 8 phases completed without a single retry
- [skill:harness-autopilot] [outcome:observation] Code review consistently caught internal coherence issues (arithmetic in examples, mislabeled cascading fixes, P5-001 classification inconsistency, stale forward references) — exactly the kind of issues this soundness review skill is designed to detect
- [skill:harness-autopilot] [outcome:observation] Phases 4-6 were more comprehensive than the spec anticipated — Phase 4 delivered plan-mode fix procedures (spec Phase 5 scope), and Phases 2/4 delivered graph variants (spec Phase 6 scope), reducing later phases to gap-filling
- [skill:harness-autopilot] [outcome:observation] gemini-cli copies: some skills use symlinks (brainstorming, planning) while others use regular files (soundness-review). Always check before assuming copy behavior

## 2026-03-21 — Roadmap Core Types and Parser (Phase 1)

- [skill:harness-execution] [outcome:success] All 6 tasks completed in a single session with 6 atomic commits. 16 new tests (10 parse + 6 serialize), full TDD rhythm.
- [skill:harness-execution] [outcome:gotcha] Types package dist must be rebuilt (`pnpm run build` in packages/types) before core `tsc --noEmit` can resolve new type exports. Tests pass without rebuild (vitest resolves via workspace aliases), but tsc needs the .d.ts files. Same pattern as update-checker Phase 2 learning.

## 2026-03-21 — Roadmap MCP Tool CRUD Operations (Phase 2)

- [skill:harness-execution] [outcome:success] All 7 tasks completed in a single session with 7 atomic commits. 31 new roadmap tests, 201 total MCP server tests pass.
- [skill:harness-execution] [outcome:gotcha] server-integration.test.ts has a separate tool count assertion from server.test.ts -- both must be updated when adding new tools. Plan only mentioned server.test.ts (37->38), but server-integration.test.ts also had a hardcoded 37.

## 2026-03-21 — Roadmap Skill Interactive Creation (Phase 3)

- [skill:harness-execution] [outcome:success] All 5 tasks completed in a single session with 3 atomic commits. 248 structure tests, 55 slash-command tests pass. Both platform copies staged together for Prettier parity.
- [skill:harness-execution] [outcome:gotcha] Skill structure tests must be run via `./packages/cli/node_modules/.bin/vitest` from root, not `npx vitest` or `pnpm exec vitest`. The root does not have vitest in PATH and pnpm exec runs recursively across workspaces.
- [skill:harness-execution] [outcome:gotcha] dist/ copies of agents/skills/tests/ always fail due to pre-existing tsconfig resolution issue (extends: ../../tsconfig.base.json cannot resolve from dist/). Only the actual agents/skills/tests/ results matter -- the 2 dist/ failures are noise.
- [skill:harness-execution] [outcome:success] Combined Tasks 2+3 (SKILL.md creation) with gemini-cli copy into a single commit, honoring the Prettier parity learning from prior phases. Prettier reformatted both copies identically.

## 2026-03-21 — Interaction Surface Abstraction: Skill Migration (Tasks 7-14)

- [skill:harness-execution] [outcome:success] All 8 tasks (7-14) completed in a single session with 7 atomic commits. All 5 core skills migrated with emit_interaction tool and markdown conventions. 14 core + 10 MCP + 12 CLI tests pass.
- [skill:harness-execution] [outcome:gotcha] All 5 core skill files (brainstorming, planning, execution, verification, code-review) are hardlinked between claude-code and gemini-cli directories (same inode). Editing the claude-code copy automatically updates gemini-cli — no separate copy step needed. The cp command even fails with "identical (not copied)" error.
- [skill:harness-execution] [outcome:gotcha] code-review SKILL.md had "Terminal" references in two locations beyond the Phase 7 heading: the pipeline phase table (row 7) and the success criteria list. Both needed surface-agnostic renaming to "Text output" for complete migration.
- [skill:harness-execution] [outcome:success] Prettier reformatted the JSON code blocks inside SKILL.md files during pre-commit hooks, but since all platform copies are hardlinks, parity is preserved automatically.

## 2026-03-21 — Detection-Remediation for Dead Code & Architecture

- [skill:harness-execution] [outcome:success] All 18 tasks completed in a single session. 5 new test files (33 tests), 3 new implementation files, 7 modified files. Full TDD rhythm on all 5 implementation tasks (Tasks 3-7).
- [skill:harness-execution] [outcome:gotcha] lint-staged stash/restore included uncommitted SKILL.md Phase 3+4 edits in an unrelated commit (93f2374). Same recurring pattern from prior learnings. Content was correct but the commit boundary was wrong.
- [skill:harness-execution] [outcome:gotcha] SKILL.md structure tests require ## Examples section -- plan omitted this for the new harness-codebase-cleanup skill. Added post-hoc with an extra commit.
- [skill:harness-execution] [outcome:success] cleanup-dead-code and enforce-architecture gemini-cli copies were already in sync (identical files, not symlinks). Editing claude-code copy and re-checking showed no diff needed.
- [skill:harness-execution] [outcome:decision] Task 12 (config format) required no file changes -- the ForbiddenImportRule type from Task 2 already documents the optional alternative field, and no existing forbiddenImports entries need alternatives.

## 2026-03-21 — Roadmap Integration Hooks (Phase 5)

- [skill:harness-execution] [outcome:success] All 5 tasks completed. Documentation-only SKILL.md edits to 4 skills (harness-execution, harness-verify, initialize-harness-project, harness-autopilot) plus gemini-cli mirror. harness validate passes.
- [skill:harness-execution] [outcome:gotcha] Task 4 commit failed due to lint-staged "prevented an empty git commit" -- Prettier reformatted the file to match what was already committed, making the staged diff empty after formatting. The changes had been absorbed into an unrelated commit (a51d5b8) by lint-staged stash/restore during the Task 3 commit. Same recurring lint-staged pattern.
- [skill:harness-execution] [outcome:success] claude-code and gemini-cli harness-autopilot SKILL.md files are separate files (different inodes, not hardlinks). Both must be edited independently, unlike the 5 core skills (brainstorming, planning, execution, verification, code-review) which ARE hardlinked.

## 2026-03-21 — Unified Documentation Pipeline

- [skill:harness-execution] [outcome:success] All 12 tasks completed in a single session. 609 skill tests pass, 197 parity tests pass. 8 files created/modified across 7 commits.
- [skill:harness-execution] [outcome:gotcha] Tasks 2-8 (incremental SKILL.md construction) cannot be committed individually because structure tests require ## Process, ## Examples, ## Gates, and ## Escalation sections. Must combine into a single file write.
- [skill:harness-execution] [outcome:gotcha] 3 of 4 sub-skill SKILL.md files (detect-doc-drift, align-documentation, validate-context-engineering) are hardlinked between claude-code and gemini-cli. harness-knowledge-mapper is NOT hardlinked and needs manual copy for parity.
- [skill:harness-execution] [outcome:gotcha] lint-staged stash/restore absorbed SKILL.md changes into unrelated commits (75769db, 9a1955d, b67c367). Same recurring pattern. Content was correct but commit boundaries and messages were wrong.

## 2026-03-28 — Phase 2: Coverage Ratchet

- [skill:harness-execution] [outcome:success] All 5 tasks completed. coverage-ratchet.mjs script, initial baselines, and CI workflow wiring all in place. Regression detection and --update mode both verified.
- [skill:harness-execution] [outcome:success] Task 5 was verification-only (no file changes to commit). The --update flag correctly captures current coverage and the check mode correctly passes against matching baselines.

## 2026-04-01 — Autopilot: Harness Multi-Platform Expansion (Codex CLI + Cursor)

- [skill:harness-autopilot] [outcome:complete] Executed 1 phase, 9 tasks, 0 retries
- [skill:harness-autopilot] [outcome:observation] Directory-based platform output (codex) cannot use the existing flat-file sync plan — needed a dedicated sync-codex.ts. Final review caught this as a warning and the fix was applied in the same run.
- [skill:harness-autopilot] [outcome:observation] Derived platform mapping (DERIVED_FROM_CLAUDE_CODE) is more maintainable than requiring every skill.yaml to list new platforms — avoids N-file bulk edits when adding platforms
- [skill:harness-autopilot] [outcome:gotcha] SkillCursor from Zod schema has alwaysApply as required boolean (from zod .default(false)), not optional — when importing the type for renderer signatures, be aware of this distinction
- [skill:harness-autopilot] [outcome:observation] Final review cycle (review → fix → re-review) added 2 commits but caught real architectural issues that would have compounded in Phase B

## 2026-04-01 — Autopilot: MCP Integration — Codex CLI + Cursor

- [skill:harness-autopilot] [outcome:complete] Executed 4 phases, 13 tasks, 0 retries. 63 target tests pass.
- [skill:harness-autopilot] [outcome:observation] Phase 2 review caught a critical bug: --tools args written to .cursor/mcp.json but harness mcp command didn't accept --tools. The picker feature was entirely non-functional at runtime. Review-then-fix cycle prevented a broken feature from shipping.
- [skill:harness-autopilot] [outcome:observation] ALL_MCP_TOOLS sync guard test (Phase 4) validates that the manually-maintained tool list matches TOOL_DEFINITIONS at test time — mitigates the maintenance hazard of a static array without introducing a runtime import coupling.
- [skill:harness-autopilot] [outcome:gotcha] @clack/prompts ^0.9.0 resolves to 0.9.1 — semver 0.x range means minor versions can have breaking changes. Pin or verify API shape in CI.

<!-- hash:a168a0a3 -->

- **2026-04-14:** Completed Task 1: Inject Neon AI tokens into Tailwind Theme. Moving to Task 2.

<!-- hash:ccb7d006 -->

- **2026-04-14:** Completed Task 2: Redesign Core Layout & Global Styles. Moving to Task 3.

<!-- hash:80dfca46 -->

- **2026-04-14:** Completed Task 3: Redesign ActionButton. Moving to Task 4.

<!-- hash:7caa77f9 -->

- **2026-04-14:** Completed Task 4: Redesign KPI Cards. Moving to Task 5.

## 2026-04-16 — Orchestrator dashboard tokens/turns not updating

- **[skill:harness-debugging] [outcome:fixed]:** `AsyncGenerator<AgentEvent, TurnResult>` return values are silently discarded by `for await (const x of gen)`. When per-turn data (like usage) belongs in a state-machine reducer keyed on yielded events, it MUST ride on the yielded event — not the generator's return value. Backends (`claude.ts`, `pi.ts`, `anthropic.ts`, `openai.ts`, `gemini.ts`, `mock.ts`) all packed usage into `TurnResult` only; orchestrator's `runAgentInBackgroundTask` uses for-await-of, so tokens never reached `state-machine.ts`'s `if (event.usage)` accumulator. Fix: extract `message.usage` (final chunk, `stop_reason !== null`) and `rawEvent.usage` (on result events) and attach to the yielded AgentEvent.
- **[skill:harness-debugging] [outcome:gotcha]:** Claude stream-json chunks carry cumulative-ish usage on every assistant entry for a given requestId — only the final chunk (`stop_reason !== null`) has authoritative totals. Use the stop_reason guard when feeding an additive accumulator to avoid double-counting. This matches the `requestId` dedup logic in `packages/core/src/usage/cc-parser.ts`.
- **[skill:harness-debugging] [outcome:gotcha]:** `session.turnCount` was dead-initialized to 0 in `orchestrator.ts:877` with no increment path in production code. Tests set it to 1/3 directly, masking the gap. Grepping for all references (not just definitions) confirmed no production mutation. Fix: bump in the state-machine's `turn_start` branch where `recentRequestTimestamps` is already updated.
