---
'@harness-engineering/cli': patch
---

fix(mcp): fire the toolchain version-skew guard on the MCP surface (#1301).

The version-skew guard added in #1293 refuses to produce findings when the
running CLI is sharply out of step with the workspace's declared
`toolchain.cliVersion`. It was wired only as a commander `preAction` hook, so it
fired on CLI invocations but not on MCP tool calls, which reach the same
findings-producing check implementations in-process through the server's
`CallToolRequest` handler — a separate entry point the hook never runs. A stale
`harness-mcp` shim therefore reproduced the original incident unmitigated.

Adds an MCP dispatch-boundary middleware (`applyVersionGuard`) that calls the
same shared evaluator (`evaluateVersionGuard`) the CLI hook uses, so the two
surfaces cannot diverge on when to refuse. A refusal returns an `isError` result
(the MCP analogue of the CLI's exit 3) and the tool never runs; a warning
proceeds with the notice prepended; `HARNESS_NO_VERSION_GUARD` downgrades a
refusal to a warning exactly as on the CLI. The gated set is the findings tools
that are the in-process twins of the guarded CLI commands. The two entry points
are disjoint, so no request is double-guarded and the CLI path is unchanged.
