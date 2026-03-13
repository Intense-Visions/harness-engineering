# Align Documentation

Automatically fix documentation drift issues detected by detect-doc-drift.

## Context

After detecting drift, use this skill to automatically update documentation to match current code state.

## Prerequisites

- `@harness-engineering/cli` installed
- Run `detect-doc-drift` first to understand scope

## Steps

1. **Run auto-fix** — Execute fix-drift command:

   Use the Bash tool:
   ```bash
   harness fix-drift --json
   ```

2. **Parse results** — See what was fixed:
   ```json
   {
     "fixed": [
       {
         "file": "docs/api.md",
         "changes": [
           "Updated createUser signature",
           "Added email parameter documentation"
         ]
       }
     ],
     "manual": [
       {
         "file": "docs/guide.md",
         "reason": "Requires human judgment to rewrite section"
       }
     ]
   }
   ```

3. **Review auto-fixes**

   Use the Bash tool to see changes:
   ```bash
   git diff docs/
   ```

4. **Verify fixes** — Re-run drift detection:

   Use the Bash tool:
   ```bash
   harness cleanup --type drift --json
   ```

   Should show fewer or no issues.

5. **Handle manual fixes**

   For items requiring manual attention:
   - Read the source code
   - Update documentation to match
   - Follow existing doc style

6. **Commit changes**

   Use the Bash tool:
   ```bash
   git add docs/
   git commit -m "docs: align documentation with code changes"
   ```

## Success Criteria

- [ ] Auto-fixable drift issues resolved
- [ ] Changes reviewed for accuracy
- [ ] Re-running detection shows improvement
- [ ] Manual fixes clearly identified
- [ ] Changes committed

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| No fixes applied | All issues need manual work | Follow manual fix guidance |
| Incorrect fix | Auto-fix made wrong assumption | Revert and fix manually |

## Examples

### Example: Successful Auto-Fix

```
Documentation Alignment Complete

Auto-fixed (3 files):
  docs/api.md
    - Updated createUser signature
    - Added email parameter

  docs/config.md
    - Added timeout option documentation

Manual attention needed (1 file):
  docs/guide.md
    - Tutorial needs rewrite for new workflow
    - See src/workflow.ts for new approach
```
