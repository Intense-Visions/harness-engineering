# DOM Parsing

> Understand the HTML5 parsing algorithm — tokenization, tree construction, speculative parsing, and the preload scanner — to minimize parser-blocking delays and accelerate DOM construction.

## When to Use

- DOMContentLoaded fires significantly later than expected relative to HTML size
- DevTools shows long "Parse HTML" blocks in the Performance timeline
- The page uses `document.write()` to inject scripts or content dynamically
- Scripts in the `<head>` are blocking the parser and delaying resource discovery
- You are deciding between `defer`, `async`, or module scripts for loading strategy
- The page has a DOM tree exceeding 1,500 nodes and you need to understand the performance implications
- Server-side rendering flushes large HTML payloads and you want to optimize chunked delivery
- You see "A Parser-blocking, cross site script" warnings in Chrome DevTools
- The preload scanner is failing to discover critical resources before the parser reaches them
- `DOMContentLoaded` and `load` event timings differ significantly and you need to understand why

## Instructions

1. **Understand the HTML5 parsing pipeline.** The parser operates in four stages: byte stream decoding (charset detection), tokenization (converting characters into tokens: start tags, end tags, character data, comments), tree construction (building the DOM tree from tokens following the HTML5 algorithm's insertion modes), and script execution (when a `<script>` tag is encountered without `defer`/`async`).

2. **Identify parser-blocking resources.** A classic `<script src="...">` tag without `defer` or `async` halts the HTML parser completely. The parser must wait for the script to download and execute before it can continue building the DOM. This is because scripts can call `document.write()` which modifies the token stream.

   ```html
   <!-- Parser-blocking: parser stops, downloads, executes, then resumes -->
   <script src="/heavy-library.js"></script>

   <!-- Non-parser-blocking: parser continues, script executes after parsing -->
   <script src="/heavy-library.js" defer></script>

   <!-- Module scripts are deferred by default -->
   <script type="module" src="/app.js"></script>
   ```

3. **Leverage the preload scanner.** When the main parser is blocked on a script, browsers run a secondary "preload scanner" (also called speculative parser) that scans ahead in the raw HTML to discover resources like images, stylesheets, and other scripts. It then initiates fetches for those resources in parallel. The preload scanner typically improves page load times by 20% or more (per Chrome team measurements).

4. **Avoid defeating the preload scanner.** The preload scanner can only find resources visible in the raw HTML. Resources loaded via JavaScript, CSS `background-image`, or `document.write()` are invisible to it.

   ```javascript
   // BAD: invisible to preload scanner — discovered only when JS executes
   const img = new Image();
   img.src = '/hero.jpg';

   // GOOD: visible to preload scanner in raw HTML
   // <link rel="preload" href="/hero.jpg" as="image">
   ```

5. **Use streaming HTML delivery.** Flush the `<head>` and initial content as soon as possible:

   ```javascript
   // Express.js streaming example
   app.get('/', (req, res) => {
     res.setHeader('Content-Type', 'text/html');
     res.write(`<!DOCTYPE html><html><head>
       <link rel="stylesheet" href="/critical.css">
       <link rel="preload" href="/hero.jpg" as="image">
     </head><body><div id="root">`);

     // Continue processing while browser fetches resources
     const data = await fetchData();
     res.write(renderContent(data));
     res.end('</div></body></html>');
   });
   ```

6. **Measure DOM parsing performance.** Use the Navigation Timing API to isolate parsing time:

   ```javascript
   const nav = performance.getEntriesByType('navigation')[0];
   const parsingTime = nav.domInteractive - nav.responseEnd;
   const domContentLoaded = nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart;
   console.log(`DOM parsing: ${parsingTime}ms, DOMContentLoaded handler: ${domContentLoaded}ms`);
   ```

## Details

### Tokenizer and Tree Construction

The HTML5 tokenizer is a state machine with 80+ states. It processes the character stream and emits tokens: DOCTYPE, start tag, end tag, comment, character, and end-of-file. The tree construction stage consumes these tokens and builds the DOM tree according to the HTML5 specification's precise rules for handling malformed markup (foster parenting, adoption agency algorithm, implicit tag closing).

Key performance insight: the tokenizer is fast (linear in input size), but tree construction can be expensive when the DOM tree is deep. Each node insertion requires walking up the tree to find the correct insertion point. Browsers optimize this with stack-based insertion mode tracking, but pathologically deep nesting (>1,500 levels) degrades performance.

### Speculative Parsing Architecture

When the main parser blocks on a synchronous script, the speculative parser takes over. It does not build a DOM tree. Instead, it scans the raw byte stream for URLs in known attributes (`href`, `src`, `poster`, `srcset`) and queues them for download. This happens on a separate thread in most modern browsers.

The speculative parser has limitations: it cannot parse JavaScript, evaluate CSS `url()` values, or follow redirects in meta refresh tags. It also cannot discover resources that depend on the execution of earlier scripts.

### Worked Example: Chrome Preload Scanner Impact

The Chrome team measured the impact of the preload scanner across 10,000 popular sites. On average, disabling the preload scanner increased page load time by 20%. On sites with many synchronous scripts in the `<head>`, the impact was even larger — up to 50% slower. The scanner discovers an average of 7 resources per page before the main parser reaches them, saving one or more network roundtrips.

### Worked Example: eBay Streaming HTML Architecture

eBay implemented streaming HTML where the server flushes the `<head>` section (containing critical CSS links and preload hints) within 100ms, before backend data fetching completes. The body content streams as data becomes available. This architecture reduced time-to-first-byte for visual content from 800ms to 100ms. The browser begins fetching CSS and fonts while the server is still querying databases and assembling page content.

### Anti-Patterns

**`document.write()` for script injection.** `document.write()` inserts content directly into the parser's token stream, which forces the parser to restart tokenization. On 2G connections, Chrome intervenes and blocks `document.write()`-injected cross-origin scripts entirely because the delay is too severe. Use `document.createElement('script')` and `appendChild` instead.

**Excessive DOM depth.** DOM trees deeper than 1,500 nodes cause quadratic increases in style recalculation cost. Each CSS selector match requires walking up the ancestor chain. Trees with more than 32 levels of nesting also trigger browser-specific performance cliffs in layout computation.

**Parser-blocking scripts in `<head>` without `defer`/`async`.** Every synchronous script in `<head>` adds download time plus execution time to the critical path before the browser can start rendering. A chain of 5 synchronous scripts, each taking 200ms to download, adds 1 second of sequential blocking even if the preload scanner discovers them early.

**Injecting large HTML via `innerHTML`.** Setting `innerHTML` bypasses incremental parsing. The browser must parse the entire HTML string at once, construct the subtree, and insert it. For large fragments (>10KB of HTML), this creates a noticeable jank spike. Use `insertAdjacentHTML` for incremental insertions or `DocumentFragment` for batch DOM construction.

### DOMContentLoaded vs load Event

`DOMContentLoaded` fires when the HTML document is fully parsed and all deferred scripts have executed, but external resources like images, stylesheets loaded asynchronously, and subframes may still be loading. The `load` event fires only when all dependent resources are fully loaded.

Key timing relationships:

- `responseEnd` — HTML bytes fully received
- `domInteractive` — HTML parsing complete, DOM tree built
- `domContentLoadedEventStart` — deferred scripts executed, ready for DOM manipulation
- `loadEventStart` — all resources loaded (images, stylesheets, subframes)

The gap between `domInteractive` and `domContentLoadedEventStart` represents deferred script execution time. A large gap indicates heavy deferred JavaScript that should be code-split or lazy-loaded.

### DOM Size Budget

For optimal performance, target these DOM complexity budgets:

- Total DOM elements: fewer than 1,500 (Google Lighthouse warns at 800, flags at 1,400)
- Maximum DOM depth: fewer than 32 levels
- Maximum child elements per parent: fewer than 60

Each additional DOM node increases memory usage by approximately 0.5-1KB and adds incremental cost to style recalculation, layout, and garbage collection.

## Source

- HTML Living Standard, Section 13: Parsing — https://html.spec.whatwg.org/multipage/parsing.html
- Chrome Preload Scanner documentation — https://web.dev/articles/preload-scanner
- WebKit Blog: Speculative Parsing — https://webkit.org/blog/
- "High Performance Browser Networking" by Ilya Grigorik (O'Reilly)

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
- DOM parsing time is measured before and after optimization using Navigation Timing API.
- Parser-blocking resources are eliminated or appropriately deferred.
