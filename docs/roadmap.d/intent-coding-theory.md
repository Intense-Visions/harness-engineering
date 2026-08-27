---
slug: "intent-coding-theory"
milestone: "Planning & Process"
order: 137
---

### Coding theory for delegated intent — sized redundancy in specs

- **Status:** planned
- **Spec:** —
- **Summary:** Human → spec → agent is a noisy channel, and Shannon's result is that reliable transmission below capacity is achievable with coding — structured redundancy sized to the channel's measured noise. Spec redundancy today (acceptance criteria, examples, counter-examples) is folklore-sized: house style decides how many examples a spec gets, not measurement. Instead: use rework attribution (misread-intent rework, already instrumented by the rework-rate work) to measure the delegation channel's error rate per ambiguity class, then size the error-correcting content like parity bits — this class of spec needs three counter-examples and a worked example to hit the target delegation error rate; that class needs none and the extra prose is pure cost. Two testable claims fall out: (1) there is a computable minimum spec redundancy for a target error rate per ambiguity class, and (2) most specs are simultaneously too long in prose (which carries little error-correction) and too short in counter-examples (which carry most of it). The deliverable is a spec-authoring advisor that prescribes redundancy by measured class, plus the measurement loop that keeps the prescription calibrated as models and domains shift.
- **Blockers:** Depends on `intent-as-the-unit-of-record` and `rework-rate-instrumentation`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1614
