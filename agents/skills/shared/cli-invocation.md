# CLI Invocation Pattern

## Running Harness Commands

All harness CLI commands support `--json` flag for structured output:

```bash
harness <command> --json
```

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Report success, proceed |
| 1 | Validation failed | Parse issues from JSON, report each |
| 2 | Error | Report error message, suggest fix |

## Tool Usage

**Claude Code:** Use the `Bash` tool
**Gemini CLI:** Use the `shell` tool
