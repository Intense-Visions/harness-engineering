---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(telemetry): add `harness telemetry synthesize` — a unified local telemetry report

Ships the in-repo slice of #563: a read-only, local, single-project command that
COMPOSES the five telemetry surfaces that already accrue — skill adoption
(`readAdoptionRecords`/`aggregateBySkill`), Bayesian skill effectiveness
(`computeSkillEffectiveness`/`detectFailingSkills`/`detectAbandonedSkills`), usage/cost
(the usage aggregator), composite code-health insights (`composeInsights`), and
`execution_outcome` graph verdicts — into one report. Markdown by default; `--json`
emits a machine-readable `TelemetrySynthesis` object designed so a future dashboard can
consume it unchanged.

It collects nothing new — no hooks, event types, or storage — and is pure composition
over existing readers, mirroring the `harness adoption retrospective` precedent.
`--skip <section>` omits a source, `--window <days>` bounds the adoption/usage/outcome
sources, and `--out <path>` writes to a file (default: stdout). A missing source
contributes an explicit "no data" note in a "Sources with no data" footer — never a
fabricated zero and never a crash.

The cross-adopter public dashboard from the shard stays out of scope (it needs a
PostHog aggregate + privacy review + hosting decision that do not exist in-repo); this
is the buildable, testable per-project data layer that dashboard would render.

`core` gains a `telemetry-synthesis` module (pure composer + Markdown renderer); the CLI
is the composition root, keeping `core` free of any `intelligence`/`graph` dependency.
