---
slug: "nyquist-bound-on-oversight"
milestone: "Fleet Family — Batch Orchestration"
order: 138
---

### The Nyquist bound on human oversight — attention aliasing detection

- **Status:** planned
- **Spec:** —
- **Summary:** Sampling theory: to reconstruct a signal you must sample at more than twice its highest frequency, and undersampling doesn't merely miss detail — it aliases, producing false slow trends that look like calm. Human oversight of an agent fleet is a sampling process: if the system's state can change materially in hours (an agent can introduce a regression class, shift an interface, drift a convention) and humans review daily, oversight is aliased — the dashboard shows a smooth trend that is an artifact of the sampling rate, and the humans' situational picture is provably unreconstructable from their observations. Make this a law the governors obey: measure the frequency content of consequential change (how fast each class of state actually moves), derive the minimum attention sampling rate per surface, compare against the declared human attention budget, and when the budget cannot meet the bound, the governor must lower the change frequency — batching, freezing surfaces, or reducing concurrency — rather than letting oversight silently become fictional. This converts 'humans can't keep up' from a vibe into a computed inequality with a forced resolution, and it composes with every governor already on the roadmap: they get a principled setpoint instead of a policy guess.
- **Blockers:** Depends on `feedback-control-for-governors`, `policy-level-human-control`, and `team-level-capacity-governor`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1618
