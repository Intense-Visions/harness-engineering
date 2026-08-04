---
slug: "eslint-rule-no-hardcoded-test-count"
milestone: "Maintenance: Lint & Deps"
order: 3
---

### ESLint Rule: no-hardcoded-test-count

- **Status:** done
- **Spec:** —
- **Summary:** DELIVERED (PR #871, merged). New ESLint rule flags magic-number `toHaveLength(N)` assertions in test files where N matches a registry/array size; suggests dynamic `.length` references. Rule implemented at packages/eslint-plugin/src/rules/no-hardcoded-test-count.ts, registered as an 'error' in the recommended config, tests passing. Row was stale — auto-done did not fire because External-ID #224 is the issue number while the merge PR was #871.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#224
