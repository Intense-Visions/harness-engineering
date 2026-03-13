# Cleanup Dead Code

Detect unused exports, unreferenced files, and dead code in the codebase.

## Context

Dead code increases maintenance burden and cognitive load. Use this skill to identify code that can be safely removed.

## Prerequisites

- `@harness-engineering/cli` installed
- TypeScript project (for accurate analysis)

## Steps

1. **Scan for dead code** — Run detection command:

   Use the shell tool:
   ```bash
   harness cleanup --type dead-code --json
   ```

2. **Parse results** — Extract findings:
   ```json
   {
     "issues": [
       {
         "type": "unused-export",
         "file": "src/utils.ts",
         "line": 15,
         "name": "deprecatedHelper",
         "message": "Export is not imported anywhere"
       },
       {
         "type": "unreferenced-file",
         "file": "src/old-feature.ts",
         "message": "File is not imported by any other file"
       }
     ]
   }
   ```

3. **Categorize findings**
   - **Unused exports:** Exported but never imported
   - **Unreferenced files:** Not imported anywhere
   - **Dead branches:** Code paths that can't be reached

4. **Verify before removal**

   For each finding, check:
   - Is it used dynamically? (string-based imports)
   - Is it a public API entry point?
   - Is it used in tests only?

5. **Report safe removals**

   List items that can safely be removed with confidence level:
   - **High confidence:** No references found, not public API
   - **Medium confidence:** Test-only usage, verify intent
   - **Low confidence:** May have dynamic usage, investigate

## Success Criteria

- [ ] Unused exports identified
- [ ] Unreferenced files detected
- [ ] Each finding verified for safety
- [ ] Safe removal candidates clearly flagged

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| False positive | Dynamic imports | Mark as intentional in config |
| Entry points flagged | Public API exports | Exclude public API patterns |

## Examples

### Example: Dead Code Found

```
Dead Code Report

Unused Exports (3):
  src/utils.ts:15 - deprecatedHelper [HIGH confidence]
    Not imported anywhere, safe to remove

  src/api.ts:42 - internalOnly [MEDIUM confidence]
    Only used in tests, verify if intentional

Unreferenced Files (1):
  src/old-feature.ts [HIGH confidence]
    No imports found, appears to be legacy code
```
