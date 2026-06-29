---
slug: "ship-aggregate-telemetry-synthesis-surface"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 4
---

### Ship aggregate-telemetry synthesis surface

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/cli/src/hooks/telemetry-reporter.js` collects rich payload (skillName, duration, outcome, phasesReached, project, team, os, harnessVersion, installId) and streams to PostHog. **No public surface synthesizes this data back.** `core-library-design/proposal.md:1338` planned "Case studies and testimonials" but never delivered. Adopters cannot validate "is this working for teams like mine?" Ship: (a) public adoption dashboard at a known URL aggregating skillName/outcome/phasesReached across the adopter base (anonymized), (b) `docs/case-studies/` directory with quarterly updates derived from telemetry + opt-in interviews, (c) README "Adopters" section with logo wall and headline stats updated by a `harness telemetry publish` script. For a tool that markets compounding-via-learning, the synthesis loop must close. Source: Pass 7-C.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#563
