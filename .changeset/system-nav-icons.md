---
'@harness-engineering/dashboard': patch
---

feat(dashboard): add sidebar icons for the remaining system pages

`SystemNavItem` now maps icons for `signals`, `tokens`, `webhooks`,
`insights-cache`, `proposals`, `routing`, and `local-models` (Brain) — pages
that previously fell back to the default icon. Completes the Local Models panel's
navigation affordance alongside the install/remove work.
