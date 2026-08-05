# cli-ergonomics-craft — LLM-judgment ceiling skill for CLI ergonomics quality

## Summary

cli-ergonomics-craft is the command-line-quality member of the craft-pipeline
initiative: an LLM-judgment ceiling skill that critiques whether a CLI is _good
to use_, not merely whether it _works_. It is the direct structural twin of
harness-docs-craft.

Unlike every other craft skill, it has **no rule-based floor twin**. A mechanical
check can verify that a flag is documented, that a command is registered, or
that the source compiles. It cannot tell whether the flag's name is predictable,
whether the help text teaches the job, or whether the error message says what to
do next. Those are ceiling questions, and only judgment answers them:

- Are **command and flag names** predictable and consistent across the surface?
- Is **help text** task-oriented — does it teach the job, or just list flags?
- Are **errors** actionable — do they name the cause AND the next step?
- Are **defaults** sane, and is the safe path the default?
- Is **output** scannable for a human and respectful of the terminal?
- Does the CLI **compose** — pipeable, machine-readable, honest exit codes?
- Are **destructive actions** guarded — confirm, dry-run, `--force`?

## Motivation

A CLI can pass every mechanical check and still be miserable to use: `--out` on
one subcommand and `--output` on another, help that restates the command name,
an error that dumps a stack trace, a `reset` that destroys state with no
confirmation, colored output piped into `grep`. These are ergonomic failures the
floor cannot see. cli-ergonomics-craft mirrors the shape the craft-pipeline has
already proven across its sibling skills (naming, spec, copy, test, knowledge,
security, docs, and the design-pipeline's design-craft) rather than inventing a
new one. harness itself ships a CLI of ~100 commands, so the skill has a natural
first input: its own command definitions.

## Scope

### In scope (v1)

- **DISCOVER:** walk the project's command-definition source under conventional
  roots (`packages/cli/src/commands`, `src/commands`, `src/cli`, `cli`, `cmd`, …);
  classify each as `leaf` (own action handler) or `group` (namespace hosting
  subcommands); exclude tests / specs, type declarations, barrels / registries,
  and build / dependency trees. `--commands-dir` points at an explicit directory;
  `--files` overrides discovery.
- **CRITIQUE:** per (command, rubric) LLM loop, filtered by command kind; 7 seed
  rubrics emitting 3-axis findings (tier × impact × confidence per ADR 0019) with
  `cite.rubricId` for ADR 0020 traceability.
- **REPORT:** aggregate findings + rubric/exemplar catalog + cost telemetry.
- A small curated exemplar reference set — gh, cargo, ripgrep, docker, the
  Stripe CLI — anchoring the rubric sources and seeding a future BENCHMARK phase.
- Surface area: `harness cli-ergonomics-craft` CLI, `mcp__harness__cli_ergonomics_craft`
  MCP tool, and the cross-cutting `critiqueCommandFile(file, opts)` API.

### Out of scope (v1)

- Autofix / command rewriting — this is judgment-only.
- POLISH and BENCHMARK phases — the exemplar catalog is carried so BENCHMARK
  lands later without a schema change, but v1 is CRITIQUE-only, matching the rest
  of the non-design craft family.
- Runtime introspection (executing `--help` and reasoning from live output); v1
  reasons from the command-definition source.
- Graph persistence of findings.
- Per-rubric disable configuration.

## Design

### The 7 seed rubrics

| Rubric     | Title                                                                     | Applies to | Source                                                           |
| ---------- | ------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| `CLI-R001` | Command and flag names are predictable and consistent                     | all        | clig.dev ("Naming") + POSIX Utility Conventions                  |
| `CLI-R002` | Help text is task-oriented (teaches the job, not just lists flags)        | all        | clig.dev ("Help") + man-page conventions                         |
| `CLI-R003` | Errors are actionable (name the cause AND the next step)                  | leaf       | clig.dev ("Errors") + NN/g error-message heuristics              |
| `CLI-R004` | Defaults are sane and the safe path is the default                        | leaf       | clig.dev ("Sensible defaults") + Raymond, Rule of Least Surprise |
| `CLI-R005` | Output is scannable for a human and respects the terminal                 | leaf       | clig.dev ("Output") + NN/g + the NO_COLOR convention             |
| `CLI-R006` | Composes with other tools (pipeable, machine-readable, honest exit codes) | leaf       | Unix philosophy (McIlroy) + clig.dev ("Machine-readable output") |
| `CLI-R007` | Destructive actions are guarded                                           | leaf       | clig.dev ("Robustness") + Raymond, Rule of Least Surprise        |

Rubrics are file-per-rubric under `catalog/rubrics/<slug>.ts`, matching the craft
family. Each carries contribution + signal metadata so the catalog can grow (ADR
0020, the living catalog).

### Kind-aware filtering

A cheap content heuristic classifies each command. Naming (`CLI-R001`) and help
(`CLI-R002`) apply to every command. The other five critique a leaf command's own
output, error, default, and safety surfaces — which a pure namespace `group`
command does not have — so they fire only on `leaf` commands. This keeps false
positives down: the destructive-guard rubric never fires on a command whose only
job is to host subcommands.

### Exemplar catalog

Five curated reference points (gh, cargo, ripgrep, docker, the Stripe CLI), each
naming a real public command-line tool and the one ergonomic dimension it best
exemplifies, plus the seed rubrics it anchors. No exemplar output is reproduced —
these are pointers, not fabricated content — grounding the rubric sources today
and seeding a future BENCHMARK phase.

### Architecture

Mirrors docs-craft (the structural twin — per-file source critique):

```
packages/cli/src/cli-ergonomics-craft/
  index.ts                     # runCliErgonomicsCraft + cross-cutting critiqueCommandFile
  extract/discover.ts          # walk command roots; classify leaf/group; exclude non-command files
  findings/schema.ts           # CliErgonomicsFinding (3-axis) + CliErgonomicsCraftOutput
  phases/critique.ts           # per (command, rubric) LLM loop; fenced-JSON parser
  catalog/rubrics/*.ts         # 7 seed rubrics + index (rubricsForKind) + types
  catalog/exemplars/index.ts   # 5 curated reference points
```

Wired identically to its siblings: `harness cli-ergonomics-craft` command in the
command registry, `cli_ergonomics_craft` MCP tool in the server + capability
declarations + setup-mcp curated list, and a generated slash command for the
claude / cursor plugins.

## Success criteria

1. 7 seed rubrics ship file-per-rubric with grounded external sources.
2. 3-axis output preserved on every finding; `cite.rubricId` always populated.
3. Kind-aware rubric filtering verified (the five leaf-only rubrics never fire on
   a `group`).
4. Curated exemplar set present (5 entries) and each anchors ≥1 seed rubric; every
   seed rubric is anchored by ≥1 exemplar.
5. Cross-cutting `critiqueCommandFile` critiques a single command without a project
   walk.
6. CLI + MCP tool + capability declaration + setup-mcp entry all wired.
7. Graceful degradation with seed rubrics when no CLI style guide is declared.

## Alternatives considered

- **Fold CLI critique into copy-craft.** Rejected: copy-craft critiques prose-in-
  code (the wording of one error string, one log line) against a writing rubric.
  CLI ergonomics is a different vocabulary (predictable names, sane defaults,
  composability, guarded destruction) about the shape of the command surface, not
  the wording of one message.
- **Ship a rule-based floor twin.** Rejected as the primary framing: the valuable
  questions here (is the name predictable, does the help teach) are inherently
  judgment calls. A mechanical linter for flag-documentation existence is a
  separate, lower-value concern and is deliberately out of scope.
- **Ship POLISH + BENCHMARK in v1.** Rejected for a coherent first version: every
  non-design craft sibling shipped CRITIQUE-only first. The exemplar catalog is
  carried now so BENCHMARK lands later without a schema change.

## References

- ADR 0018 — LLM-judgment skill pattern
- ADR 0019 — 3-axis craft output model
- ADR 0020 — living catalog (H) pattern
- ADR 0021 — detect-and-offer (B') pattern
- Structural twin: `agents/skills/claude-code/docs-craft/SKILL.md`
- Exemplars: GitHub CLI (gh), Cargo, ripgrep, Docker CLI, Stripe CLI
- Command Line Interface Guidelines — https://clig.dev
