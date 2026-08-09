---
'@harness-engineering/orchestrator': patch
---

Harden outbound webhook delivery against SSRF (CWE-918).

The private-address guard matched the subscription hostname as a string and
never resolved it, so a public hostname whose DNS record pointed at loopback,
an RFC-1918 range, or the link-local metadata address passed unchallenged. The
delivery `fetch` also followed redirects, letting a receiver that passed the
guard walk the request onto a private address on the next hop.

`guardOutboundHost` now resolves the hostname and refuses the request if any
resolved address is private; the existing string check is kept as a cheap
pre-filter, and both a resolver error and an empty address list fail closed.
Delivery sets `redirect: 'manual'` and records a 3xx as a delivery failure
instead of following it.

The refused-address set is also wider than the old regex: it now covers
RFC-6598 CGNAT (`100.64.0.0/10`, which doubles as a Kubernetes pod CIDR and as
Alibaba Cloud's metadata endpoint), the RFC-6890 protocol-assignments `/24`
(Oracle Cloud's legacy metadata address), the benchmarking block, multicast and
reserved space, IPv6 unique-local and link-local, and every IPv6 form that
embeds an IPv4 address — v4-mapped in both dotted and hex spelling,
v4-compatible, v4-translated, NAT64 `64:ff9b::/96` and 6to4.

Two behavior changes worth noting:

- IPv6-literal webhook URLs are now classified directly instead of being sent
  through DNS. This fixes a pre-existing hole where `https://[::1]/` was
  _accepted_ — `URL.hostname` returns IPv6 hosts bracketed, and the old regex
  had no bracket handling. Legitimate bracketed public IPv6 targets keep working.
- A rejected registration returns a generic 422. The specific reason is logged
  server-side rather than returned, so the response cannot be used to probe
  which internal hostnames exist.

Residual: the guard resolves the name, and the connection resolves it again, so
a record that changes between the two (DNS rebinding) is not covered. Closing
that requires pinning the resolved address at connect time.
