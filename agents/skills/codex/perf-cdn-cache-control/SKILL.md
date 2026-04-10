# CDN Cache Control

> Master CDN-specific caching mechanics — cache key composition, Vary header impact, Surrogate-Control directives, tag-based instant purging, edge TTL management with s-maxage, and edge-side includes for granular partial caching.

## When to Use

- CDN cache hit ratio is below 90% and you need to diagnose cache fragmentation
- Cache purging takes too long or purges too broadly (entire zone instead of targeted paths)
- You need different TTLs for CDN edge vs browser cache (s-maxage vs max-age)
- Vary header configuration is causing excessive cache fragmentation
- Personalized content is incorrectly cached or served to wrong users at the CDN
- Edge-side includes (ESI) are being evaluated for partial page caching
- Cache warming is needed after deployments to prevent origin overload
- Surrogate-Key or Cache-Tag headers need to be implemented for targeted purging
- CDN configuration needs to handle content negotiation (encoding, language, format)
- Flash sale or high-traffic events require CDN cache strategy planning

## Instructions

1. **Separate CDN TTL from browser TTL.** Use `s-maxage` for CDN and `max-age` for browser:

   ```
   # CDN caches for 1 hour, browser caches for 5 minutes
   Cache-Control: public, max-age=300, s-maxage=3600

   # CDN caches for 1 day, browser must always revalidate
   Cache-Control: public, max-age=0, s-maxage=86400, must-revalidate
   ```

   `s-maxage` only applies to shared caches (CDN, proxy). Browsers ignore it and use `max-age`.

2. **Configure Surrogate-Control for CDN-specific behavior.** Some CDNs support Surrogate-Control headers for directives that should not reach the browser:

   ```
   # Fastly/Varnish Surrogate-Control
   Surrogate-Control: max-age=86400
   Cache-Control: no-cache

   # CDN caches for 1 day; browser always revalidates
   # CDN strips Surrogate-Control before forwarding to browser
   ```

3. **Implement tag-based cache purging.** Tag individual responses with cache keys for targeted invalidation:

   ```
   # Tag responses with content identifiers
   Surrogate-Key: article-12345 section-news author-jane homepage
   # (Fastly)

   Cache-Tag: article-12345, section-news, author-jane, homepage
   # (Cloudflare)

   # Purge by tag (all responses tagged with "article-12345")
   # Fastly API:
   POST /service/{id}/purge/article-12345

   # Cloudflare API:
   POST /zones/{id}/purge_cache
   {"tags": ["article-12345"]}
   ```

4. **Optimize cache key composition.** The cache key determines what is considered a unique response. Audit and simplify:

   ```
   # Default cache key (often too broad):
   scheme + host + path + query-string + cookies + accept-encoding + accept-language

   # Optimized cache key:
   scheme + host + path + sorted-query(keep: page, q; strip: utm_*, fbclid)

   # CDN configuration (Cloudflare example):
   # Cache Rules → Custom cache key → Query string: Include specific
   ```

5. **Configure Vary header correctly.** The Vary header tells caches to store separate versions based on specific request headers:

   ```
   # Good: vary on encoding (mandatory for compressed content)
   Vary: Accept-Encoding

   # Acceptable: vary on encoding and language
   Vary: Accept-Encoding, Accept-Language

   # Bad: vary on everything (disables caching)
   Vary: *

   # Bad: vary on Cookie (per-user cache = 0% hit rate)
   Vary: Cookie
   ```

   Each unique combination of Vary header values creates a separate cache entry. `Vary: Accept-Encoding` typically creates 2-3 variants (br, gzip, identity). Adding `Accept-Language` with 10 languages creates 20-30 variants.

6. **Implement cache warming after purge.** After a cache purge or deploy, pre-populate the CDN cache:

   ```bash
   # Warm cache for top pages from multiple PoP regions
   URLS=(
     "https://example.com/"
     "https://example.com/products"
     "https://example.com/about"
   )
   for url in "${URLS[@]}"; do
     curl -s -o /dev/null -w "%{http_code} %{time_total}s %{url_effective}\n" "$url"
   done
   ```

7. **Use soft purge instead of hard purge.** Soft purge marks content as stale rather than deleting it. The stale content is served while the CDN fetches a fresh copy from origin:

   ```
   # Hard purge: content deleted, next request goes to origin (cache miss)
   # Soft purge: content marked stale, served while revalidating (no miss)

   # Fastly soft purge:
   PURGE /path HTTP/1.1
   Fastly-Soft-Purge: 1
   ```

## Details

### Cache Key Design Principles

The ideal cache key includes only information that changes the response content. Including extraneous information (tracking parameters, session cookies) creates unique cache entries for identical content.

Common cache key pollution sources:

- **UTM parameters** (`utm_source`, `utm_medium`, `utm_campaign`) — strip from cache key
- **Session cookies** — exclude from cache key for public content
- **Random query parameters** — cache-busting params like `_=timestamp`
- **Client hints** — `Sec-CH-UA`, `Sec-CH-UA-Mobile` create device-specific entries

### Edge-Side Includes (ESI)

ESI allows a CDN to assemble a page from multiple cached fragments, each with its own TTL:

```html
<!-- Page template (TTL: 5 minutes) -->
<html>
  <header>
    <esi:include src="/fragments/nav" />
  </header>
  <main>
    <esi:include src="/fragments/article-12345" />
  </main>
  <aside>
    <esi:include src="/fragments/trending" />
  </aside>
</html>

<!-- /fragments/nav (TTL: 1 hour — rarely changes) -->
<!-- /fragments/article-12345 (TTL: 1 day — content-hashed) -->
<!-- /fragments/trending (TTL: 5 minutes — frequently updated) -->
```

### Worked Example: The New York Times Tag-Based Purging

The New York Times uses Fastly's Surrogate-Key headers to tag every article response with its article ID, section, author, and homepage status. When an editor updates an article, the CMS sends a purge request for that article's tag. Fastly purges all cached variants of that article across all global PoPs in under 150ms. Without tag-based purging, they would need to purge by URL — but each article may be served at multiple URLs (canonical, AMP, mobile) and embedded in section pages and the homepage. Tag-based purging handles all these variants with a single API call.

### Worked Example: Shopify Flash Sale Caching

Shopify handles 80,000+ requests per second during flash sales using a Varnish-based CDN configuration with grace mode. During normal operation, product pages are cached with a 60-second TTL. During flash sales, they extend the grace (stale-while-revalidate) period to 300 seconds. If the origin becomes slow or unavailable under load, the CDN continues serving stale content while attempting to refresh. This prevents the thundering herd problem: instead of all cache misses hitting origin simultaneously, a single background refresh updates the cache while all other requests are served from stale.

### Anti-Patterns

**Vary: \* (disables caching entirely).** The `*` value tells caches that the response varies on everything — effectively uncacheable. If you see `Vary: *` in responses, it is a misconfiguration. Identify the actual varying dimensions and list them explicitly.

**Including Cookie in the cache key for public content.** If the page content is the same for all users, cookies should not be part of the cache key. Each unique cookie value creates a separate cache entry, resulting in near-0% hit rates. Use `private` caching or client-side personalization instead.

**Purging the entire cache instead of targeted paths.** A full-zone purge forces every resource to be re-fetched from origin. For a site with 100,000 cached resources, this creates a thundering herd on origin. Use path-based or tag-based purging to invalidate only what changed.

**Not separating browser TTL from CDN TTL.** Without `s-maxage`, the CDN uses `max-age` — meaning the browser and CDN have identical caching behavior. A 5-minute browser TTL makes sense (users see fresh content), but the CDN should have a longer TTL (1 hour) to maximize edge cache hits.

## Source

- RFC 9111: HTTP Caching — https://www.rfc-editor.org/rfc/rfc9111
- Fastly Surrogate-Key documentation — https://docs.fastly.com/en/guides/working-with-surrogate-keys
- Cloudflare Cache-Tag purging — https://developers.cloudflare.com/cache/how-to/purge-cache/
- W3C Edge Side Includes specification — https://www.w3.org/TR/esi-lang
- Varnish Cache documentation — https://varnish-cache.org/docs/

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
- CDN cache hit ratio exceeds 90% with cache key fragmentation minimized.
- s-maxage is configured separately from max-age for appropriate CDN vs browser TTLs.
- Tag-based or path-based purging is implemented instead of full-zone cache purges.
