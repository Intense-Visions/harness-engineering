# Service Worker Caching

> Master Service Worker caching — lifecycle management (install, activate, fetch), caching strategies (cache-first, network-first, stale-while-revalidate), offline support, precaching critical assets, runtime caching with Workbox, background sync for offline writes, and cache versioning for safe updates.

## When to Use

- The application needs to work offline or in unreliable network conditions
- Repeat visit performance should be instant (sub-100ms) for critical resources
- HTTP caching alone is insufficient because you need programmatic cache control
- Users need to submit forms offline and sync when connectivity returns
- A Progressive Web App (PWA) requires offline capabilities for app store listing
- Static assets should be served from cache without any network request
- API responses should be cached with custom expiration and invalidation logic
- The application needs to show cached content during network failures
- Push notifications require a service worker for background event handling
- You need fine-grained control over which resources are cached and when

## Instructions

1. **Register and understand the service worker lifecycle.** The lifecycle ensures safe updates without disrupting active pages:

   ```typescript
   // main.ts — register the service worker
   if ('serviceWorker' in navigator) {
     window.addEventListener('load', async () => {
       const registration = await navigator.serviceWorker.register('/sw.js', {
         scope: '/',
       });

       registration.addEventListener('updatefound', () => {
         const newWorker = registration.installing;
         newWorker?.addEventListener('statechange', () => {
           if (newWorker.state === 'activated') {
             // New version active — prompt user to refresh
             showUpdateBanner();
           }
         });
       });
     });
   }
   ```

   ```typescript
   // sw.ts — service worker lifecycle events
   const CACHE_VERSION = 'v2';
   const PRECACHE_ASSETS = ['/', '/styles.css', '/app.js', '/offline.html'];

   // Install: precache critical assets
   self.addEventListener('install', (event: ExtendableEvent) => {
     event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_ASSETS)));
     self.skipWaiting(); // activate immediately (use with caution)
   });

   // Activate: clean up old caches
   self.addEventListener('activate', (event: ExtendableEvent) => {
     event.waitUntil(
       caches
         .keys()
         .then((keys) =>
           Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
         )
     );
     self.clients.claim(); // take control of all pages
   });
   ```

2. **Implement caching strategies for different resource types.**

   ```typescript
   // Cache-First: best for static assets (JS, CSS, images with content hashes)
   async function cacheFirst(request: Request): Promise<Response> {
     const cached = await caches.match(request);
     if (cached) return cached;

     const response = await fetch(request);
     if (response.ok) {
       const cache = await caches.open(CACHE_VERSION);
       cache.put(request, response.clone());
     }
     return response;
   }

   // Network-First: best for API data that should be fresh
   async function networkFirst(request: Request): Promise<Response> {
     try {
       const response = await fetch(request);
       if (response.ok) {
         const cache = await caches.open('api-cache');
         cache.put(request, response.clone());
       }
       return response;
     } catch {
       const cached = await caches.match(request);
       if (cached) return cached;
       return new Response('Offline', { status: 503 });
     }
   }

   // Stale-While-Revalidate: best for frequently updated content (feeds, lists)
   async function staleWhileRevalidate(request: Request): Promise<Response> {
     const cache = await caches.open('swr-cache');
     const cached = await cache.match(request);

     const fetchPromise = fetch(request).then((response) => {
       if (response.ok) {
         cache.put(request, response.clone());
       }
       return response;
     });

     return cached || fetchPromise;
   }
   ```

3. **Route requests to appropriate strategies.** Use the fetch event to intercept and handle requests:

   ```typescript
   self.addEventListener('fetch', (event: FetchEvent) => {
     const { request } = event;
     const url = new URL(request.url);

     // Static assets with content hashes: cache-first (immutable)
     if (url.pathname.match(/\.(js|css|woff2)$/) && url.pathname.includes('.')) {
       event.respondWith(cacheFirst(request));
       return;
     }

     // HTML pages: network-first (always try to get fresh)
     if (request.headers.get('accept')?.includes('text/html')) {
       event.respondWith(networkFirst(request));
       return;
     }

     // API requests: stale-while-revalidate
     if (url.pathname.startsWith('/api/')) {
       event.respondWith(staleWhileRevalidate(request));
       return;
     }

     // Images: cache-first
     if (request.destination === 'image') {
       event.respondWith(cacheFirst(request));
       return;
     }

     // Default: network with cache fallback
     event.respondWith(networkFirst(request));
   });
   ```

4. **Use Workbox for production service workers.** Workbox provides battle-tested caching strategies and precaching:

   ```typescript
   import { precacheAndRoute } from 'workbox-precaching';
   import { registerRoute } from 'workbox-routing';
   import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
   import { ExpirationPlugin } from 'workbox-expiration';
   import { CacheableResponsePlugin } from 'workbox-cacheable-response';

   precacheAndRoute(self.__WB_MANIFEST);

   // Images: cache-first, 100 entries, 30 days
   registerRoute(
     ({ request }) => request.destination === 'image',
     new CacheFirst({
       cacheName: 'images',
       plugins: [
         new CacheableResponsePlugin({ statuses: [0, 200] }),
         new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
       ],
     })
   );

   // API: stale-while-revalidate, 50 entries, 5 min
   registerRoute(
     ({ url }) => url.pathname.startsWith('/api/'),
     new StaleWhileRevalidate({
       cacheName: 'api-responses',
       plugins: [
         new CacheableResponsePlugin({ statuses: [0, 200] }),
         new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 }),
       ],
     })
   );

   // Pages: network-first with 3s timeout
   registerRoute(
     ({ request }) => request.mode === 'navigate',
     new NetworkFirst({ cacheName: 'pages', networkTimeoutSeconds: 3 })
   );
   ```

5. **Implement offline fallback pages.** For navigation requests, catch fetch failures and serve the cached page or a precached `/offline.html`. Use `event.request.mode === 'navigate'` to detect page navigations.

6. **Implement background sync for offline writes.** On fetch failure, store the request in IndexedDB and call `registration.sync.register('tag')`. In the service worker, listen for the `sync` event, retrieve queued submissions, replay them via `fetch`, and remove from the queue on success. This enables offline form submission and data sync.

7. **Handle service worker updates safely.** Do not call `skipWaiting()` unconditionally. Instead, show an update banner when `registration.waiting` is detected, and only call `skipWaiting()` via `postMessage` when the user clicks "Update". Listen for `controllerchange` on the main page to reload once (guard with a `refreshing` flag to avoid loops).

## Details

### Service Worker Scope and Lifecycle

A service worker controls all pages within its scope. The lifecycle prevents race conditions: a new worker installs in the background while the old one serves current pages, activating only when all controlled pages close (or `skipWaiting()` is called). This ensures consistent cached resource versions at the cost of delayed updates.

### Worked Example: Twitter Lite PWA

Workbox with layered strategies: cache-first for static assets (precache manifest for atomic updates), stale-while-revalidate for timeline API, cache-first with 100-entry LRU for images. Background sync queues drafts and likes offline. Result: 65% lower data usage on repeat visits, 30% faster perceived load, 75% increase in tweets sent.

### Worked Example: Starbucks PWA

Menu and store locator precached at install (~1.5MB). App shell loads from cache in <100ms; personalized content fetches from network. Offline shows full menu from cache. Background sync handles orders during connectivity drops. The PWA is 99.84% smaller than the native iOS app (233KB vs 148MB).

### Anti-Patterns

**Using skipWaiting() unconditionally.** `skipWaiting()` activates the new worker immediately, potentially serving old cached HTML with new cached JS. This causes version mismatch errors. Use skipWaiting only with a user-initiated refresh prompt.

**Caching POST requests or authenticated responses.** The Cache API keys on URL only, not request body. Authenticated responses may leak across users on shared devices.

**Not setting cache size limits.** Without expiration or max entries, caches grow indefinitely. Always use ExpirationPlugin or manual cleanup.

**Caching opaque responses without understanding the cost.** Chrome allocates 7MB quota per opaque (status 0) response. Use CacheableResponsePlugin to filter by status.

## Source

- MDN: Service Worker API — https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- Workbox — https://developer.chrome.com/docs/workbox/
- web.dev: Service workers and the Cache Storage API — https://web.dev/articles/service-workers-cache-storage
- Jake Archibald: "The Service Worker Lifecycle" — https://web.dev/articles/service-worker-lifecycle

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Critical assets are precached during service worker install for instant repeat visits.
- Caching strategies match resource types (cache-first for static, network-first for HTML, SWR for API).
- Cache size is bounded with expiration policies on all runtime caches.
- An offline fallback page is shown when the network is unavailable.
- Service worker updates are handled safely with user-prompted refresh.
