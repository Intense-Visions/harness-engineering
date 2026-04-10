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
   // sw.ts — using Workbox
   import { precacheAndRoute } from 'workbox-precaching';
   import { registerRoute } from 'workbox-routing';
   import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
   import { ExpirationPlugin } from 'workbox-expiration';
   import { CacheableResponsePlugin } from 'workbox-cacheable-response';

   // Precache build assets (injected by build tool)
   precacheAndRoute(self.__WB_MANIFEST);

   // Cache images: cache-first with expiration
   registerRoute(
     ({ request }) => request.destination === 'image',
     new CacheFirst({
       cacheName: 'images',
       plugins: [
         new CacheableResponsePlugin({ statuses: [0, 200] }),
         new ExpirationPlugin({
           maxEntries: 100,
           maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
         }),
       ],
     })
   );

   // Cache API responses: stale-while-revalidate with max age
   registerRoute(
     ({ url }) => url.pathname.startsWith('/api/'),
     new StaleWhileRevalidate({
       cacheName: 'api-responses',
       plugins: [
         new CacheableResponsePlugin({ statuses: [0, 200] }),
         new ExpirationPlugin({
           maxEntries: 50,
           maxAgeSeconds: 5 * 60, // 5 minutes
         }),
       ],
     })
   );

   // Cache pages: network-first with offline fallback
   registerRoute(
     ({ request }) => request.mode === 'navigate',
     new NetworkFirst({
       cacheName: 'pages',
       networkTimeoutSeconds: 3,
       plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
     })
   );
   ```

5. **Implement offline fallback pages.** Show a meaningful offline page when the network is unavailable:

   ```typescript
   // In the fetch event handler, after network-first fails:
   self.addEventListener('fetch', (event: FetchEvent) => {
     if (event.request.mode === 'navigate') {
       event.respondWith(
         fetch(event.request).catch(async () => {
           const cache = await caches.open(CACHE_VERSION);
           const cached = await cache.match(event.request);
           if (cached) return cached;
           return cache.match('/offline.html');
         })
       );
     }
   });
   ```

6. **Implement background sync for offline writes.** Queue failed POST requests and retry when connectivity returns:

   ```typescript
   // main.ts — register sync when offline
   async function submitForm(data: FormData) {
     try {
       await fetch('/api/submit', { method: 'POST', body: data });
     } catch {
       // Store in IndexedDB and register sync
       await saveToQueue(data);
       const registration = await navigator.serviceWorker.ready;
       await registration.sync.register('submit-form');
       showNotification('Saved offline. Will sync when online.');
     }
   }

   // sw.ts — handle sync event
   self.addEventListener('sync', (event: SyncEvent) => {
     if (event.tag === 'submit-form') {
       event.waitUntil(
         getQueuedSubmissions().then((submissions) =>
           Promise.all(
             submissions.map(async (data) => {
               await fetch('/api/submit', { method: 'POST', body: data });
               await removeFromQueue(data.id);
             })
           )
         )
       );
     }
   });
   ```

7. **Handle service worker updates safely.** Avoid breaking active sessions during updates:

   ```typescript
   // sw.ts — controlled update strategy
   self.addEventListener('install', (event) => {
     // DON'T call skipWaiting() — let the user decide when to update
     event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_ASSETS)));
   });

   // main.ts — prompt user for update
   let refreshing = false;
   navigator.serviceWorker.addEventListener('controllerchange', () => {
     if (!refreshing) {
       refreshing = true;
       window.location.reload();
     }
   });

   function promptUpdate(registration: ServiceWorkerRegistration) {
     const updateBanner = document.getElementById('update-banner');
     updateBanner.style.display = 'block';
     updateBanner.querySelector('button').addEventListener('click', () => {
       registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
     });
   }

   // sw.ts — listen for skip waiting message
   self.addEventListener('message', (event) => {
     if (event.data?.type === 'SKIP_WAITING') {
       self.skipWaiting();
     }
   });
   ```

## Details

### Service Worker Scope and Lifecycle

A service worker controls all pages within its scope (defined by the registration URL). The lifecycle prevents race conditions: a new service worker installs in the background while the old one serves current pages. The new worker activates only when all pages controlled by the old worker are closed (or `skipWaiting()` is called). This ensures users never see a mix of old and new cached resources. The trade-off: updates are delayed until all tabs are closed unless `skipWaiting()` is used.

### Worked Example: Twitter Lite PWA

Twitter Lite (now X Lite) uses Workbox with a layered caching strategy. Static assets (JS, CSS, icons) use cache-first with the precache manifest ensuring atomic updates. Timeline API responses use stale-while-revalidate so tweets appear instantly from cache while fresh data loads in the background. Images use cache-first with a 100-entry LRU cache. The offline page shows cached tweets and a banner indicating offline status. Background sync queues tweet drafts and likes when offline. Result: 65% lower data usage on repeat visits, 30% faster perceived load time, and full offline reading capability. This drove 75% increase in tweets sent and 20% decrease in bounce rate.

### Worked Example: Starbucks PWA

Starbucks' PWA uses service worker caching to deliver a near-native app experience on mobile web. The menu and store locator are precached at install time (~1.5MB). Subsequent visits load the app shell from cache in <100ms, then fetch personalized content (rewards, recent orders) from the network. The offline experience shows the full menu and nearest stores from cache. Background sync handles mobile order placement during connectivity drops. The PWA is 99.84% smaller than their native iOS app (233KB vs 148MB) and loads 3x faster on repeat visits.

### Anti-Patterns

**Using skipWaiting() unconditionally.** `skipWaiting()` activates the new worker immediately, potentially serving old cached HTML with new cached JS. This causes version mismatch errors. Use skipWaiting only with a user-initiated refresh prompt.

**Caching POST requests or authenticated responses.** The Cache API is designed for GET requests. Caching POST responses causes confusion because the cache key is the URL, not the request body. Authenticated responses cached by the service worker may be served to different users on shared devices.

**Not setting cache size limits.** Without expiration or max entries, the service worker cache grows indefinitely. Mobile devices have limited storage. Always use ExpirationPlugin or manual cleanup to limit cache size.

**Caching opaque responses without understanding the cost.** Cross-origin responses without CORS headers are "opaque" (status 0). Chrome allocates 7MB of storage quota per opaque response. Caching many opaque responses quickly exhausts storage. Use CacheableResponsePlugin to filter by status.

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
