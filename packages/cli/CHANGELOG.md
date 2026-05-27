# @harness-engineering/cli

## 2.7.1

### Patch Changes

- 39bfd73: Fix `harness recommend` crashing with `Unexpected token 'E', "Error: Max"... is not valid JSON` on repos with very large drift reports.

  Root cause: `generateSuggestions` in `@harness-engineering/core` spread sub-arrays into `Array.push` (`suggestions.push(...subList)`), exceeding V8's argument-count limit (~65k) on a 322k-entry drift report and throwing `RangeError: Maximum call stack size exceeded`. The cli's `parseToolResult` then JSON-parsed the resulting error text and crashed the recommend pipeline.

  Core: switched spread-push to `concat` so the suggestion accumulator scales with report size. Cli: made `parseToolResult` honor `isError`, catch parse failures, warn via logger, and fall back to `{}` so a single failing sub-check degrades gracefully instead of taking the whole pipeline down. Both layers gained regression tests with revert-and-fail verified.

- Updated dependencies [39bfd73]
- Updated dependencies [1fd39a6]
  - @harness-engineering/core@0.28.2
  - @harness-engineering/orchestrator@0.8.0
  - @harness-engineering/dashboard@0.8.1

## 2.7.0

### Minor Changes

- e4134d3: Add `align-design-system` — the FIX half of design-pipeline sub-project #1, paired with `detect-design-drift` (shipped PR #396).

  Consumes `DRIFT-*` findings and produces actual code changes:
  - **Auto-applies** safe codemods for **DRIFT-T001 / T002 / T003** — replaces hex / font-family / px-spacing literals with token references where the pre-flight classifier deems the change safe.
  - **Emits precise suggestions** for **DRIFT-T004** (deprecated tokens, migration target ambiguous) and all **DRIFT-P\*** (primitive adoption, requires prop-translation work deferred to v1.x).

  **Three decisions locked in the spec:**
  1. **v1 fix scope** — T001/T002/T003 codemods only. Hex/font/px have unambiguous 1:1 token mappings when a matching token exists. Primitive adoption needs prop-translation tables (`<button>` ⇄ `<Button>` event handlers, ref forwarding, class merging) — substantial design surface deferred to v1.x.
  2. **Standalone + pipeline-handoff field** (mirrors `align-documentation`). One implementation, two callers. Standalone mode runs detect-design-drift internally. Pipeline mode reads `pipeline.driftFindings` from `.harness/handoff.json` and writes `pipeline.fixesApplied` back so the (future) #5 orchestrator can re-verify only affected findings.
  3. **Pre-flight classifier in align** (not on DriftFinding). Safety logic lives next to fix logic; detect's schema stays stable. Per-finding context inspection — token import present? single string-literal context (vs template/concatenation)? exact-match token value? — decides safe-codemod vs suggestion.

  **Surface area:**
  - `harness align-design-system` — CLI command. `--dry-run` for preview; `--mode pipeline` for orchestrator integration; standard `--json` / `--verbose` / `--quiet`. Exit code 0 when ≥0 outcomes produced (fix or suggestion); 1 on at least one codemod failure.
  - `mcp__harness__align_design_system` — MCP tool. Tool count bumps 71 → 72.
  - 4-platform skill markdown shipped (claude-code / codex / cursor / gemini-cli).

  **Co-shipped detect-side improvement (DRIFT-T001 widened):**

  The original DRIFT-T001 rule only flagged hexes NOT in the palette. align's codemod scope required the opposite — hexes IN the palette but used as raw literals (the most common kind of real-world drift). This PR extends DRIFT-T001 to flag BOTH cases with distinct messages:
  - "Hex color X **should use a token reference** instead of a raw literal" (in-palette literal — align can codemod)
  - "Hardcoded color X is not in the design token palette" (off-palette literal — suggestion only)

  This keeps detect's behavior coherent with align's purpose. Updated detect-side test reflects the new expectation.

  **Configuration** (additive, all optional):

  The `align-design-system` skill reads the same `design.strictness` + `design.audit.driftDetection.*` blocks as detect. No new config sub-block in v1 — the pre-flight classifier is the only safety knob and it lives in code, not config.

  **Long-term trajectory** (documented in the spec):
  - v1.x — Primitive-adoption codemods (DRIFT-P\*) with prop-translation tables.
  - v1.x — T001/T002 codemods that add the token import line when missing (driven by config).
  - v1.5 — `Fixer<Finding, Outcome>` interface extraction (parallel to `Verifier<F>` extraction triggered by detect-design-drift).
  - v2 — `harness check-design --fix` shorthand composing check-design with the align family.
  - v3 — LLM-mediated suggestions become fixes (pairs with craft-pipeline).

  **Test plan:**
  - 38 new unit + integration tests across classifier, codemods (T001/T002/T003), and end-to-end (standalone + pipeline + dry-run + idempotency)
  - 90 tests pass across all affected suites (detect tests updated for widened T001; check-design 3-verifier tests unchanged)

- c5f8d01: Add `audit-brand-compliance` — rule-based brand-semantics audit (design-pipeline sub-project #3). The last unshipped floor-layer audit; closes the floor layer and unblocks #5 design-pipeline orchestrator.

  **Two rule families in v1 (narrow + deep):**
  - **BRAND-T001 (token misuse)** — flags tokens used in contexts declared as `forbidden_contexts` in `$extensions.harness.brand`. Recognizes three reference forms: `tokens.X.Y.Z`, `var(--X-Y-Z)`, and `'X.Y.Z'` string literals. Context inference v1 uses same-line + adjacent-non-blank-line vocabulary scan against `cta` / `selection` / `focus` / `data-visualization` / `decorative` / `background` / `text` / `border` / `error` / `success` / `warning`.
  - **BRAND-V001 (forbidden phrases)** — TS Compiler API walk over `.tsx`/`.jsx` files. Scans `JsxText` nodes and string-typed `JsxAttribute` initializers for case-insensitive substring matches against `voice.forbiddenPhrases` from `DESIGN.md ## Brand Rules`.

  **Three decisions locked in the spec:**
  1. **v1 rule scope:** BRAND-T\* + BRAND-V001 only. Defers tone-by-context (needs component-state inference), reading-level / sentence-length (ship with tone-context), asset rules (image-tag + filesystem), and semantic-token-alias enforcement (overlaps with detect-drift T001) to v1.x.
  2. **Input sources:** Both `DESIGN.md ## Brand Rules` AND `tokens.json $extensions.harness.brand`. Per ADR 0028. Either resolver returning null silently skips the matching rule family.
  3. **check-design composition:** 4th verifier (triggers `Verifier<F>` interface extraction).

  **Cross-cutting: Verifier<F> interface extraction**

  The convention note in `check-design.ts` deferred extracting a formal Verifier interface until the 3rd check-\* command landed. Brand makes 4 verifiers in `harness check-design` (anatomy / craft / drift / brand). This PR extracts:

  ```ts
  // packages/cli/src/shared/verifier.ts
  export interface Verifier<F, Cat = ..., Meta = ...> {
    findings: F[];
    summary: { totalFiles, durationMs, bySeverity, byCode };
    catalog: Cat;
    meta: Meta;
  }
  ```

  All three rule-based verifiers (anatomy / drift / brand) declare structural conformance via type aliases. design-craft has a different output shape (cost telemetry, exemplar citations) and remains composed but does not conform — that's by design, the interface captures the rule-based pattern.

  **Surface area:**
  - `audit_brand` MCP tool (count 72 → 73)
  - `harness validate` fast-mode hook gated by `design.audit.brandCompliance.enabled` (default true)
  - 4th verifier in `harness check-design` (degrades gracefully on failure)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - New `design.audit.brandCompliance.{enabled, rules, fastMode}` config block

  **Configuration** (additive, all optional):

  ```json
  {
    "design": {
      "audit": {
        "brandCompliance": {
          "enabled": true,
          "rules": { "tokenMisuse": true, "voice": true },
          "fastMode": { "maxFiles": 500 }
        }
      }
    }
  }
  ```

  **Long-term trajectory** (documented in proposal):
  - v1.x: BRAND-Tone* tone-by-context rules (after component-state inference matures); BRAND-V002/V003 reading-level + sentence-length; BRAND-A* asset rules; semantic-token-alias enforcement; standalone `harness audit-brand` CLI if signal warrants.
  - v2: `align-brand-compliance` sibling FIX skill (forbidden-phrase suggestions, token-misuse alias swaps); `VIOLATES_brand` dedicated graph edge.
  - v3: LLM-judgment tone rules paired with craft-pipeline #5 copy-craft.

  **Tests:** 35+ new unit + integration tests across resolvers (DESIGN.md parser, $extensions walker), rules (token-misuse, forbidden-phrases), and end-to-end audit composition. check-design test extended for 4-verifier case. 821 tests pass across the cli suite.

- d1c9bda: Add `harness check-design` — single-pass design verifier (design-pipeline sub-project #4).

  Mirrors `harness check-docs` exactly. Composes the two design audits shipped in PRs #372 + #390 (audit-component-anatomy + design-craft critique) into one command. Designed to be invoked by the (future) #5 design-pipeline orchestrator inside its convergence fix loop — same pattern harness-docs-pipeline uses to compose check-docs.

  **CLI:**
  - `harness check-design` — runs both verifiers, aggregates findings, persists to graph
  - `--mode fast|full` (default `full`)
  - `--files <glob>...` for scoping
  - Standard `--json`/`--verbose`/`--quiet`
  - Exit codes: 0 = no error-severity findings; 1 = error-severity findings present; 2 = at least one verifier failed (degraded)

  **New exports:**
  - `runDesignCraft` from `packages/cli/src/mcp/tools/design-craft.ts` — programmatic entry point that returns `Result<DesignCraftOutput, ...>` (unwrapped from the MCP response wrapper). Same contract as `handleDesignCraft`.
  - `CraftFindingRecord` type from `@harness-engineering/graph` (was internal to `DesignConstraintAdapter.ts`; needed by check-design to format findings for `recordFindings()`).

  **Verifier-shape convention** (NOT extracted as a formal interface in this PR per the spec's "data points reveal shape" principle):

  Both invoked audits return `{ findings: F[], summary: { bySeverity, byCode, durationMs, ... }, ... }`. `check-design.ts` notes this convention in a top-of-file comment so the next check-\* author follows the pattern. The `Verifier<F>` interface gets extracted when the **third** check-\* command lands.

  **Graceful degradation:** if either verifier throws, the other still runs; failed verifiers surface in `summary.verifiersFailed`; exit code 2 (degraded) instead of crashing.

  **Long-term trajectory** (documented in proposal — not in this PR):
  - v2 = `harness validate` wraps `check-design --fast` internally (one impl, two surfaces)
  - v3 = check-\* commands become facades over graph queries (`harness findings`)

- bbc164f: Make harness skills and personas discoverable in Codex CLI, and fix a long-standing scanner false-positive flood.

  **@harness-engineering/cli** (minor): the Codex slash-command adapter now writes to `~/.codex/skills/<name>/SKILL.md` with the YAML frontmatter Codex's skill discovery requires; all 50 harness skills are reachable via `$harness-debugging`, `/skills`, and auto-trigger. The agent-definitions adapter emits real Codex subagent TOMLs at `~/.codex/agents/<name>.toml` (12 personas) so they appear in `/agent`. Both surfaces previously wrote dead files Codex ignored.

  **@harness-engineering/core** (patch): `SecurityScanner` now honors `// harness-ignore SEC-XXX: justification` on the line above the flagged code, matching the convention already in use across the repo. Previously only same-line annotations were recognized, so every prior-line annotation silently re-fired the suppressed rule.

  **@harness-engineering/orchestrator** / **@harness-engineering/dashboard** (patch): annotate the previously-flagged `JSON.parse` and `writeFile` sites with the explanatory `// harness-ignore` comments the scanner now reads correctly. No runtime behavior change.

  Also includes an infra fix to `.husky/pre-push` so nvm's Node takes precedence over Homebrew's on PATH (otherwise `better-sqlite3` fails to load under a newer Homebrew Node and blocks every push).

- 44b9c2e: Add **copy-craft** — third member of the craft-pipeline initiative (sub-project #5 of 10). LLM-judgment skill for ALL prose-in-code across **six surfaces**: error messages, log lines, CLI output strings, commit subjects, PR descriptions, and code comments. Primary domain is error messages (universally bad in most codebases). NO rule-based floor exists — pure ceiling.

  **Three decisions locked:**
  1. **All 6 surfaces from the roadmap entry.** Errors, logs, CLI output, commit subjects, PR descriptions, code comments. Single PR covers the full prose-in-code surface area. Graceful degradation for surfaces requiring external infra (git binary, gh CLI auth).
  2. **TS Compiler API for source-side extraction.** Same approach naming-craft uses. Precise: knows when a string literal is inside an `Error` constructor vs an arbitrary function call. Avoids false positives. Commit subjects and PR descriptions use shell-out (different infra).
  3. **Living catalog H (ADR 0020).** Continues the established craft pattern. Seed rubrics with contribution/signal/version fields reserved.

  **8 seed rubrics** (one file per rubric, matches naming-craft / spec-craft layout):

  | Rubric                                | Surfaces                        | Source                                               |
  | ------------------------------------- | ------------------------------- | ---------------------------------------------------- |
  | `COPY-R001` WHAT/WHY/HOW-TO-FIX       | error                           | Stripe API error guide + Nielsen #9                  |
  | `COPY-R002` calm-not-panicky          | error, log                      | Mailchimp voice + Atlassian writing                  |
  | `COPY-R003` specific-not-generic      | error, log, cli-output          | Martin, Clean Code (error handling)                  |
  | `COPY-R004` signal-not-noise          | log                             | Google SRE book                                      |
  | `COPY-R005` grep-survives             | log, cli-output                 | SRE + Unix philosophy                                |
  | `COPY-R006` describes-change-not-work | commit, pr-description          | Tim Pope, "A Note About Git Commit Messages"         |
  | `COPY-R007` stranger-in-6-months      | commit, pr-description, comment | Software-engineering folklore (durability principle) |
  | `COPY-R008` WHY-not-WHAT              | comment                         | Martin, Clean Code ch. 4 + Beck                      |

  **Six extractors** (three infrastructures):
  - **Source-side** (TS Compiler API, single pass per file amortizes parse cost):
    - `extract/source.ts` — handles errors (`throw new <X>Error(...)`, `Err({ message: ... })`), logs (`console.X`, `logger.X`, `pino.X`, `winston.X`), CLI output (path-scoped to `packages/cli/src/commands/`), and comments (excludes JSDoc + license banners)
  - **Git** (`extract/commits.ts`) — shells out `git log --pretty=format:'%H%x09%s' --since=...`; 10s timeout; skips silently when not in a git repo
  - **GitHub** (`extract/pr-descriptions.ts`) — shells out `gh pr list --json number,title,body`; skips silently when `gh` binary missing OR `gh auth status` fails

  **Honors ADRs 0018-0021:** confidence first-class, 3-axis preserved (tier × impact × confidence), `cite.rubricId` on every finding for catalog usage signal.

  **Cross-cutting:** `critiqueCopyInFile(file, opts)` exported (source-side surfaces only). Future craft skills + `harness-brainstorming` can invoke per-file copy critique without a project walk.

  **Surface area:**
  - `harness copy-craft` CLI command (`--files` / `--surfaces` / `--max-files` / `--max-items-per-file` / `--commits-since` / `--pr-limit` / `--json`)
  - `copy_craft` MCP tool (count 76 → 77)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - New `craft.copy.{enabled, maxFiles, maxItemsPerFile, surfaces, commitsSince, prLimit}` config block

  **Graceful degradation contract:** `summary.skippedSurfaces` records `{ surface, reason }` for each surface whose prerequisites weren't met. Surfaces that ran appear in `summary.catalog.surfacesScanned`. Skipped surfaces are visible in the report; not failures.

  **Tests:** 30 new tests across source extractor (errors / logs / cli-output / comments), commits extractor (with real `git init` integration), PR extractor (graceful-contract assertion), rubric mapping, critique phase, and end-to-end pipeline (mock LLM). 883 tests pass across the cli suite. Smoke-tested end-to-end against the harness repo's own source + git history: 97 commit subjects + 29 comments extracted from a 5-file scope; 252 findings emitted from the 8 rubrics × applicable surfaces; mock provider's deterministic low-confidence response preserves ADR 0019 honesty.

  **Long-term trajectory:**
  - v1.x: multi-line commit body + PR body critique; JSDoc / TSDoc (or docs-craft hand-off); PR comments + review comments; per-language support (Python `raise`/`logging`, Go `fmt.Errorf`/`log.Printf`, Rust `panic!`/`tracing`); `align-copy` sibling FIX skill for safe error-message rewrites.
  - v2: author-attributed signals via Hermes; integration with craft-pipeline orchestrator (shared `pipeline.copyFindings`).
  - v3: LLM-judgment via project's brand voice (when audit-brand-compliance v2 ships voice-attribute critique).

- 0eac8eb: Design-pipeline coordination commits — wire up the Phase 1 vertical-slice MCP tools end-to-end.

  **MCP server registration** — `mcp__harness__audit_anatomy` and `mcp__harness__design_craft` are now registered in `TOOL_DEFINITIONS` / `TOOL_HANDLERS` and discoverable to MCP clients (previously exported but unregistered).

  **`harness.config.json` schema extensions** — adds optional `design.audit.componentAnatomy.*` (gates audit-component-anatomy + the harness-accessibility deferral; controls catalog scoping, fast-mode behavior) and `design.craft.*` (gates harness-design-craft; controls fast/deep mode, autoCapture B' behavior, LLM provider, catalog scoping, signal feedback threshold). All fields optional with sensible defaults; omitting either block uses built-in defaults. Zero impact on existing configs.

  **`DesignConstraintAdapter.recordFindings()`** — generic finding-ingestion entry point that both audit-component-anatomy (ANAT-\*) and harness-design-craft (CRAFT-\*) call to persist findings as graph state. Idempotent (re-running produces no duplicate edges). Per finding: lazy `design_constraint` node creation + `violates_design` edge from file to constraint with per-finding metadata (line, severity, message, evidence, runId). Uses existing graph taxonomy — no NodeType/EdgeType additions.

  **`harness-accessibility` deferral patch** — Phase 1 step 2.6 added: when `design.audit.componentAnatomy.enabled = true` (default), A11Y-010 (interactive without accessible label) and A11Y-050 (input/select/textarea without label) are deferred to audit-component-anatomy for components in its catalog. Same i18n-style deduplication pattern proven in step 2.5. Catalog set loaded via `getCatalogTypes()` from audit-component-anatomy's public export — zero rule-content duplication.

  **Deferred to a follow-up commit:** `harness validate` fast-mode hook for audit-anatomy (the largest individual coordination item; requires touching the validate command path). The other coordination items are surgical extensions that close the loop on Phase 1 without requiring validate changes.

- ec3e872: Add **design-pipeline orchestrator** — the last unshipped sub-project of the design-pipeline initiative (#5). Closes the initiative end-to-end.

  A new `harness-design-pipeline` skill + `harness design-pipeline` CLI command + `run_design_pipeline` MCP tool that composes detect-design-drift, align-design-system, audit-component-anatomy, audit-brand-compliance, and design-craft-elevator into a sequential pipeline with convergence-based remediation.

  **Three decisions locked in the spec:**
  1. **New `harness-design-pipeline` skill** (mirrors `harness-docs-pipeline`). Keeps `harness check-design` focused on single-pass verification; orchestrator owns the multi-pass loop. Pattern parity with docs-pipeline.
  2. **FILL phase does BOTH bootstrap AND craft polish.** (a) Stubs missing DESIGN.md / tokens.json / Component Registry / Brand Rules sections with TODO placeholders (mirrors docs-pipeline's AGENTS.md bootstrap). (b) Invokes design-craft-elevator POLISH for ceiling-layer suggestions.
  3. **Generic `VerifierRegistry<F>` consumer.** AUDIT phase iterates a registry of verifiers conforming to the just-extracted `Verifier<F>` interface (PR #399). Adding a 5th rule-based verifier in the future requires only a `register()` call — zero orchestrator changes.

  **Six phases:**

  | Phase   | Role                                                                                |
  | ------- | ----------------------------------------------------------------------------------- |
  | FRESHEN | Read-only check: DESIGN.md / tokens.json / Component Registry / Brand Rules / graph |
  | DETECT  | Invoke detect-design-drift; populate `context.driftFindings`                        |
  | FIX     | Convergence loop (max 5 iterations) with align-design-system — only when `--fix`    |
  | AUDIT   | Generic Verifier<F> registry loop (audit-anatomy + audit-brand)                     |
  | FILL    | Bootstrap missing inputs + invoke design-craft-elevator POLISH                      |
  | REPORT  | Compute `pass`/`warn`/`fail` verdict; aggregate summary                             |

  **Iron Law (per harness-docs-pipeline):** the orchestrator DELEGATES, never reimplements. If you find yourself writing drift detection, fix application, or audit logic inside the orchestrator, STOP — delegate to the dedicated sub-skill. Tests enforce this: orchestrator imports only sub-skill entry points (no rule logic).

  **Surface area:**
  - `harness design-pipeline` CLI command (`--fix`, `--no-freshen`, `--no-fill`, `--ci`, `--mode`, `--files`, `--design-strictness`, `--json`)
  - `run_design_pipeline` MCP tool (count 73 → 74)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - `DesignPipelineContext` carried across phases via `.harness/handoff.json` `pipeline` field (align-design-system v1 already supports this protocol)
  - `VerifierRegistry` class generalizing Verifier<F> consumption

  **Verdict computation:**
  - `pass` — zero findings, zero suggestions, zero bootstrapped
  - `warn` — any warn-severity finding OR craft suggestion OR bootstrapped any input
  - `fail` — any error-severity finding remains after FIX

  Exit codes: 0 (pass/warn), 1 (fail), 2 (pipeline crashed with all verifiers down).

  **Convergence loop:** bounded at 5 iterations (matches docs-pipeline). Stops when align applies 0 fixes (converged) or when total drift count fails to decrease (no progress).

  **Tests:** 28 new tests across registry, phase implementations (freshen, fill, report), and end-to-end integration (empty project bootstrap, clean project pass, drift project fail, `--no-freshen` / `--no-fill` flag behavior, verifiersRun list). 818 tests pass across the cli suite. Smoke-tested end-to-end: detect+anatomy+brand+craft all fire correctly on a fixture project; verdict and per-phase counts surface as expected.

  **Long-term trajectory** (documented in spec):
  - v1.x — `--interactive` mode (terminal sessions with diff preview + per-fix approval); `--phase` flag to run a specific phase in isolation; `--persist` flag to write findings to `.harness/graph/`; `--watch` for development; per-phase telemetry via Hermes.
  - v2 — `align-brand-compliance` + `align-anatomy` FIX skills compose into the FIX phase loop alongside align-design-system; cross-orchestrator composition with craft-pipeline.
  - v3 — graph-as-source-of-truth: orchestrator becomes a graph-query facade.

  **Design-pipeline initiative state after merge: COMPLETE.** All 6 sub-projects shipped (#0 brand-guidelines ADR, #1 detect+align, #2 anatomy, #3 brand, #4 check-design verifier, #5 this orchestrator, #6 design-craft). Floor + ceiling + orchestrator end-to-end.

- 878eb6d: Design-pipeline initiative decomposition + Phase 1 vertical slices for sub-projects #2 and #6.

  **New MCP tools** (registered separately in a follow-up commit; exports ready):
  - `mcp__harness__audit_anatomy` (`packages/cli/src/mcp/tools/audit-anatomy.ts`) — audit component definitions for missing required anatomy parts (slots, states, sizes). Vertical-slice scope: Button + ANAT-D001 working end-to-end. Pattern findings (ANAT-P\*) deferred.
  - `mcp__harness__design_craft` (`packages/cli/src/mcp/tools/design-craft.ts`) — first LLM-judgment-based skill in harness. Three branchable phases (CRITIQUE / POLISH / BENCHMARK). Vertical-slice scope: CRITIQUE with hierarchy-clarity rubric + 3-axis (tier × impact × confidence) finding schema + 5-dim radar for BENCHMARK schema.

  **New internal modules** (CLI-internal, not exported):
  - `packages/cli/src/audit/component-anatomy/` — TypeScript Compiler API parser, ConventionRule + PatternRule types (with Phase 0 spike's recommended `postProcess` + `auxiliary` additive fields), 3-layer source-of-truth resolver (JSDoc → DESIGN.md → conventions), 3-layer component-type resolver, convention runner.
  - `packages/cli/src/design-craft/` — 3-axis findings schema, deterministic priority derivation, hierarchy-clarity rubric, mock LLM provider, CRITIQUE phase with permissive LLM-output parser.

  **Two new skills** added at `agents/skills/{claude-code,gemini-cli,cursor,codex}/{audit-component-anatomy,harness-design-craft}/` (4-platform parity, markdown-only per the established harness skill convention).

  **Five new ADRs** establishing reusable patterns:
  - 0018 LLM-judgment skill pattern
  - 0019 3-axis craft output model + 5-dim radar
  - 0020 Living-catalog H pattern
  - 0021 Detect-and-offer B' pattern
  - 0028 Brand-guidelines source of truth (path A: extend DESIGN.md + claim DTCG `$extensions.harness.brand`)

  **ADR cleanup (0022)**: renumbered 5 duplicate ADRs in the 0003-0007 range to 0023-0027 with inbound reference sweep across `AGENTS.md`, `docs/conventions/`, and feedback-loops plan/proposal docs. README rule ("Never reuse a number") now honored.

  **Deferred to follow-up commits** (intentional scope split — see PR description):
  - Tree-sitter pattern engine + JSDoc/DESIGN.md parsers for #2
  - DesignConstraintAdapter graph integration for both skills
  - harness-accessibility i18n-style deferral patch
  - `harness.config.json` schema extensions (`design.audit.componentAnatomy.*`, `design.craft.*`)
  - `packages/cli/src/mcp/server.ts` registration of both new tools (2-line wire-ups)
  - Vision-LLM + playwright MCP rendering for #6 deep mode
  - POLISH + BENCHMARK phase implementations + B' detect-and-offer for #6
  - Remaining catalog content for both skills (Phase 2)

  Test coverage: 4/4 audit-anatomy vertical-slice tests passing; 7/7 design-craft vertical-slice tests passing; full skills package 23941/23941 passing.

- 4215328: Add `detect-design-drift` — design-system drift verifier (design-pipeline sub-project #1, detect half).

  Floor-layer rule-based skill. Scans the project for two families of drift, reports findings, never modifies source. The matching fixer (align-design-system) is intentionally a separate sub-project so detect can ship first and stay testable in isolation.

  **Two rule families (gated independently via config):**
  - **DRIFT-T\* — token bypass.** Regex-based detection against `design-system/tokens.json` (W3C DTCG format).
    - DRIFT-T001 — hex color literal outside the loaded palette
    - DRIFT-T002 — font-family string outside the typography palette (system fallbacks always allowed)
    - DRIFT-T003 — pixel margin/padding/gap value outside the spacing scale (skipped when no spacing tokens)
    - DRIFT-T004 — reference to a `$deprecated: true` token (or `$extensions.harness.deprecated: true`), in both string-literal and CSS-var-kebab forms
  - **DRIFT-P\* — primitive adoption.** TS Compiler API JSX parsing against `design-system/DESIGN.md` `## Component Registry`.
    - DRIFT-P001 — raw `<button>` where `Button` is registered
    - DRIFT-P002 — raw `<input>` where `Input` is registered
    - DRIFT-P003 — raw `<a>` where `Link` or `Anchor` is registered
    - DRIFT-P004 — raw `<textarea>` where `Textarea` is registered

  **Soft-dependency design.** Either resolver returning `null` (`tokens.json` absent, or DESIGN.md without a `## Component Registry` section) is not a failure — the matching rule family silently skips. Projects that haven't opted in see zero false positives.

  **Surfaces:**
  - `harness validate` — fast-mode hook (gated by `design.audit.driftDetection.enabled`, default `true`). Degrades gracefully on verifier failure (single warning, other checks continue).
  - `harness check-design` — third composed verifier alongside audit-component-anatomy and design-craft critique. Findings flow into `DesignConstraintAdapter.recordFindings()` for idempotent graph persistence.
  - `mcp__harness__detect_drift` — MCP tool. Input: `{ path, mode, files?, designStrictness?, rules? }`. Output: `{ findings, summary, catalog, meta }`. Consumed by the (future) #5 design-pipeline orchestrator.

  **Severity model.** Mirrors audit-anatomy. `design.strictness: strict` → every finding `error`; `standard` → T001/T002/P001 `error`, rest `warn`; `permissive` → everything `info`.

  **Config additions** (all optional — block-omission yields built-in defaults):

  ```json
  {
    "design": {
      "audit": {
        "driftDetection": {
          "enabled": true,
          "rules": { "tokenBypass": true, "primitiveAdoption": true },
          "fastMode": { "maxFiles": 500 }
        }
      }
    }
  }
  ```

  **Verifier-shape convention** — third invoker of the `{ findings, summary, catalog, meta }` shape (per `check-design-verifier` changeset note). The `Verifier<F>` interface extraction trigger is now met; deferred to a follow-on PR so this ship stays focused.

  **Long-term trajectory** (documented in proposal — not in this PR): primitive-adoption subsumes legacy DESIGN-001/002 in v1.x; align-design-system ships as a sibling sub-project; pluggable resolver interface supports projects that ship non-DTCG token formats.

- 597c3d4: Add **knowledge-craft** — ninth sub-project of the craft-pipeline initiative (#9 of 10; fifth non-design). LLM-judgment skill for knowledge-entry quality under `docs/knowledge/`. Critiques whether an entry states a load-bearing FACT (not paraphrase of code), earns a place in the knowledge graph taxonomy, carries forward a decision that would otherwise erode, or could be picked up by a stranger six months from now. The ceiling counterpart to `harness-knowledge-pipeline` (procedural ingestion) and `harness-detect-doc-drift` (structural).

  **Three decisions locked:**
  1. **v1 scope: `docs/knowledge/` EXCLUDING `decisions/`.** Hard exclusion of the `decisions/` subdir avoids double-critique with spec-craft (which owns ADRs). AGENTS.md deferred to v1.x (different shape: navigational manifest vs fact-bearing entry).
  2. **Per-file granularity.** Knowledge entries are typically focused single-topic docs (1-3 sections); per-file aligns with how knowledge authors think. Per-section adds prompt overhead without localization gain at this scale; per-claim is too noisy + expensive.
  3. **Reference graph types in rubrics, no graph reads at runtime.** `KNOW-R003` (earns-graph-place) names `business_fact` / `business_rule` / `business_concept` / `business_decision` in its rubric description so the LLM critiques against the taxonomy; knowledge-craft never imports from `@harness-engineering/graph`. Avoids coupling to harness-knowledge-pipeline while keeping the rubric semantically aware.

  **7 seed rubrics** (one file per rubric, matches naming-craft / spec-craft / copy-craft layout):

  | Rubric      | Title                                               |
  | ----------- | --------------------------------------------------- |
  | `KNOW-R001` | States a load-bearing fact (not paraphrase)         |
  | `KNOW-R002` | Truth a code reader could not derive                |
  | `KNOW-R003` | Earns a place in the knowledge graph taxonomy       |
  | `KNOW-R004` | Carries forward a decision that would erode         |
  | `KNOW-R005` | Deleting would lose specific knowledge              |
  | `KNOW-R006` | Concrete and operationally defined (not platitudes) |
  | `KNOW-R007` | A stranger could pick it up six months from now     |

  **Honors ADRs 0018-0021:** confidence first-class, 3-axis preserved (tier × impact × confidence), `cite.rubricId` on every finding for catalog usage signal, living-catalog H seed format (`contribution` / `signal` / `version` fields reserved).

  **Cross-cutting API:** `critiqueKnowledgeFile(file, opts)` exported. Future composition target — `harness-knowledge-pipeline` can call this when a fresh entry lands at ingest time (v2). Mirrors the same shape as `critiqueSpecFile` / `critiqueCopyInFile` / `critiqueNameFile`.

  **Surface area:**
  - `harness knowledge-craft` CLI command (`--files` / `--exclude-dirs` / `--max-files` / `--json`)
  - `knowledge_craft` MCP tool (count 78 → 79)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - Plugin slash-commands generated for `.claude-plugin/` + `.cursor-plugin/`

  **Tests:** 22 new tests (8 discover + 5 critique + 9 integration) covering: hard-exclusion of `decisions/`, graph-taxonomy-naming contract for KNOW-R003 (no graph imports at runtime), per-file critique with mock LLM, cross-cutting `critiqueKnowledgeFile`, files override, maxFiles cap, excludeDirs honoring, README exclusion (case-insensitive), POSIX path normalization. 109 sibling craft tests (naming/spec/copy/design) still pass after the new module imports `shared/craft`.

  **Long-term trajectory:**
  - v1.x: AGENTS.md critique with dedicated manifest rubrics; per-section / per-claim opt-in for very large entries; `align-knowledge` sibling FIX skill for safe rewrites (load-bearing-fact extraction, redundancy collapse); graph-aware mode (opt-in: critique against actual ingested nodes).
  - v2: composes with `harness-knowledge-pipeline` at ingest time — fresh entries run knowledge-craft critique inline.
  - v3: cross-entry consistency rubrics ("this entry contradicts another entry's claim").

- 17beb09: Add **naming-craft** — first member of the craft-pipeline initiative (sub-project #1 of 10). LLM-judgment skill that critiques identifier names (variables, functions, types, files) against a curated rubric catalog seeded from Martin / Beck / Karlton.

  **Three decisions locked in the spec:**
  1. **v1 identifier kinds: variables + functions + types + files.** Covers ~80% of naming value in TS codebases. Modules / branches / commit subjects deferred to v1.x (different infrastructure; commit subjects belong to copy-craft #5).
  2. **Convention source: catalog-only + derived-from-code.** No project input required. Universal rubrics ship in the default catalog; case convention (camelCase / snake_case / PascalCase) is sampled from the project's existing identifiers via majority-rule (>50% threshold). Below threshold → silent skip of convention-conformance rubric.
  3. **Living catalog H (ADR 0020).** Mirrors design-craft's catalog pattern. Seed rubrics with `contribution` / `signal` / `version` fields reserved for future growth mechanism.

  **6 seed rubrics** (one file per rubric, matches design-craft layout):
  - `NAME-R001` predictive power (Martin)
  - `NAME-R002` concreteness (Martin / Beck)
  - `NAME-R003` verb/noun honesty (Beck)
  - `NAME-R004` convention conformance (Karlton)
  - `NAME-R005` scope match (Beck)
  - `NAME-R006` encoded measure / unit (Pragmatic Programmer)

  **Honors ADRs 0018-0021:**
  - ADR 0018 (LLM-judgment skill pattern): confidence is first-class on every finding; LlmProvider records cost telemetry.
  - ADR 0019 (3-axis output): tier × impact × confidence emitted on every finding, never collapsed to single severity.
  - ADR 0020 (living catalog H): every finding carries `cite.rubricId` for catalog usage signal; rubric `signal`/`contribution`/`version` fields ship reserved.

  **Cross-cutting:** other craft skills (docs-craft / test-craft / code-craft) will call `critiqueNamesInFile(file, opts)` — exported entry point that operates on a single file without project re-walk. Pre-computed convention can be passed through to avoid re-sampling per consumer.

  **Reuses design-craft infrastructure:** imports `LlmProvider` + `MockLlmProvider` + `derivePriority` directly. Extraction to `packages/cli/src/shared/llm/` deferred until a second non-design craft skill needs differences (v2 decision).

  **Surface area:**
  - `harness naming-craft` CLI command (`--files` / `--kinds` / `--max-files` / `--max-identifiers-per-file` / `--json` / `--verbose`)
  - `naming_craft` MCP tool (count 73 → 74)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - New `craft.naming.{enabled, maxFiles, maxIdentifiersPerFile}` config block under a new top-level `craft.*` namespace
  - Cross-cutting API: `runNamingCraft(input)` + `critiqueNamesInFile(file, opts)`

  **Tests:** 22 new unit + integration tests across extractor, convention sampler, classifier, critique phase, and end-to-end pipeline (with mock LLM provider). 801 tests pass across the cli suite. Smoke-tested end-to-end on a fixture file: 23 findings emitted from 6 rubrics × ~5 identifiers; convention sampler correctly derives `camelCase` for variables/functions and `null` for types (single type sample insufficient for majority).

  **Long-term trajectory:**
  - v1.x: module / branch / commit-subject naming; POLISH phase; per-project rubric overrides; per-language (Python / Go / Rust) idiom catalogs; `align-naming` sibling FIX skill once safe-rename heuristics mature.
  - v2: extract shared craft infrastructure (`LlmProvider` + 3-axis types + `derivePriority`) to `packages/cli/src/shared/craft/` when a second non-design craft skill lands; cross-craft convergence inside the (future) craft-pipeline orchestrator with shared `pipeline.namingFindings` field.
  - v3: aesthetic-intent-aware naming — when project has declared `harness-design` aesthetic intent, naming critique matches identifier verbosity to that aesthetic (terse for minimalist, descriptive for verbose).

- 57f89b6: Add **security-craft** — tenth (and final) sub-project of the craft-pipeline initiative (#10 of 10; sixth non-design). The craft-pipeline initiative completes with this PR. LLM-judgment skill for security posture on TS/JS source — the ceiling counterpart to `harness-security-scan` (CVE/OWASP rule-based floor) and `harness-security-reviewer` (procedural review). Threat-modeling-as-skill rather than pattern-matching. Critiques whether trust boundaries are respected, where implicit privilege escalation lurks, whether the code defends in depth or just at the gate, whether principle of least authority is honored.

  **Three decisions locked:**
  1. **v1 scope: source code only (TS/JS).** Walks `packages/*/src/`. Excludes IaC, dependency manifests, CI configs (floor concerns covered by CVE scanners + image-scanning). Narrowest scope = highest signal-to-noise; matches the per-file pattern of knowledge-craft + copy-craft.
  2. **AST-driven targeting.** Uses TS Compiler API to detect security signals in any file: HTTP handlers, middleware, auth APIs, `child_process`/`eval`/`new Function`, `fs` writes, JWT/session/cookie APIs, raw SQL queries, network egress, secret handling. **Files with zero signals are skipped entirely** — no path-heuristic fallback. AST awareness (not regex) avoids common FPs like `exec` in a comment or `eval` as a variable name.
  3. **Conservative confidence default.** Rubric prompts bias the LLM toward `medium` confidence; `high` requires a specific, named anti-pattern or visible missing guard. Per ADR 0019, low/medium-confidence findings are de-emphasized in reports. Directly mitigates the roadmap's flagged FP risk for judgment-based security (which the roadmap called out as the hardest craft to land well).

  **8 seed rubrics** (one file per rubric, each declaring `appliesToSignals` for pre-filter):

  | Rubric     | Title                                           | Applies to signals                                  |
  | ---------- | ----------------------------------------------- | --------------------------------------------------- |
  | `SEC-R001` | Trust boundary respected                        | http-handler, middleware, raw-query, privileged-op  |
  | `SEC-R002` | Principle of least authority honored            | auth-api, privileged-op, http-handler               |
  | `SEC-R003` | Defense in depth (not gate-only)                | auth-api, http-handler                              |
  | `SEC-R004` | Assumed adversary realistic for the deployment  | http-handler, middleware, auth-api                  |
  | `SEC-R005` | Data flow across trust boundaries is visible    | http-handler, raw-query, data-egress, privileged-op |
  | `SEC-R006` | Fail closed, not open                           | auth-api, middleware, http-handler                  |
  | `SEC-R007` | Secrets carried in a shape that resists leakage | secret-handling                                     |
  | `SEC-R008` | Authorization check happens before the action   | http-handler, privileged-op                         |

  **7 signal kinds** detected via single-pass TS Compiler API walk:
  - `http-handler` — `(req, res)` / `(req, res, next)` shapes; `app.get/post/...`; `@Get/@Post/...` decorators
  - `middleware` — `(req, res, next) =>` / `(ctx, next) =>` shapes
  - `auth-api` — `jwt.{sign,verify}`, `bcrypt.{hash,compare}`, `argon2.*`, `passport.*`, `req.session.*`, `res.cookie`
  - `privileged-op` — `child_process.{exec,spawn,...}`, `eval`, `new Function`, `vm.runIn*`, `fs.{writeFile,unlink,chmod,...}`
  - `data-egress` — `fetch`, `axios.*`, `http.request`, `https.request`, `net.connect`
  - `raw-query` — `*.query/raw/$queryRaw/$executeRaw` with SQL-shaped template literal
  - `secret-handling` — secret-named variable (`token`, `password`, `apiKey`, …) flowing into `console.*` / `logger.*` / `JSON.stringify` / template-literal sink

  **Honors ADRs 0018-0021:** confidence first-class (and conservatively biased), 3-axis preserved (tier × impact × confidence), `cite.rubricId` on every finding for catalog usage signal, living-catalog H seed format.

  **Cross-cutting API:** `critiqueSecurityInFile(file, opts)` exported. Returns `[]` for files with no security signals (consistent with the orchestrator's FP-management strategy). Mirrors the shape of `critiqueKnowledgeFile` / `critiqueCopyInFile` / `critiqueSpecFile` / `critiqueNameFile`.

  **Surface area:**
  - `harness security-craft` CLI command (`--files` / `--packages` / `--max-files` / `--max-signals-per-file` / `--json`)
  - `security_craft` MCP tool (count 79 → 80)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - Plugin slash-commands generated for `.claude-plugin/` + `.cursor-plugin/`

  **FP-management strategy** (three independent layers):
  1. AST-driven signal detection — files with zero security-relevant constructs are skipped entirely; no broad-glob fallback.
  2. Per-rubric `appliesToSignals` pre-filter — a file with one `secret-handling` signal only fires SEC-R007, not all 8 rubrics.
  3. Conservative-confidence system prompt — LLM defaults to `medium` confidence; `high` requires a specific, named anti-pattern.

  **Tests:** 45 new tests (8 discover + 21 signals + 5 critique + 11 integration) covering: AST awareness (comments/variable-name "eval" don't fire), every signal kind, per-rubric pre-filter, conservative-confidence contract, cross-cutting API returns `[]` for no-signal files. 167 sibling craft tests (naming/spec/copy/test/design/knowledge) still pass after the new module imports `shared/craft`.

  **craft-pipeline initiative completes** with this PR. 10 sub-projects shipped across naming-craft (#1), spec-craft (#6), copy-craft (#5), test-craft (#3), knowledge-craft (#9), security-craft (#10), and the design-pipeline-side craft skills (design-craft + the 4 design-pipeline siblings).

  **Long-term trajectory:**
  - v1.x: IaC critique with dedicated rubrics (Dockerfile USER, k8s securityContext, Terraform IAM); multi-file auth-flow tracing (handler → middleware → service via graph); `align-security` sibling FIX skill (aggressive FP safeguards); test-file security critique; `craft.security.confidenceFloor` runtime config; framework expansions (tRPC, Convex, Cloudflare Workers, Hono RPC).
  - v2: composes with `harness-security-scan` at scan time — CVE findings carry a security-craft "shape" rubric for context.
  - v3: assumed-adversary-as-config — project declares its threat model and rubrics critique against the declared model rather than inferring.

- dcca2ce: Spec B (Granular Task→Backend Routing): per-skill + per-cognitive-mode routing axes with fallback chains, BackendRouter chain-walk emitting RoutingDecision records, config validator (hard error + warn semantics), dispatch-site wiring with `HARNESS_BACKEND_OVERRIDE` env hint, RoutingDecisionBus with bounded ring buffer, 3 HTTP routes + WS topic `routing:decision`, `harness routing {config,trace,decisions}` CLI + `harness skill run --backend`, dashboard `/routing` panel (4 cards + WS + polling fallback), 5 ADRs (0029-0033). RoutingValue schema widening is additive/non-breaking (scalar form preserves byte-identical pre-Spec-B behavior).
- 800fed8: Add **spec-craft** — second member of the craft-pipeline initiative (sub-project #6 of 10). LLM-judgment skill for spec quality. Highest-leverage craft skill because spec quality compounds across the entire planning → implementation → review lifecycle below it. Triggered the v2 extraction of shared craft infrastructure: this PR moves `LlmProvider` + 3-axis types + `derivePriority` to `packages/cli/src/shared/craft/` so design-craft + naming-craft + spec-craft (and every future craft skill) import from one canonical home.

  **Three decisions locked:**
  1. **v1 spec scope: proposals + ADRs.** `docs/changes/*/proposal.md` + `docs/knowledge/decisions/*.md`. Excludes READMEs / general docs (docs-craft #2 territory). RFCs deferred to v1.x.
  2. **Per-section critique.** Specs parsed by H2 into named sections; rubrics declare which canonical section names they apply to. Localized findings (`Decisions:34 is vague`) beat doc-scoped findings (`spec is vague`). Better cost control + signal quality than whole-doc critique.
  3. **Shared craft extraction NOW.** Second non-design craft consumer triggers the extraction (noted in naming-craft's changeset). Stops the duplication pattern at 2 consumers; `LlmProvider` + `MockLlmProvider` + 3-axis types + `derivePriority` move to `packages/cli/src/shared/craft/`. design-craft and naming-craft keep their old import paths via re-export shims (zero behavior change).

  **7 seed rubrics** (one file per rubric, matches naming-craft layout):
  - `SPEC-R001` **sharpness vs vagueness** — applies to all sections
  - `SPEC-R002` **cuts at the joints** — decisions, scope, technical-design
  - `SPEC-R003` **two readers, same understanding** — decisions, success-criteria
  - `SPEC-R004` **load-bearing vs ambient context** — decisions, overview
  - `SPEC-R005` **honest rationalizations** — rationalizations\* (regex)
  - `SPEC-R006` **non-goals are non-goals** — out-of-scope* / non-goals* (regex)
  - `SPEC-R007` **stranger in 6 months** — applies to all sections

  **Honors ADRs 0018-0021:** confidence first-class, 3-axis preserved, `cite.rubricId` on every finding for catalog usage signal.

  **Cross-cutting:** `critiqueSpecFile(file, opts)` exported so future craft skills (or `harness-brainstorming`) can invoke spec critique on a doc they're already processing without re-walking the project.

  **Shared craft extraction (cross-cutting, zero behavior change):**
  - New: `packages/cli/src/shared/craft/llm/provider.ts` — `LlmProvider`, `LlmCallCost`, `MockLlmProvider`, `getProvider`
  - New: `packages/cli/src/shared/craft/findings/axes.ts` — `Tier`, `Impact`, `Confidence`
  - New: `packages/cli/src/shared/craft/findings/derived.ts` — `derivePriority`
  - `packages/cli/src/design-craft/llm/provider.ts` becomes a re-export shim
  - `packages/cli/src/design-craft/findings/derived.ts` becomes a re-export shim
  - `packages/cli/src/design-craft/findings/schema.ts` imports the 3-axis types from shared and re-exports them
  - `packages/cli/src/naming-craft/llm/provider.ts` + `findings/derived.ts` + `findings/schema.ts` now import directly from shared (no longer from design-craft)

  All existing design-craft + naming-craft tests pass unchanged (846/846 across the cli suite).

  **Surface area:**
  - `harness spec-craft` CLI command (`--files` / `--kinds` / `--sections` / `--max-files` / `--max-sections-per-file` / `--json`)
  - `spec_craft` MCP tool (count 75 → 76)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - New `craft.spec.{enabled, maxFiles, maxSectionsPerFile}` config block under the `craft.*` namespace

  **Tests:** 32 new tests across section parser, rubric mapping, spec discovery, critique phase, and end-to-end pipeline (mock LLM). 846 tests pass across the cli suite. Smoke-tested end-to-end against the repo's own specs: 5 docs scanned, 32 sections parsed, 94 findings emitted (7 rubrics × applicable sections); mock provider's deterministic low-confidence response preserves ADR 0019's honesty contract.

  **Long-term trajectory:**
  - v1.x: doc-level summary mode; RFC docs; POLISH phase (concrete rewrites of weak sections); per-project rubric override config; `align-spec` sibling FIX skill; per-section opt-out via `<!-- spec-craft:skip -->`.
  - v2: integration with `harness-brainstorming` so freshly-authored specs get critique inline; integration with `harness-soundness-review` for floor + ceiling paired runs.
  - v3: cross-spec consistency rubrics (e.g., is this spec's `Decisions` honest about constraints declared in an upstream ADR?).

- b8d97b0: Add **test-craft** — fourth member of the craft-pipeline initiative (sub-project #3 of 10). LLM-judgment skill for test quality across **vitest / jest / mocha / playwright**. Per-`it`/`test` block critique with best-effort source pairing for contract-vs-implementation rubrics. Tests are often the worst-written code in a codebase precisely because the rule-based floor (coverage threshold) is so easy to clear.

  **Three decisions locked:**
  1. **All four frameworks** (vitest / jest / mocha / playwright). Each framework has its own import-detection signature; once detected, the AST extraction is uniform (all use `describe`/`it`/`test` calls). Discovery cost is the framework-detection layer; runtime cost stays the same.
  2. **Per-`it`/`test` block critique.** Localized findings pin to a specific test (vs `describe`-scoped). Higher LLM call count but maps to actionable fix scope.
  3. **Source pairing (best-effort).** Resolves `foo.test.ts` → `foo.ts` (sibling), `../src/foo.ts`, or `../../src/foo.ts`. Skip silently when no match; non-source-dependent rubrics still fire. Enables contract-vs-implementation rubrics that need the function's public surface.

  **8 seed rubrics** from the test-quality canon:

  | Rubric                                  | Source                                                          |
  | --------------------------------------- | --------------------------------------------------------------- |
  | `TEST-R001` contract-not-narrative-name | Kent C. Dodds + Beck                                            |
  | `TEST-R002` meaningful-assertion        | Fowler "Refactoring" + xUnit Patterns (Meszaros)                |
  | `TEST-R003` arrange-act-assert          | Bill Wake "3A" + xUnit Patterns                                 |
  | `TEST-R004` fixture-earns-setup-cost    | xUnit Patterns                                                  |
  | `TEST-R005` single-responsibility       | Beck + Fowler (test smells: Eager Test)                         |
  | `TEST-R006` deleting-loses-something    | Kent C. Dodds, "Write tests. Not too many. Mostly integration." |
  | `TEST-R007` contract-not-implementation | Beck + Fowler + "Testing Trophy"                                |
  | `TEST-R008` explicit-failure-mode       | xUnit Patterns + general folklore                               |

  **Honors ADRs 0018-0021:** confidence first-class, 3-axis preserved (tier × impact × confidence), `cite.rubricId` on every finding for catalog usage signal.

  **Cross-cutting:** `critiqueTestsInFile(file, opts)` exported (honours framework filter and source-pairing toggle). Future craft skills + `harness-tdd` integration can invoke per-file test critique without a project walk.

  **Surface area:**
  - `harness test-craft` CLI command (`--files` / `--frameworks` / `--max-files` / `--max-tests-per-file` / `--no-source-pair` / `--json`)
  - `test_craft` MCP tool (count 77 → 78)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - New `craft.test.{enabled, maxFiles, maxTestsPerFile, frameworks, sourcePair}` config block
  - Plugin slash-command files pre-generated for `.claude-plugin` and `.cursor-plugin`

  **Extractor handles** `.skip` (kept and critiqued — implementation has signal), `.only` (flagged in metadata, still critiqued), `.todo` (excluded — no body). Non-string-literal test names (computed / template) skip silently.

  **Tests:** 35+ new tests across framework detection (5 frameworks), per-test extraction (skip/only/todo + nesting + body), source-pair resolver (sibling/peer/monorepo + truncation + null), critique phase, end-to-end pipeline. 912 tests pass across the cli suite. Smoke-tested end-to-end against the harness cli package: 13 tests extracted from 3 files, all source-paired correctly; 104 findings emitted (13 × 8 rubrics ≈ correct); mock provider's deterministic low-confidence response preserves ADR 0019 honesty.

  **Long-term trajectory:**
  - v1.x: fixture/helper/mock file critique; `.test-d.ts` type tests; snapshot rubrics; per-framework rubric extensions (Playwright `test.step`, vitest `bench`); cross-test consistency rubrics; `align-test` sibling FIX skill.
  - v2: integration with `harness-tdd` so fresh tests get critique inline.
  - v3: execution-aware critique (run the test, capture failure messages, critique their clarity).

### Patch Changes

- ae11a71: Add `better-sqlite3` as a runtime dependency. The CLI bundles orchestrator code that imports `better-sqlite3` (webhook queue, session search-index) and ships those chunks in `dist/`. Native bindings cannot be bundled by tsup, so the published `@harness-engineering/cli` package must declare `better-sqlite3` as a direct dependency. Without this, `npm i -g @harness-engineering/cli` succeeds but any sqlite-backed feature throws `Cannot find module 'better-sqlite3'` at runtime.
- a061773: Fix harness security scanner false positives on `security-craft/extract/signals.ts`. The scanner is regex-based and matched three comments that described what the AST detector looks for (`new Function(...)`, `Bare identifier calls: eval(...), fetch(...)`, `Raw query: db.query(\`...\${x}...\`)`) as actual sinks. Rewrote the three comments to describe the same logic without the literal patterns the regex scanner triggers on. No behavior change — pure documentation rewrite. `harness ci check --skip arch` now exits 0 (was exit 1 with 3 SEC-INJ-001/SEC-INJ-002 error-severity findings).
- Updated dependencies [d1c9bda]
- Updated dependencies [bbc164f]
- Updated dependencies [573c23b]
- Updated dependencies [16048ad]
- Updated dependencies [0eac8eb]
- Updated dependencies [dcca2ce]
  - @harness-engineering/graph@0.10.0
  - @harness-engineering/core@0.28.1
  - @harness-engineering/orchestrator@0.7.0
  - @harness-engineering/dashboard@0.8.0
  - @harness-engineering/types@0.15.0
  - @harness-engineering/intelligence@0.2.6

## 2.6.2

### Patch Changes

- Updated dependencies [bce809f]
  - @harness-engineering/orchestrator@0.6.1
  - @harness-engineering/dashboard@0.7.1

## 2.6.1

### Patch Changes

- 8678fee: Fix `ensureHarnessGitignore` overwriting `.harness/.gitignore` on every MCP start. The function now merges template entries into an existing file instead of replacing it, preserving any custom entries added by users.

## 2.6.0

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

- c94bac8: Harden `harness update` against empty `npm view` responses and migrate to the renamed `@earendil-works/pi-coding-agent` SDK.
  - `getLatestVersionAsync` now rejects when `npm view <pkg> dist-tags.latest`
    returns empty stdout. Previously a transient registry hiccup rendered as
    `cli: v2.4.5 → v` in the update banner; now the package is silently
    skipped by the caller's `Promise.allSettled`.
  - `@mariozechner/pi-coding-agent@^0.73.1` → `@earendil-works/pi-coding-agent@^0.74.1`
    (the maintainer renamed the package family). Eliminates 4 of 6 npm
    deprecation warnings during `harness update`. The 2 remaining
    (`prebuild-install`, `node-domexception`) are transitives through
    `better-sqlite3` and `@google/genai` respectively — out of our control
    until upstream bumps.

  No behavior change beyond the deprecation cleanup.

- Updated dependencies [c94bac8]
- Updated dependencies [4aa241f]
- Updated dependencies [c3653ff]
  - @harness-engineering/orchestrator@0.6.0
  - @harness-engineering/types@0.14.0
  - @harness-engineering/core@0.28.0
  - @harness-engineering/dashboard@0.7.0
  - @harness-engineering/intelligence@0.2.5

## 2.5.0

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
  - @harness-engineering/core@0.27.0
  - @harness-engineering/orchestrator@0.5.0
  - @harness-engineering/dashboard@0.6.7
  - @harness-engineering/intelligence@0.2.4

## 2.4.5

### Patch Changes

- Updated dependencies [2724dfe]
  - @harness-engineering/core@0.26.4
  - @harness-engineering/dashboard@0.6.6
  - @harness-engineering/orchestrator@0.4.6

## 2.4.4

### Patch Changes

- a58f9c6: Add `webhook-queue.sqlite`, `webhook-queue.sqlite-wal`, `webhook-queue.sqlite-shm`, and `maintenance/` to the canonical `.harness/.gitignore` template written by `ensureHarnessGitignore`.

  The Phase 3 webhook delivery queue persists state in `.harness/webhook-queue.sqlite` (plus its WAL and SHM sidecars), and the maintenance runner writes per-tick history to `.harness/maintenance/`. Both are ephemeral runtime artifacts that should never be committed. Before this change they were left untracked but unignored, so `git status` always showed them as new files in any project running the orchestrator and they were easy to commit by accident. They now match the same ignore semantics as the rest of the harness runtime directory.

## 2.4.3

### Patch Changes

- Updated dependencies [1796528]
  - @harness-engineering/core@0.26.3
  - @harness-engineering/dashboard@0.6.5
  - @harness-engineering/orchestrator@0.4.5

## 2.4.2

### Patch Changes

- Updated dependencies [48e0b5b]
  - @harness-engineering/types@0.12.0
  - @harness-engineering/core@0.26.2
  - @harness-engineering/dashboard@0.6.4
  - @harness-engineering/intelligence@0.2.3
  - @harness-engineering/orchestrator@0.4.4

## 2.4.1

### Patch Changes

- 7ae0561: Fix `harness update` reporting "All packages are up to date" while a stale background notification simultaneously printed "Update available". The post-command notification is now suppressed during the `update` subcommand (its fresh `npm view` is authoritative), and the cached check state is invalidated after a successful update so subsequent invocations don't display pre-upgrade data.

  `harness update` also now detects every `harness` binary on `PATH` (`which -a` / `where`) and warns when more than one global install is present. If the user opts in, npm-style installs are uninstalled from their respective prefixes; pnpm/yarn installs are surfaced with the exact command to run manually. This prevents the case where `npm install -g` lands in one prefix while the shell continues resolving an older binary from another prefix.

- Updated dependencies [7ae0561]
  - @harness-engineering/core@0.26.1
  - @harness-engineering/dashboard@0.6.3
  - @harness-engineering/orchestrator@0.4.3

## 2.4.0

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

- Updated dependencies [bed30c4]
- Updated dependencies [56176cd]
  - @harness-engineering/core@0.26.0
  - @harness-engineering/dashboard@0.6.2
  - @harness-engineering/orchestrator@0.4.2

## 2.3.2

### Patch Changes

- bdcfdec: fix(cli/update): detect outdated CLI even when `npm list -g` does not see it (closes #317)

  `harness update` was reporting "All packages are up to date" while a separate
  banner inside the same transcript advertised "Update available: vX -> vY", and
  never actually performed the self-upgrade. Repeated runs were a no-op.

  Root cause: the foreground check in `runUpdateAction` discovered installed
  packages by parsing `npm list -g --json`. When harness was installed via
  Homebrew, bun, asdf, or under a different nvm prefix than the shell's current
  `npm`, `npm list -g` returned no `@harness-engineering/*` entries. `packages`
  came out empty, `checkAllPackages` had nothing to compare, and the code fell
  straight into the "up to date" exit path — printing the success line, refreshing
  hooks, and shelling out to a child `harness generate`. That child process is
  where the contradictory "Update available" banner came from: its own
  `printUpdateNotification` reads the cached state populated by the background
  `npm view` check (which doesn't depend on `npm list` and so works correctly),
  and its stderr inherits to the parent terminal.

  Fix: trust `CLI_VERSION` (loaded from the running CLI's `package.json`) as the
  authoritative current version for `@harness-engineering/cli`, exactly as the
  background check already does. `getInstalledPackages` always includes the CLI;
  `getInstalledVersions` falls back to `CLI_VERSION` when `npm list -g` doesn't
  report it; `getInstalledVersion` does the same. The foreground check now
  correctly identifies the outdated CLI and reaches the install path on the
  user's first `harness update` invocation.

## 2.3.1

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

- Updated dependencies [38fa742]
- Updated dependencies [bb7658b]
  - @harness-engineering/core@0.25.0
  - @harness-engineering/dashboard@0.6.1
  - @harness-engineering/orchestrator@0.4.1
  - @harness-engineering/graph@0.9.0
  - @harness-engineering/intelligence@0.2.2

## 2.3.0

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

### Patch Changes

- Updated dependencies [287ca16]
- Updated dependencies [ed16b44]
  - @harness-engineering/core@0.24.0
  - @harness-engineering/orchestrator@0.4.0
  - @harness-engineering/dashboard@0.6.0

## 2.2.1

### Patch Changes

- d83e162: fix(hooks): block-no-verify only matches argv-token flags, not substrings (#285)

  The block-no-verify PreToolUse hook previously did a naive substring test for
  `--no-verify` against the entire Bash command, so it blocked commits whose
  message body, heredoc, or shell comment merely _mentioned_ the flag. The
  detector now strips quoted strings, heredoc bodies, and shell comments before
  testing, and matches `--no-verify` and `git commit -n` only when they appear
  as standalone argv tokens.

## 2.2.0

### Minor Changes

- d77d0f4: feat: distribute harness as the `harness-claude` Claude Code marketplace plugin

  Replaces #267, which shipped a Claude-only marketplace plugin under the name `harness` with a partial component surface (skills + MCP only). This change:
  1. **Renames** the plugin to `harness-claude` and reframes the marketplace listing so the name no longer implies tool-agnostic coverage. Sibling plugins for Cursor, Gemini CLI, and Codex are planned as follow-up PRs (`harness-cursor`, `harness-gemini`, `harness-codex`); OpenCode is covered by extending `harness setup`.
  2. **Adds persona subagents.** New `scripts/generate-plugin-agents.mjs` runs `harness generate-agent-definitions --platforms claude-code` and writes 12 rendered subagent files (`harness-architecture-enforcer.md`, `harness-code-reviewer.md`, …) to `.claude-plugin/agents/`. The plugin manifest references this directory via the `agents` field.
  3. **Adds lifecycle hooks.** New `scripts/generate-plugin-hooks.mjs` writes `.claude-plugin/hooks.json` with the `standard` profile (block-no-verify, protect-config, quality-gate, pre-compact-state, adoption-tracker, telemetry-reporter), pointing at `${CLAUDE_PLUGIN_ROOT}/.harness/hooks/<name>.js` so the scripts already shipped at `.harness/hooks/` (per #270) execute against the user's project at install time.
  4. **Consolidates plugin distribution artifacts under `.claude-plugin/`.** Slash commands moved from `commands/` (repo root) to `.claude-plugin/commands/`. Subagents moved from `agents/agents/claude-code/` to `.claude-plugin/agents/`. Frees the repo-root `commands/` slot for the future `harness-gemini` extension (Gemini uses TOML in its own `commands/` and would otherwise collide).
  5. **Adds drift guards.** Each generator gains a `--check` mode that runs the generator into a staging dir, diffs the result against the committed artifact, and exits non-zero on drift. `pnpm generate:plugin:check` chains all three. CI (`.github/workflows/ci.yml`) runs this check on every PR — no more silent drift between `agents/skills/claude-code/` and the plugin's slash command/subagent set.
  6. **Switches generators from `dist/bin/harness.js` to `tsx packages/cli/src/bin/harness.ts`.** Plugin maintenance no longer requires `pnpm build` first. `tsx` is added as a root devDependency.
  7. **Extends `initialize-harness-project` skill with Phase 5 (INSTRUMENT) and Phase 6 (FINALIZE).** The skill now closes the bootstrap parity gap that plugin install does not cover — knowledge graph (`harness scan`), architecture baseline (`harness check-arch --update-baseline`), performance baseline (`harness check-perf`), telemetry identity (`harness telemetry identify`), legacy layout migration (`harness migrate --dry-run`), and Tier-0 MCP integrations (`harness integrations add context7|sequential-thinking|playwright`). Includes a "Plugin-only callout" telling the model to prefix CLI invocations with `npx @harness-engineering/cli` when no global binary is on PATH, plus a worked example showing a full plugin-only bootstrap.

  **Plugin manifest now exposes:**

  | Field        | Path                          | Components                     |
  | ------------ | ----------------------------- | ------------------------------ |
  | `skills`     | `./agents/skills/claude-code` | All harness skills             |
  | `commands`   | `./.claude-plugin/commands/`  | 37 `/harness:*` slash commands |
  | `agents`     | `./.claude-plugin/agents/`    | 12 persona subagents           |
  | `hooks`      | `./.claude-plugin/hooks.json` | Standard hook profile          |
  | `mcpServers` | inline                        | `harness` MCP server via `npx` |

  **Out of scope (tracked as follow-up issues):**
  - `harness-cursor`, `harness-gemini`, `harness-codex` sibling plugins.
  - OpenCode integration via extended `harness setup`.
  - Consolidation of `agents/skills/{claude-code,codex,cursor,gemini-cli}/` — these are already hard-linked to a single inode (no actual duplication on disk), so this becomes a presentation/discovery refactor rather than a data-layer one.

- af02d63: feat: ship `harness-codex` marketplace plugin (PR-D in the marketplace stack)

  Final entry in the multi-tool marketplace stack: `harness-codex` for Codex
  CLI. Sibling to `harness-claude` (#284), `harness-cursor` (#288), and
  `harness-gemini` (#290).

  **The thinnest plugin of the four.** Codex's plugin spec
  (`developers.openai.com/codex/plugins/build`) only defines `skills`,
  `mcpServers`, `apps`, and `hooks` fields — no slash-command surface, no
  agents field. So `harness-codex` ships exactly what Codex actually
  consumes:
  - **`.codex-plugin/plugin.json`** — manifest pointing at
    `./agents/skills/codex` for skills and wiring the harness MCP server.
  - **`.codex-plugin/marketplace.json`** — marketplace entry with
    `policy.installation: AVAILABLE`, `category: Productivity`.
  - No `commands/`, no `agents/`, no `hooks.json` — see "Out of scope" below.

  **Generator changes:**
  - **`generate-plugin.mjs --target codex`** is a no-op by design (manifest
    is hand-maintained, no auto-generated artifacts). Wired into
    `pnpm generate:plugin:{codex,all,check}` so CI's drift guard covers all
    four targets uniformly even though codex has nothing to drift from.
  - **`plugin-config.mjs`** gained a `generateCommands` flag (alongside
    `generateAgents` and `generateHooks` from PR-C) so the generator can
    short-circuit each artifact type independently. Existing entries
    (claude, cursor, gemini) set `generateCommands: true`; codex sets all
    three to `false`.

  **Out of scope (intentional):**
  - **No slash commands.** Codex's plugin spec doesn't define a commands
    surface — Codex picks up skills directly via the manifest's `skills`
    field and surfaces them via the `$skill` invocation syntax.
  - **No persona subagents.** Like Gemini, Codex plugins have no agents
    field. Persona behavior remains reachable via `harness.run_persona`
    exposed by the MCP server.
  - **No lifecycle hooks.** Codex's plugin spec mentions a `hooks` field
    but the schema (event names, command resolution, env vars) is not
    documented yet. Deferred until the spec stabilizes — when it does,
    set `generateHooks: true` for codex and the existing generator will
    produce `.codex-plugin/hooks.json` from the same `STANDARD_HOOKS` list
    the other plugins use.

  **Stack complete:**

  | Tool        | Plugin           | Surface                                          |
  | ----------- | ---------------- | ------------------------------------------------ |
  | Claude Code | `harness-claude` | skills + commands + agents + hooks + MCP         |
  | Cursor      | `harness-cursor` | skills + commands + agents + hooks + rules + MCP |
  | Gemini CLI  | `harness-gemini` | commands + GEMINI.md context + MCP               |
  | Codex CLI   | `harness-codex`  | skills + MCP                                     |

  The follow-up — OpenCode integration via extending `harness setup` (PR-E)
  — remains tracked as a separate issue. OpenCode auto-discovers
  `.claude/skills/`, so the work there is mostly an MCP target wire-up, not
  a new manifest.

- c0b9d38: feat: ship `harness-cursor` marketplace plugin (PR-B in the marketplace stack)

  Sibling plugin to `harness-claude` (#284) for Cursor's marketplace. Same
  component surface — skills, `/harness:*` slash commands, persona subagents,
  lifecycle hooks, MCP server — plus 4 curated project rules that fire as
  `alwaysApply` in every Cursor session.

  **New surface:**
  - **`.cursor-plugin/plugin.json` + `.cursor-plugin/marketplace.json`** —
    Cursor marketplace manifest, mirrors the Claude plugin shape.
  - **`.cursor-plugin/{commands,agents,hooks.json,rules}/`** — auto-generated
    artifacts under the same path convention as `.claude-plugin/`.
  - **4 hand-written Cursor rules** (`.mdc` files in `.cursor-plugin/rules/`):
    - `validate-before-commit` — run `harness validate` before any commit.
    - `respect-architecture` — stay within layer boundaries declared in
      `harness.config.json`; no `// harness-ignore` to suppress violations.
    - `use-harness-skills` — prefer `/harness:*` skills over freelancing for
      common tasks; surface explicit skip reasons.
    - `respect-hooks` — never propose `--no-verify` or hook-bypass workarounds;
      fix the underlying issue or update calibration.

  **CLI changes:**
  - **`renderCursorAgent`** (`packages/cli/src/agent-definitions/render-cursor.ts`)
    — new renderer for Cursor subagent markdown (frontmatter `name` +
    `description`, no `tools` field). Wired into `getRenderer` in
    `generate-agent-definitions.ts`. `resolveOutputDir` simplified to take any
    `Platform` (was hardcoded for claude-code/gemini-cli only).
  - **`renderCursorCommand`** (`packages/cli/src/slash-commands/render-cursor-command.ts`)
    — new renderer for Cursor plugin slash commands (frontmatter `name` +
    `description`, body uses `<context>`/`<objective>`/`<execution_context>`/
    `<process>` blocks). Distinct from the existing `renderCursor`, which still
    serves `harness setup`'s `~/.cursor/rules/` flow.
  - **`harness generate-slash-commands --cursor-mode <rules|commands>`** — new
    flag (default `rules` for backward compatibility) selects between the two
    Cursor renderers.

  **Generator consolidation:**
  - **`scripts/generate-plugin.mjs --target <claude|cursor> [--check]`** —
    single parameterized generator replaces the three Claude-specific scripts
    from PR-A (`generate-plugin-{commands,agents,hooks}.mjs`). All three
    artifacts produced per target. Per-target config (plugin dir, slash command
    platform, agent platform, hooks command template) lives in
    `scripts/lib/plugin-config.mjs`.
  - **`pnpm generate:plugin:check`** chains both targets; CI runs it on every PR.
  - Per-target `pnpm generate:plugin:claude` and `pnpm generate:plugin:cursor`
    for partial regeneration.

  **Cursor-specific notes:**
  - Cursor's hook `command` paths use relative form (`./.harness/hooks/<name>.js`)
    rather than the `${CLAUDE_PLUGIN_ROOT}` env var. Cursor doesn't document an
    equivalent env var, but their hook docs show relative paths resolve to the
    plugin install dir.
  - Cursor distinguishes `commands` (slash) from `rules` (always-apply guidance)
    in the plugin manifest. The harness plugin uses both.

  **Out of scope (tracked as follow-up issues):**
  - `harness-gemini` (PR-C) and `harness-codex` (PR-D) sibling plugins.
  - Cursor's `harness-cursor:harness` natural-language router command appears
    in `.cursor-plugin/commands/harness.md` rather than as a parent-level
    command (Cursor's slash-commands generator doesn't special-case
    `command_name` the way Claude/Gemini do). Functional but slightly noisy in
    the command list. Optional cleanup.

- 38d2d84: feat: ship `harness-gemini` marketplace extension (PR-C in the marketplace stack)

  Sibling extension to `harness-claude` (#284) and `harness-cursor` (#288) for
  Gemini CLI's extension marketplace. Same MCP and slash-command surface, but
  scoped to what Gemini extensions actually support.

  **New surface:**
  - **`.gemini-extension/gemini-extension.json` + `marketplace.json`** —
    Gemini extension manifest with `mcpServers` and `contextFileName`. Mirrors
    the marketplace manifest shape used by the Claude and Cursor siblings.
  - **`.gemini-extension/GEMINI.md`** — context document loaded automatically
    when the extension activates. Documents the persona table, the skill
    surface, and how to invoke `/harness:*` commands. Stands in for the
    native subagent and hooks fields that Gemini extensions don't have.
  - **`.gemini-extension/commands/*.toml`** (37 files) — auto-generated TOML
    slash commands. Same set the Claude and Cursor plugins ship.

  **CLI changes:**
  - **`generate-plugin.mjs`** now accepts `--target gemini`. Per-target
    config in `scripts/lib/plugin-config.mjs` gained three flags so the
    generator can be honest about each tool's actual surface:
    - `commandExt` — `.md` for Claude/Cursor, `.toml` for Gemini. Diff and
      prettier formatting branch on this. (Prettier doesn't format TOML, so
      the gemini path skips prettier.)
    - `generateAgents` — `false` for Gemini (no native subagents field). The
      generator skips the agent-rendering step entirely instead of writing
      dead-end files no platform reads.
    - `generateHooks` — `false` for Gemini (no native hooks field).
  - **`pnpm generate:plugin:gemini`** + **`generate:plugin:all`** /
    **`generate:plugin:check`** include the gemini target. CI runs the
    combined check on every PR.

  **Scope differences from Claude/Cursor siblings:**

  Gemini extensions only support commands + MCP servers + a context document.
  Two surfaces present in the Claude and Cursor plugins are intentionally
  out of scope here:
  - **No persona subagents.** Gemini extensions don't have an agents field.
    Persona behavior is documented in GEMINI.md and exposed through
    `/harness:*` commands and `harness.run_persona` (MCP).
  - **No lifecycle hooks.** Gemini extensions don't support hooks. Users
    wire `harness validate` / `harness check-arch` into CI manually, the
    same way they would without the extension.

  **Out of scope (tracked as follow-up):**
  - `harness-codex` (PR-D) sibling extension.
  - OpenCode integration via extending `harness setup` (PR-E). OpenCode
    auto-discovers `.claude/skills/`, so the work there is mostly an MCP
    target wire-up, not a new manifest.

- 11a5912: feat: integrate OpenCode in `harness setup` (PR-E in the marketplace stack)

  Adds OpenCode as the fifth supported AI client in `harness setup`. Unlike
  the four marketplace plugins (PR-A through PR-D), OpenCode joins via the
  existing `harness setup` flow rather than its own marketplace manifest —
  OpenCode plugins are JS/TS code, not declarative manifests, and OpenCode
  auto-discovers `.claude/skills/` so it shares Claude's skill tree without
  any plugin-side wiring.

  **What ships:**
  - **`harness setup` detects `~/.config/opencode/`** as a new client marker
    and writes the harness MCP server to `./opencode.json` in the project
    root. Skipped (with a friendly warning) when neither the global config
    dir nor a project-local `opencode.json` is present.
  - **`harness setup-mcp --client opencode`** wires up the MCP server
    standalone for users who want fine-grained control.
  - **Tier-0 MCP integrations parity** — context7, sequential-thinking, and
    playwright are written to `opencode.json` alongside `.mcp.json` and
    `.gemini/settings.json`, mirroring the existing Gemini parity block.

  **OpenCode's MCP shape differs from the others:**

  OpenCode uses `mcp` (not `mcpServers`) at the top level, and each entry
  uses `type: "local"`, a single combined `command` array (executable +
  args), `enabled`, and `environment`. The new `writeOpencodeMcpEntry`
  helper translates the standard `{command, args?, env?}` shape into
  OpenCode's wire format.

  **Test coverage:**
  - 6 new tests in `setup-mcp.test.ts` covering the OpenCode branch
    (configure, skip-if-configured, all-clients, key preservation).
  - 6 new tests in `integrations/config.test.ts` covering the
    `writeOpencodeMcpEntry` translation (mcp field, command array,
    environment translation, top-level field preservation, mcp entry
    preservation).
  - 3 new tests in `setup.test.ts` covering Tier-0 OpenCode parity
    (project-local marker, global marker, neither-present negative).

  **Stack complete:**

  | Tool         | Integration                                  | Status         |
  | ------------ | -------------------------------------------- | -------------- |
  | Claude Code  | `harness-claude` marketplace plugin          | shipped (#284) |
  | Cursor       | `harness-cursor` marketplace plugin          | shipped (#288) |
  | Gemini CLI   | `harness-gemini` marketplace extension       | shipped (#290) |
  | Codex CLI    | `harness-codex` marketplace plugin           | shipped (#291) |
  | **OpenCode** | **via `harness setup` (no plugin manifest)** | **this PR**    |

  **README updates:**
  - Quick Start now lists Gemini CLI and Codex CLI marketplace plugins as
    shipped (they were "coming" before PR-C/PR-D landed) and adds an
    OpenCode bullet pointing to the npm path.
  - Plugin-vs-npm parity table replaces the outdated "Gemini CLI / Codex /
    OpenCode integration ❌ (sibling plugins coming)" row with two rows
    reflecting current state — Gemini/Codex shipped via plugins, OpenCode
    via `harness setup`.
  - MCP config table gains an OpenCode row showing the project-local
    `opencode.json` path.

## 2.1.1

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

- Updated dependencies [ba8da2e]
- Updated dependencies [54d9494]
- Updated dependencies [a1df67e]
  - @harness-engineering/core@0.23.8
  - @harness-engineering/dashboard@0.5.2
  - @harness-engineering/orchestrator@0.3.2

## 2.1.0

### Minor Changes

- fix(ingest, graph): resolve `harness ingest` OOM/recursion crashes (#274) and `loadGraph` V8 string-cap crashes (#276) on real-world monorepos.

  **`@harness-engineering/graph`:**
  - Issue #274 — recursive walker with a 22-entry inline if-chain skip list crashed with `Maximum call stack size exceeded` or heap-OOM on monorepos with populated build caches. The skip list missed `.turbo`, `.vite`, `.cache`, `.docusaurus`, `.wrangler`, `.svelte-kit`, `.parcel-cache`, `storybook-static`, `playwright-report`, `test-results`, `.pytest_cache`, `.pnpm-store`, `.nuxt`, and AI agent sandbox dirs (`.claude`, `.cursor`, `.codex`, `.gemini`, `.aider`). The `.claude/worktrees/` omission alone could multiply walker workload by 50× on heavy users of Claude Code's worktree feature.
  - New shared `DEFAULT_SKIP_DIRS` constant (60+ entries) at `packages/graph/src/ingest/skip-dirs.ts`, exported from the package barrel along with `resolveSkipDirs`. Covers VCS, package managers, JS/TS framework caches, test/coverage outputs, Python virtualenvs and bytecode, JVM build outputs, IDE metadata, and AI agent sandboxes.
  - `CodeIngestor.findSourceFiles` rewritten as an iterative BFS walker — no more recursion, bounded by frontier size rather than path depth.
  - New `CodeIngestorOptions` constructor parameter: `skipDirs` (replace defaults), `additionalSkipDirs` (extend defaults), `excludePatterns` (minimatch globs), `respectGitignore` (default-on, supports the common `.gitignore` subset; negation is dropped silently).
  - Issue #276 — `loadGraph` slurped `graph.json` into one V8 string and crashed with `RangeError: Invalid string length` on graphs > ~512 MB. Production monorepos with thousands of source files hit this easily.
  - On-disk schema bumped v1 → v2: `graph.json` is now NDJSON, one record per line with a `kind` discriminator (`"node"` or `"edge"`). Reader uses `readline` so peak string size is bounded by the largest single record. Old v1 graphs trigger the existing `schema_mismatch` path → automatic rebuild on next scan.
  - New `loadGraphMetadata` helper (exported) reads only `metadata.json`. New `nodesByType` field on `GraphMetadata` enables a fast-path for summary callers that never touch `graph.json`.
  - `RangeError: Invalid string length` now wraps into an actionable error pointing at the offending file and likely cause.

  **`@harness-engineering/cli`:**
  - New `ingest` config block on `HarnessConfigSchema` mirroring `CodeIngestorOptions`. Use `additionalSkipDirs` to extend the comprehensive defaults without replacing them, `excludePatterns` for glob-based exclusions, and `respectGitignore: false` to opt out of `.gitignore` honoring.
  - `harness scan` and `harness ingest --source code` load the `ingest` block via best-effort `loadIngestOptions` — if `harness.config.json` is missing or malformed, falls back to defaults silently.
  - `harness graph status` now reads only `metadata.json` (via `loadGraphMetadata`) and returns instantly with full per-type node breakdown, even on multi-GB graphs that previously failed to load.
  - `harness graph status` reports a clear `schema_mismatch` message instead of an opaque parse error when the graph was written by an older schema version.
  - The CLI's MCP `glob-helper` now imports the shared `DEFAULT_SKIP_DIRS` so the MCP file walker and the graph ingester can no longer drift.

  **Documentation:**
  - `docs/reference/configuration.md` — new `ingest` section documenting `skipDirs`, `additionalSkipDirs`, `excludePatterns`, `respectGitignore`, the comprehensive default list, and a worked example.

  **Tests:**
  - New `packages/graph/tests/ingest/CodeIngestor-skip-dirs.test.ts` — asserts default coverage of `.claude`/`.vite`/`.turbo`/etc., custom `additionalSkipDirs`/`skipDirs`/`excludePatterns` work, `.gitignore` is honored, iterative walker handles deeply nested directories.
  - New `packages/graph/tests/store/Serializer.test.ts` — asserts NDJSON line shape, save/load roundtrip preserves nodes and edges, metadata fast-path returns counts without reading `graph.json`, schema-mismatch on legacy v1 files, large-graph (5K nodes + 5K edges) streams cleanly.
  - Existing `packages/cli/tests/commands/graph.test.ts` updated to assert the v2 NDJSON shape.

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.8.0
  - @harness-engineering/core@0.23.7
  - @harness-engineering/dashboard@0.5.1
  - @harness-engineering/intelligence@0.2.1
  - @harness-engineering/orchestrator@0.3.1

## 2.0.0

### Patch Changes

- Updated dependencies [8825aee]
- Updated dependencies [8825aee]
  - @harness-engineering/orchestrator@0.3.0
  - @harness-engineering/dashboard@0.5.0
  - @harness-engineering/types@0.11.0
  - @harness-engineering/intelligence@0.2.0
  - @harness-engineering/core@0.23.6

## 1.28.1

### Patch Changes

- Updated dependencies [18412eb]
  - @harness-engineering/graph@0.7.1
  - @harness-engineering/core@0.23.5
  - @harness-engineering/dashboard@0.4.1
  - @harness-engineering/intelligence@0.1.5
  - @harness-engineering/orchestrator@0.2.17

## 1.28.0

### Minor Changes

- 3bfe4e4: feat(config): add `design.enabled` tri-state config field for design-system opt-in/decline.
  - New `design.enabled?: boolean` field on `DesignConfigSchema`. Tri-state runtime semantics:
    - `true` — design system enabled; `harness-design-system` fires on `on_new_feature`.
    - `false` — explicitly declined; skill skips with a permanent-decline log line.
    - absent — undecided; skill surfaces a gentle prompt.
  - `.superRefine()` ensures `design.platforms` is a non-empty `('web' | 'mobile')[]` whenever `design.enabled === true`.
  - `initialize-harness-project` Phase 3 step 5b now records the choice via `emit_interaction` (yes / no / not sure) for non-test-suite projects; Phase 4 step 4 promotes the roadmap nudge to an active question and auto-adds a `Set up design system` planned roadmap entry when both answers are yes.
  - 6-variant fixture matrix and a yes/yes end-to-end test cover all answer combinations.

  Spec: `docs/changes/init-design-roadmap-config/proposal.md`. Verification report: `docs/changes/init-design-roadmap-config/verification/2026-05-03-phase5-report.md`.

- 3bfe4e4: feat(cli): add `harness migrate` command for legacy artifact layout.

  Migrates pre-co-location project artifacts (`.harness/architecture/`, `docs/plans/`, etc.) into the canonical layout. Supports `--dry-run` to preview the migration plan, interactive orphan bucketing, and a `--non-interactive` mode for CI use.

  Subsequent refactor pass hardened the implementation:
  - Replaced shell-string `git mv` with `execFileSync` (no shell metacharacter interpolation surface).
  - Tightened filename-prefix matching to require a word boundary (so plan `authhelper-plan` no longer falsely maps to topic `auth`).
  - Switched `runMigrate` return type to `Promise<Result<MigrationResult, CLIError>>` matching the convention used by `runCleanupSessions` and the rest of the CLI commands.
  - Resolves `harness.config.json` relative to the migrate cwd; warns explicitly on parse failure rather than silently falling back.
  - Skips the interactive orphan prompt during `--dry-run`.

- 3bfe4e4: feat: configurable domain inference for the knowledge pipeline.

  **`@harness-engineering/graph`:**
  - New shared helper `inferDomain(node, options)` at `packages/graph/src/ingest/domain-inference.ts`. Exported from the package barrel along with `DomainInferenceOptions`, `DEFAULT_PATTERNS`, `DEFAULT_BLOCKLIST`.
  - Built-in patterns cover common monorepo conventions: `packages/<dir>`, `apps/<dir>`, `services/<dir>`, `src/<dir>`, `lib/<dir>`.
  - Reserved blocklist prevents misclassification of infrastructure paths: `node_modules`, `.harness`, `dist`, `build`, `.git`, `coverage`, `.next`, `.turbo`, `.cache`, `out`, `tmp`.
  - Generic first-segment fallback after blocklist filter; preserves existing `KnowledgeLinker` connector-source branch and the `metadata.domain` highest-precedence behavior.
  - Refinements: code-extension allowlist (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`) so directories with dots in names like `foo.bar/` retain their full segment; symmetric blocklist returns `'unknown'` when a pattern captures a blocklisted segment instead of bleeding into the generic fallback.
  - Wired into `KnowledgeStagingAggregator`, `CoverageScorer`, and `KnowledgeDocMaterializer`. Each gains an optional `inferenceOptions: DomainInferenceOptions = {}` constructor parameter — back-compat preserved for single-arg construction.
  - `KnowledgePipelineRunner` accepts `inferenceOptions` on its per-run options and threads to all four construction sites.
  - Test coverage: 19 unit tests for the helper + 11 wiring/integration tests across consumer classes + 3 end-to-end fixture tests.

  **`@harness-engineering/cli`:**
  - New optional config: `knowledge.domainPatterns: string[]` and `knowledge.domainBlocklist: string[]` on `HarnessConfigSchema`. Pattern format is the literal `prefix/<dir>` (regex `^[\w.-]+\/<dir>$`); blocklist entries are non-empty strings. Both default to `[]` and **extend** the built-in defaults rather than replacing them.
  - `harness knowledge-pipeline` reads both fields via `resolveConfig()` and maps them to the runner's `inferenceOptions.extraPatterns` / `extraBlocklist`.
  - 22 schema validation tests covering valid populated / valid empty / valid absent / invalid pattern / invalid blocklist element / default-propagation cases.

  **Documentation:**
  - `docs/reference/configuration.md` — new `knowledge` section documenting both fields, the built-in defaults, the precedence order, both refinements, and a worked `agents/<dir>` example.
  - `docs/knowledge/graph/node-edge-taxonomy.md` — new "Domain Inference" section with a 6-row precedence-walkthrough table.
  - `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md` — one-line note in EXTRACT phase pointing at the config override.

  **Known follow-up:** Phase 6 verification showed the real-repo `unknown` bucket did not close as projected on this monorepo (helper + wiring + integration test all pass independently, but the production pipeline runtime path appears to lose `node.path` between extraction and aggregation). The diagnostic is filed as `Diagnose pipeline node-path loss for domain inference` on the roadmap.

  Spec: `docs/changes/knowledge-domain-classifier/proposal.md`. Verification report: `docs/changes/knowledge-domain-classifier/verification/2026-05-03-phase6-report.md`.

### Patch Changes

- 3bfe4e4: fix(roadmap): unblock dependents when blocker is marked done.

  Previously, marking a blocker feature as `done` left its dependents in the `blocked` state until manually updated. The roadmap now propagates done-status to dependents, transitioning them back to `planned` (or whatever their pre-block status was) when the blocker is resolved.

- Updated dependencies [3bfe4e4]
- Updated dependencies [3bfe4e4]
  - @harness-engineering/dashboard@0.4.0
  - @harness-engineering/graph@0.7.0
  - @harness-engineering/core@0.23.4
  - @harness-engineering/intelligence@0.1.4
  - @harness-engineering/orchestrator@0.2.16

## 1.27.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/dashboard@0.3.0

## 1.27.0

### Minor Changes

- Knowledge document materialization pipeline

  **@harness-engineering/graph:**
  - Add KnowledgeDocMaterializer that generates markdown knowledge docs from graph gap analysis
  - Wire KnowledgeDocMaterializer into pipeline convergence loop
  - Pass store to generateGapReport for differential gap analysis
  - Add materialization field to KnowledgePipelineResult
  - Fix filePath normalization to forward slashes for Windows compatibility
  - Fix conditional spread for exactOptionalPropertyTypes compatibility
  - Address review findings in knowledge pipeline
  - Add integration tests for pipeline materialization

  **@harness-engineering/cli:**
  - Display differential gaps and materialization results in knowledge-pipeline output

  **@harness-engineering/dashboard:**
  - Add knowledge pipeline to skill registry

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.6.0
  - @harness-engineering/dashboard@0.2.2
  - @harness-engineering/core@0.23.3
  - @harness-engineering/orchestrator@0.2.15

## 1.26.1

### Patch Changes

- Updated dependencies [e3dc2e7]
  - @harness-engineering/orchestrator@0.2.14
  - @harness-engineering/dashboard@0.2.1

## 1.26.0

### Minor Changes

- f62d6ab: Knowledge pipeline (Phases 4-5)

  **@harness-engineering/graph:**
  - Add KnowledgePipelineRunner with 4-phase convergence loop for end-to-end knowledge extraction
  - Complete Phase 4 knowledge pipeline with D2/PlantUML parsers, staging aggregator, and CLI integration
  - Add Phase 5 Visual & Advanced pipeline capabilities
  - Add DiagramParseResult types and MermaidParser for diagram-to-graph ingestion
  - Add StructuralDriftDetector with deterministic classification
  - Add ContentCondenser with passthrough and truncation tiers
  - Add KnowledgeLinker with heuristic pattern registry, clustering, staged output, and deduplication
  - Add code signal extractors for business knowledge extraction
  - Add business knowledge foundation with `business_fact` node type and `maxContentLength` config field
  - Add `execution_outcome` node type and `outcome_of` edge type

  **@harness-engineering/cli:**
  - Add Phase 5 Visual & Advanced pipeline capabilities
  - Add business-signals source to graph ingest

### Patch Changes

- f62d6ab: Resolve CLI typecheck errors for optional intelligence import and fix formatting failures
- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
  - @harness-engineering/graph@0.5.0
  - @harness-engineering/dashboard@0.2.0
  - @harness-engineering/orchestrator@0.2.13
  - @harness-engineering/linter-gen@0.1.7
  - @harness-engineering/core@0.23.2
  - @harness-engineering/types@0.10.1

## 1.25.7

### Patch Changes

- f0a7cdd: fix(init): skip project scaffolding for pre-existing projects (#235)

  `harness init` no longer creates scaffold files (pom.xml, App.java, etc.) when the target directory already contains a project. Detects existing projects by checking for common build/config markers and only writes harness config files.

## Unreleased

### Fixed

- fix(init): skip project scaffolding for pre-existing projects ([#235](https://github.com/Intense-Visions/harness-engineering/issues/235))

  `harness init --language java` (and the MCP `init_project` tool) no longer creates scaffold files (pom.xml, App.java, checkstyle.xml, etc.) when the target directory already contains a project. Added `isExistingProject()` detection that checks for 13 common build/config markers (build.gradle, package.json, go.mod, pyproject.toml, Cargo.toml, etc.). When an existing project is detected, only harness infrastructure files (harness.config.json, AGENTS.md) are written. Also added build.gradle/build.gradle.kts to `NON_JSON_PACKAGE_CONFIGS`. Use `--force` to override.

## 1.25.6

### Patch Changes

- 528a72f: Fix two root causes preventing PostHog telemetry data collection

  **CLI command telemetry:**
  Commander.js `preAction` hook used `thisCommand` (root program) instead of `actionCommand` (the actual subcommand). `resolveCommandName` always returned `""`, silently skipping adoption record writes. Fixed by using the correct `actionCommand` parameter.

  **Skill invocation telemetry:**
  `emitEvent()` was implemented but never called from production code. Wired event emission into MCP tool handlers (`manage_state`, `emit_interaction`, `run_skill`) so the adoption-tracker Stop hook has events to process. Added new `event-emitter.ts` module with `emitSkillEvent` for phase transitions, gate results, handoffs, and errors.

- Updated dependencies
  - @harness-engineering/dashboard@0.1.8

## 1.25.5

### Patch Changes

- fix(ci): cross-platform CI fixes for Windows test timeouts and coverage scripts
- fix(cli): prevent `--global` from orphaning core harness slash commands

  `harness generate-slash-commands --global` and `harness update` (global) no longer remove core harness commands when run from a project with installed third-party skills.

- fix(telemetry): use `distinct_id` (snake_case) for PostHog batch API

  PostHog requires `distinct_id` but the code sent `distinctId` (camelCase), causing all telemetry events to be silently rejected with HTTP 400. Added identity fallbacks from `harness.config.json` name and `git config user.name`. Added `harness telemetry test` command for verifying PostHog connectivity.

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.23.0
  - @harness-engineering/types@0.10.0
  - @harness-engineering/orchestrator@0.2.11
  - @harness-engineering/dashboard@0.1.7

## 1.25.4

### Patch Changes

- ad48d91: Fix orchestrator state reconciliation, stale worktree reuse, and dashboard production proxy

  **@harness-engineering/orchestrator:**
  - Reconcile completed/claimed state against roadmap on each tick: completed entries are released after a grace period when they reappear as active candidates, and orphaned claims are released when escalated issues leave active candidates
  - Always recreate worktrees from latest base ref on dispatch instead of reusing stale worktrees from before an orchestrator restart
  - Add `analyses/`, `interactions/`, `workspaces/` to `.harness/.gitignore` template so orchestrator runtime directories are never committed

  **@harness-engineering/dashboard:**
  - Proxy orchestrator API and WebSocket in production mode (`harness dashboard run`), not just in Vite dev server — fixes dashboard failing to connect to orchestrator in production
  - Fix CORS to allow non-loopback HOST bindings

  **@harness-engineering/cli:**
  - Add `--orchestrator-url` flag to `harness dashboard` command for configuring the orchestrator proxy target

- Updated dependencies [ad48d91]
  - @harness-engineering/orchestrator@0.2.10
  - @harness-engineering/dashboard@0.1.6

## 1.25.3

### Patch Changes

- 1d0fdd8: Rename orchestrator config file from WORKFLOW.md to harness.orchestrator.md. The CLI default for `--workflow` now points to `harness.orchestrator.md`.
- Updated dependencies [1d0fdd8]
  - @harness-engineering/orchestrator@0.2.9

## 1.25.2

### Patch Changes

- 2911ef5: Fix telemetry pipeline and hook path resolution
  - Fix identity field lowercasing in telemetry wizard: project name, team, and alias now preserve original casing
  - Add `hooks/` and `security/` to `.harness/.gitignore` template so generated artifacts are never committed
  - Add CLI command telemetry: every `harness` CLI invocation writes an adoption record to `adoption.jsonl`, flushed to PostHog on the next invocation
  - Fix hook path resolution: use `git rev-parse --show-toplevel` so hooks resolve correctly when Claude Code CWD is a subdirectory
  - Untrack `.harness/security/timeline.json` (runtime artifact committed before gitignore rule existed)

## 1.25.1

### Patch Changes

- 370cefb: Fix hook refresh failure after global install. `resolveHookSourceDir()` path resolution failed in bundled dist layout, and `copy-assets.mjs` was not copying hook scripts to `dist/hooks/`.

## 1.25.0

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

- Updated dependencies [f1bc300]
- Updated dependencies
  - @harness-engineering/core@0.22.0
  - @harness-engineering/orchestrator@0.2.8
  - @harness-engineering/dashboard@0.1.5

## 1.24.3

### Patch Changes

- 46999c5: Fix `harness dashboard` returning 404 on all routes by serving built client static files from the Hono API server with SPA fallback.
- 802a1dd: Fix `search_skills` returning irrelevant results and compaction destroying skill content.
  - Index all non-internal skills regardless of tier so the router can discover Tier 1/2 skills
  - Add minimum score threshold (0.25) to filter noise from incidental substring matches
  - Fix `resultToMcpResponse` double-wrapping strings with `JSON.stringify`, which collapsed newlines and caused truncation to drop all content
  - Truncate long lines to fit budget instead of silently skipping them; cap marker cost at 50% of budget
  - Exempt 12 tools from lossy truncation (run_skill, emit_interaction, manage_state, etc.) — use structural-only compaction for tools whose output must arrive complete

- Updated dependencies [46999c5]
- Updated dependencies [802a1dd]
  - @harness-engineering/dashboard@0.1.4
  - @harness-engineering/core@0.21.4
  - @harness-engineering/orchestrator@0.2.7

## 1.24.1

### Patch Changes

- 5bbad27: Fix `harness update` to check all installed packages for updates, not just CLI. Adds `--force` and `--regenerate` flags.

## 1.24.0

### Minor Changes

- Skill dispatcher enhancements, knowledge skill infrastructure, and structural improvements
  - Add `related_skills` traversal and knowledge auto-injection (cap N=3) to skill dispatcher
  - Add `paths` glob dimension to skill scoring (0.20 weight)
  - Add NL router skill with `command_name` override
  - Add `--skills-dir`, bulk install, global skills, and GitHub source to install command
  - Replicate knowledge skills across gemini-cli, cursor, and codex platforms
  - Add `return` after `process.exit()` calls for TypeScript control-flow correctness
  - Replace `!!` with `Boolean()` for explicit boolean coercion in integrations list
  - Reduce Tier 2 structural complexity across CLI commands

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.21.2
  - @harness-engineering/graph@0.4.2
  - @harness-engineering/linter-gen@0.1.6
  - @harness-engineering/orchestrator@0.2.6
  - @harness-engineering/types@0.9.1

## 1.23.2

### Patch Changes

- Reduce cyclomatic complexity in `traceability` command
- Updated dependencies
  - @harness-engineering/core@0.21.1 — fix blocked status corruption in external sync

## 1.23.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.21.0 — roadmap sync: remove auto-assignee, add title-based dedup, single fetch per cycle

## 1.23.0

### Minor Changes

- Add `assignee` field to `manage_roadmap update` action

  The `update` action now accepts an `assignee` parameter that delegates to `assignFeature()` for proper assignment history tracking (new assignment and reassignment with unassigned + assigned records). Because `update` is a mutating action, `triggerExternalSync` fires automatically — fixing the bug where the roadmap pilot skill bypassed sync by calling `assignFeature()` directly.

## 1.22.0

### Minor Changes

- Predictive architecture failure analysis, spec-to-implementation traceability, architecture decay timeline, and skill recommendation engine

## 1.21.0

### Minor Changes

- Return readable markdown from emit_interaction instead of JSON blob

  Split the single JSON content item into dual items: rendered markdown first (audience: user+assistant) and metadata JSON second (audience: assistant), with MCP audience annotations. This makes emit_interaction output readable on Gemini CLI and other clients that display raw MCP tool responses.

### Patch Changes

- Fix search_skills to find skills by name and description, not just keywords

## 1.20.1

### Patch Changes

- Fix injection scanner false positives on trusted MCP tool output

  The sentinel injection guard was scanning output from all MCP tools, including harness-internal tools like `run_skill` and `gather_context` that return project documentation and state. Skill docs containing legitimate patterns (e.g., `<context>` XML tags, "auto-approve" feature descriptions) triggered INJ-CTX-003 and INJ-PERM-003, tainting the session and blocking git operations.

  Added `trustedOutputTools` option to the injection guard middleware. All harness MCP tools are marked as trusted (opt-in), skipping output scanning while preserving input scanning. New tools default to untrusted.

## 1.20.0

### Minor Changes

- Load project `.env` for external sync — The MCP server's `triggerExternalSync` now loads `.env` from the project root when `GITHUB_TOKEN` is not already in the environment, fixing token discovery when the MCP server's working directory differs from the project.

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.19.0 — GitHub sync assignee push and auto-population

## 1.19.0

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.18.0 — GitHub milestone sync, feature type labels, rate limit retry

## 1.18.0

### Minor Changes

- Environment configuration via `.env` file
  - **dotenv support** — Added `dotenv` as a runtime dependency. Both CLI entry points (`harness`, `harness-mcp`) now load `.env` from the working directory at startup via `import 'dotenv/config'`.
  - **`.env.example`** — New file at repo root documenting all known environment variables: API keys (GITHUB_TOKEN, CONFLUENCE_API_KEY, CONFLUENCE_BASE_URL, JIRA_API_KEY, JIRA_BASE_URL, SLACK_API_KEY), integrations (PERPLEXITY_API_KEY), feature flags (HARNESS_NO_UPDATE_CHECK, CI), and server config (PORT).
  - **`.gitignore` hardening** — Broadened env file patterns from `.env` / `.env*.local` to `.env*` with `!.env.example` exception, catching all variants (`.env.production`, `.env.staging`, etc.).

## 1.17.0

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
  - @harness-engineering/core@0.17.0
  - @harness-engineering/graph@0.3.5
  - @harness-engineering/orchestrator@0.2.5

## 1.16.0

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
  - @harness-engineering/core@0.16.0
  - @harness-engineering/types@0.6.0
  - @harness-engineering/orchestrator@0.2.4
  - @harness-engineering/graph@0.3.4

## 1.15.0

### Minor Changes

- **Hooks system** — 6 hook scripts (`block-no-verify`, `cost-tracker`, `pre-compact-state`, `protect-config`, `quality-gate`, `profiles`) with profile tiers (minimal/standard/strict). CLI commands `hooks init`, `hooks list`, `hooks remove` for managing Claude Code hooks via `settings.json` merge.
- **Code navigation MCP tools** — Register `code_outline`, `code_search`, and `code_unfold` tools in the MCP server, powered by the new core code-nav module.
- **Event timeline in `gather_context`** — Structured event log integration for richer context assembly.
- **Learnings progressive disclosure** — Depth parameter in `gather_context` and `loadBudgetedLearnings` for layered context retrieval. Frontmatter annotations and index entry extraction.
- **Onboarding funnel** — `harness setup` command, `doctor` health check, and first-run welcome experience.
- **Session learning promotion** — Autopilot DONE state promotes session learnings and suggests pruning.

### Patch Changes

- Fix shell injection and `-n` flag bypass in hook scripts
- Fix `execFileSync` consistency and MCP-003 wildcard in security/hooks
- Fix stale scripts, malformed settings, and fallback error in hooks CLI
- Fix roadmap sync guard with directional protection
- Updated dependencies
  - @harness-engineering/core@0.15.0
  - @harness-engineering/types@0.5.0

## 1.14.0

### Minor Changes

- **Multi-language template system** — 5 language bases (Python, Go, Rust, Java, TypeScript) and 10 framework overlays (FastAPI, Django, Gin, Axum, Spring Boot, Next.js, React Vite, Express, NestJS). Language-aware resolution in `TemplateEngine` with `detectFramework()` auto-detection.
- **`--language` flag** — Explicit language selection for `harness init` with conflict validation against detected framework.
- **Framework conventions** — `harness init` appends framework-specific conventions to existing AGENTS.md and persists tooling/framework metadata in `harness.config.json`.
- **Session sections in `manage_state`** — New session section actions (read, append, status update) with schema-validated definitions.
- **Session section retrieval in `gather_context`** — New `sessions` include key for loading session section data.
- **MCP `init_project` enhancements** — Accepts `language` parameter and persists tooling metadata.

### Patch Changes

- Fix `detectFramework` file descriptor leak with try/finally guard
- Fix enum constraints on session section and status MCP schema properties
- Reduce cyclomatic complexity across template and tool modules
- Updated dependencies
  - @harness-engineering/core@0.14.0
  - @harness-engineering/types@0.4.0

## 1.13.1

### Patch Changes

- **Graph tools decomposition** — Split `graph.ts` (821 lines) into 9 focused modules under `tools/graph/`: `query-graph`, `search-similar`, `find-context-for`, `get-relationships`, `get-impact`, `ingest-source`, `detect-anomalies`, `ask-graph`, and shared utilities.
- **Roadmap handler refactor** — Extracted 6 action handlers from `handleManageRoadmap` into standalone functions with shared `RoadmapDeps` interface.
- **Three-tier skill loading** — New `search_skills` MCP tool (46 total). Skill dispatcher with tier-based loading, index builder, and stack profile detection.
- **`check_docs` docsDir fix** — `check_docs` MCP tool and `harness add` command now honor the `docsDir` config field.
- **Cross-platform path fix** — `path.relative()` outputs normalized to POSIX separators across glob helper and path utilities.
- **Gather-context fix** — Resolved `exactOptionalPropertyTypes` error in gather-context tool.
- MCP tool count test assertions updated from 45 to 46.
- Updated dependencies
  - @harness-engineering/core@0.13.1
  - @harness-engineering/orchestrator@0.2.3

## 1.13.0

### Minor Changes

- Efficient Context Pipeline: session support in MCP tools, learnings prune command, roadmap parser fix
  - **`harness learnings prune`**: New CLI command that analyzes global learnings for recurring patterns, presents improvement proposals, and archives old entries keeping 20 most recent
  - **`gather_context` session support**: Added `session` and `learningsBudget` parameters for session-scoped context loading with token-budgeted learnings
  - **`manage_state` session support**: All 7 actions (show, learn, failure, archive, reset, save-handoff, load-handoff) now accept `session` parameter for session-scoped state
  - **`emit_interaction` session support**: Handoff writes respect session scoping when `session` parameter is provided
  - **Roadmap parser fix**: `manage_roadmap` no longer clobbers the roadmap file — parser accepts both `### Feature: X` and `### X` formats, serializer outputs format matching actual roadmap

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.13.0
  - @harness-engineering/types@0.3.1

## 1.12.0

### Minor Changes

- Add constraint sharing commands and private registry support
  - `harness install-constraints` — install shared constraint bundles with conflict detection, dry-run mode, and `--force-local`/`--force-package` resolution
  - `harness uninstall-constraints` — remove contributed rules using lockfile-driven tracking
  - `harness install --from` — install skills from local paths (directories or tarballs)
  - `harness install --registry` / `harness search --registry` / `harness publish --registry` — private registry support with `.npmrc` token reading
  - Upgrade detection in `install-constraints` (uninstall old version before installing new)
  - Fix `exactOptionalPropertyTypes` violation in install command

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.12.0
  - @harness-engineering/orchestrator@0.2.1

## 1.11.0

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
  - @harness-engineering/orchestrator@0.2.0
  - @harness-engineering/core@0.11.0
  - @harness-engineering/types@0.3.0
  - @harness-engineering/graph@0.3.2
  - @harness-engineering/linter-gen@0.1.3

## 1.10.0

### Minor Changes

- **Merge `@harness-engineering/mcp-server` into CLI** — the MCP server (42 tools, 8 resources) now ships as part of the CLI package. Installing `@harness-engineering/cli` provides both `harness` and `harness-mcp` binaries.
  - Move source to `packages/cli/src/mcp/` (server, tools, resources, utils)
  - Move tests to `packages/cli/tests/mcp/` (37 test files, 889 tests)
  - Add `harness mcp` subcommand and `harness-mcp` bin entry
  - Add `@modelcontextprotocol/sdk` as dependency (externalized in tsup)
  - Re-export `createHarnessServer`, `startServer`, `getToolDefinitions` from CLI index
  - `@harness-engineering/mcp-server` is now deprecated
- Add lint check to `assess_project` tool with enforcement in execution skill
- Embed automatic roadmap sync into pipeline skills
- Update `release-readiness` skill to use `assess_project` with lint

### Patch Changes

- Replace `no-explicit-any` casts with typed interfaces in `gather-context`
- Unify `paths.ts` with `findUpFrom` + `process.cwd()` fallback
- Updated dependencies
  - @harness-engineering/core@0.10.1
  - @harness-engineering/graph@0.3.1

## 1.9.0

### Minor Changes

- Pick up composite MCP tools (`gather_context`, `assess_project`, `review_changes`), agent workflow acceleration, and `detect_anomalies` tool via updated mcp-server

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.10.0
  - @harness-engineering/graph@0.3.0

## 1.8.0

### Minor Changes

- Upgrade `review` command with `--comment`, `--ci`, `--deep`, and `--no-mechanical` flags for the unified 7-phase review pipeline
- Add update-check hooks with startup background check and notification helpers
- Read `updateCheckInterval` from project config in update-check hooks
- Add `parseConventionalMarkdown` utility for interaction surface patterns

### Patch Changes

- Resolve TypeScript strict-mode errors and platform parity gaps
- Updated dependencies
  - @harness-engineering/core@0.9.0
  - @harness-engineering/types@0.2.0

## 1.7.0

### Minor Changes

- Remove `harness-mcp` binary from CLI package to break cyclic dependency with `@harness-engineering/mcp-server`. The `harness-mcp` binary is now provided exclusively by `@harness-engineering/mcp-server`. Users who install the CLI globally should also install `npm install -g @harness-engineering/mcp-server` for MCP server support.
- Remove `@harness-engineering/mcp-server` from production dependencies

### Patch Changes

- Align dependency versions across workspace: `@types/node` ^22, `vitest` ^4, `minimatch` ^10, `typescript` ^5.3.3

## 1.6.2

### Patch Changes

- Bundle workspace packages into CLI dist so global install works without sibling packages

## 1.6.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.2.1

## 1.6.0

### Minor Changes

- Add agent definition generator for persona-based routing
- Add 5 new graph-powered skills: harness-impact-analysis, harness-dependency-health, harness-hotspot-detector, harness-test-advisor, harness-knowledge-mapper
- Add 2 new personas: Graph Maintainer, Codebase Health Analyst
- Update all 12 Tier-1/Tier-2 skill SKILL.md files with graph-aware context gathering notes
- Add graph refresh steps to 8 code-modifying skills
- Add platform parity lint rule (platform-parity.test.ts) ensuring claude-code and gemini-cli skills stay in sync
- Update 3 existing personas with graph skill references

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.8.0
  - @harness-engineering/graph@0.2.0

## 1.5.0

### Minor Changes

- Discover project-local skills in `generate-slash-commands` by default instead of only finding built-in global skills
  - New `--include-global` flag merges built-in skills alongside project skills
  - Project skills take precedence over global skills on name collision
  - Falls back to global skills when run outside a project (backward compatible)
  - Helpful message when no skills are found with guidance on `--include-global` and `create-skill`
- Export `SkillSource` type from package index

### Patch Changes

- Fix `create-skill` to scaffold with both `claude-code` and `gemini-cli` platforms by default

## 1.4.0

### Patch Changes

- Fix `update` command to use `@latest` per package instead of a single version

## 1.3.0

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
  - @harness-engineering/core@0.7.0

## 1.2.2

### Patch Changes

- Fix slash command descriptions not appearing in Claude Code by moving YAML frontmatter to line 1

## 1.2.1

### Patch Changes

- dc88a2e: Codebase hardening: normalize package scripts, deduplicate Result type, tighten API surface, expand test coverage, and fix documentation drift.

  **Breaking (core):** Removed 6 internal helpers from the entropy barrel export: `resolveEntryPoints`, `parseDocumentationFile`, `findPossibleMatches`, `levenshteinDistance`, `buildReachabilityMap`, `checkConfigPattern`. These were implementation details not used by any downstream package. If you imported them directly from `@harness-engineering/core`, import from the specific detector file instead (e.g., `@harness-engineering/core/src/entropy/detectors/drift`).

  **core:** `Result<T,E>` is now re-exported from `@harness-engineering/types` instead of being defined separately. No consumer-facing change.

  **All packages:** Normalized scripts (consistent `test`, `test:watch`, `lint`, `typecheck`, `clean`). Added mcp-server to root tsconfig references.

  **mcp-server:** Fixed 5 `no-explicit-any` lint errors in architecture, feedback, and validate tools.

  **Test coverage:** Added 96 new tests across 13 new test files (types, cli subcommands, mcp-server tools).

  **Documentation:** Rewrote cli.md and configuration.md to match actual implementation. Fixed 10 inaccuracies in AGENTS.md.

- Updated dependencies [dc88a2e]
  - @harness-engineering/core@0.6.0

## 1.1.1

### Patch Changes

- Fix setup-mcp to write Claude Code config to .mcp.json (not .claude/settings.json), add Gemini trusted folder support, fix package name to @harness-engineering/mcp-server, and export CLI functions for MCP server integration.

## 1.1.0

### Minor Changes

- Add setup-mcp command and auto-configure MCP server during init for Claude Code and Gemini CLI

## 1.0.2

### Patch Changes

- Bundle agents (skills + personas) into dist for global install support

## 1.0.1

### Patch Changes

- Bundle templates into dist for global install support
