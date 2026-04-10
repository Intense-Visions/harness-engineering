# Content Compression

> Master content compression for web delivery — Brotli, gzip, and Zstandard algorithms, compression level selection, content-encoding negotiation, static pre-compression vs dynamic compression, and format-specific optimization strategies.

## When to Use

- Transfer sizes for text-based assets (HTML, CSS, JS, JSON, SVG) are not minimized
- Lighthouse flags "Enable text compression" as a performance opportunity
- You need to choose between Brotli and gzip for your server or CDN configuration
- Build pipeline needs pre-compression of static assets for maximum compression without runtime CPU cost
- API responses are large JSON payloads that would benefit from compression
- CDN configuration needs correct Vary and Content-Encoding header setup
- You are evaluating Zstandard (zstd) as an emerging compression alternative
- Compression is applied to resources that should not be compressed (images, video)
- Server CPU usage is high from dynamic compression and you need to optimize compression levels
- Transfer size budgets require maximizing compression ratios for text assets

## Instructions

1. **Verify compression is active.** In Chrome DevTools Network panel, check the "Content-Encoding" response header for `br` (Brotli), `gzip`, or `zstd`. Compare "Size" column (transfer size) vs "Size" column tooltip (uncompressed size). If they are equal, compression is not active.

   ```bash
   # Check compression with curl
   curl -H "Accept-Encoding: br, gzip" -I https://example.com/app.js
   # Look for: Content-Encoding: br
   ```

2. **Choose the right algorithm.** Decision matrix:

   | Algorithm      | Compression Ratio       | Compression Speed   | Decompression Speed | Browser Support |
   | -------------- | ----------------------- | ------------------- | ------------------- | --------------- |
   | gzip (deflate) | Baseline                | Fast (levels 1-4)   | Very fast           | 100%            |
   | Brotli         | 15-26% better than gzip | Slow at high levels | Very fast           | 97%             |
   | Zstandard      | 10-20% better than gzip | Very fast           | Very fast           | ~70% (emerging) |

   **Default recommendation:** Brotli for static assets (pre-compressed at build time), Brotli level 4-6 for dynamic responses, gzip as fallback.

3. **Configure static pre-compression.** For build artifacts (JS, CSS, HTML), compress at build time at maximum quality:

   ```bash
   # Brotli pre-compression (level 11 — slow but maximum compression)
   brotli -q 11 dist/app.js     # creates dist/app.js.br
   brotli -q 11 dist/style.css  # creates dist/style.css.br

   # gzip pre-compression (level 9 — maximum for gzip)
   gzip -k -9 dist/app.js       # creates dist/app.js.gz
   ```

   Configure the server to serve pre-compressed files when available:

   ```nginx
   # Nginx: serve pre-compressed files
   gzip_static on;
   brotli_static on;
   ```

4. **Configure dynamic compression for generated responses.** For API responses, HTML templates, and other dynamic content, use moderate compression levels:

   ```nginx
   # Nginx dynamic Brotli configuration
   brotli on;
   brotli_comp_level 4;  # Good balance of compression and CPU
   brotli_types text/html text/plain text/css application/json
                 application/javascript text/xml application/xml
                 image/svg+xml;

   # Nginx dynamic gzip configuration (fallback)
   gzip on;
   gzip_comp_level 6;
   gzip_types text/html text/plain text/css application/json
              application/javascript text/xml application/xml
              image/svg+xml;
   gzip_min_length 1000;  # Don't compress tiny responses
   ```

5. **Set correct response headers.** Ensure Content-Encoding and Vary headers are correct:

   ```
   Content-Encoding: br
   Vary: Accept-Encoding
   ```

   The `Vary: Accept-Encoding` header tells caches to store separate versions for different encodings. Without it, a CDN might serve a Brotli-compressed response to a client that only supports gzip.

6. **Know what NOT to compress.** Skip compression for:
   - Already-compressed formats: JPEG, PNG, WebP, AVIF, MP4, WOFF2, ZIP
   - Very small responses (<1KB): compression metadata overhead exceeds savings
   - Encrypted content: compression before encryption can leak information (BREACH attack)

7. **Measure compression effectiveness.** Compare transfer sizes before and after:

   ```javascript
   // Measure compression ratio for each resource
   const resources = performance.getEntriesByType('resource');
   resources.forEach((r) => {
     if (r.transferSize > 0 && r.decodedBodySize > 0) {
       const ratio = (1 - r.transferSize / r.decodedBodySize) * 100;
       console.log(`${r.name}: ${ratio.toFixed(1)}% compressed`);
     }
   });
   ```

## Details

### Compression Level Selection Guide

Brotli levels 0-11 offer a wide range of speed/ratio tradeoffs:

- **Brotli 0-3:** Faster than gzip with similar compression. Use for real-time streaming.
- **Brotli 4-6:** Sweet spot for dynamic content. Brotli 4 outperforms gzip 9 in both ratio and speed for typical web content.
- **Brotli 7-9:** Diminishing returns. Only use if CPU is plentiful.
- **Brotli 10-11:** 100x slower than level 4. Only for pre-compressed static assets.

For gzip: level 6 is the standard default. Level 9 adds ~5% compression for ~50% more CPU. Level 1 is useful for real-time compression of large streaming responses.

### Brotli's Web Dictionary

Brotli includes a built-in static dictionary of common web content fragments (HTML tags, CSS properties, JavaScript keywords). This gives Brotli a significant advantage over gzip for small web resources. A 10KB JavaScript file might compress 20% better with Brotli than gzip specifically because common patterns like `function`, `return`, `document.getElementById` are in the dictionary.

### Worked Example: LinkedIn Compression Migration

LinkedIn reduced transfer sizes by 20% across their static assets by switching from gzip-6 (their previous standard) to a dual strategy: Brotli-11 for build-time pre-compressed static assets and Brotli-5 for dynamic API responses. The static assets (JS bundles, CSS) saw the largest gains — a 450KB (uncompressed) JavaScript bundle went from 120KB with gzip-6 to 95KB with Brotli-11. The migration required: adding Brotli pre-compression to the build pipeline, configuring Nginx brotli_static module, and ensuring the CDN correctly varied on Accept-Encoding.

### Worked Example: Cloudflare Compression Benchmarks

Cloudflare published benchmarks showing that Brotli level 4 outperforms gzip level 9 in both compression ratio (4.5% better) and compression speed (15% faster) for typical web content (HTML, CSS, JS). For their CDN, they use Brotli-4 as the default dynamic compression level, which compresses a typical 100KB HTML page in 2ms (vs 3ms for gzip-9) while achieving a 25:1 compression ratio (vs 22:1 for gzip-9). They estimate this saves 15-20% bandwidth globally across their network.

### Anti-Patterns

**Compressing already-compressed formats.** JPEG, PNG, WebP, MP4, WOFF2, and ZIP files are already compressed. Attempting to compress them adds CPU cost with near-zero (<1%) size reduction, and may even increase size due to compression metadata overhead.

**Using Brotli level 11 for dynamic responses.** Brotli-11 takes approximately 100x longer than Brotli-4 to compress the same content. For a dynamic API response, this adds 50-200ms of CPU time per request. Use Brotli-11 only for static pre-compression at build time.

**Not setting Vary: Accept-Encoding.** Without this header, a CDN or proxy may cache the Brotli-compressed version and serve it to a client that only supports gzip (causing a decode error) or cache the uncompressed version and serve it to a client that supports Brotli (wasting bandwidth).

**Compressing responses under 1KB.** The overhead of compression framing (gzip header: ~20 bytes, Brotli header: ~10 bytes) combined with the minimum block size means very small responses may not shrink or may even grow after compression. Set a minimum size threshold (1KB recommended).

## Source

- RFC 7932: Brotli Compressed Data Format — https://www.rfc-editor.org/rfc/rfc7932
- RFC 1952: GZIP File Format Specification — https://www.rfc-editor.org/rfc/rfc1952
- RFC 8878: Zstandard Compression — https://www.rfc-editor.org/rfc/rfc8878
- Google Brotli repository and benchmarks — https://github.com/google/brotli
- Cloudflare compression benchmarks — https://blog.cloudflare.com/results-experimenting-brotli/

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
- All text-based assets (HTML, CSS, JS, JSON, SVG) are served with Content-Encoding: br or gzip.
- Static assets use Brotli pre-compression at maximum quality (level 11) from the build pipeline.
- Vary: Accept-Encoding is present on all compressed responses for correct CDN caching behavior.
