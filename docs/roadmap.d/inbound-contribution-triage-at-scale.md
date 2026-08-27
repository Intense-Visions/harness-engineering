---
slug: "inbound-contribution-triage-at-scale"
milestone: "Fleet Family — Batch Orchestration"
order: 112
---

### Maintainer-side intake: triage a flood the project did not author

- **Status:** planned
- **Spec:** —
- **Summary:** Every fleet is producer-side. `issue-fleet` triages "the open-issue backlog" and `pr-fleet` lands "the open-PR queue" — both assume the project authored the work and that the queue is finite and ours. A large open-source project inverts this: openclaw/openclaw carries 81,403 forks, 5,726 open issues and 2,191 open pull requests, taking in roughly 131 new issues and merging 313 pull requests **per day**. At that shape the scarce resource is maintainer attention, and the harness's entire value proposition — produce more — is the opposite of what is needed. Build the receiving function: continuous intake that classifies, deduplicates, ranks and routes inbound issues and pull requests against declared project scope; auto-closes out-of-scope and stale items under stated policy; and presents maintainers with batched decisions rather than an unordered stream. Same fan-out machinery, inverted objective. Without it the harness is unusable by exactly the projects with the most volume to manage.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1544
