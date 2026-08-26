---
slug: "adversarial-input-hardening-for-intake-agents"
milestone: "v5.0 — Trust & Security Model"
order: 127
---

### Inbound text is attacker input to the triage agents

- **Status:** planned
- **Spec:** —
- **Summary:** The maintainer-side items (`inbound-contribution-triage-at-scale`, `machine-pre-review-for-untrusted-changes`, `semantic-duplicate-detection-at-backlog-scale`) all point LLM agents at text authored by strangers — issue bodies, PR descriptions, commit messages, diffs. At the volumes that motivate those items (a measured large open project takes in ~131 issues per day), that is a continuous stream of attacker-controllable instructions flowing into autonomous systems that hold labels, close/merge authority, and CI dispatch. Prompt injection here is not hypothetical; it is the expected steady state. Build the hardening as a property of the intake pipeline, not of individual prompts: strict instruction/data separation so inbound text is never interpolated into an agent's directive channel; capability-stripped triage agents that can *propose* but not execute closes, merges, or dispatches; canary tokens in agent context whose exfiltration marks a compromised run; injection-attempt detection that routes the item to a quarantine queue with the evidence attached; and red-team fixtures in CI so regressions in any of this fail the build. Also covers the slower attack: outcome-learning loops (`bandit-allocation-with-sequential-stopping`, `contributor-trust-tiering` promotion) must treat inbound-influenced outcomes as poisonable training signal and cap their learning rate from untrusted sources.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1559
