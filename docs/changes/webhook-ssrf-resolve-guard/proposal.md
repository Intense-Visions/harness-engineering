# Resolve-then-check the outbound webhook host and stop following redirects

**Keywords:** ssrf, webhooks, dns-resolution, url-guard, redirect, link-local, outbound-delivery

## Overview

The orchestrator's outbound webhook path decides whether a subscription URL is
safe to POST to by matching the **hostname string** against a set of regexes.
`isPrivateHost` (`packages/orchestrator/src/server/utils/url-guard.ts:6`) tests
the hostname against `PRIVATE_HOSTNAME_RE` (`localhost` / `*.local`),
`PRIVATE_IPV4_RE` (127./10./172.16-31./192.168./169.254./0.0.0.0) and
`LOOPBACK_IPV6_RE` — and nothing else. It never resolves the name.

Consequently an ordinary-looking public hostname whose DNS A record points at a
private address passes the guard. This is not hypothetical: measured in this
worktree on the pinned base commit,

```
host=localtest.me isPrivateHost=false resolves-to=127.0.0.1
host=lvh.me       isPrivateHost=false resolves-to=127.0.0.1
```

Both are registrable public names that resolve to loopback. The same shape
covers a name resolving to `169.254.169.254` (cloud instance metadata) or any
RFC-1918 address. The guard runs at two places — subscription registration
(`packages/orchestrator/src/server/routes/v1/webhooks.ts:148`) and again at
fire time in the delivery worker
(`packages/orchestrator/src/gateway/webhooks/delivery.ts:127`) — and both
inherit the same string-only weakness.

Second, independent hole: the delivery POST at
`packages/orchestrator/src/gateway/webhooks/delivery.ts:144-153` passes no
`redirect` option, so `fetch` follows redirects by default. A subscription URL
that legitimately passes the guard can answer with a redirect to a private
address, and the guard is bypassed entirely because it only ever inspected the
first URL. Measured on the pinned base commit:

```
final status=200 ok=true url=http://127.0.0.1:<port>/metadata redirected=true
(target server logged: RECEIVED GET /metadata)
```

and with a `307` instead of a `302` the redirected request retains the method,
the body, **and** the `X-Harness-Signature` header:

```
307-TARGET method=POST url=/latest/meta-data/ body="{\"secret\":\"payload\"}" sig=sha256=deadbeef
```

CWE-918 (Server-Side Request Forgery). Evidence class: exploitable-path.

## Honest impact

This is a **blind** SSRF with a write side effect. Being precise about what an
attacker gains matters more than the label:

- **The response body never reaches the subscriber.** `executeDelivery` reads
  only `res.ok` and `res.status`; the body is discarded
  (`delivery.ts:154-155`). There is no data-exfiltration channel here.
- **The observable oracle is coarse.** The only delivery telemetry exposed over
  the API is `GET /api/v1/webhooks/queue/stats`, which returns aggregate counts
  (`pending`/`inFlight`/`failed`/`dead`/`delivered`) and no per-delivery status
  or error string (`webhooks.ts:98`, `queue.ts:218-230`). So an attacker who can
  read stats learns roughly one bit per delivery — "the internal endpoint
  answered 2xx" vs "it did not" — plus timing inferred from their own
  redirector. That is enough to sweep for live internal hosts and ports, not
  enough to read their contents.
- **The real teeth are the side effect, not the read.** Because a `307` preserves
  method, body and headers, the orchestrator can be made to issue an
  authenticated-looking signed POST at an arbitrary internal endpoint from
  inside the trust boundary. The body is a harness-generated gateway event, not
  attacker-chosen, which bounds this — but "an internal service receives a POST
  it would otherwise never receive" is the concrete harm.
- **Who can trigger it.** Anyone who can create a webhook subscription. The
  registration guard is the only thing standing between a caller and an outbound
  request, and it is the guard being bypassed.

Deliberately _not_ claimed: full internal-response exfiltration, credential
theft, or metadata-service credential capture. None of those follow from this
code path, because the response body is dropped.

## Decisions made

1. **Resolve-then-check, keep the string check as a pre-filter.** The regexes
   stay exactly as they are and keep their existing name and tests; they become
   a cheap fast path that avoids a DNS round trip for the common literal case. A
   new async guard adds resolution on top.
   _Rationale:_ the existing `isPrivateHost` unit tests
   (`webhooks-url-guard.test.ts:14-54`) encode real intent — literal private
   addresses must be refused without any network dependency. Rewriting the
   function to be async would have forced every one of those to change and would
   have made a purely-literal rejection depend on DNS being up.

2. **The resolving guard returns a verdict, not a bare boolean.** Callers need
   to distinguish "rejected because the literal is private", "rejected because
   it resolves private", and "could not resolve" in order to write a useful
   error string into the DLQ or the 422 body.

3. **DNS failure fails closed.** An unresolvable host is refused rather than
   allowed through.
   _Rationale:_ a host that does not resolve cannot be delivered to anyway, so
   failing closed costs no legitimate delivery. It does mean a transient
   resolver outage produces a 422 at registration; the verdict's distinct
   `dns-failure` reason makes that diagnosable rather than mysterious.

4. **Address coverage is widened past the current regexes.** The resolved-address
   check covers IPv4 `0.0.0.0/8`, `10/8`, `127/8`, `169.254/16`, `172.16/12`,
   `192.168/16`, and IPv6 `::`, `::1`, `fc00::/7` (unique-local), `fe80::/10`
   (link-local), plus IPv4-mapped IPv6 (`::ffff:a.b.c.d`) delegated to the IPv4
   check. The pre-existing `PRIVATE_IPV4_RE` only matched `0.0.0.0` exactly and
   had no unique-local IPv6 case.

5. **Redirects are refused, not followed.** `redirect: 'manual'` on the delivery
   fetch, and a 3xx response is recorded as a delivery failure with an explicit
   `redirect not followed` error rather than being chased.
   _Rationale:_ following a redirect re-opens the whole hole no matter how good
   the first-hop guard is. Re-running the guard on each hop was considered and
   rejected as more machinery for the same outcome — a webhook receiver has no
   legitimate need to redirect a signed event POST.

6. **Redirects keep the ordinary retry/backoff path rather than dead-lettering
   immediately.** A 3xx is treated like any other non-2xx.
   _Rationale:_ smaller change. Immediate dead-lettering is arguably better
   operationally (a redirect will never start succeeding on retry), but that is a
   behavior expansion beyond the security defect and is left out.

7. **Injectable seams mirror the existing `fetchImpl` convention.** The guard
   takes an optional `lookup`, and `WebhookDelivery` gains an optional
   `lookupImpl`, so the regression tests are deterministic and never touch the
   network.

8. **Decisions added after the security self-review.** The OWASP/CWE reviewer ran
   over the diff before push and found five items worth acting on; all are inside
   the guard already being changed, so none grew the scope:
   - An empty resolved-address list returned `{ blocked: false }` — `[].find()`
     is `undefined`. Fail-open inside a fail-closed function. Now blocked as
     `dns-failure`.
   - The refused-address set omitted RFC-6598 CGNAT (`100.64.0.0/10`, which is
     both a common Kubernetes pod/service CIDR and Alibaba Cloud's metadata
     endpoint at `100.100.100.200`) and the RFC-6890 protocol-assignments `/24`
     (Oracle Cloud's legacy metadata address at `192.0.0.192`). Both added,
     along with the benchmarking, multicast and reserved ranges.
   - IPv6 forms that embed an IPv4 address were only recognised in their dotted
     spelling. `::ffff:7f00:1` is the same address as `::ffff:127.0.0.1` and was
     classified public. The IPv6 branch now fully expands the address and
     unwraps v4-mapped (both spellings), v4-compatible, v4-translated, NAT64
     `64:ff9b::/96` and 6to4 before classifying.
   - Sending every hostname through DNS meant bracketed IPv6 literals — the form
     `URL.hostname` actually returns — were rejected as `dns-failure`, breaking
     legitimate `https://[2606:4700:4700::1111]/` targets. An IP-literal fast
     path now classifies them directly. This also closes a pre-existing hole:
     `https://[::1]/` was _accepted_ before, because `LOOPBACK_IPV6_RE` has no
     bracket handling.
   - Returning `verdict.reason` in the 422 body let a caller distinguish "name
     resolves to something internal" from "name does not exist", enumerating the
     internal namespace one registration at a time. The reason is now logged
     server-side and the response body is generic.

   Parked as follow-up, deliberately not fixed here: the DNS lookup runs outside
   the per-delivery timeout and outside the abort path (`dns.lookup` is not
   abortable), and it is uncached, so it consumes a libuv threadpool slot per
   delivery attempt. Both are availability concerns, not SSRF, and fixing them
   properly means either a resolver swap with its own trade-offs (`dns.resolve*`
   bypasses `/etc/hosts`, which would _lose_ coverage) or a verdict cache.

## Technical design

### `packages/orchestrator/src/server/utils/url-guard.ts`

Unchanged export:

```ts
export function isPrivateHost(hostname: string): boolean; // literal pre-filter, as today
```

New exports:

```ts
export type HostGuardReason = 'private-literal' | 'private-address' | 'dns-failure';

export interface HostGuardVerdict {
  blocked: boolean;
  reason?: HostGuardReason;
  detail?: string;
}

export type HostLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export function isPrivateAddress(ip: string): boolean;

export async function guardOutboundHost(
  hostname: string,
  opts?: { lookup?: HostLookup }
): Promise<HostGuardVerdict>;
```

`guardOutboundHost` runs the literal pre-filter, short-circuits on a hit, then
resolves with `dns.promises.lookup(hostname, { all: true })` and blocks if **any**
returned address satisfies `isPrivateAddress`. A lookup rejection yields
`{ blocked: true, reason: 'dns-failure' }`.

### `packages/orchestrator/src/server/routes/v1/webhooks.ts`

The create handler already runs inside `void (async () => { ... })()`, so the
call site becomes an `await guardOutboundHost(targetHostname)` and the 422 body
gains the verdict's reason.

### `packages/orchestrator/src/gateway/webhooks/delivery.ts`

- `DeliveryWorkerOptions` gains `lookupImpl?: HostLookup`.
- The fire-time recheck becomes `await guardOutboundHost(hostname, { lookup })`,
  writing the verdict reason into the dead-letter `lastError`. The existing
  `'private/loopback'` substring is preserved in the message so the existing
  dead-letter assertion keeps its meaning.
- The delivery `fetch` gains `redirect: 'manual'`; a `res.status >= 300 &&
res.status < 400` sets an explicit `redirect not followed (HTTP <status>)`
  error.

## Integration Points

- **Entry Points** — no new entry point. Two existing call sites change
  (`POST /api/v1/webhooks` registration guard, `WebhookDelivery.executeDelivery`
  fire-time guard + fetch). Three new exports from the existing
  `server/utils/url-guard.ts` module.
- **Registrations Required** — none. `url-guard.ts` is imported directly by both
  consumers; no barrel regeneration and no route registration.
- **Documentation Updates** — none required; no user-visible API contract
  changes beyond a more specific 422 error string. A changeset (patch,
  `@harness-engineering/orchestrator`) is required by the repo.
- **Architectural Decisions** — none rise to a standalone ADR. This is a small
  bounded hardening of an existing guard, not a new architectural seam.
- **Knowledge Impact** — the durable lesson is "a hostname allowlist/denylist
  that never resolves is not a network guard, and a guard that does not also
  refuse redirects only guards the first hop." Captured in this proposal.

## Success Criteria

1. `guardOutboundHost` blocks a hostname whose resolved addresses include a
   loopback, RFC-1918, link-local, or unique-local address, with reason
   `private-address`.
2. `guardOutboundHost` blocks a literal private host without performing any
   lookup (injected lookup is never called), with reason `private-literal`.
3. `guardOutboundHost` allows a hostname resolving only to public addresses.
4. `guardOutboundHost` blocks with reason `dns-failure` when resolution rejects.
5. `POST /api/v1/webhooks` returns 422 for a URL whose hostname resolves to a
   private address, and still returns 200 for one that resolves publicly.
6. `WebhookDelivery` dead-letters a subscription whose hostname resolves private,
   without issuing any HTTP request.
7. `WebhookDelivery` does **not** follow a redirect: the redirect target server
   receives zero requests and the delivery is recorded as failed.
8. Delivery to a normal public-shaped endpoint that answers 200 directly still
   succeeds — every pre-existing delivery test still passes unmodified.

## Implementation Order

1. Extend `url-guard.ts` with `isPrivateAddress` + `guardOutboundHost` and its
   unit tests (tests first — they fail on the base commit because the symbols do
   not exist).
2. Switch the registration route to the resolving guard; add the route-level
   regression test.
3. Switch the delivery worker's fire-time recheck to the resolving guard and add
   `redirect: 'manual'` + 3xx handling; add the two delivery regression tests.
4. Changeset, full local gates, security self-review of the diff.

## Residual risk (explicit)

The fix closes resolve-time and redirect-time bypasses. It does **not** close
the TOCTOU window between the guard's `lookup` and the connection the subsequent
`fetch` opens — `fetch` resolves the name a second time, so a DNS record that
flips between the two resolutions (classic DNS rebinding with a short TTL) can
still land on a private address. Fully closing that requires pinning the
resolved IP at connect time via a custom `undici` dispatcher or a `lookup`-hooked
agent, which is a materially larger change than this defect warrants. It is
stated here and in the PR body rather than papered over.
