# HTTP/3 and QUIC Protocol

> Understand HTTP/3's QUIC transport layer — 0-RTT connection establishment, UDP-based stream multiplexing without head-of-line blocking, connection migration across network changes, and built-in TLS 1.3 encryption for faster, more resilient web delivery.

## When to Use

- Users on mobile networks experience high latency due to TCP+TLS handshake overhead
- HTTP/2 performance degrades on lossy networks (>1% packet loss) due to TCP head-of-line blocking
- Application serves users who switch between WiFi and cellular connections mid-session
- You are evaluating CDN providers and need to understand HTTP/3 support implications
- Lighthouse or WebPageTest shows high connection establishment times on repeat visits
- Your site serves a global audience with significant traffic from high-latency regions
- You need to configure HTTP/3 fallback behavior via Alt-Svc headers
- Real-time applications (video conferencing, live streaming) need resilient transport
- You are configuring 0-RTT and need to understand replay attack implications
- Performance testing shows TTFB variance correlated with network switching events

## Instructions

1. **Check current HTTP/3 support.** Verify your CDN or server supports HTTP/3. In Chrome DevTools Network panel, the Protocol column shows `h3` for HTTP/3 connections. Test with curl: `curl --http3 -I https://example.com`. Check server headers for `alt-svc: h3=":443"` which advertises HTTP/3 availability.

2. **Understand QUIC transport fundamentals.** QUIC is a UDP-based transport protocol that integrates TLS 1.3. Unlike TCP, QUIC handles multiplexing at the transport layer, so packet loss on one stream does not block other streams.

   ```
   TCP + TLS 1.2 (HTTP/2):     QUIC (HTTP/3):
   ┌──────────────────┐        ┌──────────────────┐
   │ 1 RTT: TCP SYN   │        │ 1 RTT: QUIC      │
   │ 1 RTT: TCP ACK   │        │   handshake +     │
   │ 1 RTT: TLS hello │        │   TLS 1.3 +       │
   │ 1 RTT: TLS finish│        │   first data      │
   │ First data: 3 RTT │        │ First data: 1 RTT │
   └──────────────────┘        └──────────────────┘
                                (0 RTT on reconnect)
   ```

3. **Configure Alt-Svc advertisement.** The server advertises HTTP/3 availability via the Alt-Svc response header. The browser remembers this and attempts QUIC on subsequent connections.

   ```
   # Server response header
   Alt-Svc: h3=":443"; ma=86400

   # Nginx configuration
   add_header Alt-Svc 'h3=":443"; ma=86400';

   # Caddy automatically enables HTTP/3
   ```

4. **Enable 0-RTT for repeat connections.** QUIC's 0-RTT mode allows clients to send data in the first packet on reconnection using cached server parameters. This eliminates handshake latency entirely for repeat visitors.

   ```
   First visit:  Client ─── QUIC handshake (1 RTT) ──→ Server
   Repeat visit: Client ─── 0-RTT data + handshake ──→ Server
                 (data sent immediately, no waiting for handshake)
   ```

   **Security consideration:** 0-RTT data can be replayed by an attacker. Only allow 0-RTT for idempotent requests (GET, HEAD). Non-idempotent requests (POST, PUT, DELETE) must use 1-RTT mode.

5. **Leverage connection migration.** When a mobile user switches from WiFi to cellular, TCP connections break (IP address changes). QUIC connections survive because they are identified by a Connection ID, not by IP:port tuple. Configure connection ID rotation for privacy.

6. **Configure fallback behavior.** Not all networks support UDP (some corporate firewalls block it). Implement graceful fallback:
   - Browser tries HTTP/3 (QUIC over UDP)
   - If UDP is blocked, falls back to HTTP/2 (TCP)
   - Alt-Svc cache remembers working protocol

7. **Measure improvement.** Compare HTTP/2 vs HTTP/3 using WebPageTest with mobile network profiles. Focus on: TTFB (especially repeat visits with 0-RTT), performance under packet loss (2-5% loss scenarios), and connection migration success rate.

## Details

### QUIC Packet Structure

QUIC packets contain one or more frames. Each frame belongs to a specific stream. Unlike TCP, QUIC handles loss recovery per-stream: if stream 3 loses a packet, streams 1 and 5 continue unaffected. This eliminates the TCP head-of-line blocking problem that affects HTTP/2.

Each QUIC connection starts with a cryptographic handshake that integrates TLS 1.3. The handshake and encryption are inseparable — there is no unencrypted QUIC. This means middleboxes cannot inspect or modify QUIC traffic (unlike TCP where TLS is a separate layer).

### QPACK Header Compression

HTTP/3 uses QPACK instead of HPACK for header compression. HPACK requires in-order delivery (which TCP provides), but QUIC streams may arrive out of order. QPACK handles this by using separate unidirectional streams for the dynamic table, allowing header blocks to be decoded independently.

### Congestion Control

QUIC implements pluggable congestion control at the application layer (not in the kernel like TCP). Common algorithms:

- **Cubic** — default in most implementations, similar to TCP Cubic
- **BBR (Bottleneck Bandwidth and Round-trip propagation time)** — Google's algorithm, better for high-bandwidth, high-latency paths
- **BBRv2** — improved fairness with Cubic flows

### Worked Example: Google Search Latency

Google deployed QUIC (the precursor to HTTP/3) across their services and measured an 8% reduction in search latency globally. The improvement was particularly dramatic in high-latency regions: India saw a 15% reduction in search result page load time, primarily from 0-RTT eliminating handshake roundtrips. On YouTube, QUIC reduced rebuffering by 18% on mobile networks due to connection migration surviving WiFi-to-cellular handoffs during video playback.

### Worked Example: Cloudflare HTTP/3 Measurements

Cloudflare measured a 12.4% improvement in time-to-first-byte for HTTP/3 vs HTTP/2 connections on mobile networks. The improvement was attributed to: (1) 0-RTT on repeat connections saving one full RTT (~50-150ms on mobile), (2) elimination of TCP head-of-line blocking under the 1-3% packet loss typical of mobile networks, and (3) faster loss recovery from QUIC's more granular acknowledgment mechanism. On wired connections with low packet loss, the improvement was smaller (~3-5%), primarily from 0-RTT savings.

### Anti-Patterns

**Assuming HTTP/3 is universally available.** Approximately 5-8% of networks block UDP traffic (corporate firewalls, some ISPs). Always configure Alt-Svc based fallback to HTTP/2. Test in environments with UDP blocking before deployment.

**Not configuring 0-RTT replay protection.** 0-RTT data can be captured and replayed. An attacker could replay a 0-RTT GET request to trigger server-side effects. Only allow 0-RTT for safe, idempotent methods. Implement server-side replay detection for sensitive endpoints.

**Ignoring connection migration for mobile traffic.** If your audience is primarily mobile, connection migration is a major benefit. Ensure your load balancer and CDN support QUIC connection IDs — some L4 load balancers route by IP:port and will break connection migration.

**Serving HTTP/3 without optimizing the TLS certificate chain.** QUIC's initial handshake must fit in the initial congestion window. An oversized certificate chain (>4KB) requires multiple roundtrips, negating the 1-RTT handshake benefit. Use ECDSA certificates (smaller than RSA), minimize chain length, and enable OCSP stapling.

**Disabling QUIC retry tokens in production.** QUIC retry tokens protect against IP address spoofing amplification attacks. Without retry, an attacker can send a small initial packet with a spoofed source IP and the server responds with a much larger handshake — a classic amplification vector. Always enable retry tokens in production. The cost is one additional roundtrip for the first connection, but subsequent connections from the same client are not affected.

**Not monitoring QUIC-specific metrics.** Standard HTTP monitoring (status codes, TTFB) misses QUIC-specific failure modes. Track: 0-RTT acceptance rate (should be >80% for repeat visitors), connection migration success rate, UDP block rate (percentage of clients falling back to TCP), and handshake failure rate. A sudden drop in 0-RTT acceptance may indicate a server key rotation issue or middlebox interference.

### Decision Guidance: When HTTP/3 Provides the Most Benefit

HTTP/3 is not uniformly better than HTTP/2 in all scenarios. The largest gains appear under specific conditions:

- **High packet loss (>1%)** — HTTP/3's per-stream loss recovery eliminates head-of-line blocking. On networks with 2-3% packet loss (typical mobile), HTTP/3 can be 30-50% faster than HTTP/2.
- **High RTT (>100ms)** — 0-RTT saves an entire roundtrip on repeat connections. At 200ms RTT, this saves 200ms of latency — significant for perceived performance.
- **Mobile users switching networks** — connection migration keeps sessions alive across WiFi-to-cellular transitions. Without it, users experience 1-3 second stalls while TCP connections are re-established.
- **Low packet loss, low RTT (wired connections)** — improvement is marginal (3-5%). The cost of deploying and maintaining HTTP/3 infrastructure may not be justified for intranet or datacenter-to-datacenter traffic.

### QUIC and Load Balancers

QUIC connections are identified by Connection IDs, not IP:port tuples. This creates challenges for load balancers that route based on the 5-tuple (src IP, src port, dst IP, dst port, protocol). If a QUIC connection migrates (client IP changes), a naive load balancer routes the migrated packets to a different backend server, breaking the connection.

Solutions:

- **Connection ID-aware load balancers** — encode routing information in the Connection ID itself. The load balancer extracts the backend server identifier from the Connection ID without maintaining per-connection state. RFC 9312 defines a standardized format for this.
- **Shared state backends** — store QUIC session state in a shared store (Redis, memcached) so any backend can resume a migrated connection. Adds latency but works with existing L4 load balancers.
- **CDN termination** — terminate QUIC at the CDN edge and use HTTP/2 or HTTP/1.1 to the origin. This is the simplest approach and avoids load balancer complexity entirely. Most CDNs (Cloudflare, Fastly, Akamai) support this.

### UDP Path MTU Discovery

QUIC runs over UDP, which does not have TCP's built-in path MTU discovery. QUIC implements its own PMTU discovery by sending probe packets of increasing size. If a packet exceeds the path MTU, it is silently dropped (unlike TCP where ICMP messages signal the issue). Some networks block ICMP "Packet Too Big" messages, making PMTU discovery unreliable. QUIC's initial packet size is capped at 1200 bytes (the minimum guaranteed MTU for IPv6) to ensure the handshake succeeds. After connection establishment, QUIC can probe for larger MTU to improve throughput for bulk transfers.

### Debugging QUIC Connections

QUIC's encryption makes traditional packet inspection tools (tcpdump, Wireshark) less useful — the payload is encrypted. To debug QUIC issues, use QUIC-aware tooling:

- **Chrome's net-export** — `chrome://net-export/` captures QUIC session logs including handshake details, stream states, and congestion control metrics
- **qlog** — standardized QUIC event logging format (RFC 9516). Most QUIC implementations support qlog output. Visualize with qvis (https://qvis.quictools.info/)
- **SSLKEYLOGFILE** — set this environment variable to capture TLS keys, enabling Wireshark to decrypt QUIC traffic for development debugging (never in production)

## Source

- RFC 9000: QUIC Transport Protocol — https://www.rfc-editor.org/rfc/rfc9000
- RFC 9114: HTTP/3 — https://www.rfc-editor.org/rfc/rfc9114
- RFC 9204: QPACK Header Compression — https://www.rfc-editor.org/rfc/rfc9204
- Google QUIC Discovery paper — "The QUIC Transport Protocol: Design and Internet-Scale Deployment" (SIGCOMM 2017)
- Cloudflare HTTP/3 performance analysis — https://blog.cloudflare.com/http3-the-past-present-and-future/

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
- HTTP/3 is active (Protocol column shows `h3`) with Alt-Svc fallback to HTTP/2 configured.
- 0-RTT is enabled for idempotent requests with replay protection for non-idempotent endpoints.
- TTFB on repeat visits shows measurable improvement from 0-RTT connection establishment.
