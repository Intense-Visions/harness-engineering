---
'@harness-engineering/dashboard': patch
---

Correct the `client` dashboard lane wording and stop dropping the role seed on
the identity-failure path (follow-up to #1132).

The `client` lane was described as "read-only", but the lanes are
presentation-only and enforce no authorization — the lane defaults to `/s/roadmap`,
where a live **Claim** write action (`POST /api/actions/roadmap/claim`) ships.
The "read-only" wording implied an access guarantee that is not enforced, so it
is dropped from the lane description and the surrounding comments (client `roles.ts`
and shared `roles.ts`); the "presentation-only, not a security boundary" caveat
is kept and reinforced. No behavior change — the Claim button is intentionally
not hidden by role (that would be half-authorization, which #1132 deliberately
avoided).

`GET /api/identity` now returns the `role` preference (from
`HARNESS_DASHBOARD_ROLE`) even on the 503 identity-resolution-failure path, and
the client `useRole` hook reads the body regardless of status, so an operator's
role seed is no longer silently dropped when GitHub identity cannot be resolved.
