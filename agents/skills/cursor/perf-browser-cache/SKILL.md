# Browser Caching

> Master HTTP browser caching — Cache-Control directives, ETag and Last-Modified validation, immutable assets with content-hashed filenames, stale-while-revalidate patterns, and cache partitioning in modern browsers for optimal repeat-visit performance.

## When to Use

- Repeat visitors experience slow page loads despite no content changes
- Lighthouse flags "Serve static assets with an efficient cache policy"
- DevTools Network panel shows 200 responses instead of 304 or (disk cache) for static assets
- You need to decide between no-cache, no-store, and max-age for different content types
- A deploy invalidates all cached assets unnecessarily (cache busting is too aggressive)
- Content-hashed filenames are not implemented and versioned assets are served with short TTLs
- Stale content is being served after deploys because cache invalidation is not working
- You need to understand cache partitioning impact on shared CDN-hosted resources
- API responses could benefit from conditional caching with ETags
- Cache hit rates on repeat visits are below 90%

## Instructions

1. **Audit current caching behavior.** In Chrome DevTools Network panel, check the "Size" column. Values like "(disk cache)" or "(memory cache)" indicate cached resources. Look at response headers for Cache-Control directives. Resources without caching headers or with `no-store` are fetched fresh every time.

2. **Design a caching strategy by content type.** Different content types need different caching policies:

   ```
   Static assets (JS, CSS, images) with content hash:
     Cache-Control: public, max-age=31536000, immutable

   HTML documents:
     Cache-Control: no-cache
     (or: Cache-Control: public, max-age=0, must-revalidate)

   API responses (cacheable):
     Cache-Control: private, max-age=60, stale-while-revalidate=300

   User-specific data:
     Cache-Control: private, no-cache

   Sensitive data (banking, health):
     Cache-Control: no-store
   ```

3. **Implement content-hashed filenames.** Content hashing ensures cached files are automatically invalidated when content changes:

   ```
   # Build output with content hash
   app.a1b2c3d4.js     ← hash changes when code changes
   style.e5f6g7h8.css  ← hash changes when styles change
   vendor.i9j0k1l2.js  ← hash rarely changes (stable dependencies)

   # Cache-Control for hashed files
   Cache-Control: public, max-age=31536000, immutable
   # 1 year TTL + immutable = browser never revalidates
   ```

   The HTML document (not content-hashed) references specific hashed filenames. When you deploy, the HTML changes to reference new hashes, and the browser fetches the new files.

4. **Configure ETag validation for dynamic content.** ETags allow the browser to check if content has changed without re-downloading:

   ```
   # First request
   GET /api/products
   → 200 OK
   → ETag: "abc123"
   → Cache-Control: no-cache

   # Subsequent request (browser sends conditional request)
   GET /api/products
   If-None-Match: "abc123"
   → 304 Not Modified  (no body, saves bandwidth)
   ```

5. **Use stale-while-revalidate for balanced freshness.** This directive serves the cached version immediately while fetching a fresh copy in the background:

   ```
   Cache-Control: public, max-age=3600, stale-while-revalidate=86400

   Timeline:
   0-1h:    Serve from cache (fresh)
   1h-25h:  Serve from cache (stale) + revalidate in background
   >25h:    Must revalidate before serving (cache expired)
   ```

6. **Understand browser cache layers.** Browsers maintain multiple cache tiers:
   - **Memory cache** — fastest, cleared on tab close, used for preloaded resources and recently accessed items
   - **Disk cache** — persists across sessions, used for most HTTP-cached resources
   - **Service Worker cache** — application-controlled via Cache API
   - **Push cache** — HTTP/2 push cache, cleared after connection closes

7. **Account for cache partitioning.** Modern browsers (Chrome 86+, Firefox 85+) partition the HTTP cache by top-level site. A resource cached when visiting `site-a.com` is NOT reused when visiting `site-b.com`, even if the URL is identical. This impacts shared CDN-hosted resources (Google Fonts, cdnjs, unpkg) — self-hosting eliminates the cross-site cache miss.

## Details

### Cache-Control Directive Reference

| Directive                  | Meaning                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `public`                   | Any cache (browser, CDN, proxy) may store this response    |
| `private`                  | Only the end-user browser may cache (not CDN or proxy)     |
| `max-age=N`                | Cache is fresh for N seconds from response time            |
| `s-maxage=N`               | CDN/proxy TTL (overrides max-age for shared caches)        |
| `no-cache`                 | Cache the response but revalidate before every use         |
| `no-store`                 | Do not cache at all — not in memory, not on disk           |
| `must-revalidate`          | After max-age expires, MUST revalidate (no stale serving)  |
| `immutable`                | Content will never change — skip revalidation entirely     |
| `stale-while-revalidate=N` | Serve stale for N seconds while revalidating in background |
| `stale-if-error=N`         | Serve stale for N seconds if origin returns an error       |

### Worked Example: Twitter Static Asset Caching

Twitter serves static assets with `Cache-Control: public, max-age=31536000, immutable` using content-hashed filenames (e.g., `main.a1b2c3d4.js`). This eliminates all revalidation requests on repeat visits — the browser serves directly from disk cache without any network activity. On deploy, the HTML document (cached with `no-cache`) references new hashed filenames, triggering fresh downloads only for changed assets. Unchanged assets (vendor libraries, shared components) remain cached. This approach achieves >99% cache hit rate for static assets on repeat visits.

### Worked Example: Financial Times Stale-While-Revalidate

The Financial Times implemented `stale-while-revalidate` with a 1-hour fresh window and 24-hour stale window for their article pages. Result: 95% of page views are served instantly from cache (either fresh or stale), with background revalidation keeping content within 1 hour of the latest version. For breaking news, they supplement with explicit cache purging via the CDN API. This approach reduced perceived page load time by 70% on repeat visits compared to their previous `no-cache` policy.

### Anti-Patterns

**Using no-cache when you mean no-store.** `no-cache` DOES cache the response — it just requires revalidation before each use (a conditional request). `no-store` prevents caching entirely. For truly sensitive data (banking details, health records), use `no-store`. For HTML that should always be fresh, use `no-cache` (allows 304 responses).

**Setting short max-age on versioned assets.** If filenames contain content hashes, the content at that URL will never change. Setting `max-age=3600` on `app.a1b2c3.js` forces unnecessary revalidation every hour. Use `max-age=31536000, immutable` instead.

**Forgetting Vary header with content negotiation.** If your server returns different content based on `Accept-Encoding` or `Accept-Language`, the `Vary` header must list those headers. Without it, a cache may serve a gzip-compressed response to a client that sent `Accept-Encoding: br`.

**Query string cache busting instead of filename hashing.** URLs like `/app.js?v=123` rely on all caches respecting query parameters. Some CDNs strip or ignore query strings by default. Content-hashed filenames (`/app.abc123.js`) are universally reliable.

## Source

- MDN Web Docs: HTTP Caching — https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching
- RFC 9111: HTTP Caching — https://www.rfc-editor.org/rfc/rfc9111
- web.dev: HTTP Cache — https://web.dev/articles/http-cache
- Chrome Cache Partitioning — https://developer.chrome.com/blog/http-cache-partitioning/
- Jake Archibald: "Caching best practices" — https://jakearchibald.com/2016/caching-best-practices/

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
- Static assets with content hashes use `max-age=31536000, immutable` caching.
- HTML documents use `no-cache` or equivalent to ensure fresh content on navigation.
- Repeat visit network activity shows (disk cache) for static assets instead of 200 responses.
