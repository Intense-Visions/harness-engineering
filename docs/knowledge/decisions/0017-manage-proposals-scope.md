---
number: 0017
title: manage-proposals as a new token scope
date: 2026-05-17
status: accepted
tier: medium
source: docs/changes/hermes-phase-4-skill-proposals/proposal.md
---

## Context

The Phase 0 ADR (`0011-orchestrator-gateway-api-contract.md`) pins the
gateway's scope vocabulary and requires an ADR for any change. Phase 4
adds the `/api/v1/proposals/*` routes: list, get, run-gate, approve,
reject, edit. The existing scopes were considered:

- `read-status` fits list / get; routes are pure status reads.
- `modify-roadmap` is the wrong shape — proposals are not roadmap items.
- `trigger-job` is the wrong shape — proposals are not jobs.
- `admin` would conflate broad admin authority with proposal mutation.
- Inventing `approve-proposal` / `reject-proposal` / `edit-proposal`
  as three separate scopes was rejected — overly fine-grained for the
  current threat model.

## Decision

We chose to **add one new scope, `manage-proposals`**, which covers all
mutating operations on `/api/v1/proposals/*`: `run-gate`, `approve`,
`reject`, and `edit` (PATCH). Read operations (`GET /api/v1/proposals`
and `GET /api/v1/proposals/<id>`) continue under `read-status`, matching
the existing pattern for dashboard reads. Concrete commitments:

1. Add `'manage-proposals'` to `SCOPE_VOCABULARY` in
   `packages/orchestrator/src/auth/scopes.ts` and to `TokenScopeSchema`
   in `packages/types/src/auth.ts`.
2. Map the four mutation routes to `manage-proposals` in
   `V1_BRIDGE_ROUTES` (`packages/orchestrator/src/server/v1-bridge-routes.ts`).
3. `admin` continues to be a superset of every scope, so admin tokens
   keep working unchanged.

## Consequences

**Positive:**

- One scope per surface keeps the policy intelligible. An operator
  granting a Slack bot "the right to manage proposals" understands the
  blast radius without having to know about three sibling scopes.
- The proposal review queue can be safely delegated to a bot or
  per-team token without granting `modify-roadmap` or `trigger-job` as
  collateral.
- The reads-under-`read-status` choice means existing dashboard tokens
  see the queue without an upgrade — only mutation requires re-issuing
  with the new scope.

**Negative:**

- Future per-action breakdown (approve-only vs. reject-only) would
  require an additional ADR amendment.
- Scope-vocabulary growth has a long-tail review cost. The Phase 0 ADR
  policy is the throttle.

**Reversibility:**

- Removing the scope means removing the four routes from
  `V1_BRIDGE_ROUTES` and re-mapping them to `admin`. Existing tokens
  carrying `manage-proposals` would silently lose authority; legacy
  admin tokens would still work.

## Alternatives Considered

- **Three separate scopes (approve / reject / edit / run-gate):**
  Rejected as over-decomposed. The threat model does not justify
  per-action granularity; reviewers typically need all four together.
- **Reuse `modify-roadmap`:** Rejected — scope names that describe
  unrelated surfaces become foot-guns when a token is granted for one
  surface and inadvertently inherits authority over another.

## References

- Phase 0 scope policy: `docs/knowledge/decisions/0011-orchestrator-gateway-api-contract.md`.
- Phase 4 spec: `docs/changes/hermes-phase-4-skill-proposals/proposal.md`.
- Implementation: `packages/orchestrator/src/auth/scopes.ts`,
  `packages/orchestrator/src/server/v1-bridge-routes.ts`.
