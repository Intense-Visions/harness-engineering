# Copy Craft

> LLM-judgment critique of prose-in-code across six surfaces: error messages, log lines, CLI output strings, commit subjects, PR descriptions, and code comments. Primary domain is error messages (universally bad in most codebases). Third member of the craft-pipeline initiative. NO rule-based floor exists — pure ceiling. Emits 3-axis findings (tier × impact × confidence per ADR 0019).

## When to Use

- During PR review on code that adds or changes error messages, log lines, or CLI output
- After a feature ships, to audit error-message quality across the changed surfaces
- Periodically (per-release) to catch accumulated noise in log lines + comment rot
- As the user-facing-copy critic alongside design-craft (which owns UI copy)
- NOT for UI copy in components (use design-craft)
- NOT for prose documentation in `docs/` (use docs-craft #2 when it ships)
- NOT for autofix / rewriting (this is judgment-only; v2 may ship `align-copy`)
- NOT for JSDoc / TSDoc structured API docs (docs-craft territory)
- NOT for non-TS/JS languages in v1 (v1.x)

## Process

### Phase 1: EXTRACT — Six surfaces, three infrastructures

1. **Read project configuration.** Check `harness.config.json` for:
   - `craft.copy.enabled` — gate (default `true`)
   - `craft.copy.surfaces` — restrict to specific surfaces (default: all 6)
   - `craft.copy.maxFiles` (default 100), `craft.copy.maxItemsPerFile` (default 20)
   - `craft.copy.commitsSince` (default `'1 month ago'`), `craft.copy.prLimit` (default 20)

2. **Source-side surfaces** (errors / logs / CLI output / comments): single TS Compiler API walk per source file. Amortizes parse cost across surfaces.
   - **errors:** `throw new <X>Error("...")` where the constructor name ends in `Error`; also `Err({ message: "..." })` for Result-style returns
   - **logs:** `console.log/info/warn/error/debug` and `logger.X` / `log.X` / `pino.X` / `winston.X` where X is a known level
   - **cli-output:** strings inside files under `packages/*/src/commands/` (configurable via `cliOutputPaths`); takes precedence over `log` for files matching the glob
   - **comments:** `ts.getLeadingCommentRanges()` + `getTrailingCommentRanges()`; excludes JSDoc and license banners

3. **Git surface** (commits): shell-out to `git log --pretty=format:'%H%x09%s' --since=...`. Skip silently when not in a git repo.

4. **GitHub surface** (PR descriptions): shell-out to `gh pr list --json number,title,body`. Skip silently when `gh` binary missing or `gh auth status` fails.

5. **Skipped surfaces** recorded in `summary.skippedSurfaces` with the reason — visible in the report, not a failure.

### Phase 2: CRITIQUE — Per (item, rubric) loop, surface-filtered

8 seed rubrics, each declares which surfaces it applies to:

| Rubric                                | Surfaces                        |
| ------------------------------------- | ------------------------------- |
| `COPY-R001` WHAT/WHY/HOW-TO-FIX       | error                           |
| `COPY-R002` calm-not-panicky          | error, log                      |
| `COPY-R003` specific-not-generic      | error, log, cli-output          |
| `COPY-R004` signal-not-noise          | log                             |
| `COPY-R005` grep-survives             | log, cli-output                 |
| `COPY-R006` describes-change-not-work | commit, pr-description          |
| `COPY-R007` stranger-in-6-months      | commit, pr-description, comment |
| `COPY-R008` WHY-not-WHAT              | comment                         |

For each (item, rubric) where the rubric applies to the item's surface:

1. Build prompt with rubric description + surface + context (errorType / logLevel / ref) + snippet (truncated to 1500 chars).
2. LLM returns fenced JSON: `null` (rubric doesn't apply / copy is fine) OR `{ tier, impact, confidence, message }`.
3. On non-null: emit `CopyFinding` with `cite.rubricId` for ADR 0020 traceability.

### Phase 3: REPORT — Aggregate + cost telemetry

Emit `CopyCraftOutput`:

```ts
{
  findings: CopyFinding[];
  summary: {
    phaseRun: ['critique'];
    durationMs: number;
    llmCalls: { provider, model, count, costUsd };
    catalog: { rubricsApplied: string[]; surfacesScanned: CopySurface[] };
    counts: Record<CopySurface, number>;
    skippedSurfaces: Array<{ surface, reason }>;
    runId: string;
  }
}
```

## Harness Integration

- **`harness copy-craft`** — CLI entry. `--files` / `--surfaces` / `--max-files` / `--max-items-per-file` / `--commits-since` / `--pr-limit` / `--json` / `--verbose`.
- **`mcp__harness__copy_craft`** — MCP tool. Same input/output. Consumed by agents.
- **Cross-cutting API:** `critiqueCopyInFile(file, opts)` exported. Source-side surfaces only; git surfaces are project-scoped.
- **Shared craft infrastructure:** imports `LlmProvider` + 3-axis types + `derivePriority` from `packages/cli/src/shared/craft/` (extracted by spec-craft).

## Success Criteria

See `docs/changes/craft-pipeline/copy-craft/proposal.md` for the full 39 success criteria. Highlights:

- 8 seed rubrics ship in `catalog/rubrics/<id>.ts` (file-per-rubric, matches naming/spec-craft)
- 3-axis output preserved (tier × impact × confidence, never collapsed)
- `cite.rubricId` populated on every finding (ADR 0020)
- Single TS AST walk amortizes parse cost across 4 source surfaces
- Graceful degradation: `summary.skippedSurfaces` records when git/gh surfaces couldn't run
- Cross-cutting `critiqueCopyInFile` exported (source surfaces only)

## Examples

### Example: Generic error message

**Input:** `src/parse.ts`:

```ts
throw new Error('parse error');
```

**Output (mock LLM):**

```
[error]
  COPY-R001 [foundational/large/medium] src/parse.ts:14 error
    "parse error"
    Doesn't tell WHAT was being parsed, WHY it failed, or HOW the user can
    recover. Try: "Failed to parse design-system/tokens.json at line 12: ..."
  COPY-R003 [polish/medium/high] src/parse.ts:14 error
    "parse error"
    Generic — no operation, no artifact. Name the file being parsed and the
    specific failure mode.
```

### Example: Noisy log line

**Input:**

```ts
console.log('entered function');
```

**Output:**

```
[log]
  COPY-R004 [foundational/medium/high] src/handler.ts:23 log
    "entered function"
    Pure noise — fires on every invocation; carries no state or decision.
    Either remove or replace with a state-transition log at the relevant
    boundary.
```

### Example: Work-not-change commit subject

**Input:** A commit with subject `"update tests"`.

**Output:**

```
[commit]
  COPY-R006 [polish/medium/medium] git:abc1234 commit
    "update tests"
    Describes the work, not the change. A reader six months from now needs
    to know what behaviour changed. Try: "ratchet drift threshold to 0.5%
    after Hermes Phase 4 baseline reset" or similar.
```

### Example: Missing prerequisites — graceful skip

When not in a git repo OR `gh` is missing/unauthenticated, those surfaces silently skip and the report shows:

```
Skipped surfaces:
  - commit: not a git repo
  - pr-description: gh binary not found
```

## Gates

- **No autofix.** v2's `align-copy` may add safe rewrites.
- **No JSDoc / TSDoc.** docs-craft #2 territory.
- **No PR / review comments.** v1.x.
- **No commit BODY critique.** Subjects only in v1.
- **No B' bootstrap.** Same posture as naming/spec-craft.
- **No graph persistence.** Phase 1 MVP.
- **No non-TS/JS language support.** v1.x.
- **No author-attributed signals.** v1.x telemetry.

## Escalation

- **When LLM cost is too high:** drop `maxItemsPerFile` (default 20) or scope to specific surfaces with `--surfaces error`. Cost ≈ items × applicable rubrics × per-call.
- **When intentionally-bad test fixtures get flagged:** scope via `--files` to exclude fixtures. v1.x adds `<!-- copy-craft:skip -->` annotation + JSDoc tag.
- **When git surface skips though you ARE in a repo:** the walk goes up 10 levels looking for `.git`. If you're deeper than that, run from a closer cwd.
- **When PR surface skips with `gh auth status` failing:** run `gh auth login` first. Or scope away with `--surfaces error,log,comment`.
- **When `console.log` in a CLI file gets surface='log' instead of 'cli-output':** verify the file path contains `packages/cli/src/commands/` (or a similar default substring). Override with `craft.copy.cliOutputGlobs` config in v1.x.

## Status

**v1 — in implementation.** See:

- Spec: `docs/changes/craft-pipeline/copy-craft/proposal.md`
- Roadmap entry: `craft-pipeline sub-project #5`
- Sibling craft skills: `naming-craft` (#1), `spec-craft` (#6)
- Shared infrastructure: `packages/cli/src/shared/craft/` (extracted by spec-craft)
- Future: `align-copy` (FIX side, v2), docs-craft (#2, prose docs), test-craft (#3), code-craft (#4)
