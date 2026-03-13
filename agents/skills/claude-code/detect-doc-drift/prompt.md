# Detect Documentation Drift

Detect documentation that has drifted from the current code state.

## Context

Documentation drift occurs when code changes but docs aren't updated. Use this skill to find stale documentation that needs updating.

## Prerequisites

- `@harness-engineering/cli` installed
- `harness.config.json` configured with docsDir

## Steps

1. **Scan for drift** — Run the drift detection command:

   Use the Bash tool:
   ```bash
   harness cleanup --type drift --json
   ```

2. **Parse results** — Extract drift findings:
   ```json
   {
     "issues": [
       {
         "type": "drift",
         "file": "docs/api.md",
         "severity": "high",
         "message": "Function signature changed: foo(a) -> foo(a, b)",
         "sourceFile": "src/api.ts",
         "sourceLine": 42
       }
     ]
   }
   ```

3. **Categorize by severity**
   - **High:** Public API docs completely outdated
   - **Medium:** Missing parameters or return types
   - **Low:** Minor wording or formatting drift

4. **Report findings**

   For each issue:
   - Doc file and location
   - Source file that changed
   - What specifically drifted
   - Severity level

5. **Suggest resolutions**
   - For signature changes: Update doc to match new signature
   - For removed items: Remove from docs or mark deprecated
   - For new items: Add documentation

## Success Criteria

- [ ] All source files scanned
- [ ] Drift findings categorized by severity
- [ ] Each finding has actionable resolution guidance
- [ ] No false positives reported

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| No docs directory | docsDir not configured | Set docsDir in harness.config.json |
| Parse error | Malformed source file | Fix syntax errors first |

## Examples

### Example: Drift Detected

```
Documentation Drift Report

High Severity (2):
  docs/api.md:15 - Function signature changed
    Source: src/api.ts:42
    Old: createUser(name: string)
    New: createUser(name: string, email: string)
    Fix: Update docs to include email parameter

Medium Severity (1):
  docs/config.md:30 - Missing new option
    Source: src/config.ts:18
    Missing: timeout option added to config
    Fix: Document the new timeout option
```
