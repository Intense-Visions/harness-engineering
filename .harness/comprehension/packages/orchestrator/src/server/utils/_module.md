---
schemaVersion: 1
module: "packages/orchestrator/src/server/utils"
sourceHash: "72e9fb993e59e868383dbbecbd4a6c7975d349363a7768c85212219dc9479580"
compiledAt: "2026-08-28T01:22:12.332Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["url-guard.ts"]
---

## Summary

This module implements outbound-request SSRF protection for the orchestrator. `guardOutboundHost()` is the primary gate: it decides whether to allow an HTTP request to a given hostname, blocking anything that resolves to a private/loopback/link-local/metadata address or fails DNS lookup. The module handles both IPv4 and IPv6 (including all embedded-IPv4 forms like v4-mapped and NAT64), normalizes IPv6 abbreviations to full expansions before checking, and ensures one bad address in a multi-family resolution blocks the whole hostname. `isPrivateHost()` is a cheap literal-only pre-filter; `isPrivateAddress()` is the resolved-IP classifier.

## Invariants

- Three-stage gating is mandatory: hostname literal → IP literal → DNS resolution. A public hostname can have an A record pointing at 169.254.169.254 or 127.0.0.1; string matching never sees it.
- One private address in the result set blocks the entire hostname, even if others resolve public. This closes the race where the guard checks AAAA but the connector picks A (or vice versa) and lands on a private address.
- IPv6 must be fully expanded before classification, not prefix-matched. fc0::1 expands to 0x0fc0::1, which is outside fc00::/7; a startsWith('fc') would wrongly block it. Similarly, ::ffff:7f00:1 and ::ffff:127.0.0.1 must classify identically.
- Every IPv6 form that embeds an IPv4 address must be unwrapped and re-classified as IPv4: v4-mapped (::ffff:a.b.c.d, ::ffff:7f00:1), v4-compatible (::a.b.c.d), v4-translated (::ffff:0:a.b.c.d), NAT64 (64:ff9b::/96), and 6to4 (2002::/16). NAT64 is critical for IPv6-only cloud subnets where 64:ff9b::a9fe:a9fe maps to 169.254.169.254.
- IPv6 bracket stripping is required: URL-normalized IPv6 literals arrive bracketed (e.g., [::1]); stripping before parsing/regex is non-optional.
- DNS failure blocks, failing closed: an empty address list or resolver error returns {blocked: true, reason: 'dns-failure'}. A hostname that won't resolve cannot be delivered to anyway, and a distinct reason code keeps resolver outages diagnosable.
- isPrivateHost() is a pre-filter only, never a full gate. It catches common literals (localhost, *.local, 127.x, 10.x, etc.) without network I/O but is blind to DNS rebinding. Always use guardOutboundHost() for actual connection decisions.
- The detail field is server-log-only, never HTTP-response-safe. It may contain resolved internal IPs or raw resolver errors—exposing it to clients makes the orchestrator an internal-network oracle for attackers.
- Residual DNS-rebinding risk exists: between the guard's check and the actual connect, a short-TTL record could change. Closing this would require IP pinning at connect-time via a custom dispatcher (out of scope for this module).

## Interface Contract

```ts
export guardOutboundHost
export isPrivateAddress
export isPrivateHost
```

## Dependency Slice

```
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
```
