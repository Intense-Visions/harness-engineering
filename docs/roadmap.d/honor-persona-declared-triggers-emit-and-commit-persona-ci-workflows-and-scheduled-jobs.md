---
slug: "honor-persona-declared-triggers-emit-and-commit-persona-ci-workflows-and-scheduled-jobs"
milestone: "v5.0 — Article-Framing Docs & Personas"
order: 11
---

### Honor persona-declared triggers — emit and commit persona CI workflows and scheduled jobs

- **Status:** planned
- **Spec:** —
- **Summary:** Persona YAMLs (agents/personas/\*.yaml) declare on_pr/on_commit/scheduled(cron) triggers and outputs.ci-workflow: true, and a generator exists (packages/cli/src/persona/generators/ci-workflow.ts), but — verified 2026-06 — NO generated persona workflow is committed and nothing honors the triggers; they are dead declarations. Make them real: run the persona CI-workflow generator and commit the resulting .github/workflows/ so declared triggers actually fire, plus a check that fails when a persona's declared trigger has no committed workflow (drift guard, mirrors generate:plugin:check). First consumer: the new harness-pm persona (#566) auto-runs acceptance-eval on PRs touching docs/changes/\*\* — closing the manual-only gap for the upstream acceptance-criteria gate. Also lights up the currently-dormant declarations on codebase-health-analyst (dependency-health, hotspot-detector, cleanup-dead-code — weekly sweep), performance-guardian (perf), entropy-cleaner (cleanup), graph-maintainer, and security-reviewer (on_pr deep OWASP/threat-model review beyond CI's lightweight security-scan). Today the project's strongest gear is opt-in; this makes it load-bearing without a human remembering to invoke each persona. Recommended priority: P1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#663
