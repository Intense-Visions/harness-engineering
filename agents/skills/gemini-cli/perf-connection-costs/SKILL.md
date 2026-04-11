# Network Connection Costs

> Understand and minimize the cumulative cost of DNS resolution, TCP handshake, and TLS negotiation — the invisible overhead that adds 100-500ms to every new connection before a single byte of application data transfers.

## When to Use

- Time to First Byte (TTFB) exceeds 600ms and network waterfall shows connection establishment as the bottleneck
- DevTools shows DNS lookup, TCP connect, and TLS handshake consuming significant time per resource
- A page connects to more than 4 unique origins (main domain, CDN, analytics, fonts, ads)
- Mobile users report slow initial page loads, especially on high-latency cellular networks
- You need to decide how many third-party origins to include on a page
- Server-side applications make outbound HTTP requests to multiple microservices
- TTFB is inconsistent across geographic regions, suggesting DNS or routing issues
- You are optimizing the critical rendering path and need to reduce resource discovery latency
- Connection reuse metrics show low keep-alive rates or frequent connection churn
- TLS handshake time exceeds 100ms and certificate chain optimization is needed

## Instructions

1. **Measure connection costs.** In Chrome DevTools Network panel, hover over the Waterfall bar for any resource. The tooltip breaks down: DNS Lookup, TCP Connection (Initial connection), TLS Handshake (SSL), and TTFB (Waiting for server response). Use the Navigation Timing API for programmatic measurement:

   ```javascript
   const nav = performance.getEntriesByType('navigation')[0];
   console.log({
     dns: nav.domainLookupEnd - nav.domainLookupStart, // DNS resolution
     tcp: nav.connectEnd - nav.connectStart, // TCP handshake
     tls:
       nav.secureConnectionStart > 0
         ? nav.connectEnd - nav.secureConnectionStart // TLS negotiation
         : 0,
     ttfb: nav.responseStart - nav.requestStart, // Server processing
   });
   ```

2. **Minimize unique origins.** Each unique origin requires a full DNS + TCP + TLS handshake. Audit all origins on your page:

   ```bash
   # Extract unique origins from a HAR file or DevTools
   # Target: 4 or fewer unique origins for critical resources
   ```

   Decision thresholds:
   - 1-3 origins: optimal, minimal connection overhead
   - 4-6 origins: acceptable, use preconnect for non-primary origins
   - 7+ origins: excessive, consolidate or defer non-critical third-party resources

3. **Optimize DNS resolution.** DNS resolution involves recursive lookups through multiple nameservers. Typical cost: 20-120ms globally, but can exceed 200ms for uncached domains on mobile.

   Mitigation strategies:
   - **dns-prefetch** for origins needed soon: `<link rel="dns-prefetch" href="//cdn.example.com">`
   - **Reduce DNS TTL carefully** — shorter TTL means more lookups, longer means slower failover
   - **Use a fast DNS provider** — Cloudflare DNS (1.1.1.1): ~11ms median, Route 53: ~20ms median
   - **DNS-over-HTTPS (DoH)** — encrypted but may add latency for first resolution

4. **Reduce TCP handshake cost.** TCP requires a 3-way handshake (SYN, SYN-ACK, ACK) — one full round trip. Mitigation:
   - **TCP Fast Open (TFO)** — sends data in the SYN packet on repeat connections, saving 1 RTT
   - **Increase initial congestion window (initcwnd)** — default is 10 segments (~14.6KB); this determines how much data transfers in the first RTT after handshake
   - **Connection reuse via keep-alive** — HTTP/1.1 defaults to keep-alive; HTTP/2 multiplexes over one connection

   ```bash
   # Check and set initcwnd on Linux
   ip route show
   ip route change default via <gateway> dev eth0 initcwnd 10 initrwnd 10
   ```

5. **Optimize TLS negotiation.** TLS adds 1-2 RTTs depending on version:
   - **TLS 1.2**: 2 additional RTTs (ClientHello -> ServerHello -> Finished)
   - **TLS 1.3**: 1 additional RTT (combined handshake), 0-RTT on resumption

   Optimization checklist:
   - Use TLS 1.3 (saves 1 RTT over TLS 1.2)
   - Enable TLS session resumption (session tickets or session IDs)
   - Use ECDSA certificates (256-byte signature vs 2048-byte RSA)
   - Minimize certificate chain length (2-3 certificates maximum)
   - Enable OCSP stapling (avoids client-side OCSP check adding 100-200ms)

6. **Use preconnect for critical third-party origins.** Preconnect performs DNS + TCP + TLS ahead of time:

   ```html
   <!-- Preconnect to critical third-party origins -->
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://cdn.example.com" />

   <!-- Use dns-prefetch as fallback for browsers that don't support preconnect -->
   <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
   ```

7. **Enable connection pooling for server-side requests.** Backend services making HTTP requests to other services should reuse connections:

   ```javascript
   // Node.js: use an HTTP agent with keep-alive
   const http = require('http');
   const agent = new http.Agent({
     keepAlive: true,
     maxSockets: 50,
     maxFreeSockets: 10,
     timeout: 60000,
   });
   ```

## Details

### The Connection Cost Breakdown

A new HTTPS connection to a remote server involves three sequential steps:

| Step                | Roundtrips          | Typical Latency (100ms RTT) | Typical Latency (250ms RTT) |
| ------------------- | ------------------- | --------------------------- | --------------------------- |
| DNS Resolution      | 1 RTT (if uncached) | 20-120ms                    | 50-250ms                    |
| TCP Handshake       | 1 RTT               | 100ms                       | 250ms                       |
| TLS 1.3             | 1 RTT               | 100ms                       | 250ms                       |
| TLS 1.2             | 2 RTT               | 200ms                       | 500ms                       |
| **Total (TLS 1.3)** | **3 RTT**           | **220-320ms**               | **550-750ms**               |
| **Total (TLS 1.2)** | **4 RTT**           | **320-420ms**               | **800-1000ms**              |

Every unique origin incurs this cost for the first request. Subsequent requests on the same connection skip all of it.

### TCP Slow Start and Initial Congestion Window

After the TCP handshake, the connection starts in slow start mode. The initial congestion window (initcwnd) determines how many TCP segments can be sent before receiving an acknowledgment. With initcwnd=10 (the modern default), approximately 14.6KB of data can transfer in the first RTT. This is why inlining critical CSS under 14KB ensures it arrives in the first roundtrip.

### Worked Example: LinkedIn TTFB Optimization

LinkedIn reduced TTFB by 50% by implementing two changes: (1) adding `<link rel="preconnect">` for 3 third-party origins used for fonts, analytics, and advertising — this shifted 300ms of connection setup from the critical path to the preconnect phase, and (2) increasing their server's initcwnd from the legacy default of 3 to 10, allowing the initial HTML response to transfer 14.6KB in the first RTT instead of 4.4KB. Combined, these changes reduced the visible blank-screen time from 1.2s to 0.6s on median mobile connections.

### Worked Example: Yahoo DNS Optimization

Yahoo measured DNS lookup times averaging 20-120ms across global users. They reduced this by 70% through: (1) implementing `<link rel="dns-prefetch">` for all third-party origins in the document head, (2) reducing unique origins from 12 to 4 by consolidating CDN domains, (3) switching to a DNS provider with better global anycast coverage. The reduction in origins alone saved 4-8 full connection handshakes per page load (400-800ms on mobile).

### Anti-Patterns

**Connecting to too many unique origins.** Each origin requires a full handshake chain. A page with 12 unique origins spends 2-4 seconds just on connection establishment on mobile networks. Consolidate to 4 or fewer origins for critical path resources.

**Oversized TLS certificate chains.** Certificate chains exceeding 3KB (3+ intermediate certificates or RSA-4096 keys) require multiple TCP roundtrips to deliver. Use ECDSA certificates (P-256: 64-byte key vs RSA-2048: 256-byte key) and minimize intermediates.

**Not enabling TLS session resumption.** Without session tickets or session IDs, every connection performs a full TLS handshake. Session resumption reduces TLS to 1 RTT (TLS 1.2) or 0 RTT (TLS 1.3). Verify with: `openssl s_client -connect example.com:443 -reconnect`.

**Relying on DNS TTL alone without prefetch hints.** DNS caches expire, and the first visitor after expiry pays the full lookup cost. Always add `dns-prefetch` hints for known third-party origins as a safety net.

## Source

- Ilya Grigorik, "High Performance Browser Networking" (O'Reilly), Chapters 1-4
- RFC 7918: TLS False Start — https://www.rfc-editor.org/rfc/rfc7918
- RFC 8446: TLS 1.3 — https://www.rfc-editor.org/rfc/rfc8446
- Google Research: "An Argument for Increasing TCP's Initial Congestion Window" — https://research.google/pubs/pub36640/
- W3C Resource Hints Specification — https://www.w3.org/TR/resource-hints/

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
- Critical path origins are reduced to 4 or fewer with preconnect hints for necessary third-party origins.
- TLS 1.3 is active with session resumption enabled and OCSP stapling configured.
- Connection waterfall shows reuse (no repeat DNS/TCP/TLS for same-origin requests).
