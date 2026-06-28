---
slug: "wire-outcome-eval-into-the-lifecycle-as-an-automatic-spec-satisfaction-gate"
milestone: "v5.0 — Article-Framing Docs & Personas"
order: 10
---

### Wire outcome-eval into the lifecycle as an automatic spec-satisfaction gate

- **Status:** planned
- **Spec:** —
- **Summary:** outcome-eval is the harness's first blocking post-execution spec-satisfaction gate, but nothing invokes it automatically — verified 2026-06 it is absent from .husky/, .github/workflows/, AND the harness-autopilot VERIFY/INTEGRATE/REVIEW loop. Its blocking authority (high-confidence NOT_SATISFIED) only bites when a human or agent chooses to run /harness:outcome-eval or mcp**harness**outcome_eval. Wire it in: (a) call outcome_eval in harness-autopilot after REVIEW (post-execution, before PHASE_COMPLETE), gathering diff+testOutput from the session and halting on a blocking verdict; (b) add a pre-merge CI job (sibling to .github/workflows/required-review.yml) that runs it on PRs and surfaces the verdict, blocking only on high-confidence NOT_SATISFIED. This makes the #1-gap gate actually load-bearing and unblocks the assumptions baked into #569 (pre-merge-brief surfaces 'outcome-eval result when available'), #533 (post-merge rollback on failed eval), and #552 (Holiday Confidence KPI measures 'outcome-eval passed'). Recommended priority: P1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#662
