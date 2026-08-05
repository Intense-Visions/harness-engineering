---
'@harness-engineering/cli': patch
---

Graduate the pre-merge brief to an adopter-facing artifact. `harness init` can
now render the opt-in `ci-pre-merge-brief` template — a GitHub Actions workflow
that runs `harness review-ci` then upserts the senior-facing `harness
pre-merge-brief` sticky PR comment (diff, review verdict, Signal status,
outcome-eval, and "worth your eyes") — plus a matching branch-protection ruleset
for the eventual acknowledgment gate. Mirrors how `ci-required-review` graduated:
a discoverable, opt-in named template directory rendered by the existing
`TemplateEngine` (no engine change). Every brief section degrades independently,
so the workflow runs in a plain adopter CI without a daemon or signal providers.
