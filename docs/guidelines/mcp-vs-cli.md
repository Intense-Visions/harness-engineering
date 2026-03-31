# MCP vs CLI: Decision Guideline

> When should a SKILL.md instruct the agent to use an MCP tool vs a CLI command via Bash?

## Decision Rule

**Use CLI via Bash when:**

- The output is pass/fail (exit code is sufficient)
- The output is human-readable text (findings list, validation report)
- You do not need to branch on specific fields in structured output
- The command has a direct `harness` CLI equivalent

**Use MCP tool when:**

- You need to branch on specific fields in a structured JSON response
- You need to parse and transform the response programmatically
- The tool returns structured data (graph queries, context bundles, CRUD results)
- No CLI equivalent exists for the operation

## Quick Reference

| Operation              | Use | Command/Tool                                                                                 |
| ---------------------- | --- | -------------------------------------------------------------------------------------------- |
| Project validation     | CLI | `harness validate`                                                                           |
| Dependency checking    | CLI | `harness check-deps`                                                                         |
| Documentation checking | CLI | `harness check-docs`                                                                         |
| Security scanning      | CLI | `harness check-security`                                                                     |
| Dead code detection    | CLI | `harness cleanup --type dead-code`                                                           |
| Doc drift detection    | CLI | `harness cleanup --type drift`                                                               |
| Architecture checking  | CLI | `harness check-arch`                                                                         |
| Performance checking   | CLI | `harness check-perf`                                                                         |
| Drift auto-fix         | CLI | `harness fix-drift`                                                                          |
| Hotspot detection      | CLI | `git log --format=format: --name-only --since="6 months ago" \| sort \| uniq -c \| sort -rn` |
| Load working context   | MCP | `gather_context` (branches on state/learnings/handoff fields)                                |
| Graph queries          | MCP | `query_graph`, `get_impact`, `get_relationships` (structured graph data)                     |
| Roadmap CRUD           | MCP | `manage_roadmap` (structured sync results)                                                   |
| Code review dispatch   | MCP | `review_changes` (structured ReviewFinding objects)                                          |

## Anti-Patterns

1. **MCP for pass/fail checks.** If you only check whether the command succeeded or failed, use CLI. Example: `harness check-security` instead of `run_security_scan` MCP tool.
2. **Skill invocation for inline operations.** If the operation is a single command (e.g., `git log` for hotspot analysis), run it directly instead of invoking another skill via `harness skill run`.
3. **MCP with fallback to CLI.** If the SKILL.md says "use MCP tool, or if unavailable, use CLI" and the CLI provides the same information, just use CLI. The fallback pattern wastes tokens describing two paths.

## When to Add `--json` to CLI

Some CLI commands support `--json` for machine-readable output. Use `--json` when:

- The SKILL.md needs to parse specific fields from the output (e.g., violation counts, file paths)
- The output feeds into a structured report

Even with `--json`, prefer CLI over MCP if you are not branching on the response structure.
