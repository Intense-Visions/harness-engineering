---
slug: "audit-and-cap-the-pre-commit-skip-list"
milestone: "v5.0 — Enforcement Hardening"
order: 3
---

### Audit and cap the pre-commit --skip list

- **Status:** planned
- **Spec:** —
- **Summary:** `.husky/pre-commit:4` silently skips `entropy,docs,perf,security,deps,phase-gate` — six categories disabled at commit time. The skips may be justified individually, but the cumulative silence is the article's failure pattern #2: "every gap was once a known issue. Then it became background noise. Then it became invisible." Either move slow checks to pre-push with no auto-skip, or emit a one-line stderr warning per skipped category so the gaps remain visibly named. Source: Pass 1 #4.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#529
