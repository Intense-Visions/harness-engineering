# Harness Code Review

Perform structured code review combining automated harness checks with manual review checklist.

## Context

Use this skill when reviewing code changes (PRs, commits, or local changes). Combines automated validation with human-guided review criteria.

## Prerequisites

- `@harness-engineering/cli` installed
- Changes to review (staged, committed, or in PR)

## Steps

1. **Identify changes to review**

   Use the shell tool to see what changed:
   ```bash
   git diff --name-only HEAD~1
   ```

   Or for staged changes:
   ```bash
   git diff --cached --name-only
   ```

2. **Run automated checks**

   Use the shell tool:
   ```bash
   harness validate --json && harness check-deps --json
   ```

   Report any automated findings first.

3. **Review code changes**

   For each changed file, read the diff and check:

   Use the shell tool:
   ```bash
   git diff HEAD~1 -- <file>
   ```

4. **Apply review checklist**

   - [ ] **Intent match:** Do changes match the stated purpose?
   - [ ] **Architecture:** No layer violations or new circular deps?
   - [ ] **Tests:** Are new/changed behaviors tested?
   - [ ] **Documentation:** Are docs updated if needed?
   - [ ] **Security:** No obvious vulnerabilities introduced?
   - [ ] **Performance:** No obvious performance issues?
   - [ ] **Error handling:** Are errors handled appropriately?
   - [ ] **Naming:** Are names clear and consistent?

5. **Generate structured feedback**

   Use the shell tool:
   ```bash
   harness agent review
   ```

6. **Summarize findings**

   Group by severity:
   - **Blockers:** Must fix before merge
   - **Suggestions:** Should consider fixing
   - **Nitpicks:** Minor style issues

## Success Criteria

- [ ] All automated checks pass
- [ ] Review checklist completed for each file
- [ ] Issues documented with clear descriptions
- [ ] Actionable feedback provided

## Error Handling

| Situation | Resolution |
|-----------|------------|
| Automated checks fail | Fix automated issues first |
| Large diff | Break review into logical chunks |
| Unclear intent | Ask for clarification before reviewing |

## Review Checklist Reference

### Architecture
- Imports follow layer hierarchy
- No circular dependencies introduced
- Module boundaries respected

### Testing
- New code has tests
- Edge cases covered
- Tests are readable and maintainable

### Documentation
- Public APIs documented
- Complex logic has comments
- README updated if needed

### Security
- No hardcoded secrets
- Input validation present
- Proper error messages (no sensitive data leaked)
