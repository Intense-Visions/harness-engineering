---
slug: "eslint-rule-prefer-execfile-over-exec"
milestone: "Maintenance: Lint & Deps"
order: 1
---

### ESLint Rule: prefer-execfile-over-exec

- **Status:** planned
- **Spec:** —
- **Summary:** New ESLint rule to flag execSync/exec with string commands (shell invocation) and suggest execFileSync/execFile with array args (no shell). Reduces shell injection surface and avoids broken exit code handling with shell redirects. 15+ instances in codebase.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#222
