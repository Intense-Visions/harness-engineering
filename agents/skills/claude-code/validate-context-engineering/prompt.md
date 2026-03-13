# Validate Context Engineering

Validate this repository's context engineering practices: AGENTS.md structure, documentation coverage, and knowledge map integrity.

## Context

Use this skill to verify that a project follows harness engineering context practices. Run before merging PRs or after significant documentation changes.

## Prerequisites

- `@harness-engineering/cli` installed globally or in project
- `harness.config.json` exists in project root

## Steps

1. **Run validation command** — Execute the harness validate command with JSON output:

   Use the Bash tool:
   ```bash
   harness validate --json
   ```

2. **Check exit code**
   - Exit 0: Validation passed
   - Exit 1: Validation issues found
   - Exit 2: Error (config missing, CLI error)

3. **Parse JSON output** — Extract the validation result:
   ```json
   {
     "valid": true|false,
     "issues": [...],
     "summary": {...}
   }
   ```

4. **Report findings**
   - If valid: Report success with summary
   - If issues found: List each issue with:
     - File path and line number
     - Issue description
     - Suggested fix

5. **Suggest fixes** — For each issue type:
   - Missing AGENTS.md: Create with `harness init`
   - Broken links: Update or remove dead references
   - Low doc coverage: Add documentation to undocumented exports
   - Invalid structure: Fix AGENTS.md format

## Success Criteria

- [ ] AGENTS.md exists in project root
- [ ] AGENTS.md parses without errors
- [ ] All file links in AGENTS.md resolve to existing files
- [ ] Documentation coverage meets threshold (default: 80%)
- [ ] Knowledge map has no broken references
- [ ] harness.config.json exists and is valid

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Config not found | Missing harness.config.json | Run `harness init` to create config |
| AGENTS.md not found | Missing context file | Create AGENTS.md or run `harness init` |
| CLI not installed | harness command not available | Install with `npm install -g @harness-engineering/cli` |

## Examples

### Example: Successful Validation

```bash
$ harness validate --json
{
  "valid": true,
  "issues": [],
  "summary": {
    "agentsMap": "valid",
    "docCoverage": "87%",
    "knowledgeMap": "valid"
  }
}
```

Report: "Context engineering validation passed. Documentation coverage: 87%."

### Example: Issues Found

```bash
$ harness validate --json
{
  "valid": false,
  "issues": [
    {
      "file": "AGENTS.md",
      "line": 15,
      "message": "Broken link: ./docs/api.md does not exist",
      "suggestion": "Update link or create the missing file"
    }
  ]
}
```

Report: "Validation failed. Found 1 issue in AGENTS.md:15 - broken link to ./docs/api.md. Fix by updating the link or creating the missing file."
