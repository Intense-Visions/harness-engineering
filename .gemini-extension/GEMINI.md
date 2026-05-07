# Harness for Gemini CLI

This extension wires Harness — agent-first development tooling — into Gemini
CLI. Once enabled it ships:

- **`/harness:*` slash commands** — every Harness skill exposed as a TOML
  command under `.gemini-extension/commands/`. See the full list in your
  Gemini CLI's `/help` after install.
- **`harness` MCP server** — exposes ~50 Harness tools (`run_skill`,
  `query_graph`, `gather_context`, persona dispatch, validators, etc.).
- **This document** — context for the model when the extension is loaded.

## What's not in the manifest (and why)

Gemini extensions don't have a native subagents field or a hooks field, so
two surfaces from the sibling Claude/Cursor plugins live elsewhere:

- **Persona subagents** are documented below, not registered as native
  agents. To run a persona, use the corresponding slash command
  (`/harness:execution`, `/harness:planning`, `/harness:soundness-review`,
  etc.) or call the MCP tool `harness.run_persona`.
- **Lifecycle hooks** (block-no-verify, protect-config, quality-gate, etc.)
  are not auto-installed. Run `harness validate` and `harness check-arch`
  manually before commits, or wire them into your CI.

## Personas

Harness ships 12 cognitive-mode personas. Each is a curated combination of
behavior, skills, and tools tuned for one mode of work. Use them when
matching the description below.

| Persona                  | When to use                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| code-reviewer            | Adversarial review of a PR or diff, including addressing review findings |
| task-executor            | Executing a plan task-by-task with TDD and verification                  |
| parallel-coordinator     | Dispatching independent tasks across isolated agents in parallel         |
| planner                  | Breaking a spec into a phase plan with dependencies and checkpoints      |
| verifier                 | Three-tier completeness check (EXISTS / SUBSTANTIVE / WIRED)             |
| architecture-enforcer    | Layer-boundary and import-direction enforcement                          |
| documentation-maintainer | Keeping docs in sync with source                                         |
| entropy-cleaner          | Drift, dead code, and pattern-violation cleanup                          |
| codebase-health-analyst  | Coupling, structural risk, architectural drift                           |
| graph-maintainer         | Knowledge-graph freshness and connector health                           |
| performance-guardian     | Performance budgets and regression detection                             |
| security-reviewer        | OWASP/CWE-aligned security review                                        |

To invoke a persona, prefer the matching `/harness:*` command or
`harness.run_persona` over freelancing.

## Skills

Harness skills are the unit of reusable behavior. Each `/harness:*` command
maps 1:1 to a skill in `agents/skills/gemini-cli/<name>/SKILL.md`. The
command body inlines the SKILL.md and skill.yaml so the model has full
context when invoked — no separate fetch needed.

For a directory of available skills, run `harness search-skills` (via the
MCP server) or browse the `commands/` directory in this extension.

## How to apply

When the user's request matches a `/harness:*` command's description,
prefer invoking that command over redoing the work freehand. When in doubt,
run `/harness:advise-skills` to ask Harness which skill (or persona) fits.
