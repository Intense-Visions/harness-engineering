# CLI Ergonomics Craft

> LLM-judgment critique of command-line ergonomics quality — the ceiling counterpart to mechanical CLI checks. The direct structural twin of harness-docs-craft, but with no rule-based floor twin: a mechanical linter can confirm a flag is documented, but only judgment can tell whether the name is predictable, whether the help teaches, and whether the error says what to do next. Emits 3-axis findings (tier × impact × confidence per ADR 0019).

## When to Use

- During PR review on a new or substantially-changed CLI command or flag surface
- Before shipping a CLI (or a new subcommand family) to users, to catch ergonomic debt the floor cannot see
- Periodically, to audit whether a growing command surface has stayed consistent (flag names, grammar, output conventions)
- On this repo's own command definitions under `packages/cli/src/commands` — a natural input, since harness ships a CLI
- As the CLI critic alongside copy-craft (which owns error-message and log prose) and docs-craft (which owns authored teaching prose)
- NOT for whether a flag compiles or a command is registered (that is the mechanical floor, not this skill)
- NOT for the wording of a single error string in isolation (use copy-craft — it owns prose-in-code)
- NOT for README / guide / tutorial prose (use docs-craft)
- NOT for autofix / command rewriting (this is judgment-only)

## Process

### B' precondition check (every invocation)

cli-ergonomics-craft is the ceiling; it runs regardless of setup, but its critique sharpens when a project declares its CLI conventions. Before critiquing, note the state:

| Precondition       | Source                                            | If missing                                                                                                                                                                          |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cliStyleDeclared` | a project CLI style guide (e.g. `docs/**/CLI.md`) | Run with the generic seed rubrics; note in the summary that a style guide would sharpen critique and offer to seed one (progressive upgrade — the same posture as docs-craft's B'). |

When no style guide exists, cli-ergonomics-craft still runs with the seed rubrics (degraded, not blocked). It never refuses to critique just because a project has not written its CLI conventions down.

### Phase 1: DISCOVER — Find command definitions

1. **Read project configuration.** Shared craft config under `craft.llm.*` selects the judgment backend. `maxFiles` (default 60) caps the command count.

2. **Walk the command source tree(s).** Discover command-definition source files under the conventional roots (`packages/cli/src/commands`, `src/commands`, `src/cli`, `cli`, `cmd`, …). Classify each as `leaf` (a command with its own action handler — it does work, produces output, can error, may mutate state) or `group` (a namespace whose job is to host subcommands). `--commands-dir` points discovery at an explicit directory; `--files` overrides discovery entirely.

3. **Exclude non-command surfaces.** Tests / specs, type declarations, barrels and registries (`index.ts`, `_registry.ts`), and build / dependency trees (`node_modules`, `dist`, `tests`) are skipped — they are not authored command surfaces.

### Phase 2: CRITIQUE — Per (command, rubric) loop, kind-filtered

7 seed rubrics, each declaring which command kinds it applies to:

| Rubric     | Title                                                                     | Applies to |
| ---------- | ------------------------------------------------------------------------- | ---------- |
| `CLI-R001` | Command and flag names are predictable and consistent                     | all        |
| `CLI-R002` | Help text is task-oriented (teaches the job, not just lists flags)        | all        |
| `CLI-R003` | Errors are actionable (name the cause AND the next step)                  | leaf       |
| `CLI-R004` | Defaults are sane and the safe path is the default                        | leaf       |
| `CLI-R005` | Output is scannable for a human and respects the terminal                 | leaf       |
| `CLI-R006` | Composes with other tools (pipeable, machine-readable, honest exit codes) | leaf       |
| `CLI-R007` | Destructive actions are guarded                                           | leaf       |

For each (command, rubric) where the rubric applies to the command's kind:

1. Build a prompt with the rubric description + command kind + definition source (truncated to 6000 chars for cost).
2. The LLM returns fenced JSON: `null` (rubric doesn't apply / the command already clears the bar) OR `{ tier, impact, confidence, message }`.
3. On non-null: emit a `CliErgonomicsFinding` with `cite.rubricId` populated for ADR 0020 traceability, and a derived `priority` for sorting.

A `group` command (a pure namespace) is critiqued only for naming and help; the other five rubrics critique a leaf command's own output, error, default, and safety surfaces, which a namespace does not have.

A small curated exemplar set anchors the catalog — **gh, cargo, ripgrep, docker, the Stripe CLI** — each a public reference point for one ergonomic dimension (gh for a uniform noun-verb grammar and `--json` composability, cargo for task-oriented help and actionable errors, ripgrep for terminal-aware output, docker for guarded destructive operations, the Stripe CLI for job-first help). The exemplars ground the rubric sources today and seed a future BENCHMARK phase, the direct analogue of docs-craft's exemplar corpus.

### Phase 3: REPORT — Aggregate + cost telemetry

Emit `CliErgonomicsCraftOutput`:

```ts
{
  findings: CliErgonomicsFinding[];
  summary: {
    phaseRun: ['critique'];
    mode: 'fast';
    durationMs: number;
    llmCalls: { provider, model, count, costUsd };
    catalog: { rubricsApplied: string[]; exemplarsAvailable: number };
    counts: { filesScanned, filesSkipped };
    runId: string;
  }
}
```

## Harness Integration

- **`harness cli-ergonomics-craft`** — CLI entry. `--files <glob>` / `--commands-dir <dir>` / `--exclude-dirs <dirs...>` / `--max-files <n>` / `--json` / `--verbose`. Exits non-zero when any `foundational`-tier finding is present.
- **`mcp__harness__cli_ergonomics_craft`** — MCP tool. Two modes (see "In-session flow" below).
- **`mcp__harness__cli_ergonomics_craft_finalize`** — MCP tool that completes the in-session flow.
- **Cross-cutting API:** `critiqueCommandFile(file, opts)` exported from `packages/cli/src/cli-ergonomics-craft/index.ts`. Another craft skill (or an orchestrator) can critique a single command without re-walking the project.
- **Shared craft infrastructure:** `LlmProvider`, `MockLlmProvider`, `derivePriority`, and the 3-axis types all live in `packages/cli/src/shared/craft/`.
- **Sibling boundaries:** copy-craft owns error-message and log prose; docs-craft owns authored teaching prose. cli-ergonomics-craft owns the shape of the command surface — names, help structure, defaults, output contract, and destructive-action guards.
- **LLM provider:** configured in `harness.config.json` under `craft.llm` (`{ "backend": "<name>" }` for one of `agent.backends`, or `{ "mode": "in-session" | "mock" }`). Default when nothing is set: `in-session` (host chat answers prompts via the two-step MCP flow). `HARNESS_CRAFT_LLM` overrides the file (`in-session`, `mock`, or a backend name).

## In-session flow (default)

When `HARNESS_CRAFT_LLM` is unset (or set to `in-session`), the MCP tool does **not** call any LLM. It discovers the command definitions, builds one prompt per (command, rubric) pair, and returns them for the calling agent to answer with its own model. This is a two-step protocol — skipping step 3 leaves you with prompts, never findings.

**Step 1 — `mcp__harness__cli_ergonomics_craft({ path, ... })`** returns `{ "status": "collected", "runId": "<uuid>", "pendingPrompts": [{ "promptId", "systemPrompt", "userPrompt" }, ...], "projection": { "promptCount": N, "budget": 100 } }`. If `projection.promptCount > budget`, `status` is `"budget-exceeded"` and `pendingPrompts` is empty — re-invoke with a smaller `maxFiles`, or pass `promptBudget` to raise the ceiling.

**Step 2** — for each pending prompt, generate the fenced-JSON response as if you were a senior CLI/developer-experience engineer applying the rubric to the command: a fenced `null` block if the rubric does not apply or the command already clears the bar, otherwise a fenced block of `{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "a critique naming the specific command/flag/handler and a concrete suggested change" }`.

**Step 3 — `mcp__harness__cli_ergonomics_craft_finalize({ path, runId, responses: [{ promptId, raw }, ...] })`** parses the responses through the same validation the inline path uses and returns the standard `CliErgonomicsCraftOutput`.

If you want inline behavior (the skill calls an LLM directly), pass `mode: 'inline'` to step 1 and set `HARNESS_CRAFT_LLM` to a non-`in-session` provider. Running the CLI (`harness cli-ergonomics-craft`) under the default in-session provider fails loudly with this guidance rather than returning an empty result.

## Success Criteria

See `docs/changes/cli-ergonomics-craft/proposal.md` for the full success criteria. Highlights:

- 7 seed rubrics ship at `catalog/rubrics/<slug>.ts` (file-per-rubric, matching the craft family)
- 3-axis output preserved (tier × impact × confidence, never collapsed)
- `cite.rubricId` populated on every finding (ADR 0020)
- Kind-aware rubric filtering (the destructive-guard rubric never fires on a pure namespace)
- A curated exemplar set anchors the catalog and grows without a schema change
- Cross-cutting `critiqueCommandFile` works on a single command without a project walk
- Graceful degradation: runs with seed rubrics when no CLI style guide is declared

## Examples

### Example: A flag that breaks the naming convention

**Input:** `src/commands/build.ts` defining `new Command('build').option('--out <f>')` while the rest of the surface uses `--output`.

**Output (mock LLM):**

```
src/commands/build.ts (leaf)
  CLI-R001 [foundational/large/high] src/commands/build.ts (leaf)
    `--out` breaks the `--output` convention every other subcommand uses. A
    user who learned `--output` on one command cannot predict `--out` here.
    Rename to `--output` (keep `--out` as a hidden alias for one release).
```

### Example: A destructive command with no guard

**Input:** `src/commands/reset.ts` — a `reset` command that deletes state immediately in its action handler with no confirmation and no dry-run.

**Output:**

```
src/commands/reset.ts (leaf)
  CLI-R007 [foundational/large/high] src/commands/reset.ts (leaf)
    `reset` destroys state the moment it runs — no confirmation, no `--dry-run`,
    no `--force` gate. Confirm before proceeding (skip the prompt when stdin is
    not a TTY only if `--force` is passed), and add `--dry-run` to preview.
```

### Example: A clean command — no findings

**Input:** A leaf command with a conventional flag set, task-oriented help, a sane zero-flag default, `--json` output, and a guarded destructive path.

**Output:**

```
No CLI-ergonomics-craft findings.

Summary: 0 findings across 1 commands (0 skipped, 7 rubrics, 5 exemplars, 7 LLM calls, $0.0000, 4ms)
```

## Gates

- **No autofix.** cli-ergonomics-craft is judgment-only; it never rewrites a command.
- **No floor duplication.** Whether a command is registered or a flag compiles is a mechanical concern, not this skill's.
- **No sibling territory.** Error-message and log wording belong to copy-craft; teaching prose belongs to docs-craft.
- **No POLISH / BENCHMARK phases in v1.** The catalog carries exemplars so a future BENCHMARK phase (score against gh / cargo / ripgrep tier) lands without a schema change — but v1 is CRITIQUE-only, the same first-version posture as the rest of the non-design craft family.
- **No graph persistence.** v1 returns findings; it does not write craft edges to the graph.
- **No runtime introspection.** v1 reasons from the command-definition source, not from executing `--help` — a later minor version may add a runtime probe.
- **No B' hard block.** When no CLI style guide is declared, cli-ergonomics-craft runs with the seed rubrics and notes the degraded context — it never refuses.

## Escalation

- **When LLM cost is too high:** drop `--max-files` (default 60), or scope to specific commands with `--files`. Per-command cost = applicable rubrics × per-call; source is truncated at 6000 input chars.
- **When a rubric produces a high false-positive rate:** scope away with `--files`, or filter findings by `cite.rubricId` in your consumer. Per-rubric disable is a later minor version.
- **When discovery misses a project's layout:** point it at the right place with `--commands-dir`, or pass an explicit `--files` list.
- **When no LLM provider is configured:** cli-ergonomics-craft is LLM-judgment-based. Configure a craft backend under `craft.llm.*`; do not expect rule-based output.

## Status

**v1 — CRITIQUE phase.** See:

- Spec: `docs/changes/cli-ergonomics-craft/proposal.md`
- Roadmap entry: part of the `craft-pipeline` initiative
- Sibling craft skills: `harness-docs-craft` (the structural twin), `harness-design-craft`, `naming-craft`, `spec-craft`, `copy-craft`, `test-craft`, `knowledge-craft`, `security-craft`
- Shared infrastructure: `packages/cli/src/shared/craft/`
- Future: a BENCHMARK phase scoring against the exemplar corpus, a runtime `--help` probe, and a per-rubric disable configuration
