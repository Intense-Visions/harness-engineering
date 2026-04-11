# CDN Strategies

> Design and optimize Content Delivery Network architecture — tiered caching, origin shielding, edge compute patterns, cache hit ratio optimization, multi-CDN strategies, and geographic routing for globally distributed applications.

## When to Use

- Users in distant regions experience TTFB exceeding 500ms due to origin server distance
- Origin server is under heavy load from cache misses and you need to reduce origin traffic
- Cache hit ratio is below 90% and you need to improve CDN efficiency
- You are designing a multi-region application and need a CDN-first architecture
- Flash sales or viral content cause traffic spikes that overwhelm the origin
- Edge compute is being evaluated for personalization, A/B testing, or authentication
- Multiple CDN providers need to be orchestrated for redundancy and performance
- Static assets, API responses, and HTML pages have different caching requirements
- You need to understand PoP (Point of Presence) architecture and anycast routing
- Geographic content restrictions or data sovereignty requirements affect CDN configuration

## Instructions

1. **Understand CDN architecture.** A CDN consists of Points of Presence (PoPs) distributed globally. Each PoP contains edge servers that cache content. When a user requests a resource, DNS (typically anycast) routes them to the nearest PoP.

   ```
   User Request Flow:
   User → DNS (anycast) → Nearest PoP Edge → [Cache HIT] → Response
                                             → [Cache MISS] → Shield PoP → Origin → Response
   ```

2. **Configure tiered caching.** Most CDNs support multi-tier caching:
   - **Edge tier** — 200+ global PoPs, closest to users, smallest cache
   - **Shield/Regional tier** — 10-20 regional PoPs, larger cache, reduces origin load
   - **Origin tier** — your server(s), generates content on cache miss

   Enable origin shielding to collapse multiple edge misses into a single origin request:

   ```
   Without shielding:     Edge-A miss → Origin
                          Edge-B miss → Origin
                          Edge-C miss → Origin  (3 origin requests)

   With shielding:        Edge-A miss → Shield → Origin
                          Edge-B miss → Shield → (cache hit)
                          Edge-C miss → Shield → (cache hit)  (1 origin request)
   ```

3. **Optimize cache hit ratio.** Target >95% cache hit ratio for static assets, >80% for dynamic content. Strategies:
   - Normalize cache keys (strip unnecessary query params, sort remaining params)
   - Use `Vary` header correctly (only vary on headers that actually change the response)
   - Set appropriate TTLs by content type (static assets: 1 year, HTML: minutes to hours)
   - Warm cache after deploys or purges (pre-populate popular content)

4. **Implement edge compute for dynamic content.** Edge compute runs application logic at the CDN edge, eliminating origin roundtrips for common operations:

   ```javascript
   // Cloudflare Worker example: A/B testing at the edge
   export default {
     async fetch(request) {
       const bucket = request.headers.get('cookie')?.includes('ab=B') ? 'B' : 'A';
       const url = new URL(request.url);
       url.pathname = `/${bucket}${url.pathname}`;
       return fetch(url);
     },
   };
   ```

5. **Design cache keys carefully.** The cache key determines what constitutes a unique cacheable response. Poor cache key design causes either cache pollution (too many unique entries) or incorrect responses (too few entries).

   ```
   Good cache key:  scheme + host + path + normalized-query
   Bad cache key:   scheme + host + path + all-headers + cookies
                    (creates per-user cache entries, ~0% hit rate)
   ```

6. **Configure multi-CDN for redundancy.** DNS-based routing directs traffic to the best-performing CDN:
   - Active-active: distribute traffic across CDNs based on performance metrics
   - Active-passive: failover to secondary CDN when primary is degraded
   - Use tools like Citrix Intelligent Traffic Management or NS1 for real-time CDN steering

7. **Monitor CDN performance.** Track these metrics:
   - Cache hit ratio (target: >95% for static, >80% for dynamic)
   - Origin offload percentage (percentage of requests NOT hitting origin)
   - Edge TTFB (time from edge to user, should be <50ms)
   - Origin TTFB (time from edge to origin on miss, identifies origin bottlenecks)

## Details

### Anycast Routing

CDNs use anycast — the same IP address is advertised from every PoP via BGP. The internet's routing infrastructure directs each user to the geographically nearest PoP. Anycast provides automatic failover: if a PoP goes offline, BGP reconverges and traffic routes to the next nearest PoP. Typical failover time: 10-30 seconds.

### Cache Warming Strategies

After a deploy or cache purge, hit rates temporarily drop. Warming strategies:

- **Synthetic requests** — script that requests popular URLs from each PoP
- **Stale-while-revalidate** — serve stale content while fetching fresh in background
- **Soft purge** — mark content as stale rather than deleting (Fastly's approach), continue serving stale while revalidating

### Worked Example: Netflix Open Connect

Netflix serves 125 million hours of video daily through their Open Connect CDN. Instead of using a traditional CDN, Netflix deploys custom cache appliances directly inside ISP networks. Each appliance stores the most popular content for that region (determined by machine learning prediction). This approach reduces internet transit traffic by 70% and achieves sub-10ms latency for video streams. The key insight: for high-bandwidth content, pushing cache servers into the last-mile network eliminates backbone traversal entirely.

### Worked Example: The Guardian CDN-First Architecture

The Guardian improved First Contentful Paint by 1.2 seconds by moving from a single-origin architecture to a CDN-first design with edge-side includes (ESI). Static page shells are cached at the edge with a 60-second TTL. Dynamic components (personalized recommendations, live scores) are fetched client-side or via ESI fragments with separate TTLs. The result: 95% of page views are served entirely from CDN edge with <50ms TTFB, compared to the previous 300-800ms origin response time. Origin requests dropped by 85%.

### Anti-Patterns

**Caching personalized content without proper Vary headers.** If your CDN caches a page with user-specific content (name, cart, recommendations) without varying on the correct identifier, it serves user A's data to user B. Personalized content must either use `Vary` headers correctly, be excluded from caching, or be fetched client-side after the cached shell loads.

**Not configuring origin shielding.** Without shielding, a cache expiry causes every edge PoP to simultaneously request from origin. With 200 PoPs, this creates a thundering herd of 200 concurrent origin requests for the same content. Origin shielding collapses these to 1 request.

**Short TTLs globally instead of tiered TTLs.** Setting `Cache-Control: max-age=60` on all content means even static assets (CSS, JS, images) are revalidated every minute. Use content-type-specific TTLs: static assets with content hashes get `max-age=31536000`, HTML gets `max-age=60, stale-while-revalidate=3600`.

**Ignoring CDN cache key design.** Default cache keys often include all query parameters, cookies, and sometimes headers. A URL with analytics parameters (`?utm_source=twitter&utm_medium=social`) creates a different cache entry than the base URL, reducing hit rates. Strip non-functional query parameters from cache keys.

**Using a single CDN region for global traffic.** Deploying origin servers in a single region (e.g., us-east-1) and relying solely on CDN edge caching creates a single point of failure and high shield-to-origin latency for distant PoPs. Deploy origin replicas in at least two regions and configure the CDN shield tier to route to the nearest origin.

**Purging entire cache zones instead of targeted invalidation.** When a single asset changes, purging the entire cache (sometimes called a "zone purge") drops hit rates to zero temporarily and creates a thundering herd against the origin. Use surrogate keys or cache tags to purge only the specific resources that changed. Fastly, Cloudflare, and Akamai all support tag-based purging.

### Decision Guidance: When to Use Edge Compute vs. Origin Logic

Edge compute is ideal for latency-sensitive, low-complexity operations: URL rewrites, A/B test bucket assignment, geolocation-based routing, bot detection, and request/response header manipulation. Avoid running complex business logic at the edge — database access from edge functions introduces unpredictable latency depending on the PoP-to-database distance, and debugging distributed edge deployments is significantly harder than centralized origin debugging. A good rule of thumb: if the operation needs a database query, keep it at the origin. If it can run with only the request context and a key-value store, it belongs at the edge.

### Cache Invalidation Strategies

Cache invalidation is often the hardest part of CDN management. Three primary approaches:

- **TTL-based expiration** — simplest approach, content expires after a fixed duration. Works well for content with predictable update cadences (news articles refresh hourly, product prices refresh every 5 minutes).
- **Purge-on-publish** — the CMS or deploy pipeline sends a purge request when content changes. Provides near-instant freshness but requires integration between the publishing system and the CDN API.
- **Stale-while-revalidate** — serves stale content immediately while fetching fresh content in the background. Combines low latency with eventual freshness. Best for content where serving slightly stale data is acceptable (e.g., product listing pages, blog posts).

For most applications, combining TTL-based expiration with stale-while-revalidate provides the best balance: `Cache-Control: max-age=300, stale-while-revalidate=3600` serves cached content for 5 minutes, then serves stale for up to an hour while revalidating in the background.

When using purge-on-publish, always implement rate limiting on purge API calls. A misconfigured deploy pipeline that purges thousands of URLs in a tight loop can overwhelm the CDN's purge infrastructure and cause cascading cache misses across all PoPs.

## Source

- Cloudflare CDN Architecture — https://www.cloudflare.com/learning/cdn/what-is-a-cdn/
- Netflix Open Connect — https://openconnect.netflix.com/
- Fastly Edge Cloud Platform documentation — https://docs.fastly.com/
- Akamai CDN Performance Best Practices — https://developer.akamai.com/
- "Content Delivery Networks: Fundamentals, Design, and Evolution" (Wiley)

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
- Cache hit ratio exceeds 95% for static assets and 80% for cacheable dynamic content.
- Origin shielding is enabled, reducing origin load by at least 80% for cacheable content.
- Edge TTFB is under 50ms for cached content at all major geographic regions.
