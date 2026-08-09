# Plan: resolve-then-check the outbound webhook host and stop following redirects

**Date:** 2026-08-09 · **Spec:** `docs/changes/webhook-ssrf-resolve-guard/proposal.md` · **Tasks:** 9 · **Time:** ~50 min · **Integration Tier:** small

## Goal

Close two independent SSRF bypasses on the orchestrator's outbound webhook path
(CWE-918): the private-address guard matches the hostname as a string and never
resolves it, and the delivery `fetch` follows redirects. Add a resolving guard
alongside the existing literal pre-filter, wire it into both call sites
(registration + fire-time recheck), and refuse redirects at delivery.

## Observable Truths (Acceptance Criteria)

1. `guardOutboundHost('evil.test', { lookup })` where the injected lookup returns
   `169.254.169.254` yields `{ blocked: true, reason: 'private-address' }`.
   **Gate:** unit test in `webhooks-url-guard.test.ts`.
2. `guardOutboundHost('localhost', { lookup })` yields `reason:
'private-literal'` and the injected lookup is **never invoked** (spy call
   count 0) — the literal pre-filter short-circuits without DNS.
   **Gate:** unit test asserting the spy count.
3. `guardOutboundHost('hooks.example.com', { lookup })` with a public resolved
   address yields `{ blocked: false }`. **Gate:** unit test.
4. A rejecting lookup yields `{ blocked: true, reason: 'dns-failure' }`.
   **Gate:** unit test.
5. `isPrivateAddress` returns true for each of `127.0.0.1`, `10.0.0.1`,
   `172.16.0.1`, `192.168.1.1`, `169.254.169.254`, `0.0.0.0`, `::1`,
   `fd00::1` (unique-local), `fe80::1` (link-local), `::ffff:127.0.0.1`
   (IPv4-mapped), and false for `8.8.8.8`, `172.15.0.1`, `2606:4700::1111`.
   **Gate:** unit test table.
6. `POST /api/v1/webhooks` with a URL whose hostname resolves to a private
   address returns 422; the same route still returns 200 for a hostname
   resolving publicly. **Gate:** route test with `vi.mock('node:dns/promises')`.
7. `WebhookDelivery` dead-letters a subscription whose hostname resolves private
   (injected `lookupImpl`) with **zero** HTTP requests issued.
   **Gate:** delivery test asserting the receiver got nothing and the dead row's
   `lastError` names the resolved-address reason.
8. `WebhookDelivery` does not follow a redirect: given a 302 to a second local
   server, that second server receives **zero** requests and the delivery is
   recorded failed with a `redirect not followed` error.
   **Gate:** delivery test with two `http.createServer` instances.
9. Every pre-existing test in `delivery.test.ts`, `webhooks-url-guard.test.ts`
   and `webhooks-integration.test.ts` passes **unmodified**. **Gate:** targeted
   vitest run; the diff must not touch their existing assertions.
10. `pnpm typecheck`, `pnpm lint`, and the orchestrator unit suite are green, and
    a patch changeset for `@harness-engineering/orchestrator` exists.
    **Gate:** local gate run.

## Uncertainties

- [ASSUMPTION] Node's `fetch` with `redirect: 'manual'` surfaces the real 3xx
  status rather than an opaque response. **Verified** on the pinned base commit
  under Node 22.20.0: `manual status=302 ok=false`. Not assumed.
- [ASSUMPTION] `dns.promises.lookup` on an IP literal short-circuits without a
  network call. Irrelevant in practice here because the literal pre-filter
  catches every private literal before the lookup runs.
- [ASSUMPTION] The route's create handler already runs inside an async IIFE, so
  making the guard awaitable needs no signature change on
  `handleV1WebhooksRoute` (which stays sync-returning `boolean`). Confirmed at
  `webhooks.ts:121-170`.
- [DEFERRABLE] Whether a 3xx should dead-letter immediately instead of consuming
  the retry budget. Left on the ordinary retry path deliberately (spec Decision 6) — it is a behavior change, not a security fix.
- [OUT OF SCOPE] Pinning the resolved IP at connect time (custom undici
  dispatcher) to close the TOCTOU/DNS-rebinding window. Documented as residual
  risk; not attempted.

## File Map

- MODIFY `packages/orchestrator/src/server/utils/url-guard.ts` — add
  `isPrivateAddress`, `guardOutboundHost`, `HostGuardVerdict`, `HostLookup`;
  leave `isPrivateHost` and its regexes untouched.
- MODIFY `packages/orchestrator/src/server/routes/v1/webhooks.ts` — await the
  resolving guard at registration.
- MODIFY `packages/orchestrator/src/gateway/webhooks/delivery.ts` — `lookupImpl`
  option, resolving fire-time recheck, `redirect: 'manual'`, 3xx handling.
- MODIFY `packages/orchestrator/src/server/routes/v1/webhooks-url-guard.test.ts`
  — append new describe blocks (existing blocks untouched).
- MODIFY `packages/orchestrator/src/gateway/webhooks/delivery.test.ts` — append
  two regression tests (existing tests untouched).
- CREATE `.changeset/<name>.md` — patch bump for the orchestrator.

## Skeleton

1. **Guard core (TDD)** — write the failing `guardOutboundHost` /
   `isPrivateAddress` unit tests, then implement (~3 tasks, ~20 min)
2. **Registration call site** — route swap + route regression test (~2 tasks, ~10 min)
3. **Delivery call site** — recheck swap, redirect refusal, two regression tests
   (~3 tasks, ~15 min)
4. **Gates** — changeset, typecheck/lint/test, security self-review of the diff
   (~1 task, ~5 min)

## Tasks

### Task 1 — Failing tests for `isPrivateAddress`

Append a `describe('isPrivateAddress')` table to `webhooks-url-guard.test.ts`
covering AC 5. Fails at import (symbol does not exist).

### Task 2 — Failing tests for `guardOutboundHost`

Append a `describe('guardOutboundHost')` block covering AC 1–4, using a
hand-rolled injected `lookup` (no vitest module mocking) plus a call-count spy
for the short-circuit assertion.

### Task 3 — Implement the guard

Add `isPrivateAddress` (IPv4 ranges incl. `0.0.0.0/8`, IPv6 `::`, `::1`,
`fc00::/7`, `fe80::/10`, IPv4-mapped delegation) and `guardOutboundHost`
(pre-filter → `dns.promises.lookup(host, { all: true })` → block if any address
is private; reject → `dns-failure`). Tasks 1–2 go green.

### Task 4 — Failing route test

New `describe` in `webhooks-url-guard.test.ts` (or a sibling file) using
`vi.mock('node:dns/promises')` to make a public-looking hostname resolve to
`169.254.169.254`; assert 422. Add the public-resolution 200 counterpart.

### Task 5 — Switch the registration guard

`await guardOutboundHost(targetHostname)` in the create handler; include the
verdict reason in the 422 body. Task 4 goes green. `[checkpoint:verify]`

### Task 6 — Failing delivery tests

Append to `delivery.test.ts`: (a) resolved-private dead-letter via injected
`lookupImpl`, zero HTTP requests; (b) redirect-not-followed with two servers.

### Task 7 — Switch the delivery guard + refuse redirects

Add `lookupImpl` to `DeliveryWorkerOptions`, await the resolving guard, keep the
`private/loopback` substring in the dead-letter message, add `redirect:
'manual'` and the 3xx branch. Task 6 goes green.

### Task 8 — Full targeted suite

Run the orchestrator webhook suites and confirm AC 9 (no pre-existing test was
edited to pass). `[checkpoint:verify]`

### Task 9 — Changeset + gates + security self-review

Patch changeset for `@harness-engineering/orchestrator`; `pnpm typecheck`,
`pnpm lint`, unit suite; dispatch the OWASP/CWE security reviewer over the diff
and address blocking findings.
