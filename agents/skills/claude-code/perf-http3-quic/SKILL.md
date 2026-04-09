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
