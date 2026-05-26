---
'@harness-engineering/cli': minor
---

Add **copy-craft** — third member of the craft-pipeline initiative (sub-project #5 of 10). LLM-judgment skill for ALL prose-in-code across **six surfaces**: error messages, log lines, CLI output strings, commit subjects, PR descriptions, and code comments. Primary domain is error messages (universally bad in most codebases). NO rule-based floor exists — pure ceiling.

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
