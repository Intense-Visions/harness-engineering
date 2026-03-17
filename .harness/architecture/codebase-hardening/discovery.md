# Discovery: Codebase Hardening

## 1. What problem are you solving?

The harness-engineering project is mechanically healthy (builds, tests, lint, typecheck all pass) but has accumulated structural inconsistencies and documentation drift that will impede adoption, contributor onboarding, and long-term maintainability. Specifically:

- Documentation describes commands, config formats, and schemas that don't match reality
- Package configurations (scripts, build tools, exports) are inconsistent across the monorepo
- Test coverage has gaps in the agent-facing API surface (MCP tools) and CLI subcommands
- The public API surface leaks internal implementation details and has duplicate type definitions

## 2. What are the hard constraints?

- TypeScript monorepo (pnpm + Turborepo, strict TS, ESM-first)
- 6 packages with strict one-way dependency flow: types -> core -> cli/eslint-plugin/linter-gen -> mcp-server
- Result<T, E> pattern for error handling in core
- Node >=22.0.0 engine requirement
- MCP protocol for AI agent integration
- Changesets for versioning/publishing
- All existing tests must continue to pass throughout

## 3. What are the soft preferences?

- Minimize churn to existing public API consumers
- Keep each phase independently shippable (no phase depends on a future phase to be useful)
- Prefer mechanical enforcement of consistency (CI checks) over convention-by-documentation

## 4. What has been considered?

Three approaches were evaluated:

- **Option A (Foundation First):** Fix structural issues bottom-up, then document against verified reality. Selected.
- **Option B (User-Facing First):** Fix docs immediately, then harden internals. Rejected because docs written against an inconsistent codebase may need re-updating.
- **Option C (Surgical Strikes):** Fix only critical items. Rejected because the inconsistencies are interconnected and partial fixes leave technical debt.

## 5. What does success look like in 6 months?

- Any contributor can run the full validation suite with consistent scripts across all packages
- Documentation accurately describes every CLI command, config format, and API surface
- MCP tools (the agent-facing API) have complete test coverage
- The public API surface is intentional — nothing leaks that shouldn't
- Adding a new package follows an obvious, documented pattern because all existing packages are consistent
