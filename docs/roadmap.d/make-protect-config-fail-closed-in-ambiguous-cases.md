---
slug: "make-protect-config-fail-closed-in-ambiguous-cases"
milestone: "v5.0 — Enforcement Hardening"
order: 1
---

### Make protect-config fail-closed in ambiguous cases

- **Status:** done
- **Spec:** docs/changes/protect-config-fail-closed/proposal.md
- **Summary:** `packages/cli/src/hooks/protect-config.js:36,41,49` — three branches currently fail-open (parse error → allow, empty stdin → allow, missing `file_path` → allow). The security-flavored hook that protects config silently yields whenever its input is malformed. Change to fail-closed with a clear error message. Defense-in-depth. Source: Pass 5 #2.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#527
