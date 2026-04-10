# HTTP/2 Stream Multiplexing

> Master HTTP/2's binary framing layer, stream multiplexing over a single TCP connection, stream priorities, HPACK header compression, server push mechanics, and head-of-line blocking mitigation to eliminate redundant connections and accelerate page delivery.

## When to Use

- A page opens 6+ TCP connections per origin and you need to reduce connection overhead
- Network waterfall shows sequential resource loading despite parallel availability
- Lighthouse flags "Reduce server response times (TTFB)" related to connection establishment
- You are evaluating whether to domain-shard assets or consolidate to fewer origins
- Server push is being considered for critical CSS or JS delivery
- You need to prioritize resource delivery order (critical CSS before analytics scripts)
- HTTP/1.1 head-of-line blocking is measurably delaying page loads
- A migration from HTTP/1.1 to HTTP/2 is planned and you need to understand behavioral differences
- You need to decide between bundling all resources into single files vs fine-grained splitting
- Connection coalescing behavior needs to be understood for multi-domain TLS certificate configurations

## Instructions

1. **Verify HTTP/2 support.** Check the server and CDN configuration. In Chrome DevTools Network panel, the "Protocol" column shows `h2` for HTTP/2. In curl: `curl -I --http2 https://example.com` — look for `HTTP/2 200`. Confirm the TLS certificate covers all relevant domains for connection coalescing.

2. **Understand the binary framing layer.** HTTP/2 replaces HTTP/1.1 text-based protocol with a binary framing layer. Every HTTP message is broken into frames (HEADERS, DATA, PRIORITY, RST_STREAM, SETTINGS, PUSH_PROMISE, PING, GOAWAY, WINDOW_UPDATE, CONTINUATION). Frames are assigned to numbered streams, and multiple streams are multiplexed over a single TCP connection.

   ```
   HTTP/2 Connection (single TCP socket)
   +--------------------------------------------------+
   | Stream 1: GET /index.html     [HEADERS] [DATA]   |
   | Stream 3: GET /style.css      [HEADERS] [DATA]   |
   | Stream 5: GET /app.js         [HEADERS] [DATA]   |
   | Stream 7: GET /hero.webp      [HEADERS] [DATA]   |
   +--------------------------------------------------+
   Frames from all streams interleave on the same connection.
   ```

3. **Configure stream priorities.** HTTP/2 allows clients to assign priority weight (1-256) and dependency relationships between streams. Browsers set priorities automatically: CSS and fonts get higher priority than images. Override with the `fetchpriority` attribute when the browser's heuristics are wrong.

   ```html
   <!-- Boost priority for LCP hero image -->
   <img src="/hero.webp" fetchpriority="high" alt="Hero" />

   <!-- Lower priority for below-the-fold images -->
   <img src="/gallery-1.webp" fetchpriority="low" alt="Gallery" loading="lazy" />
   ```

4. **Leverage HPACK header compression.** HTTP/2 uses HPACK to compress headers. The first request sends full headers; subsequent requests on the same connection reference a shared dynamic table, sending only differences. Typical savings: 85-95% reduction in header bytes after the first request. Headers that repeat across requests (cookies, user-agent, accept) benefit most.

5. **Evaluate server push carefully.** Server push allows the server to send resources before the client requests them. The server sends a PUSH_PROMISE frame, then the DATA frames for the pushed resource. In practice, server push is deprecated in Chrome 106+ and removed from most implementations because:
   - Pushed resources compete with the response body for bandwidth
   - The browser may already have the resource cached (wasted bytes)
   - 103 Early Hints is the recommended replacement

   ```
   # Instead of server push, use 103 Early Hints:
   HTTP/1.1 103 Early Hints
   Link: </style.css>; rel=preload; as=style
   Link: </app.js>; rel=preload; as=script

   HTTP/2 200
   Content-Type: text/html
   # ... full response follows
   ```

6. **Remove HTTP/1.1 workarounds.** After confirming HTTP/2 works, reverse these HTTP/1.1 hacks:
   - **Remove domain sharding** — consolidate assets to fewer origins (one origin = one multiplexed connection)
   - **Stop concatenating all CSS/JS into single files** — HTTP/2 makes fine-grained splitting viable (better cache granularity)
   - **Remove image sprites** — individual images with HTTP/2 avoid downloading unused sprite sections

7. **Measure improvement.** Compare before/after using WebPageTest with the "Connection View" to visualize multiplexing. Key metrics: number of TCP connections (should approach 1 per origin), TTFB for individual resources (should overlap), and total page load time.

## Details

### Binary Framing and Stream Lifecycle

Each HTTP/2 stream goes through a defined lifecycle: idle -> open -> half-closed -> closed. Streams use odd numbers for client-initiated requests and even numbers for server-initiated pushes. The maximum concurrent streams is negotiated in SETTINGS frames (default: 100 in most implementations). If the limit is reached, new requests queue until a stream closes.

Frame sizes are limited by SETTINGS_MAX_FRAME_SIZE (default: 16,384 bytes, max: 16,777,215 bytes). Larger frames reduce framing overhead but increase head-of-line blocking at the TCP level.

### Connection Coalescing

HTTP/2 can reuse a connection for multiple origins if: (1) the origins resolve to the same IP address, and (2) the TLS certificate covers both origins (via SAN or wildcard). For example, if `cdn.example.com` and `api.example.com` share a certificate and resolve to the same IP, the browser uses one connection for both.

### TCP-Level Head-of-Line Blocking

HTTP/2 eliminates HTTP-level head-of-line blocking (multiple requests in flight simultaneously), but TCP-level head-of-line blocking remains. If a TCP packet is lost, all streams on that connection stall until the packet is retransmitted. On lossy networks (mobile, high-latency), this can negate multiplexing benefits. HTTP/3 (QUIC) solves this by using UDP with per-stream loss recovery.

Measured impact: at 2% packet loss, HTTP/2 performance degrades by approximately 30-40% compared to ideal conditions. At 5% loss, multiple HTTP/1.1 connections can outperform HTTP/2's single multiplexed connection.

### Worked Example: Akamai HTTP/2 Migration

Akamai measured an 8x improvement in page load time under high-latency conditions (300ms RTT) by enabling HTTP/2 multiplexing. The test page loaded 100 image tiles. Under HTTP/1.1 with 6 connections per origin, loading was serialized in batches of 6. Under HTTP/2, all 100 requests were multiplexed over a single connection, with frames interleaved based on priority. The key insight: the improvement is most dramatic on high-latency connections where connection establishment cost dominates.

### Worked Example: Etsy HTTP/2 Adoption

Etsy migrated to HTTP/2 and measured a 13% reduction in median page load time. Their approach: (1) deploy HTTP/2 at the CDN edge, (2) remove domain sharding that split assets across 4 origins, (3) switch from concatenated bundles to per-page code splitting. The consolidated single-origin approach reduced DNS lookups from 4 to 1 and TCP handshakes from 24 (4 origins x 6 connections) to 1. Cache efficiency improved because individual changed modules invalidated only their chunk, not the entire bundle.

### Anti-Patterns

**Domain sharding with HTTP/2.** HTTP/1.1 browsers limited connections to 6 per origin, so sites spread assets across multiple domains (cdn1.example.com, cdn2.example.com). With HTTP/2, this splits the multiplexed connection into multiple connections, each with its own HPACK state and priority tree. Consolidate to one origin.

**Overly aggressive server push.** Pushing resources the client already has cached wastes bandwidth. The client can send RST_STREAM to cancel a push, but the server may have already transmitted significant data. Use 103 Early Hints instead — the client can skip preloading resources it has cached.

**Single mega-bundle.** HTTP/1.1 favored fewer, larger files to minimize requests. HTTP/2 makes request overhead negligible, so fine-grained code splitting is preferred: each module changes independently, enabling granular cache invalidation. A recommended baseline: one vendor chunk (rarely changes) + one chunk per route (changes independently).

**Ignoring stream priorities.** Without explicit priority configuration, the server may send low-priority resources (analytics scripts, tracking pixels) before high-priority ones (CSS, fonts). Use `fetchpriority` attributes and server-side priority tuning.

## Source

- RFC 7540: HTTP/2 — https://www.rfc-editor.org/rfc/rfc7540
- RFC 7541: HPACK Header Compression — https://www.rfc-editor.org/rfc/rfc7541
- Ilya Grigorik, "High Performance Browser Networking" (O'Reilly), Chapter 12
- Akamai HTTP/2 performance benchmarks — https://developer.akamai.com/blog
- Chrome 106 Server Push deprecation — https://developer.chrome.com/blog/removing-push

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
- HTTP/2 is verified active (Protocol column shows `h2`) and domain sharding is eliminated.
- Number of TCP connections per origin approaches 1 for HTTP/2-enabled origins.
- Resource loading waterfall shows parallel multiplexed delivery rather than sequential batching.
