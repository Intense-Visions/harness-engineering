# Plan: Performance Engineering — Phase 2 Extended Coverage

**Date:** 2026-04-09
**Spec:** docs/changes/knowledge-skills-wave-2/proposal.md
**Estimated tasks:** 33
**Estimated time:** ~165 minutes

## Goal

Create 31 extended performance engineering knowledge skills covering network performance, caching hierarchies, bundle optimization, image/asset optimization, database query performance, rendering strategies, and advanced topics — then replicate across all 4 platforms.

## Observable Truths (Acceptance Criteria)

1. When `ls agents/skills/claude-code/ | grep "^perf-" | wc -l` is run, 46 directories are listed (15 from Phase 1 + 31 new).
2. When `npx vitest run agents/skills/tests/structure.test.ts` is run, all 31 new skill.yaml files pass SkillMetadataSchema validation.
3. When `npx vitest run agents/skills/tests/structure.test.ts` is run, all 31 new SKILL.md files pass the knowledge-type section check (`## Instructions` required).
4. Each new SKILL.md contains all 7 spec-required sections: `## When to Use`, `## Instructions`, `## Details`, `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`.
5. Each new SKILL.md is 150-250 lines with at least 2 worked examples from real production systems and at least 3 anti-patterns.
6. When `diff -rq agents/skills/claude-code/perf-http2-multiplexing/ agents/skills/gemini-cli/perf-http2-multiplexing/` is run, files are identical (and likewise for all 31 skills across all 4 platforms).
7. Each skill.yaml has its `platforms` field listing all 4 platforms: `claude-code`, `gemini-cli`, `cursor`, `codex`.
8. When `harness validate` is run, validation passes.

## File Map

### CREATE (claude-code) — 62 files in 31 directories

**Network Performance:**

- CREATE agents/skills/claude-code/perf-http2-multiplexing/skill.yaml
- CREATE agents/skills/claude-code/perf-http2-multiplexing/SKILL.md
- CREATE agents/skills/claude-code/perf-http3-quic/skill.yaml
- CREATE agents/skills/claude-code/perf-http3-quic/SKILL.md
- CREATE agents/skills/claude-code/perf-connection-costs/skill.yaml
- CREATE agents/skills/claude-code/perf-connection-costs/SKILL.md
- CREATE agents/skills/claude-code/perf-cdn-strategies/skill.yaml
- CREATE agents/skills/claude-code/perf-cdn-strategies/SKILL.md
- CREATE agents/skills/claude-code/perf-resource-hints/skill.yaml
- CREATE agents/skills/claude-code/perf-resource-hints/SKILL.md
- CREATE agents/skills/claude-code/perf-compression/skill.yaml
- CREATE agents/skills/claude-code/perf-compression/SKILL.md

**Caching Hierarchies:**

- CREATE agents/skills/claude-code/perf-browser-cache/skill.yaml
- CREATE agents/skills/claude-code/perf-browser-cache/SKILL.md
- CREATE agents/skills/claude-code/perf-cdn-cache-control/skill.yaml
- CREATE agents/skills/claude-code/perf-cdn-cache-control/SKILL.md
- CREATE agents/skills/claude-code/perf-server-side-caching/skill.yaml
- CREATE agents/skills/claude-code/perf-server-side-caching/SKILL.md
- CREATE agents/skills/claude-code/perf-cache-invalidation/skill.yaml
- CREATE agents/skills/claude-code/perf-cache-invalidation/SKILL.md

**Bundle Optimization:**

- CREATE agents/skills/claude-code/perf-code-splitting/skill.yaml
- CREATE agents/skills/claude-code/perf-code-splitting/SKILL.md
- CREATE agents/skills/claude-code/perf-tree-shaking/skill.yaml
- CREATE agents/skills/claude-code/perf-tree-shaking/SKILL.md
- CREATE agents/skills/claude-code/perf-lazy-loading/skill.yaml
- CREATE agents/skills/claude-code/perf-lazy-loading/SKILL.md
- CREATE agents/skills/claude-code/perf-module-federation/skill.yaml
- CREATE agents/skills/claude-code/perf-module-federation/SKILL.md
- CREATE agents/skills/claude-code/perf-bundle-analysis/skill.yaml
- CREATE agents/skills/claude-code/perf-bundle-analysis/SKILL.md

**Image and Asset Optimization:**

- CREATE agents/skills/claude-code/perf-image-formats/skill.yaml
- CREATE agents/skills/claude-code/perf-image-formats/SKILL.md
- CREATE agents/skills/claude-code/perf-responsive-images/skill.yaml
- CREATE agents/skills/claude-code/perf-responsive-images/SKILL.md
- CREATE agents/skills/claude-code/perf-lazy-loading-media/skill.yaml
- CREATE agents/skills/claude-code/perf-lazy-loading-media/SKILL.md
- CREATE agents/skills/claude-code/perf-font-loading/skill.yaml
- CREATE agents/skills/claude-code/perf-font-loading/SKILL.md
- CREATE agents/skills/claude-code/perf-svg-optimization/skill.yaml
- CREATE agents/skills/claude-code/perf-svg-optimization/SKILL.md

**Database Query Performance:**

- CREATE agents/skills/claude-code/perf-query-optimization/skill.yaml
- CREATE agents/skills/claude-code/perf-query-optimization/SKILL.md
- CREATE agents/skills/claude-code/perf-n-plus-one/skill.yaml
- CREATE agents/skills/claude-code/perf-n-plus-one/SKILL.md
- CREATE agents/skills/claude-code/perf-connection-pooling/skill.yaml
- CREATE agents/skills/claude-code/perf-connection-pooling/SKILL.md
- CREATE agents/skills/claude-code/perf-index-strategies/skill.yaml
- CREATE agents/skills/claude-code/perf-index-strategies/SKILL.md

**Rendering Strategies:**

- CREATE agents/skills/claude-code/perf-server-side-rendering/skill.yaml
- CREATE agents/skills/claude-code/perf-server-side-rendering/SKILL.md
- CREATE agents/skills/claude-code/perf-client-side-rendering/skill.yaml
- CREATE agents/skills/claude-code/perf-client-side-rendering/SKILL.md
- CREATE agents/skills/claude-code/perf-static-generation/skill.yaml
- CREATE agents/skills/claude-code/perf-static-generation/SKILL.md
- CREATE agents/skills/claude-code/perf-streaming-rendering/skill.yaml
- CREATE agents/skills/claude-code/perf-streaming-rendering/SKILL.md
- CREATE agents/skills/claude-code/perf-edge-rendering/skill.yaml
- CREATE agents/skills/claude-code/perf-edge-rendering/SKILL.md

**Advanced:**

- CREATE agents/skills/claude-code/perf-web-workers/skill.yaml
- CREATE agents/skills/claude-code/perf-web-workers/SKILL.md
- CREATE agents/skills/claude-code/perf-service-worker-caching/skill.yaml
- CREATE agents/skills/claude-code/perf-service-worker-caching/SKILL.md

### CREATE (platform replicas) — 186 files in 93 directories

- CREATE agents/skills/gemini-cli/perf-{name}/skill.yaml (31 files)
- CREATE agents/skills/gemini-cli/perf-{name}/SKILL.md (31 files)
- CREATE agents/skills/cursor/perf-{name}/skill.yaml (31 files)
- CREATE agents/skills/cursor/perf-{name}/SKILL.md (31 files)
- CREATE agents/skills/codex/perf-{name}/skill.yaml (31 files)
- CREATE agents/skills/codex/perf-{name}/SKILL.md (31 files)

**Total: 248 files in 124 directories.**

## Skeleton

1. Network Performance skills in claude-code (~6 tasks, ~30 min)
2. Caching Hierarchies skills in claude-code (~4 tasks, ~20 min)
3. Bundle Optimization skills in claude-code (~5 tasks, ~25 min)
4. Image and Asset Optimization skills in claude-code (~5 tasks, ~25 min)
5. Database Query Performance skills in claude-code (~4 tasks, ~20 min)
6. Rendering Strategies skills in claude-code (~5 tasks, ~25 min)
7. Advanced skills in claude-code (~2 tasks, ~10 min)
8. Platform replication (~1 task, ~5 min)
9. Validation (~1 task, ~5 min)

**Estimated total:** 33 tasks, ~165 minutes

---

## Shared Patterns

### skill.yaml Template

Every skill.yaml in this plan follows the same structure. Only these fields vary per skill:

- `name` — the skill directory name
- `description` — one-line description
- `related_skills` — domain-specific cross-references
- `keywords` — domain-specific terms for dispatcher scoring

All other fields are constant:

```yaml
version: '1.0.0'
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
stack_signals: []
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

### SKILL.md Template

Every SKILL.md follows the established Wave 1 structure. Required sections:

1. `# <Title>` — h1 heading
2. `> <description>` — blockquote subtitle
3. `## When to Use` — 8-10 bullet points describing trigger scenarios
4. `## Instructions` — numbered procedural steps with code examples
5. `## Details` — sub-topics, anti-patterns, real-world examples with specific metrics
6. `## Source` — authoritative references (RFCs, W3C specs, Chrome docs, research papers)
7. `## Process` — standard 3-step process block
8. `## Harness Integration` — standard knowledge integration block
9. `## Success Criteria` — measurable criteria

Each SKILL.md must be **150-250 lines**, include **at least 2 worked examples** from real production systems with specific metrics, and include **at least 3 anti-patterns**.

### SKILL.md Content Quality Requirements

- **No "use your judgment"** — every principle includes concrete decision procedures with thresholds
- **Framework-agnostic** — teach the underlying protocol/runtime/database model, not framework specifics
- **PhD-level rigor, practitioner-level accessibility** — include protocol internals, algorithm complexity, system architecture details
- **Specific values** — not "improve performance" but "Pinterest reduced wait time by 40% and saw 15% increase in SEO traffic after optimizing load time by 1 second"
- **Anti-patterns describe what bad looks like** — with specific code patterns, measurable impact, and how to detect

### Standard Process Block (identical in every SKILL.md)

```markdown
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
```

Each Success Criteria section should also include 2-3 domain-specific measurable criteria relevant to the skill topic.

### Cross-reference Pool

These existing skills should be referenced in `related_skills` where relevant:

**Phase 1 perf skills (always prefer cross-referencing within the perf domain):**

- `perf-critical-rendering-path`, `perf-dom-parsing`, `perf-style-calculation`, `perf-layout-reflow`, `perf-paint-compositing`
- `perf-largest-contentful-paint`, `perf-interaction-to-next-paint`, `perf-cumulative-layout-shift`
- `perf-event-loop`, `perf-long-tasks`, `perf-garbage-collection`
- `perf-memory-leaks`, `perf-heap-profiling`
- `perf-performance-api`, `perf-profiling-methodology`

**Existing framework-specific skills:**

- `css-performance-patterns` — CSS perf (reference from rendering, bundle, asset skills)
- `node-performance-profiling` — Node.js profiling (reference from SSR, DB, caching skills)
- `ts-performance-patterns` — TypeScript perf (reference from bundle skills)
- `angular-performance-patterns` — Angular perf (reference from rendering skills)
- `mobile-performance-patterns` — Mobile perf (reference from image, rendering skills)
- `test-performance-testing` — Perf testing (reference from all categories)
- `otel-performance-insights` — Observability (reference from network, caching, DB skills)
- `svelte-performance-patterns` — Svelte perf (reference from rendering skills)
- `graphql-performance-patterns` — GraphQL perf (reference from DB, caching skills)
- `prisma-performance-patterns` — Prisma perf (reference from DB skills)
- `drizzle-performance-patterns` — Drizzle perf (reference from DB skills)

---

## Tasks

### Task 1: perf-http2-multiplexing

**Depends on:** none
**Files:** agents/skills/claude-code/perf-http2-multiplexing/skill.yaml, agents/skills/claude-code/perf-http2-multiplexing/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-http2-multiplexing`

2. Create `agents/skills/claude-code/perf-http2-multiplexing/skill.yaml`:

```yaml
name: perf-http2-multiplexing
version: '1.0.0'
description: HTTP/2 stream multiplexing — concurrent requests, server push, prioritization, and head-of-line blocking mitigation
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-http3-quic
  - perf-connection-costs
  - perf-cdn-strategies
  - perf-resource-hints
  - perf-critical-rendering-path
stack_signals: []
keywords:
  - http2
  - multiplexing
  - streams
  - server push
  - hpack
  - head-of-line blocking
  - connection coalescing
  - binary framing
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-http2-multiplexing/SKILL.md` (150-250 lines):
   - Cover: HTTP/2 binary framing layer, stream multiplexing over single TCP connection, stream priorities and weight-based allocation, HPACK header compression, server push mechanics and when to avoid it, connection coalescing, head-of-line blocking at TCP level
   - Worked examples: How Akamai measured 8x improvement in page load under high-latency conditions by enabling HTTP/2 multiplexing (reduced connections from 6 per origin to 1), how Etsy migrated to HTTP/2 and reduced median page load by 13% by eliminating domain sharding
   - Anti-patterns: domain sharding with HTTP/2 (splits the multiplexed connection, negates benefits), overly aggressive server push that wastes bandwidth on cached resources, bundling all CSS/JS into single files (HTTP/2 makes fine-grained splitting viable), not setting stream priorities (browser heuristics may deprioritize critical resources)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-http2-multiplexing knowledge skill`

---

### Task 2: perf-http3-quic

**Depends on:** none
**Files:** agents/skills/claude-code/perf-http3-quic/skill.yaml, agents/skills/claude-code/perf-http3-quic/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-http3-quic`

2. Create `agents/skills/claude-code/perf-http3-quic/skill.yaml`:

```yaml
name: perf-http3-quic
version: '1.0.0'
description: HTTP/3 and QUIC protocol — 0-RTT connections, connection migration, stream-level flow control, and UDP-based transport
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-http2-multiplexing
  - perf-connection-costs
  - perf-cdn-strategies
  - perf-compression
stack_signals: []
keywords:
  - http3
  - quic
  - 0-rtt
  - connection migration
  - udp transport
  - stream multiplexing
  - congestion control
  - tls 1.3
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-http3-quic/SKILL.md` (150-250 lines):
   - Cover: QUIC transport built on UDP, 0-RTT connection establishment (vs 2-3 RTT for TCP+TLS 1.2), connection migration across network changes (mobile WiFi to cellular), stream-level head-of-line blocking elimination, built-in TLS 1.3, congestion control (Cubic, BBR), QPACK header compression
   - Worked examples: How Google saw 8% reduction in search latency globally after deploying QUIC (particularly impactful in high-latency regions like India), how Cloudflare measured 12.4% improvement in time-to-first-byte for HTTP/3 vs HTTP/2 connections on mobile networks
   - Anti-patterns: assuming HTTP/3 is universally available (UDP blocked by some firewalls, need HTTP/2 fallback via Alt-Svc), not configuring 0-RTT replay protection (opens replay attack surface), ignoring connection migration benefits for mobile-heavy traffic, serving HTTP/3 without also optimizing TLS certificate chain

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-http3-quic knowledge skill`

---

### Task 3: perf-connection-costs

**Depends on:** none
**Files:** agents/skills/claude-code/perf-connection-costs/skill.yaml, agents/skills/claude-code/perf-connection-costs/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-connection-costs`

2. Create `agents/skills/claude-code/perf-connection-costs/skill.yaml`:

```yaml
name: perf-connection-costs
version: '1.0.0'
description: Network connection overhead — DNS resolution, TCP handshake, TLS negotiation, connection reuse, and keep-alive strategies
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-http2-multiplexing
  - perf-http3-quic
  - perf-resource-hints
  - perf-cdn-strategies
  - perf-critical-rendering-path
  - node-performance-profiling
stack_signals: []
keywords:
  - dns resolution
  - tcp handshake
  - tls negotiation
  - connection reuse
  - keep-alive
  - time to first byte
  - ttfb
  - ssl certificate
  - connection pooling
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-connection-costs/SKILL.md` (150-250 lines):
   - Cover: DNS resolution (recursive + iterative lookups, DNS-over-HTTPS), TCP 3-way handshake cost (~1 RTT), TLS 1.2 (2 RTT) vs TLS 1.3 (1 RTT) negotiation, connection reuse and HTTP keep-alive, connection prewarming, OCSP stapling, certificate chain optimization, TCP slow start and initial congestion window (initcwnd)
   - Worked examples: How LinkedIn reduced TTFB by 50% by preconnecting to third-party origins and increasing their initcwnd to 10 segments, how Yahoo measured DNS lookup times averaging 20-120ms globally and reduced them by 70% with DNS prefetching and reduced unique origins from 12 to 4
   - Anti-patterns: connecting to too many unique origins (each incurs full DNS+TCP+TLS cost), oversized TLS certificate chains (>3KB adds extra RTTs), not enabling TLS session resumption (full handshake every time), relying on DNS TTL alone without dns-prefetch hints

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-connection-costs knowledge skill`

---

### Task 4: perf-cdn-strategies

**Depends on:** none
**Files:** agents/skills/claude-code/perf-cdn-strategies/skill.yaml, agents/skills/claude-code/perf-cdn-strategies/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-cdn-strategies`

2. Create `agents/skills/claude-code/perf-cdn-strategies/skill.yaml`:

```yaml
name: perf-cdn-strategies
version: '1.0.0'
description: CDN architecture — edge caching, origin shielding, cache tiers, edge compute, and multi-CDN strategies
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-cdn-cache-control
  - perf-browser-cache
  - perf-connection-costs
  - perf-compression
  - perf-edge-rendering
  - otel-performance-insights
stack_signals: []
keywords:
  - cdn
  - edge caching
  - origin shielding
  - cache tier
  - edge compute
  - pop
  - anycast
  - multi-cdn
  - cache hit ratio
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-cdn-strategies/SKILL.md` (150-250 lines):
   - Cover: CDN architecture (PoPs, anycast routing, tiered caching), origin shielding to reduce origin load, cache hit ratio optimization (target >95%), edge compute patterns (Cloudflare Workers, Lambda@Edge, Deno Deploy), multi-CDN strategies and DNS-based routing, cache warming, geographic routing vs latency-based routing
   - Worked examples: How Netflix serves 125 million hours of video daily by deploying Open Connect CDN appliances directly in ISP networks (reducing internet transit traffic by 70%), how The Guardian improved FCP by 1.2 seconds by moving from a single-origin architecture to a CDN-first architecture with edge-side includes
   - Anti-patterns: caching personalized content at the CDN edge without vary headers (serving user A's data to user B), not configuring origin shielding (every edge miss hits origin, creating thundering herd on cache expiry), setting short TTLs globally instead of tiered TTLs by content type, ignoring CDN cache key design (query params, cookies bloating keys)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-cdn-strategies knowledge skill`

---

### Task 5: perf-resource-hints

**Depends on:** none
**Files:** agents/skills/claude-code/perf-resource-hints/skill.yaml, agents/skills/claude-code/perf-resource-hints/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-resource-hints`

2. Create `agents/skills/claude-code/perf-resource-hints/skill.yaml`:

```yaml
name: perf-resource-hints
version: '1.0.0'
description: Resource hints — preload, prefetch, preconnect, dns-prefetch, modulepreload, and fetchpriority for optimal resource loading
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-connection-costs
  - perf-critical-rendering-path
  - perf-largest-contentful-paint
  - perf-lazy-loading
  - perf-font-loading
  - css-performance-patterns
stack_signals: []
keywords:
  - preload
  - prefetch
  - preconnect
  - dns-prefetch
  - modulepreload
  - fetchpriority
  - resource hints
  - early hints
  - 103 early hints
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-resource-hints/SKILL.md` (150-250 lines):
   - Cover: dns-prefetch (resolve DNS early), preconnect (DNS+TCP+TLS early), preload (fetch critical resources with `as` attribute for correct priority), prefetch (low-priority fetch for next navigation), modulepreload (preload ES modules including dependencies), fetchpriority attribute (high/low/auto), 103 Early Hints (server sends hints before full response), speculation rules API for prerendering
   - Worked examples: How Shopify improved LCP by 1.3 seconds by adding preload for hero images and preconnect to their CDN origin, how Wikipedia reduced page load time by 300ms by using dns-prefetch for all external origins and preload for critical fonts
   - Anti-patterns: preloading everything (saturates bandwidth, delays actually critical resources), preload without `as` attribute (browser cannot set correct priority), using prefetch for current-page resources (prefetch is for future navigations), too many preconnect hints (>6 origins creates diminishing returns from socket exhaustion)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-resource-hints knowledge skill`

---

### Task 6: perf-compression

**Depends on:** none
**Files:** agents/skills/claude-code/perf-compression/skill.yaml, agents/skills/claude-code/perf-compression/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-compression`

2. Create `agents/skills/claude-code/perf-compression/skill.yaml`:

```yaml
name: perf-compression
version: '1.0.0'
description: Content compression — Brotli vs gzip comparison, compression levels, content-encoding negotiation, and static vs dynamic compression
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-cdn-strategies
  - perf-http2-multiplexing
  - perf-bundle-analysis
  - perf-cdn-cache-control
stack_signals: []
keywords:
  - brotli
  - gzip
  - compression
  - content-encoding
  - transfer size
  - zstd
  - deflate
  - compression ratio
  - static compression
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-compression/SKILL.md` (150-250 lines):
   - Cover: gzip (deflate algorithm, ubiquitous support, compression levels 1-9), Brotli (15-26% better compression than gzip on text, levels 0-11, built-in dictionary for web content), Zstandard (emerging, excellent compression/speed ratio), content-encoding negotiation via Accept-Encoding, static pre-compression vs dynamic on-the-fly compression, what to compress (text: HTML/CSS/JS/JSON/SVG, skip: images/video already compressed), compression level selection tradeoffs
   - Worked examples: How LinkedIn reduced transfer sizes by 20% by switching from gzip-6 to Brotli-5 for static assets (with Brotli-11 for build-time pre-compressed files), how Cloudflare reported that Brotli-4 outperforms gzip-9 in both compression ratio and CPU time for typical web content
   - Anti-patterns: compressing already-compressed formats (JPEG, PNG, MP4 — adds CPU cost with near-zero size reduction), using maximum Brotli level (11) for dynamic responses (100x slower than level 4, inappropriate for real-time compression), not setting Vary: Accept-Encoding (CDN serves Brotli to clients that only understand gzip), compressing responses under 1KB (overhead of compression metadata exceeds savings)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-compression knowledge skill`

---

### Task 7: perf-browser-cache

**Depends on:** none
**Files:** agents/skills/claude-code/perf-browser-cache/skill.yaml, agents/skills/claude-code/perf-browser-cache/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-browser-cache`

2. Create `agents/skills/claude-code/perf-browser-cache/skill.yaml`:

```yaml
name: perf-browser-cache
version: '1.0.0'
description: Browser caching — Cache-Control directives, ETag validation, immutable assets, stale-while-revalidate, and cache partitioning
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-cdn-cache-control
  - perf-cache-invalidation
  - perf-service-worker-caching
  - perf-cdn-strategies
  - perf-compression
stack_signals: []
keywords:
  - cache-control
  - etag
  - immutable
  - stale-while-revalidate
  - max-age
  - browser cache
  - cache partitioning
  - conditional request
  - 304 not modified
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-browser-cache/SKILL.md` (150-250 lines):
   - Cover: Cache-Control directives (max-age, no-cache, no-store, public, private, must-revalidate, immutable, stale-while-revalidate, stale-if-error), ETag and Last-Modified validation (conditional requests, 304 Not Modified), hashed filenames for cache-busting (content-addressable), cache partitioning in modern browsers (top-level site isolation), HTTP cache layers (memory cache, disk cache, push cache), cache storage limits and eviction
   - Worked examples: How Twitter serves static assets with `Cache-Control: public, max-age=31536000, immutable` using content-hashed filenames (e.g., main.a1b2c3d4.js), eliminating revalidation requests entirely on repeat visits, how The Financial Times achieved 95% cache hit rates by implementing stale-while-revalidate with 1-hour stale window plus background refresh
   - Anti-patterns: using no-cache when you mean no-store (no-cache still caches, just revalidates every time), setting short max-age on versioned assets (hashed filenames make long max-age safe), forgetting Vary header with content negotiation (cache serves wrong encoding/language), relying on query string cache busting (?v=123) instead of filename hashing (some CDNs ignore query strings)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-browser-cache knowledge skill`

---

### Task 8: perf-cdn-cache-control

**Depends on:** none
**Files:** agents/skills/claude-code/perf-cdn-cache-control/skill.yaml, agents/skills/claude-code/perf-cdn-cache-control/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-cdn-cache-control`

2. Create `agents/skills/claude-code/perf-cdn-cache-control/skill.yaml`:

```yaml
name: perf-cdn-cache-control
version: '1.0.0'
description: CDN cache control — cache keys, Vary header strategies, surrogate control, cache purging, and edge TTL management
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-browser-cache
  - perf-cdn-strategies
  - perf-cache-invalidation
  - perf-compression
  - otel-performance-insights
stack_signals: []
keywords:
  - cdn cache
  - cache key
  - vary header
  - surrogate-control
  - cache purge
  - edge ttl
  - s-maxage
  - cache tag
  - instant purge
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-cdn-cache-control/SKILL.md` (150-250 lines):
   - Cover: s-maxage vs max-age (CDN TTL vs browser TTL), Surrogate-Control header (CDN-specific directives), cache key composition (URL, headers, cookies, custom keys), Vary header impact on cache fragmentation, cache purging strategies (instant purge, tag-based purge, soft purge), stale-while-revalidate at CDN level, edge-side includes (ESI) for partial caching, cache warming after purge
   - Worked examples: How Fastly uses Surrogate-Key headers enabling tag-based instant purge (The New York Times purges article caches in <150ms when content updates), how Varnish-based CDN configurations at scale use grace mode to serve stale content during origin failures while Shopify handles 80k requests/second during flash sales
   - Anti-patterns: Vary: \* (disables caching entirely), including Cookie in cache key for public content (creates per-user cache entries), purging entire cache instead of targeted paths (cache stampede on origin), not separating browser TTL from CDN TTL (s-maxage allows different edge retention)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-cdn-cache-control knowledge skill`

---

### Task 9: perf-server-side-caching

**Depends on:** none
**Files:** agents/skills/claude-code/perf-server-side-caching/skill.yaml, agents/skills/claude-code/perf-server-side-caching/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-server-side-caching`

2. Create `agents/skills/claude-code/perf-server-side-caching/skill.yaml`:

```yaml
name: perf-server-side-caching
version: '1.0.0'
description: Server-side caching — Redis, Memcached, application-level caching patterns, cache-aside, write-through, and read-through strategies
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-cache-invalidation
  - perf-browser-cache
  - perf-cdn-cache-control
  - perf-connection-pooling
  - perf-query-optimization
  - node-performance-profiling
stack_signals: []
keywords:
  - redis
  - memcached
  - cache-aside
  - write-through
  - read-through
  - write-behind
  - application cache
  - distributed cache
  - cache warming
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-server-side-caching/SKILL.md` (150-250 lines):
   - Cover: cache-aside (lazy loading) pattern, read-through and write-through patterns, write-behind (write-back) for write-heavy workloads, Redis vs Memcached tradeoffs (data structures vs simplicity, persistence vs pure cache), cache serialization formats (JSON, MessagePack, Protocol Buffers), distributed cache consistency, cache warming strategies, multi-tier caching (L1 in-process, L2 distributed)
   - Worked examples: How Instagram uses Redis for caching user timelines, storing 300 million user sessions with <1ms read latency using consistent hashing across a Redis cluster, how GitHub reduced database load by 50% by implementing a multi-tier caching strategy (per-process LRU cache + Redis + CDN) for repository metadata
   - Anti-patterns: caching without TTL (stale data grows unbounded, eventually consumes all memory), serializing entire ORM objects (bloated cache entries, includes metadata and relations not needed), using cache as primary data store without persistence (data loss on restart), not handling cache failures gracefully (cascade failure when cache is down)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-server-side-caching knowledge skill`

---

### Task 10: perf-cache-invalidation

**Depends on:** none
**Files:** agents/skills/claude-code/perf-cache-invalidation/skill.yaml, agents/skills/claude-code/perf-cache-invalidation/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-cache-invalidation`

2. Create `agents/skills/claude-code/perf-cache-invalidation/skill.yaml`:

```yaml
name: perf-cache-invalidation
version: '1.0.0'
description: Cache invalidation — TTL strategies, event-driven invalidation, cache stampede prevention, and versioned cache keys
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-server-side-caching
  - perf-browser-cache
  - perf-cdn-cache-control
  - perf-cdn-strategies
stack_signals: []
keywords:
  - cache invalidation
  - ttl
  - cache stampede
  - thundering herd
  - event-driven invalidation
  - versioned keys
  - cache warming
  - probabilistic early expiration
  - lock-based invalidation
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-cache-invalidation/SKILL.md` (150-250 lines):
   - Cover: TTL-based expiration (time-based, simple but potentially stale), event-driven invalidation (publish cache-bust on data change), versioned cache keys (include data version in key), cache stampede/thundering herd problem (many requests hit origin simultaneously on expiry), stampede prevention techniques (lock-based recomputation, probabilistic early expiration/XFetch algorithm, stale-while-revalidate), fan-out invalidation for denormalized caches, eventual consistency tradeoffs
   - Worked examples: How Facebook implements lease-based cache invalidation in Memcache — when a cache miss occurs, the client receives a lease token and only the lease holder recomputes, preventing stampede (described in their "Scaling Memcache at Facebook" paper), how Stripe uses versioned cache keys with monotonically increasing generation numbers so cache invalidation is a metadata update rather than a purge operation
   - Anti-patterns: invalidating by deleting without stampede protection (first delete triggers N concurrent recomputations), using wallclock-based TTLs without jitter (all entries expire simultaneously), invalidating parent caches without invalidating derived/denormalized caches (stale downstream data), fire-and-forget invalidation without confirmation (network drops silently leave stale entries)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-cache-invalidation knowledge skill`

---

### Task 11: perf-code-splitting

**Depends on:** none
**Files:** agents/skills/claude-code/perf-code-splitting/skill.yaml, agents/skills/claude-code/perf-code-splitting/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-code-splitting`

2. Create `agents/skills/claude-code/perf-code-splitting/skill.yaml`:

```yaml
name: perf-code-splitting
version: '1.0.0'
description: Code splitting — route-based, component-based, and vendor splitting with dynamic imports for optimal chunk delivery
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-tree-shaking
  - perf-lazy-loading
  - perf-bundle-analysis
  - perf-module-federation
  - perf-http2-multiplexing
  - ts-performance-patterns
stack_signals: []
keywords:
  - code splitting
  - dynamic import
  - route splitting
  - vendor chunk
  - chunk strategy
  - webpack splitchunks
  - lazy route
  - entry point
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-code-splitting/SKILL.md` (150-250 lines):
   - Cover: dynamic import() syntax, route-based splitting (each page is a separate chunk), component-based splitting (heavy components loaded on demand), vendor splitting (separate node_modules into stable chunks for long-term caching), Webpack SplitChunksPlugin configuration, Rollup manualChunks, chunk naming and deterministic chunk hashes, prefetching split chunks on link hover, waterfall avoidance with parallel chunk loading
   - Worked examples: How Airbnb reduced their initial JS payload from 1.1MB to 300KB by implementing route-based code splitting with aggressive prefetching, improving TTI by 2.5 seconds on 3G, how Notion split their monolithic 4MB bundle into 50+ chunks and used intersection-observer-based prefetching to load upcoming route chunks before navigation
   - Anti-patterns: splitting too granularly (100+ tiny chunks cause HTTP overhead even with HTTP/2), not splitting vendor code (app code changes invalidate vendor cache), dynamic imports inside hot loops (creates new chunk requests on each iteration), splitting without prefetch strategy (navigation creates visible loading delay)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-code-splitting knowledge skill`

---

### Task 12: perf-tree-shaking

**Depends on:** none
**Files:** agents/skills/claude-code/perf-tree-shaking/skill.yaml, agents/skills/claude-code/perf-tree-shaking/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-tree-shaking`

2. Create `agents/skills/claude-code/perf-tree-shaking/skill.yaml`:

```yaml
name: perf-tree-shaking
version: '1.0.0'
description: Tree shaking — dead code elimination via ESM static analysis, sideEffects flag, and module-level optimization
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-code-splitting
  - perf-bundle-analysis
  - perf-lazy-loading
  - ts-performance-patterns
stack_signals: []
keywords:
  - tree shaking
  - dead code elimination
  - sideEffects
  - esm
  - unused exports
  - module optimization
  - barrel files
  - pure annotation
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-tree-shaking/SKILL.md` (150-250 lines):
   - Cover: ESM static structure enabling static analysis (import/export at top level), how bundlers mark unused exports for removal, package.json sideEffects field (false = pure module, array = specific side-effect files), /_#**PURE**_/ annotation for function calls, barrel file problem (re-exporting everything defeats tree shaking), CommonJS vs ESM (CJS is dynamic, cannot be tree-shaken), Webpack usedExports optimization, Rollup's superior tree shaking via ESM-native approach
   - Worked examples: How Material UI v5 reduced bundle impact by 80% by restructuring from barrel exports to direct imports (from `import { Button } from '@mui/material'` pulling 200KB to direct path imports pulling 20KB), how Lodash-es enables tree shaking while lodash CJS pulls the entire 70KB library for a single function
   - Anti-patterns: barrel files that re-export entire modules (import from index.ts pulls everything), libraries without sideEffects: false (bundler assumes all code has side effects, keeps everything), mixing CJS require() with ESM imports (breaks static analysis), class-based patterns that prevent tree shaking (class methods cannot be individually eliminated)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-tree-shaking knowledge skill`

---

### Task 13: perf-lazy-loading

**Depends on:** none
**Files:** agents/skills/claude-code/perf-lazy-loading/skill.yaml, agents/skills/claude-code/perf-lazy-loading/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-lazy-loading`

2. Create `agents/skills/claude-code/perf-lazy-loading/skill.yaml`:

```yaml
name: perf-lazy-loading
version: '1.0.0'
description: Lazy loading — Intersection Observer-based loading, route-level and component-level lazy loading, and prefetch strategies
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-code-splitting
  - perf-lazy-loading-media
  - perf-resource-hints
  - perf-largest-contentful-paint
  - perf-interaction-to-next-paint
stack_signals: []
keywords:
  - lazy loading
  - intersection observer
  - dynamic import
  - route lazy loading
  - component lazy loading
  - prefetch
  - suspense
  - loading boundary
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-lazy-loading/SKILL.md` (150-250 lines):
   - Cover: Intersection Observer API for viewport-triggered loading, route-level lazy loading (React.lazy, Vue async components, Angular loadChildren), component-level lazy loading for heavy widgets (charts, editors, maps), loading boundaries and fallback UIs (React Suspense, skeleton screens), prefetching strategies (on hover, on idle, on viewport proximity), critical vs non-critical content separation, JavaScript module lazy loading via dynamic import()
   - Worked examples: How Pinterest improved initial page load by 40% by lazy loading below-the-fold pin boards using Intersection Observer with 200px rootMargin for pre-loading before scroll reaches them, how Slack lazy loads heavy features (code blocks with syntax highlighting, file previews) on first interaction, reducing initial bundle from 2.1MB to 800KB
   - Anti-patterns: lazy loading above-the-fold content (delays LCP, the opposite of the goal), not providing loading fallbacks (content pops in causing layout shift, hurting CLS), lazy loading critical navigation or header components (visible delay on every page load), excessive loading boundaries (50 Suspense wrappers create waterfall of sequential loads)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-lazy-loading knowledge skill`

---

### Task 14: perf-module-federation

**Depends on:** none
**Files:** agents/skills/claude-code/perf-module-federation/skill.yaml, agents/skills/claude-code/perf-module-federation/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-module-federation`

2. Create `agents/skills/claude-code/perf-module-federation/skill.yaml`:

```yaml
name: perf-module-federation
version: '1.0.0'
description: Module federation — micro-frontend runtime sharing, version negotiation, shared dependency management, and federation performance patterns
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-code-splitting
  - perf-lazy-loading
  - perf-bundle-analysis
  - perf-http2-multiplexing
stack_signals: []
keywords:
  - module federation
  - micro-frontend
  - runtime sharing
  - shared dependencies
  - remote modules
  - webpack federation
  - version negotiation
  - dynamic remotes
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-module-federation/SKILL.md` (150-250 lines):
   - Cover: Webpack Module Federation architecture (host, remote, shared concepts), runtime module loading vs build-time bundling, shared dependency version negotiation (singleton, requiredVersion, eager), dynamic remote loading, federation performance implications (additional network requests for remote entry, initialization waterfall), Vite federation plugins, import map-based federation alternatives, shared state management across federated modules
   - Worked examples: How IKEA uses Module Federation to split their e-commerce platform into 5 independently deployed micro-frontends sharing React and design system libraries (reducing total download by 40% vs duplicated dependencies), how Spotify's web player uses micro-frontends that share a common audio playback engine via runtime federation
   - Anti-patterns: sharing too many dependencies as singletons (version conflicts break at runtime, not build time), not eager-loading critical shared deps (lazy shared initialization adds 200-500ms), duplicating large libraries across remotes (React loaded 3 times = 300KB+ wasted), not versioning remote entry points (cached stale entry files load wrong module versions)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-module-federation knowledge skill`

---

### Task 15: perf-bundle-analysis

**Depends on:** none
**Files:** agents/skills/claude-code/perf-bundle-analysis/skill.yaml, agents/skills/claude-code/perf-bundle-analysis/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-bundle-analysis`

2. Create `agents/skills/claude-code/perf-bundle-analysis/skill.yaml`:

```yaml
name: perf-bundle-analysis
version: '1.0.0'
description: Bundle analysis — visualization tools, size budgets, dependency cost awareness, and CI-integrated size tracking
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-code-splitting
  - perf-tree-shaking
  - perf-compression
  - perf-lazy-loading
  - test-performance-testing
stack_signals: []
keywords:
  - bundle analysis
  - webpack-bundle-analyzer
  - size budget
  - bundle size
  - dependency cost
  - source-map-explorer
  - bundlephobia
  - performance budget
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-bundle-analysis/SKILL.md` (150-250 lines):
   - Cover: webpack-bundle-analyzer (treemap visualization of chunk composition), source-map-explorer (source map based analysis), bundlephobia for npm package cost awareness, performance budgets in CI (bundlesize, size-limit), Lighthouse performance budgets, tracking bundle size over time (PR checks, size regression alerts), identifying duplicate dependencies, analyzing parse/compile cost (not just transfer size), gzip vs raw size metrics
   - Worked examples: How Zillow used webpack-bundle-analyzer to discover that moment.js (330KB) with all locales was included and replaced it with day.js (2KB), reducing bundle by 66KB gzipped, how Walmart implemented size-limit in CI with a 200KB JS budget per route and caught a PR that would have added 150KB of unused polyfills
   - Anti-patterns: only measuring transfer size (ignoring parse/compile time — a 100KB JS file takes 50-100ms to parse on mid-range mobile), not having a budget (bundle size creeps 5-10KB per sprint without guardrails), measuring total bundle instead of per-route (a 2MB total bundle is fine if initial route loads 150KB), checking bundle size only in production builds (missing development-only code that leaks through)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-bundle-analysis knowledge skill`

---

### Task 16: perf-image-formats

**Depends on:** none
**Files:** agents/skills/claude-code/perf-image-formats/skill.yaml, agents/skills/claude-code/perf-image-formats/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-image-formats`

2. Create `agents/skills/claude-code/perf-image-formats/skill.yaml`:

```yaml
name: perf-image-formats
version: '1.0.0'
description: Image formats — WebP, AVIF, JPEG XL comparison, format selection decision tree, and quality/size tradeoffs
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-responsive-images
  - perf-lazy-loading-media
  - perf-compression
  - perf-cdn-strategies
  - perf-largest-contentful-paint
  - css-performance-patterns
stack_signals: []
keywords:
  - webp
  - avif
  - jpeg xl
  - image format
  - lossy compression
  - lossless compression
  - image optimization
  - format selection
  - image quality
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-image-formats/SKILL.md` (150-250 lines):
   - Cover: JPEG (lossy, universally supported, good for photos), PNG (lossless, transparency, good for graphics), WebP (25-34% smaller than JPEG at equivalent quality, supports transparency and animation, 97% browser support), AVIF (50% smaller than JPEG, excellent quality at low bitrates, slower encode, 92% browser support), JPEG XL (progressive decode, lossless JPEG recompression, limited browser support), format selection decision tree (photo vs graphic, transparency needed, animation, browser support constraints), quality settings and SSIM/DSSIM metrics
   - Worked examples: How Netflix improved image-heavy pages by adopting AVIF for title card images, achieving 50% file size reduction vs JPEG at SSIM 0.95 (saving ~40TB of daily bandwidth), how eBay migrated product images from JPEG to WebP using content negotiation via Accept header, reducing image payload by 30% and improving LCP by 500ms on product pages
   - Anti-patterns: serving a single format to all browsers (not using picture element or Accept-based negotiation), using lossless PNG for photographs (10x larger than lossy JPEG with no perceptible quality gain), re-encoding already lossy images (JPEG to WebP conversion of a q=60 JPEG adds artifacts), choosing AVIF for images that need instant decode (encode/decode is slower, impacts LCP for hero images on slow devices)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-image-formats knowledge skill`

---

### Task 17: perf-responsive-images

**Depends on:** none
**Files:** agents/skills/claude-code/perf-responsive-images/skill.yaml, agents/skills/claude-code/perf-responsive-images/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-responsive-images`

2. Create `agents/skills/claude-code/perf-responsive-images/skill.yaml`:

```yaml
name: perf-responsive-images
version: '1.0.0'
description: Responsive images — srcset, sizes attributes, picture element, art direction, and resolution switching for optimal delivery
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-image-formats
  - perf-lazy-loading-media
  - perf-largest-contentful-paint
  - perf-cumulative-layout-shift
  - mobile-performance-patterns
stack_signals: []
keywords:
  - srcset
  - sizes attribute
  - picture element
  - art direction
  - resolution switching
  - responsive images
  - image cdn
  - device pixel ratio
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-responsive-images/SKILL.md` (150-250 lines):
   - Cover: srcset with width descriptors (w) for resolution switching, sizes attribute for layout-width hints, srcset with pixel density descriptors (x) for DPR-based selection, picture element for art direction and format negotiation, image CDNs (Cloudinary, imgix, Cloudflare Image Resizing) for on-demand transforms, width/height attributes for aspect ratio preservation (CLS prevention), content-negotiation via Accept header (server-side format selection)
   - Worked examples: How The Guardian reduced image bytes by 62% by implementing srcset with 6 size variants (200w to 2000w) combined with sizes attribute matching their CSS grid breakpoints, how Unsplash delivers images via imgix CDN with URL-based transforms (`?w=800&fm=webp&q=75`) allowing infinite responsive variants without pre-generating files
   - Anti-patterns: serving desktop-sized images to mobile devices (a 2000px hero image on a 375px phone wastes 80% of downloaded bytes), using only DPR-based srcset without sizes (browser cannot select optimal width), missing width/height attributes (causes layout shift as image loads), not accounting for art direction (cropping a wide landscape to a narrow portrait may lose the subject)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-responsive-images knowledge skill`

---

### Task 18: perf-lazy-loading-media

**Depends on:** none
**Files:** agents/skills/claude-code/perf-lazy-loading-media/skill.yaml, agents/skills/claude-code/perf-lazy-loading-media/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-lazy-loading-media`

2. Create `agents/skills/claude-code/perf-lazy-loading-media/skill.yaml`:

```yaml
name: perf-lazy-loading-media
version: '1.0.0'
description: Media lazy loading — native loading attribute, video poster frames, placeholder strategies (LQIP, BlurHash, dominant color), and iframe deferral
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-lazy-loading
  - perf-responsive-images
  - perf-image-formats
  - perf-largest-contentful-paint
  - perf-cumulative-layout-shift
stack_signals: []
keywords:
  - lazy loading images
  - loading attribute
  - lqip
  - blurhash
  - dominant color
  - video poster
  - iframe lazy loading
  - placeholder strategy
  - native lazy loading
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-lazy-loading-media/SKILL.md` (150-250 lines):
   - Cover: native `loading="lazy"` attribute (browser-managed, threshold-based), Intersection Observer for custom lazy loading, placeholder strategies (LQIP — Low Quality Image Placeholder, BlurHash, dominant color extraction, solid color, CSS aspect-ratio), video lazy loading (poster attribute, preload="none", play-on-viewport), iframe lazy loading for embeds (YouTube, maps, social media), fade-in transitions for loaded media, avoiding lazy loading above-the-fold content (LCP impact)
   - Worked examples: How Medium uses LQIP with progressive JPEG — a 42-byte blurred thumbnail loads instantly, transitions to full image on intersection, perceived load time feels instant despite 200KB hero images, how YouTube embeds use lite-youtube-embed (a facade pattern) that replaces a 600KB iframe with a 10KB thumbnail until click, improving page load by 3-5 seconds for pages with multiple video embeds
   - Anti-patterns: lazy loading the LCP image (delays largest paint, hurts Core Web Vitals — always use `loading="eager"` or omit the attribute for hero images), not reserving space for lazy loaded images (causes cumulative layout shift when images pop in), using JavaScript lazy loading when native loading="lazy" suffices (unnecessary complexity), lazy loading all images including critical above-the-fold ones

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-lazy-loading-media knowledge skill`

---

### Task 19: perf-font-loading

**Depends on:** none
**Files:** agents/skills/claude-code/perf-font-loading/skill.yaml, agents/skills/claude-code/perf-font-loading/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-font-loading`

2. Create `agents/skills/claude-code/perf-font-loading/skill.yaml`:

```yaml
name: perf-font-loading
version: '1.0.0'
description: Font loading — font-display strategies, subsetting, variable fonts, FOIT/FOUT management, and self-hosting vs CDN tradeoffs
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-resource-hints
  - perf-critical-rendering-path
  - perf-largest-contentful-paint
  - perf-cumulative-layout-shift
  - css-performance-patterns
stack_signals: []
keywords:
  - font-display
  - foit
  - fout
  - font subsetting
  - variable fonts
  - woff2
  - font loading api
  - self-hosted fonts
  - web fonts
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-font-loading/SKILL.md` (150-250 lines):
   - Cover: font-display values (auto, block, swap, fallback, optional) with decision tree, FOIT (Flash of Invisible Text) vs FOUT (Flash of Unstyled Text), WOFF2 format (30% smaller than WOFF, universal support), font subsetting (unicode-range, tools: glyphhanger, pyftsubset), variable fonts (one file replaces multiple weights/styles, saves network requests), preloading critical fonts, Font Loading API (document.fonts.load()), self-hosting vs Google Fonts (privacy, performance, cache partitioning impact), size-adjust and ascent-override for reduced layout shift
   - Worked examples: How Smashing Magazine reduced font-related CLS from 0.15 to 0.01 by implementing font-display: optional with a carefully matched fallback stack using size-adjust, how Shopify self-hosts fonts with aggressive subsetting (Latin subset only: 20KB down from 200KB for CJK-inclusive files) and preload hints, cutting font load time from 800ms to 100ms
   - Anti-patterns: font-display: block (invisible text for up to 3 seconds on slow connections), loading 4+ font files for weight variants when a variable font covers all weights in one file, not preloading the primary body font (browser discovers it late during CSS parsing), loading fonts from Google Fonts CDN without preconnect (DNS+TCP+TLS overhead to fonts.googleapis.com AND fonts.gstatic.com)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-font-loading knowledge skill`

---

### Task 20: perf-svg-optimization

**Depends on:** none
**Files:** agents/skills/claude-code/perf-svg-optimization/skill.yaml, agents/skills/claude-code/perf-svg-optimization/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-svg-optimization`

2. Create `agents/skills/claude-code/perf-svg-optimization/skill.yaml`:

```yaml
name: perf-svg-optimization
version: '1.0.0'
description: SVG optimization — minification with SVGO, inline vs external delivery, sprite sheets, accessibility, and rendering performance
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-image-formats
  - perf-compression
  - perf-bundle-analysis
  - perf-critical-rendering-path
  - css-performance-patterns
stack_signals: []
keywords:
  - svg optimization
  - svgo
  - svg sprite
  - inline svg
  - svg minification
  - svg accessibility
  - svg performance
  - vector graphics
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-svg-optimization/SKILL.md` (150-250 lines):
   - Cover: SVGO (SVG Optimizer) configuration and safe plugins, inline SVG vs external file vs data URI tradeoffs, SVG sprite sheets with `<symbol>` and `<use>`, CSS-in-SVG considerations (styleable inline SVGs vs static external), reducing SVG complexity (path simplification, decimal precision, removing editor metadata), SVG rendering performance (complex filters and blur are GPU-expensive), animation performance (SMIL vs CSS vs JS, requestAnimationFrame), accessibility (role, aria-label, title element)
   - Worked examples: How GitHub optimizes their 400+ icon set as an SVG sprite sheet — a single HTTP request loads all icons, individual icons referenced via `<use href="#icon-name">`, total sprite file is 45KB gzipped (vs 400 separate requests), how Figma exports optimized SVGs with SVGO integration reducing exported file sizes by 60-80% (removing Figma-specific metadata, simplifying paths to 2 decimal places)
   - Anti-patterns: embedding SVGs as base64 data URIs (37% larger than raw SVG, cannot be gzip-compressed in CSS, blocks CSS parsing), complex SVG filters (feGaussianBlur with large stdDeviation causes GPU repaints, use CSS box-shadow instead), not minifying SVGs (editor metadata from Illustrator/Figma adds 40-60% bloat), using SVG for photographs (rasterize instead — SVG is for vector content)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-svg-optimization knowledge skill`

---

### Task 21: perf-query-optimization

**Depends on:** none
**Files:** agents/skills/claude-code/perf-query-optimization/skill.yaml, agents/skills/claude-code/perf-query-optimization/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-query-optimization`

2. Create `agents/skills/claude-code/perf-query-optimization/skill.yaml`:

```yaml
name: perf-query-optimization
version: '1.0.0'
description: Database query optimization — EXPLAIN analysis, query plan reading, optimizer hints, and systematic query tuning methodology
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-index-strategies
  - perf-n-plus-one
  - perf-connection-pooling
  - perf-server-side-caching
  - prisma-performance-patterns
  - drizzle-performance-patterns
stack_signals: []
keywords:
  - explain analyze
  - query plan
  - sequential scan
  - index scan
  - query optimizer
  - slow query log
  - query tuning
  - execution plan
  - cost estimation
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-query-optimization/SKILL.md` (150-250 lines):
   - Cover: EXPLAIN and EXPLAIN ANALYZE (PostgreSQL), EXPLAIN FORMAT=JSON (MySQL), reading query plans (Seq Scan, Index Scan, Bitmap Index Scan, Nested Loop, Hash Join, Merge Join), cost estimation (startup cost, total cost, rows, width), identifying full table scans, join order optimization, common table expressions (CTEs) and materialization, OFFSET/LIMIT pagination problems (use keyset pagination instead), query rewriting techniques, pg_stat_statements for identifying slow queries
   - Worked examples: How Figma optimized a dashboard query that joined 5 tables from 12 seconds to 40ms by adding composite indexes and rewriting a correlated subquery as a lateral join, how GitLab identified that 3% of their queries consumed 50% of database CPU by analyzing pg_stat_statements and optimized the top 10 offenders for 40% overall reduction
   - Anti-patterns: SELECT \* when only specific columns are needed (fetches unnecessary data, prevents covering index usage), using OFFSET for deep pagination (database must scan and discard OFFSET rows — OFFSET 10000 is 10x slower than OFFSET 1000), wrapping indexed columns in functions (WHERE LOWER(email) = '...' cannot use a standard index on email), not analyzing query plans before and after changes (guessing at optimization instead of measuring)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-query-optimization knowledge skill`

---

### Task 22: perf-n-plus-one

**Depends on:** none
**Files:** agents/skills/claude-code/perf-n-plus-one/skill.yaml, agents/skills/claude-code/perf-n-plus-one/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-n-plus-one`

2. Create `agents/skills/claude-code/perf-n-plus-one/skill.yaml`:

```yaml
name: perf-n-plus-one
version: '1.0.0'
description: N+1 query problem — detection, eager loading, DataLoader pattern, batch queries, and ORM-specific solutions
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-query-optimization
  - perf-connection-pooling
  - perf-server-side-caching
  - prisma-performance-patterns
  - drizzle-performance-patterns
  - graphql-performance-patterns
stack_signals: []
keywords:
  - n+1 query
  - eager loading
  - dataloader
  - batch query
  - orm optimization
  - include
  - join fetch
  - preloading
  - query batching
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-n-plus-one/SKILL.md` (150-250 lines):
   - Cover: N+1 problem definition (1 query for parent + N queries for each child), detection methods (query logging, slow query analysis, application profiling), eager loading solutions (SQL JOINs, ORM includes/preloads), DataLoader pattern (batch and deduplicate within a request tick — originally from Facebook for GraphQL), batch queries (WHERE id IN (...)), ORM-specific solutions (Prisma include, Sequelize eager loading, TypeORM relations, ActiveRecord includes), GraphQL-specific N+1 (each resolver fetches independently), window functions as alternative to N+1 JOINs
   - Worked examples: How Shopify built their own DataLoader implementation that reduced API response times by 10x by batching N+1 queries in their GraphQL layer (a product listing page went from 200 queries to 3), how a Rails application at Basecamp went from 500ms to 50ms response time by replacing lazy-loaded associations with ActiveRecord includes() for a dashboard showing 50 projects with their members
   - Anti-patterns: eager loading everything (loading 10 associations when only 2 are needed wastes memory and query time), not monitoring query count per request (N+1 creeps in silently as new features add associations), using DataLoader outside of request scope (shared instances accumulate stale batches), solving N+1 with caching instead of fixing the query pattern (masks the problem, cache misses still slow)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-n-plus-one knowledge skill`

---

### Task 23: perf-connection-pooling

**Depends on:** none
**Files:** agents/skills/claude-code/perf-connection-pooling/skill.yaml, agents/skills/claude-code/perf-connection-pooling/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-connection-pooling`

2. Create `agents/skills/claude-code/perf-connection-pooling/skill.yaml`:

```yaml
name: perf-connection-pooling
version: '1.0.0'
description: Database connection pooling — pool sizing formulas, connection overhead, PgBouncer, and serverless connection management
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-query-optimization
  - perf-n-plus-one
  - perf-server-side-caching
  - node-performance-profiling
  - prisma-performance-patterns
stack_signals: []
keywords:
  - connection pool
  - pgbouncer
  - pool size
  - connection overhead
  - connection limit
  - idle timeout
  - serverless database
  - connection multiplexing
  - pool exhaustion
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-connection-pooling/SKILL.md` (150-250 lines):
   - Cover: connection creation cost (PostgreSQL: ~5-10ms for TCP+auth+process fork), pool sizing formula (connections = (core_count \* 2) + effective_spindle_count from PostgreSQL wiki), PgBouncer modes (session, transaction, statement), connection-per-request vs persistent pools, idle connection overhead (PostgreSQL: ~10MB per idle connection for process memory), serverless connection challenges (Lambda/Vercel: each function instance opens new connections), Prisma connection pool, external poolers (PgBouncer, pgcat, Supavisor), health checking and connection validation
   - Worked examples: How Heroku found that a 20-connection pool outperforms 200 connections for a 4-core PostgreSQL instance (contention overhead dominates beyond optimal pool size — their benchmark showed 96% performance at pool=20 vs pool=200), how Vercel implemented Prisma Accelerate connection pooling proxy to solve the serverless connection explosion problem (1000 Lambda invocations no longer create 1000 database connections)
   - Anti-patterns: setting pool size = max_connections (leaves no room for admin connections, migrations, or monitoring), no connection timeout (pool exhaustion causes requests to queue indefinitely), opening connections per request without pooling (5-10ms overhead per query adds up to seconds on complex pages), using PgBouncer in transaction mode with prepared statements (prepared statements are connection-scoped, fail with multiplexed connections)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-connection-pooling knowledge skill`

---

### Task 24: perf-index-strategies

**Depends on:** none
**Files:** agents/skills/claude-code/perf-index-strategies/skill.yaml, agents/skills/claude-code/perf-index-strategies/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-index-strategies`

2. Create `agents/skills/claude-code/perf-index-strategies/skill.yaml`:

```yaml
name: perf-index-strategies
version: '1.0.0'
description: Database index strategies — B-tree, hash, GIN, GiST, composite indexes, partial indexes, covering indexes, and index maintenance
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-query-optimization
  - perf-n-plus-one
  - perf-connection-pooling
  - prisma-performance-patterns
  - drizzle-performance-patterns
stack_signals: []
keywords:
  - b-tree index
  - hash index
  - gin index
  - gist index
  - composite index
  - partial index
  - covering index
  - index scan
  - index bloat
  - reindex
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-index-strategies/SKILL.md` (150-250 lines):
   - Cover: B-tree indexes (default, ordered, range queries, O(log n) lookup), hash indexes (equality only, O(1), PostgreSQL now WAL-logged), GIN indexes (full-text search, JSONB containment, array operations), GiST indexes (geometric data, range types, nearest-neighbor), composite indexes (column order matters — leftmost prefix rule), partial indexes (WHERE clause reduces index size), covering indexes (INCLUDE columns for index-only scans), expression indexes (indexed computed values), index maintenance (bloat detection, REINDEX, pg_stat_user_indexes for unused index detection), write amplification cost
   - Worked examples: How Discourse reduced their full-text search from 2 seconds to 20ms by replacing LIKE '%term%' with a GIN trigram index (pg_trgm extension), how a SaaS platform reduced their multi-tenant query time by 90% using partial indexes (CREATE INDEX ON orders(created_at) WHERE tenant_id = 42) — one small index per active tenant instead of one massive index
   - Anti-patterns: indexing every column individually (write amplification, unused indexes waste storage and slow inserts), wrong column order in composite indexes (WHERE a = 1 AND b > 5 needs index (a, b) not (b, a)), not using partial indexes for boolean flags (indexing is_active on a table where 95% of rows are active wastes space — index WHERE is_active = false instead), never monitoring index usage (pg_stat_user_indexes.idx_scan = 0 means the index is never used)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-index-strategies knowledge skill`

---

### Task 25: perf-server-side-rendering

**Depends on:** none
**Files:** agents/skills/claude-code/perf-server-side-rendering/skill.yaml, agents/skills/claude-code/perf-server-side-rendering/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-server-side-rendering`

2. Create `agents/skills/claude-code/perf-server-side-rendering/skill.yaml`:

```yaml
name: perf-server-side-rendering
version: '1.0.0'
description: Server-side rendering — SSR benefits and costs, hydration overhead, streaming SSR, selective hydration, and islands architecture
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-client-side-rendering
  - perf-static-generation
  - perf-streaming-rendering
  - perf-edge-rendering
  - perf-critical-rendering-path
  - perf-largest-contentful-paint
  - node-performance-profiling
stack_signals: []
keywords:
  - ssr
  - server-side rendering
  - hydration
  - streaming ssr
  - selective hydration
  - islands architecture
  - renderToString
  - renderToPipeableStream
  - ttfb
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-server-side-rendering/SKILL.md` (150-250 lines):
   - Cover: SSR fundamentals (server renders HTML, client receives painted content immediately), hydration (client-side JS attaches event listeners to server-rendered markup), hydration cost (full component tree replay, TTI delayed by JS execution), streaming SSR (renderToPipeableStream in React 18, chunked transfer encoding), selective hydration (prioritize interactive components), islands architecture (Astro — static HTML shell with hydrated interactive islands), partial hydration and resumability (Qwik), server components (React Server Components — zero client JS for data-fetching components)
   - Worked examples: How Walmart improved FCP by 35% and TTI by 26% by implementing streaming SSR (flushing the shell HTML in <100ms while data-dependent sections stream in), how The Guardian moved from client-side rendering to SSR and saw a 60% improvement in LCP (from 4.1s to 1.6s) and 45% improvement in search ranking visibility
   - Anti-patterns: hydrating the entire page when only small islands are interactive (hydration JS can be larger than the original client-side app), blocking SSR on slow API calls (one slow endpoint delays the entire page — use streaming), SSR without caching (rendering identical pages per request wastes server CPU — implement stale-while-revalidate or full-page caching), not measuring TTFB (SSR shifts work to the server, if server is slow TTFB regresses)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-server-side-rendering knowledge skill`

---

### Task 26: perf-client-side-rendering

**Depends on:** none
**Files:** agents/skills/claude-code/perf-client-side-rendering/skill.yaml, agents/skills/claude-code/perf-client-side-rendering/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-client-side-rendering`

2. Create `agents/skills/claude-code/perf-client-side-rendering/skill.yaml`:

```yaml
name: perf-client-side-rendering
version: '1.0.0'
description: Client-side rendering — SPA performance optimization, skeleton screens, progressive rendering, and app shell architecture
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-server-side-rendering
  - perf-code-splitting
  - perf-lazy-loading
  - perf-service-worker-caching
  - perf-critical-rendering-path
  - perf-largest-contentful-paint
stack_signals: []
keywords:
  - client-side rendering
  - spa
  - skeleton screen
  - app shell
  - progressive rendering
  - virtual dom
  - reconciliation
  - first meaningful paint
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-client-side-rendering/SKILL.md` (150-250 lines):
   - Cover: CSR fundamentals (empty HTML shell, JavaScript renders content), app shell architecture (cache the UI shell, load data dynamically), skeleton screens (placeholder UI during data fetching), progressive rendering (render available data first, enhance as more loads), virtual DOM diffing and reconciliation cost, re-render optimization (React.memo, useMemo, Vue computed properties), list virtualization for large datasets (react-window, @tanstack/virtual), requestAnimationFrame for visual updates, requestIdleCallback for non-urgent work
   - Worked examples: How LinkedIn reduced perceived load time by 50% on their feed by implementing skeleton screens that match the exact layout dimensions of real content cards (preventing layout shift while providing instant visual feedback), how Discord manages real-time rendering of 100+ messages per second in active channels using list virtualization (only rendering visible messages) and batched state updates
   - Anti-patterns: large initial JS bundle without code splitting (SPA loads 2MB+ before showing anything), not implementing app shell (every navigation re-downloads the full layout), re-rendering entire component trees on minor state changes (missing memoization causes cascading renders), blocking the main thread with large list renders (render 10,000 DOM nodes instead of virtualizing)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-client-side-rendering knowledge skill`

---

### Task 27: perf-static-generation

**Depends on:** none
**Files:** agents/skills/claude-code/perf-static-generation/skill.yaml, agents/skills/claude-code/perf-static-generation/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-static-generation`

2. Create `agents/skills/claude-code/perf-static-generation/skill.yaml`:

```yaml
name: perf-static-generation
version: '1.0.0'
description: Static site generation — build-time rendering, incremental static regeneration, on-demand revalidation, and CDN-first delivery
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-server-side-rendering
  - perf-client-side-rendering
  - perf-cdn-strategies
  - perf-browser-cache
  - perf-edge-rendering
stack_signals: []
keywords:
  - static generation
  - ssg
  - incremental static regeneration
  - isr
  - build-time rendering
  - on-demand revalidation
  - jamstack
  - pre-rendering
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-static-generation/SKILL.md` (150-250 lines):
   - Cover: SSG fundamentals (HTML generated at build time, served from CDN), Next.js ISR (Incremental Static Regeneration — stale-while-revalidate at page level), on-demand revalidation (webhook-triggered rebuild of specific pages), Astro static output, build time scaling challenges (10K+ pages), deferred static generation (generate on first request, cache thereafter), hybrid approaches (static pages + dynamic API routes), content-addressable deploys (atomic deployments, instant rollback), pre-rendering for SPAs (react-snap, prerender-spa-plugin)
   - Worked examples: How Vercel's Next.js blog generates 10,000 documentation pages at build time with ISR revalidation every 60 seconds (TTFB under 50ms globally via edge CDN, content freshness within 1 minute), how Smashing Magazine migrated from WordPress to Jamstack (Hugo SSG) and saw TTFB drop from 800ms to 40ms while handling traffic spikes of 100K concurrent readers without scaling servers
   - Anti-patterns: static generating user-specific pages (personal dashboards should use CSR or SSR, not SSG), rebuilding entire site for a single content change (10K pages = 30+ minute builds without incremental approaches), not setting up preview/draft mode (content editors cannot preview changes before publish), relying solely on build-time generation for time-sensitive content (stock prices, live scores need SSR or client-side updates)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-static-generation knowledge skill`

---

### Task 28: perf-streaming-rendering

**Depends on:** none
**Files:** agents/skills/claude-code/perf-streaming-rendering/skill.yaml, agents/skills/claude-code/perf-streaming-rendering/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-streaming-rendering`

2. Create `agents/skills/claude-code/perf-streaming-rendering/skill.yaml`:

```yaml
name: perf-streaming-rendering
version: '1.0.0'
description: Streaming rendering — React Suspense streaming, chunked transfer encoding, out-of-order streaming, and progressive page delivery
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-server-side-rendering
  - perf-critical-rendering-path
  - perf-largest-contentful-paint
  - perf-http2-multiplexing
  - node-performance-profiling
stack_signals: []
keywords:
  - streaming ssr
  - react suspense
  - renderToPipeableStream
  - chunked transfer
  - out-of-order streaming
  - progressive rendering
  - flush
  - streaming html
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-streaming-rendering/SKILL.md` (150-250 lines):
   - Cover: chunked transfer encoding (HTTP/1.1 Transfer-Encoding: chunked), React 18 renderToPipeableStream (streaming HTML with Suspense boundaries), out-of-order streaming (send placeholder, stream replacement content later via inline script), Suspense boundaries as streaming boundaries, selective hydration (hydrate interactive sections first), streaming with error boundaries, Node.js stream piping to HTTP response, early flush strategies (send head + shell before data resolves), Vue streaming renderer, SolidJS streaming
   - Worked examples: How Shopify's Hydrogen framework uses React streaming SSR to flush the page shell in <100ms while product data streams in, achieving 50% faster FCP than traditional SSR (renderToString waits for all data before sending any HTML), how Netflix implemented progressive HTML streaming for their title pages — the header and navigation render in the first chunk while recommendation data streams in 200-500ms later
   - Anti-patterns: wrapping the entire app in a single Suspense boundary (defeats streaming — everything waits for the slowest data), not providing meaningful fallback UI in Suspense boundaries (users see blank spaces instead of skeletons), streaming without HTTP/2 (HTTP/1.1 head-of-line blocking limits streaming benefits), not handling stream errors (an error in one suspended section should not crash the entire response)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-streaming-rendering knowledge skill`

---

### Task 29: perf-edge-rendering

**Depends on:** none
**Files:** agents/skills/claude-code/perf-edge-rendering/skill.yaml, agents/skills/claude-code/perf-edge-rendering/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-edge-rendering`

2. Create `agents/skills/claude-code/perf-edge-rendering/skill.yaml`:

```yaml
name: perf-edge-rendering
version: '1.0.0'
description: Edge rendering — edge compute platforms, regional deployment, latency optimization, and edge-side personalization
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-cdn-strategies
  - perf-server-side-rendering
  - perf-static-generation
  - perf-cdn-cache-control
  - perf-connection-costs
stack_signals: []
keywords:
  - edge compute
  - edge rendering
  - cloudflare workers
  - lambda@edge
  - deno deploy
  - edge ssr
  - regional deployment
  - latency optimization
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-edge-rendering/SKILL.md` (150-250 lines):
   - Cover: edge compute platforms (Cloudflare Workers, AWS Lambda@Edge, Deno Deploy, Vercel Edge Functions, Fastly Compute@Edge), edge runtime constraints (no Node.js APIs, V8 isolates, limited execution time, no filesystem), edge SSR vs origin SSR tradeoffs (latency vs compute capability), edge-side personalization (A/B testing, geolocation, device detection without origin roundtrip), data locality challenges (edge compute is fast but database is usually in one region — use read replicas or distributed databases), edge caching with compute (stale-while-revalidate implemented at edge), middleware at the edge (authentication, redirects, header manipulation)
   - Worked examples: How Vercel reduced global P50 TTFB from 300ms to 50ms by deploying Next.js middleware to edge locations (authentication checks, A/B test assignment, and geolocation-based redirects all happen within 10ms at the nearest PoP), how Cloudflare Workers enables Shopify's Oxygen framework to render storefronts at 300+ edge locations with sub-50ms TTFB globally (vs 200-400ms from a single-region origin)
   - Anti-patterns: running heavy computation at the edge (edge functions have 10-50ms CPU time limits — offload intensive work to origin), accessing a single-region database from all edge locations (adds cross-region latency, negating edge benefits), deploying full Node.js SSR to edge (edge runtimes support Web APIs, not Node.js APIs — requires compatible frameworks), not measuring cold start impact (V8 isolates start in <5ms, but Lambda@Edge cold starts can be 100-500ms)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-edge-rendering knowledge skill`

---

### Task 30: perf-web-workers

**Depends on:** none
**Files:** agents/skills/claude-code/perf-web-workers/skill.yaml, agents/skills/claude-code/perf-web-workers/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-web-workers`

2. Create `agents/skills/claude-code/perf-web-workers/skill.yaml`:

```yaml
name: perf-web-workers
version: '1.0.0'
description: Web Workers — dedicated and shared workers, Comlink RPC, SharedArrayBuffer, Atomics, and off-main-thread architecture
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-event-loop
  - perf-long-tasks
  - perf-interaction-to-next-paint
  - perf-service-worker-caching
  - perf-garbage-collection
stack_signals: []
keywords:
  - web worker
  - dedicated worker
  - shared worker
  - comlink
  - SharedArrayBuffer
  - atomics
  - off-main-thread
  - transferable objects
  - postMessage
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-web-workers/SKILL.md` (150-250 lines):
   - Cover: dedicated Workers (one worker per script, isolated thread), shared Workers (shared across tabs/windows), Worker lifecycle and message passing (postMessage, onmessage), structured clone algorithm cost, transferable objects (ArrayBuffer, ImageBitmap — zero-copy transfer), Comlink library (RPC-style API over postMessage, removes boilerplate), SharedArrayBuffer and Atomics (shared memory for lock-free concurrent access, requires cross-origin isolation headers), worklet types (AudioWorklet, PaintWorklet), off-main-thread architecture patterns (move parsing, compression, image processing to workers), bundling workers (worker-loader, Vite worker support)
   - Worked examples: How Google Docs moves spell checking and grammar analysis to a dedicated Web Worker, keeping the main thread free for 60fps typing responsiveness (spell check can take 50-200ms for large documents, which would cause visible input lag on main thread), how Figma uses SharedArrayBuffer with a custom binary protocol to share their design canvas state between the main thread and a rendering worker, enabling complex vector operations without main-thread jank
   - Anti-patterns: using workers for trivial computation (worker creation overhead is 50-100ms, not worth it for <10ms tasks), sending large objects via postMessage without transfer (structured clone of a 10MB ArrayBuffer takes 50ms — use transfer instead for 0ms), not handling worker errors (uncaught errors in workers are silently swallowed), creating too many workers (each worker consumes ~1MB memory minimum, browser may throttle beyond navigator.hardwareConcurrency)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-web-workers knowledge skill`

---

### Task 31: perf-service-worker-caching

**Depends on:** none
**Files:** agents/skills/claude-code/perf-service-worker-caching/skill.yaml, agents/skills/claude-code/perf-service-worker-caching/SKILL.md

1. Create directory: `mkdir -p agents/skills/claude-code/perf-service-worker-caching`

2. Create `agents/skills/claude-code/perf-service-worker-caching/skill.yaml`:

```yaml
name: perf-service-worker-caching
version: '1.0.0'
description: Service Worker caching — lifecycle management, cache strategies (stale-while-revalidate, cache-first, network-first), offline support, and Workbox patterns
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - perf-browser-cache
  - perf-web-workers
  - perf-critical-rendering-path
  - perf-largest-contentful-paint
  - perf-cdn-strategies
stack_signals: []
keywords:
  - service worker
  - cache api
  - workbox
  - stale-while-revalidate
  - cache-first
  - network-first
  - offline support
  - precaching
  - runtime caching
  - sw lifecycle
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `agents/skills/claude-code/perf-service-worker-caching/SKILL.md` (150-250 lines):
   - Cover: Service Worker lifecycle (install, activate, fetch event), Cache API (caches.open, cache.put, cache.match), caching strategies (cache-first for static assets, network-first for API data, stale-while-revalidate for balanced freshness/speed, network-only, cache-only), Workbox library (precaching with revision hashes, runtime caching with strategy plugins, expiration plugin, background sync), precaching (versioned assets cached at install time), runtime caching (dynamic request interception), cache versioning and cleanup (delete old caches on activate), navigation preload (parallel network request during SW startup), offline fallback pages
   - Worked examples: How Twitter Lite's service worker serves the app shell from cache in <1 second on repeat visits (cache-first for static assets, stale-while-revalidate for API responses), enabling offline timeline reading for 3 million daily users, how Starbucks' PWA uses Workbox precaching for the ordering flow (240KB app shell cached at install) and runtime caching with stale-while-revalidate for menu data — the app works fully offline and is 99.84% smaller than their native iOS app
   - Anti-patterns: caching API responses without expiration (stale data accumulates, Cache API has no automatic eviction by default), not versioning the service worker (old SW serves stale assets indefinitely until all tabs close), precaching too many assets (100MB precache delays installation, wastes bandwidth on first visit), using cache-first for frequently changing API data (users see stale content with no background update)

4. Run: `harness validate`
5. Commit: `feat(skills): add perf-service-worker-caching knowledge skill`

---

### Task 32: Replicate all Phase 2 skills to gemini-cli, cursor, and codex

**Depends on:** Tasks 1-31
**Files:** 186 files across agents/skills/{gemini-cli,cursor,codex}/perf-\*/

1. Run the replication script (copies only NEW perf-\* directories that do not already exist on target platforms):

```bash
for skill_dir in agents/skills/claude-code/perf-*/; do
  skill_name=$(basename "$skill_dir")
  for platform in gemini-cli cursor codex; do
    if [ ! -d "agents/skills/$platform/$skill_name" ]; then
      mkdir -p "agents/skills/$platform/$skill_name"
      cp "$skill_dir"skill.yaml "agents/skills/$platform/$skill_name/"
      cp "$skill_dir"SKILL.md "agents/skills/$platform/$skill_name/"
    fi
  done
done
```

2. Verify file count:

```bash
for platform in claude-code gemini-cli cursor codex; do
  echo "$platform: $(ls -d agents/skills/$platform/perf-*/ 2>/dev/null | wc -l) perf skill directories"
done
```

Expected output: 46 directories per platform (15 Phase 1 + 31 Phase 2).

3. Verify all skill.yaml files list all 4 platforms:

```bash
for platform in gemini-cli cursor codex; do
  for skill_dir in agents/skills/$platform/perf-http2-multiplexing agents/skills/$platform/perf-service-worker-caching; do
    echo "=== $skill_dir ==="
    grep -A 4 "^platforms:" "$skill_dir/skill.yaml"
  done
done
```

Expected: each file lists claude-code, gemini-cli, cursor, codex.

4. Run: `harness validate`
5. Commit: `feat(skills): replicate Phase 2 perf skills to all platforms`

---

### Task 33: Validate all Phase 2 skills

[checkpoint:human-verify]

**Depends on:** Task 32
**Files:** none (validation only)

1. Run structure tests:

```bash
npx vitest run agents/skills/tests/structure.test.ts
```

2. Verify section completeness for all new SKILL.md files:

```bash
for skill_dir in agents/skills/claude-code/perf-http2-multiplexing agents/skills/claude-code/perf-http3-quic agents/skills/claude-code/perf-connection-costs agents/skills/claude-code/perf-cdn-strategies agents/skills/claude-code/perf-resource-hints agents/skills/claude-code/perf-compression agents/skills/claude-code/perf-browser-cache agents/skills/claude-code/perf-cdn-cache-control agents/skills/claude-code/perf-server-side-caching agents/skills/claude-code/perf-cache-invalidation agents/skills/claude-code/perf-code-splitting agents/skills/claude-code/perf-tree-shaking agents/skills/claude-code/perf-lazy-loading agents/skills/claude-code/perf-module-federation agents/skills/claude-code/perf-bundle-analysis agents/skills/claude-code/perf-image-formats agents/skills/claude-code/perf-responsive-images agents/skills/claude-code/perf-lazy-loading-media agents/skills/claude-code/perf-font-loading agents/skills/claude-code/perf-svg-optimization agents/skills/claude-code/perf-query-optimization agents/skills/claude-code/perf-n-plus-one agents/skills/claude-code/perf-connection-pooling agents/skills/claude-code/perf-index-strategies agents/skills/claude-code/perf-server-side-rendering agents/skills/claude-code/perf-client-side-rendering agents/skills/claude-code/perf-static-generation agents/skills/claude-code/perf-streaming-rendering agents/skills/claude-code/perf-edge-rendering agents/skills/claude-code/perf-web-workers agents/skills/claude-code/perf-service-worker-caching; do
  name=$(basename "$skill_dir")
  lines=$(wc -l < "$skill_dir/SKILL.md")
  has_when=$(grep -c "## When to Use" "$skill_dir/SKILL.md")
  has_instructions=$(grep -c "## Instructions" "$skill_dir/SKILL.md")
  has_details=$(grep -c "## Details" "$skill_dir/SKILL.md")
  has_source=$(grep -c "## Source" "$skill_dir/SKILL.md")
  echo "$name: ${lines} lines, When=$has_when, Instructions=$has_instructions, Details=$has_details, Source=$has_source"
done
```

Expected: every skill has 150-250 lines and all required sections present (count >= 1).

3. Verify cross-platform consistency:

```bash
diff_count=0
for skill_dir in agents/skills/claude-code/perf-http2-multiplexing agents/skills/claude-code/perf-compression agents/skills/claude-code/perf-cache-invalidation agents/skills/claude-code/perf-bundle-analysis agents/skills/claude-code/perf-query-optimization agents/skills/claude-code/perf-server-side-rendering agents/skills/claude-code/perf-service-worker-caching; do
  skill_name=$(basename "$skill_dir")
  for platform in gemini-cli cursor codex; do
    diff -q "$skill_dir/SKILL.md" "agents/skills/$platform/$skill_name/SKILL.md" || diff_count=$((diff_count + 1))
    diff -q "$skill_dir/skill.yaml" "agents/skills/$platform/$skill_name/skill.yaml" || diff_count=$((diff_count + 1))
  done
done
echo "Differences found: $diff_count"
```

Expected: 0 differences.

4. Run: `harness validate`
5. Final human verification: review 3 representative skills for content quality:
   - perf-http2-multiplexing (network)
   - perf-cache-invalidation (caching)
   - perf-server-side-rendering (rendering)
