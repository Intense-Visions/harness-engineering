# copy-craft v1

> Third member of the craft-pipeline initiative (sub-project #5 of 10). LLM-judgment skill for ALL prose-in-code: error messages, log lines, CLI output strings, commit message subjects, PR descriptions, and code comments. Primary domain is error messages (universally bad in most codebases). NO rule-based floor exists — pure ceiling. Honors ADRs 0018-0021. Imports shared craft infrastructure from `packages/cli/src/shared/craft/` (the home extracted by spec-craft).

## Overview

**Project:** copy-craft (v1)
**Initiative:** craft-pipeline (sub-project #5 of 10 — third non-design craft skill)
**Date:** 2026-05-25
**Estimated effort:** ~1.5 weeks, single PR (six extractors increase scope vs naming/spec-craft which had one each)
**Composes with:** naming-craft (identifier-naming inside error strings), spec-craft (commit subjects are spec-adjacent), design-craft-elevator (UI copy in components), docs-craft (#2, future — prose docs)

### What this ships

A new skill + CLI command + MCP tool that critiques prose-in-code across six distinct surfaces. Each surface has its own extractor (different infrastructure) but shares one rubric catalog and the standard 3-axis output:

| Surface            | Extractor                                                                    | Primary rubrics                                             |
| ------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Error messages     | TS Compiler API — `throw new <SomeError>("...")` + `Err({ message: "..." })` | WHAT/WHY/HOW-TO-FIX, calm-not-panicky, specific-not-generic |
| Log lines          | TS Compiler API — `console.log/info/warn/error`, `logger.X`                  | Signal-not-noise, grep-survives, leveled-correctly          |
| CLI output strings | TS Compiler API — strings under `packages/cli/src/commands/`                 | Terminal-respecting (width, color), teaches-next-step       |
| Commit subjects    | `git log` shell-out                                                          | Describes-change-not-work, stranger-in-6-months, length     |
| PR descriptions    | `gh pr list` + `gh pr view` shell-out (auth-gated)                           | Same as commit subjects + extended-body coherence           |
| Code comments      | TS Compiler API — `ts.getLeadingCommentRanges()` traversal                   | WHY-not-WHAT, non-obvious, no-rot                           |

Each surface degrades gracefully when its prerequisites are absent (no `gh` binary → PR-description rule silently skips; not in a git repo → commit-subject rule skips).

### What this does NOT ship

- **No FIX skill.** Sibling `align-copy` is v2 if signal warrants safe-to-apply rewrites.
- **No B' detect-and-offer.** Same posture as naming-craft / spec-craft v1.
- **No graph persistence.** Phase 1 MVP.
- **No language support beyond TS/JS.** Python/Go/Rust error idioms in v1.x.
- **No deep/vision mode.** All copy is text.
- **No multi-line commit-body critique.** v1 critiques commit SUBJECTS only (the `%s` line). Bodies and PR descriptions get separate rubric mappings.
- **No JSDoc / TSDoc API doc critique.** That's docs-craft's (#2) territory. v1 critiques inline `//` comments that aren't structured doc.
- **No PR-comment / review-comment critique.** PRs only; comments inside them are deferred.
- **No author-attributed signals.** v1 treats all copy uniformly; per-author analysis is v1.x telemetry territory.

### What problem this solves

Error messages are the universally-worst prose in most codebases. Log lines accumulate noise that survives no grep. CLI output assumes the user already knows what failed. Commit subjects describe the work ("update tests") instead of the change ("ratchet drift threshold to 0.5%"). PR descriptions paste the commit message and call it done. Code comments narrate the code instead of explaining the WHY. None of this is caught by any rule-based floor — there's no linter that says "this `throw new Error('failed')` doesn't tell the user what to do next." copy-craft puts the canonical critique rubrics (calm-not-panicky, signal-not-noise, change-not-work, WHY-not-WHAT) into the loop, surfacing concrete findings with suggested rewrites.

## Decisions

| #   | Decision                                | Lock                                                                                                                  | Rationale                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | v1 surfaces                             | **All 6 surfaces from the roadmap entry** (errors, logs, CLI output, commit subjects, PR descriptions, code comments) | User picked the bold scope. Single PR covers the full prose-in-code surface area. Each extractor is small per-surface (regex / AST / shell-out); the integration is more work than any one extractor. Graceful degradation for surfaces requiring external infra (git, gh CLI).              |
| 2   | Extraction approach for source surfaces | **TS Compiler API** (errors, logs, CLI output, comments)                                                              | Same approach naming-craft uses for JSX. Precise: knows when a string literal is inside an Error constructor vs an arbitrary function call. Avoids false positives on non-error code. Reuses existing AST infrastructure. Commit subjects + PR descriptions use shell-out (different infra). |
| 3   | Catalog pattern                         | **Living catalog H (ADR 0020)**                                                                                       | Continues the established craft pattern (naming + spec). Seed rubrics with contribution/signal/version fields reserved.                                                                                                                                                                      |

## Scope

### In-scope

- **8 seed rubrics** (one file per rubric, matches naming-craft / spec-craft layout):
  - `COPY-R001` **WHAT/WHY/HOW-TO-FIX** (errors) — does the message explain what failed, why, and what to do next?
  - `COPY-R002` **calm-not-panicky** (errors, logs) — `"CATASTROPHIC FAILURE"` vs `"could not resolve config file"`
  - `COPY-R003` **specific-not-generic** (errors, logs, CLI output) — names the operation/artifact, not "an error occurred"
  - `COPY-R004` **signal-not-noise** (logs) — would this log line be worth scanning at 3am?
  - `COPY-R005` **grep-survives** (logs, CLI output) — searchable substrings without timestamp noise
  - `COPY-R006` **describes-change-not-work** (commit subjects, PR descriptions) — `"update tests"` (work) vs `"ratchet drift threshold"` (change)
  - `COPY-R007` **stranger-in-6-months** (commit subjects, PR descriptions, comments) — could a reader without your current context understand it?
  - `COPY-R008` **WHY-not-WHAT** (comments) — does the comment explain the non-obvious reason, or just narrate the code below?
- **6 extractors**:
  - `extract/errors.ts` — TS API walk for `throw new <X>("...")` (where X has "Error" or is whitelisted) + `Err({ message: "..." })`
  - `extract/logs.ts` — TS API walk for `console.log/info/warn/error/debug` and common logger forms (`logger.X`, `log.X`, `pino.X`, `winston.X`)
  - `extract/cli-output.ts` — TS API walk over files under a configurable CLI-source glob (default `packages/*/src/commands/`); finds string literals passed to printers (`console.log`, `formatter.write`, `chalk(...)`)
  - `extract/commits.ts` — `git log --pretty=format:'%H%x09%s'` shell-out; parses subjects with hash for citation
  - `extract/pr-descriptions.ts` — `gh pr list --json number,title,body` shell-out (gated on `gh` binary present + `gh auth status` succeeds); skip gracefully when unavailable
  - `extract/comments.ts` — TS API + `ts.getLeadingCommentRanges()` to capture single-line and block comments (excludes JSDoc; docs-craft will own that)
- **Per-rubric surface mapping** (similar to spec-craft's section mapping):
  ```ts
  appliesToSurfaces: ['error' | 'log' | 'cli-output' | 'commit' | 'pr-description' | 'comment'][]
  ```
- **3-axis `CopyFinding`** matching the shared craft shape: tier × impact × confidence + cite + derived priority + target (file + line + surface).
- **Graceful degradation** for git/gh-dependent surfaces:
  - Not a git repo (no `.git/`) → commit extractor skips silently
  - `gh` binary missing or unauthenticated → PR-description extractor skips silently
  - No findings recorded as failures for these cases; surface count in `summary` reflects what actually ran
- **CLI:** `harness copy-craft`.
- **MCP tool:** `copy_craft` (count 76 → 77).
- **4-platform skill markdown.**
- **Config block:** `craft.copy.{enabled, maxFiles, maxItemsPerFile, surfaces}` where `surfaces` lets users disable specific extractors.

### Out-of-scope (v1)

- **No FIX skill.** v2.
- **No B' bootstrap.** Same posture as naming/spec.
- **No graph persistence.** Phase 1 MVP.
- **No non-TS/JS language support.** v1.x.
- **No JSDoc / TSDoc.** docs-craft (#2) territory.
- **No PR comments / review comments.** v1.x.
- **No multi-line commit-body critique.** Subjects only in v1.
- **No author-attributed analysis.** v1.x telemetry.

## Inputs

- **Project root path** (CLI / MCP arg).
- **harness.config.json** — `craft.copy.{enabled, maxFiles, maxItemsPerFile, surfaces, commitsSince, prLimit}` (new sub-block under `craft.*`).
- **TS Compiler API** for source-side extractors.
- **`git` binary** for commit subjects (optional; degrades silently).
- **`gh` binary** + auth for PR descriptions (optional; degrades silently).
- **LLM provider** (`MockLlmProvider` in v1; same posture as naming/spec).

## Outputs

```ts
type CopySurface = 'error' | 'log' | 'cli-output' | 'commit' | 'pr-description' | 'comment';

interface CopyFinding {
  /** Stable code in COPY-R\d{3} namespace. */
  code: string;
  phase: 'critique';
  tier: 'foundational' | 'polish' | 'aspirational';
  impact: 'small' | 'medium' | 'large';
  confidence: 'high' | 'medium' | 'low';
  target: {
    /** File path for source surfaces; ref (commit hash / PR number) for git surfaces. */
    file: string;
    line?: number;
    surface: CopySurface;
    /** The actual copy snippet that was critiqued. */
    snippet: string;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

interface CopyCraftOutput {
  findings: CopyFinding[];
  summary: {
    phaseRun: ['critique'];
    mode: 'fast';
    durationMs: number;
    llmCalls: { provider: string; model: string; count: number; costUsd: number };
    catalog: { rubricsApplied: string[]; surfacesScanned: CopySurface[] };
    counts: Record<CopySurface, number>; // items extracted per surface
    skippedSurfaces: Array<{ surface: CopySurface; reason: string }>;
    runId: string;
  };
}
```

## Technical Design

### Module layout

```
packages/cli/src/copy-craft/
  findings/
    schema.ts                      # CopyFinding, CopyCraftOutput, CopySurface
  catalog/
    rubrics/
      what-why-how-to-fix.ts       # COPY-R001
      calm-not-panicky.ts          # COPY-R002
      specific-not-generic.ts      # COPY-R003
      signal-not-noise.ts          # COPY-R004
      grep-survives.ts             # COPY-R005
      describes-change-not-work.ts # COPY-R006
      stranger-in-6-months.ts      # COPY-R007
      why-not-what.ts              # COPY-R008
    index.ts                       # rubric registry + surface-mapping helpers
  extract/
    errors.ts                      # throw new <X>Error(...) + Err({ message: ... })
    logs.ts                        # console.X + logger.X
    cli-output.ts                  # strings under CLI source dirs
    commits.ts                     # `git log` shell-out
    pr-descriptions.ts             # `gh pr list/view` shell-out (auth-gated)
    comments.ts                    # ts.getLeadingCommentRanges() walk
  phases/
    critique.ts                    # LLM critique loop per (item, rubric)
  index.ts                         # runCopyCraft + critiqueCopyInFile
packages/cli/src/mcp/tools/
  copy-craft.ts
packages/cli/src/commands/
  copy-craft.ts
agents/skills/{4 platforms}/copy-craft/
  SKILL.md
  skill.yaml
```

### Extracted item shape (extractor → critique handoff)

```ts
interface ExtractedCopyItem {
  file: string;
  line?: number;
  surface: CopySurface;
  snippet: string;
  /** Surrounding context for LLM prompt (function name, log level, error type, etc.) */
  context: {
    /** For errors: "TypeError", "ValidationError", "Error" */
    errorType?: string;
    /** For logs: "info", "warn", "error", "debug" */
    logLevel?: string;
    /** For commits / PRs: hash / number */
    ref?: string;
  };
}
```

### Source extractors (TS Compiler API)

All source extractors share a single TS AST walk per file but emit different `surface` tags based on what they find:

```ts
function visit(node: ts.Node, file: string, sourceFile: ts.SourceFile, out: ExtractedCopyItem[]): void {
  // Error: ts.NewExpression where ctor name matches /Error$/
  // Log: ts.CallExpression where ts.PropertyAccessExpression.expression matches logger/console patterns
  // Comment: ts.getLeadingCommentRanges + ts.getTrailingCommentRanges
  // CLI output: same as log, but only emitted when file path matches CLI source glob
  ...
}
```

Single-pass walk amortizes the AST parse cost across surfaces.

### Git / GitHub extractors

**Commits** (`extract/commits.ts`):

```ts
async function extractCommits(opts: {
  since?: string;
  limit?: number;
}): Promise<ExtractedCopyItem[]> {
  // Probe: is this a git repo? `git rev-parse --git-dir`
  // If not: return [] (caller logs skip in summary.skippedSurfaces)
  // git log --pretty=format:'%H%x09%s' --since="${since ?? '1 month ago'}" -n ${limit ?? 100}
  // Parse hash + subject; emit one item per commit with surface='commit'.
}
```

**PR descriptions** (`extract/pr-descriptions.ts`):

```ts
async function extractPRDescriptions(opts: { limit?: number }): Promise<ExtractedCopyItem[]> {
  // Probe: gh binary exists + gh auth status succeeds
  // If not: return [] (caller logs skip)
  // gh pr list --state=all --limit=${limit ?? 20} --json number,title,body
  // Emit one item per PR with surface='pr-description', snippet=title+body
}
```

Both shell-outs use `child_process.execSync` with timeouts; failures degrade silently (recorded in `summary.skippedSurfaces`).

### Rubric → surface mapping

Like spec-craft's section mapping. Each rubric declares which surfaces it applies to:

| Rubric                              | Applies to surfaces             |
| ----------------------------------- | ------------------------------- |
| COPY-R001 WHAT/WHY/HOW-TO-FIX       | error                           |
| COPY-R002 calm-not-panicky          | error, log                      |
| COPY-R003 specific-not-generic      | error, log, cli-output          |
| COPY-R004 signal-not-noise          | log                             |
| COPY-R005 grep-survives             | log, cli-output                 |
| COPY-R006 describes-change-not-work | commit, pr-description          |
| COPY-R007 stranger-in-6-months      | commit, pr-description, comment |
| COPY-R008 WHY-not-WHAT              | comment                         |

The orchestrator iterates `(item, rubric)` pairs only where the rubric applies to the item's surface. Skipped pairs are not LLM-called.

### Critique phase

Same pattern as naming/spec:

1. Build prompt with rubric description + surface label + context (errorType / logLevel / ref) + snippet.
2. LLM returns fenced JSON: `null` (rubric doesn't apply / copy is fine) OR `{ tier, impact, confidence, message, suggestedRewrite? }`.
3. On non-null: emit `CopyFinding` with `cite.rubricId` populated.

### Cross-cutting API

```ts
// packages/cli/src/copy-craft/index.ts
export async function runCopyCraft(input: CopyCraftInput): Promise<CopyCraftOutput>;
export async function critiqueCopyInFile(
  file: string,
  opts?: {
    source?: string;
    surfaces?: CopySurface[];
    rubrics?: CopyRubric[];
    provider?: LlmProvider;
  }
): Promise<CopyFinding[]>;
```

`critiqueCopyInFile` is the cross-cutting entry — handles only source-side surfaces (error / log / cli-output / comment). Git surfaces are project-scoped only.

## Surface area

### CLI

```
harness copy-craft [options]
  --files <files...>             Optional file/glob scope (source surfaces)
  --surfaces <surfaces...>       Restrict to: error / log / cli-output / commit / pr-description / comment
  --max-files <n>                Cap source file count (default: 100)
  --max-items-per-file <n>       Cap per-file item sampling (default: 20)
  --commits-since <when>         Override commit window (default: '1 month ago')
  --pr-limit <n>                 Override PR count (default: 20)
  --json
  --verbose / --quiet
```

Exit codes:

- `0` — no foundational-tier findings
- `1` — at least one foundational-tier finding
- `2` — crashed

### MCP tool

`copy_craft` — same input/output as function call. Count 76 → 77.

### Config

```ts
craft.copy: {
  enabled: boolean;                 // default true
  maxFiles: number;                 // default 100
  maxItemsPerFile: number;          // default 20
  surfaces?: CopySurface[];         // default: all six
  commitsSince?: string;            // default: '1 month ago'
  prLimit?: number;                 // default: 20
}
```

## Rationalizations to reject

| Rationalization                                                            | Why it's wrong                                                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Defer PR descriptions because they need gh auth"                          | User locked all 6 surfaces. Graceful degradation (skip when gh unavailable) is the honest answer: feature ships; runs when prereqs present, skips when not, surfaces the skip in `summary.skippedSurfaces`.             |
| "Extract errors via regex instead of TS API"                               | Q2 decision locked TS API. Regex emits false positives on `throw new MyClass("not an error")` and misses `Err({ message })` returns.                                                                                    |
| "Include JSDoc in the comments surface"                                    | JSDoc is structured API doc; docs-craft (#2) owns the rubric vocabulary for that (signal, predicts response shape, examples earn their place). Inline `//` and unstructured `/* */` are the v1 comment scope.           |
| "Critique commit body, not just subject"                                   | Bodies are richer but more variable in shape (some teams require them, others don't). v1 subjects-only matches the universal craft criterion ("does the subject describe the change"). Bodies + extended forms in v1.x. |
| "Make commit window configurable per-rubric"                               | YAGNI. v1 uses project-wide `--commits-since`; per-rubric scoping is a v1.x knob if real-world signal demands it.                                                                                                       |
| "Run all 8 rubrics on every surface"                                       | Surface mapping is the cost-control + signal-quality lever. `signal-not-noise` on commit subjects is noise; `describes-change-not-work` on log lines is meaningless.                                                    |
| "Add `--auth-required` flag for PR-descriptions"                           | The extractor already probes auth and skips silently. A flag duplicates the implicit check with manual override that doesn't add value.                                                                                 |
| "Use a unified CRAFT-C\d{3} code namespace shared across all craft skills" | Per-skill namespace (NAME-R, SPEC-R, COPY-R) keeps debugging local. Convergence to a unified prefix is v2 if it pays off.                                                                                               |
| "Critique HTTP response body strings (API responses) too"                  | Out of scope — that's api-craft (#7) territory (API quality, including error response shapes).                                                                                                                          |
| "Skip the cross-cutting `critiqueCopyInFile` API — overkill for v1"        | Same pattern as naming/spec; future craft skills + harness-brainstorming will want it. Cheap to ship now, expensive to retrofit later.                                                                                  |

## Success criteria

**Extractors — source surfaces (10)**

1. `extract/errors.ts` finds `throw new Error("msg")` and emits surface='error', context.errorType='Error'
2. ...finds `throw new TypeError("msg")` and emits errorType='TypeError'
3. ...finds `throw new ValidationError("msg")` (any \*Error class) — emits the actual ctor name
4. ...finds `Err({ message: "msg" })` Result-style returns — emits errorType='Err' (or null)
5. `extract/logs.ts` finds `console.log("msg")` and emits surface='log', context.logLevel='log'
6. ...finds `console.warn`, `console.error`, `console.info`, `console.debug` with correct logLevel
7. ...finds `logger.info("msg")`, `logger.warn("msg")`, etc. (any `*.X` where X is a known level)
8. `extract/cli-output.ts` emits surface='cli-output' for strings in files matching the CLI glob (default `packages/*/src/commands/`)
9. `extract/comments.ts` finds single-line `// comment` and emits surface='comment'
10. ...finds block `/* comment */` and emits surface='comment'
11. ...EXCLUDES JSDoc (`/** ... */`) — docs-craft territory

**Extractors — git / GitHub surfaces (6)**

12. `extract/commits.ts` returns [] when not in a git repo (no `.git`)
13. ...shells out `git log --pretty=format:'%H%x09%s'` when in a git repo and emits items with surface='commit'
14. ...respects `--commits-since` window option
15. `extract/pr-descriptions.ts` returns [] when `gh` binary is missing
16. ...returns [] when `gh auth status` fails
17. ...emits items with surface='pr-description' when gh is available + authenticated

**Catalog + rubric mapping (6)**

18. 8 seed rubrics ship at `catalog/rubrics/<id>.ts` (file-per-rubric)
19. Rubric `appliesToSurfaces` array filters which (item, rubric) pairs LLM-call
20. `COPY-R001` runs on errors only (not logs, not commits)
21. `COPY-R007` runs on commits / PRs / comments (per its applicability)
22. Non-applicable rubric/surface pairs skip silently (no LLM call)
23. Rubric `signal` / `contribution` / `version` fields present (ADR 0020)

**Critique + output (6)**

24. `runCopyCraft({ path })` produces a `CopyCraftOutput` with `findings`, `summary.counts`, `summary.skippedSurfaces`
25. Mock LLM provider's deterministic response produces a valid `CopyFinding`
26. Each finding includes `cite.rubricId` (ADR 0020)
27. `tier × impact × confidence` axes present (ADR 0019)
28. `derived.priority` computed via shared/craft's `derivePriority`
29. Cost telemetry: `summary.llmCalls.{count, costUsd}` populated

**Graceful degradation (3)**

30. Commit extractor skip records `{ surface: 'commit', reason: 'not a git repo' }` in `summary.skippedSurfaces`
31. PR extractor skip records `{ surface: 'pr-description', reason: '<gh missing | not authed>' }`
32. Skipped surfaces do NOT appear in `summary.catalog.surfacesScanned`

**Surface area (5)**

33. New MCP tool `copy_craft` registered (count 76 → 77)
34. New CLI command `harness copy-craft` registered
35. 4-platform skill markdown shipped
36. New config block `craft.copy.*` validates round-trip
37. Auto-doc regenerates with `copy_craft` MCP entry + `copy-craft` skill entry

**Cross-cutting (2)**

38. `critiqueCopyInFile(file, opts)` exported and invocable independently (source-side surfaces only)
39. `surfaces` filter on the orchestrator restricts which extractors run

## Long-term trajectory

- **v1.x — multi-line commit body + PR body critique** with extended-form rubrics (paragraphs honest, links earning their place).
- **v1.x — JSDoc / TSDoc** in copy-craft (or docs-craft hand-off, depending on which lands first).
- **v1.x — PR comments + review comments** as a separate surface (`pr-comment` / `review-comment`).
- **v1.x — per-language support** (Python `raise`/`logging`, Go `fmt.Errorf`/`log.Printf`, Rust `panic!`/`tracing::*`).
- **v1.x — `align-copy` sibling FIX skill** for safe-to-apply rewrites of error messages (the cleanest fix surface).
- **v2 — author-attributed signals** + per-author telemetry via Hermes.
- **v2 — composes with craft-pipeline orchestrator** (when it ships) — shared `pipeline.copyFindings` field; cross-skill convergence on commit-subject critique.
- **v3 — LLM-judgment via project's brand voice** (when `audit-brand-compliance` v2 ships voice-attribute critique). Cross-pipeline polish.

## Risks + mitigations

| Risk                                                                                                     | Mitigation                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM cost balloons across 6 surfaces                                                                      | Per-file caps (maxItemsPerFile=20) + per-project cap (maxFiles=100) + per-rubric/surface mapping (skips non-applicable pairs). Commit/PR caps separate (commitsSince + prLimit). Cost reported transparently in `summary.llmCalls.costUsd`. |
| False positives on test-fixture error messages ("intentionally bad")                                     | Low-confidence findings de-emphasized per ADR 0019. v1.x adds `<!-- copy-craft:skip -->` annotation. For v1: scope via `--files` to exclude fixtures.                                                                                       |
| `git log` shell-out is slow on huge repos                                                                | Bounded by `--commits-since` window + `-n limit`. Defaults (1 month, 100 commits) keep cost bounded.                                                                                                                                        |
| `gh` shell-out hangs on broken auth                                                                      | All shell-outs use `execSync` with a 10s timeout; broken auth times out and the surface skips silently.                                                                                                                                     |
| TS API walk doubles cost vs naming-craft (more surfaces extracted per file)                              | Single-pass AST walk amortizes parse cost across surfaces. Per-file ceiling is M=20 items total (sampled across surfaces) — same cost shape as naming-craft.                                                                                |
| Comments extractor over-counts file-header `//` license banners                                          | v1 includes them. v1.x adds heuristic skip for first-N-line block headers + common license-banner regex.                                                                                                                                    |
| CLI-output extractor's "files under `packages/*/src/commands/`" glob doesn't match a non-monorepo layout | Configurable via `craft.copy.cliOutputGlobs: string[]`. v1 default works for harness's own monorepo; users with different layouts override.                                                                                                 |
| `pr-description` extractor exposes secrets in critique findings                                          | `gh pr view` returns the rendered body only (no secrets in titles/bodies by gh's own contract). Critique findings include only the snippet that was fed to the LLM; no auth tokens or env vars are surfaced.                                |

## Open questions deferred to implementation

- **Whitelisted non-Error error classes.** v1 captures any class whose name ends in `Error`. Edge cases (custom Result types, Exception classes from non-TS conventions) are caught via `Err({ message })` pattern. Refinement based on real-world signal.
- **Log-call patterns.** v1 recognizes `console.*` + `logger.*` / `log.*` (any `*.X` where X is in a level allowlist). Pino-specific `child()` chains and winston transports are v1.x.
- **CLI-output glob default.** v1 ships `packages/*/src/commands/**/*.ts` as the default. Spec'd here; tunable per-config.
- **Commit-message subject parsing.** v1 takes the full subject (`%s`). Multi-line subjects (rare but possible) get joined with spaces. v1.x may add Conventional Commits parsing (type + scope + summary as separate rubric targets).
  EOF
