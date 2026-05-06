# Category mapping

This document is the operator-facing classification guide used by `harness-compound`'s classify phase. The authoritative type list lives in `packages/core/src/solutions/schema.ts`; this file is documentation.

## bug-track (the fix-shape: a problem was solved)

| Category           | Use when                                 | Example                                |
| ------------------ | ---------------------------------------- | -------------------------------------- |
| build-errors       | Build/typecheck/lint failures            | TS error after dep upgrade             |
| test-failures      | Tests fail in a specific predictable way | Flaky test root-caused to retry budget |
| runtime-errors     | Process crashes or unhandled exceptions  | Null deref in adapter init             |
| performance-issues | Latency/throughput regressions           | N+1 query, wrong index                 |
| database-issues    | Schema, migration, or query failures     | Missing FK, deadlock                   |
| security-issues    | Vulnerabilities, leaks, missing authz    | PII in logs, unsigned cookie           |
| ui-bugs            | Visual / interaction defects             | Z-index regression, focus trap         |
| integration-issues | Cross-system contract bugs               | Webhook signature mismatch             |
| logic-errors       | Wrong-output-but-no-crash bugs           | Off-by-one in scheduler                |

## knowledge-track (the pattern-shape: a reusable insight)

| Category              | Use when                                     | Example                                     |
| --------------------- | -------------------------------------------- | ------------------------------------------- |
| architecture-patterns | A high-level structural choice is documented | "Layered packages with strict layer rules"  |
| design-patterns       | A within-package pattern is documented       | "Result<T,E> for fallible APIs"             |
| tooling-decisions     | A tool was chosen over alternatives          | "pnpm over npm for workspaces"              |
| conventions           | A team/project convention is recorded        | "Frontmatter shape for solution docs"       |
| dx                    | A developer-experience improvement           | "Slash command auto-generation"             |
| best-practices        | A general "do this" guideline                | "Type-only imports across layer boundaries" |
