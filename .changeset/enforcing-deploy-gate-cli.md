---
'@harness-engineering/cli': minor
'@harness-engineering/core': minor
---

Add `harness check-deployment` — an enforcing pre/post-deploy gate backed by a
pure `packages/core/src/deployment` engine. It verifies deployment readiness and
exits non-zero on unambiguous, incident-causing violations so CI can gate a deploy:
a hardcoded secret in a pipeline or committed env file (`DEPLOY-SEC001`,
non-waivable), a deploy target with no rollback path wired (`DEPLOY-RB001`), and a
direct-to-production deploy with no promotion/approval gate (`DEPLOY-ENV001`).
Maturity gaps (missing stages, weak env separation, no health check, pipeline
smells) are surfaced as non-blocking advisories. On a repo with no deployment
configuration the gate abstains loudly (exit 3, never a false green); `enabled:
false` opts out explicitly (exit 0). The rollback requirement is satisfied by a
`rollback` config block, a revert/rollback workflow or script, or a documented
runbook, tying the pre-ship gate to the post-ship rollback circuit breaker. The
gate is standalone and opt-in via `deployment.enabled` — it is not added to the
default `ci check`.

The `@harness-engineering/core` bump ships the new `deployment` engine module
(detect + evaluate + exit-code) reused by the command.
