# Cache Invalidation

> Solve the hardest problem in computer science — cache invalidation strategies including TTL-based expiry, event-driven invalidation, versioned cache keys, cache stampede prevention with locking and probabilistic early expiration, and fan-out invalidation for denormalized data.

## When to Use

- Users see stale data after content updates and you need faster cache freshness
- Cache expiry causes thundering herd / stampede on the origin or database
- A content management system needs real-time content updates across cached pages
- Denormalized cache entries reference data that changes independently
- You need to choose between TTL-based and event-driven invalidation
- Cache miss storms after deploys or cache restarts overload the backend
- Distributed caches across multiple regions need coordinated invalidation
- Versioned cache keys are being considered to avoid explicit invalidation
- Rate of content change varies by entity (some change hourly, some yearly)
- Cache invalidation bugs cause data inconsistency between cache and database

## Instructions

1. **Choose an invalidation strategy.** Match the strategy to your consistency requirements:

   | Strategy              | Freshness                      | Complexity | Best For                         |
   | --------------------- | ------------------------------ | ---------- | -------------------------------- |
   | TTL-based             | Eventual (up to TTL)           | Low        | Content that tolerates staleness |
   | Event-driven          | Near-real-time                 | Medium     | CMS, user-facing content         |
   | Versioned keys        | Immediate                      | Medium     | Immutable data, API responses    |
   | Hybrid (TTL + events) | Near-real-time with safety net | High       | Most production systems          |

2. **Implement TTL-based expiration with jitter.** Add random jitter to prevent synchronized expiry:

   ```javascript
   function setWithJitter(key, value, baseTTL) {
     // Add +/- 10% jitter to prevent synchronized expiry
     const jitter = baseTTL * 0.1 * (Math.random() * 2 - 1);
     const ttl = Math.round(baseTTL + jitter);
     return redis.setex(key, ttl, JSON.stringify(value));
   }

   // 300 items with baseTTL=3600 expire between 3240-3960 seconds
   // instead of all expiring at exactly 3600 seconds
   ```

3. **Implement event-driven invalidation.** Publish invalidation events when source data changes:

   ```javascript
   // On data change: publish invalidation event
   async function updateArticle(articleId, data) {
     await db.articles.update(articleId, data);

     // Publish invalidation event
     await redis.publish(
       'cache:invalidate',
       JSON.stringify({
         type: 'article',
         id: articleId,
         tags: ['homepage', `section:${data.section}`, `author:${data.authorId}`],
       })
     );
   }

   // Cache subscriber: listen for invalidation events
   const subscriber = redis.duplicate();
   subscriber.subscribe('cache:invalidate');
   subscriber.on('message', (channel, message) => {
     const event = JSON.parse(message);
     // Delete specific cache entry
     redis.del(`article:${event.id}`);
     // Delete related cache entries
     event.tags.forEach((tag) => invalidateByTag(tag));
   });
   ```

4. **Use versioned cache keys for immutable patterns.** Instead of invalidating, change the key:

   ```javascript
   // Version stored in a lightweight metadata key
   async function getArticle(articleId) {
     const version = await redis.get(`article:${articleId}:version`);
     const cacheKey = `article:${articleId}:v${version}`;

     const cached = await redis.get(cacheKey);
     if (cached) return JSON.parse(cached);

     const article = await db.articles.findById(articleId);
     await redis.setex(cacheKey, 86400, JSON.stringify(article));
     return article;
   }

   async function updateArticle(articleId, data) {
     await db.articles.update(articleId, data);
     // Increment version — old key naturally expires via TTL
     await redis.incr(`article:${articleId}:version`);
   }
   ```

5. **Prevent cache stampede with locking.** When a cache entry expires, only one process should recompute:

   ```javascript
   async function getWithLock(key, computeFn, ttl = 3600) {
     const cached = await redis.get(key);
     if (cached) return JSON.parse(cached);

     // Try to acquire lock
     const lockKey = `lock:${key}`;
     const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 30);

     if (acquired) {
       try {
         // This process recomputes
         const value = await computeFn();
         await redis.setex(key, ttl, JSON.stringify(value));
         return value;
       } finally {
         await redis.del(lockKey);
       }
     } else {
       // Another process is recomputing — wait and retry
       await new Promise((resolve) => setTimeout(resolve, 100));
       return getWithLock(key, computeFn, ttl);
     }
   }
   ```

6. **Implement probabilistic early expiration (XFetch).** Proactively refresh cache entries before they expire:

   ```javascript
   async function getWithXFetch(key, computeFn, ttl = 3600, beta = 1.0) {
     const cached = await redis.get(key);
     if (cached) {
       const entry = JSON.parse(cached);
       const now = Date.now();
       const expiry = entry.expiry;
       const delta = entry.computeTime; // ms to recompute

       // Probabilistic early recomputation
       // Higher beta = more aggressive early refresh
       const shouldRefresh = now - delta * beta * Math.log(Math.random()) >= expiry;

       if (!shouldRefresh) {
         return entry.value;
       }
     }

     // Recompute
     const start = Date.now();
     const value = await computeFn();
     const computeTime = Date.now() - start;

     await redis.setex(
       key,
       ttl,
       JSON.stringify({
         value,
         expiry: Date.now() + ttl * 1000,
         computeTime,
       })
     );

     return value;
   }
   ```

7. **Handle fan-out invalidation for denormalized data.** When a user updates their name, invalidate all cached entities that embed that name:

   ```javascript
   // Maintain a reverse index: entity → dependent cache keys
   async function invalidateUser(userId) {
     const dependents = await redis.smembers(`deps:user:${userId}`);
     // dependents might be: ['article:123', 'comment:456', 'team:789']

     if (dependents.length > 0) {
       await redis.del(...dependents);
       await redis.del(`deps:user:${userId}`);
     }
     await redis.del(`user:${userId}`);
   }
   ```

## Details

### The XFetch Algorithm

The XFetch algorithm (from the paper "Optimal Probabilistic Cache Stampede Prevention") provides a mathematically optimal solution to cache stampede. Instead of waiting for expiry and then competing for a lock, XFetch probabilistically triggers recomputation before expiry. The probability increases as the entry approaches expiry and scales with the computation cost (expensive computations start refreshing earlier). The beta parameter controls aggressiveness: beta=1.0 is optimal for single-threaded access, beta=2.0+ for high-concurrency scenarios.

### Worked Example: Facebook Lease-Based Invalidation

Facebook's Memcache infrastructure (described in their "Scaling Memcache at Facebook" NSDI 2013 paper) implements lease-based cache invalidation. When a cache miss occurs, the client receives a lease token from Memcache. Only the lease holder can write the recomputed value back to cache — other concurrent requests for the same key receive a "wait" response and retry after a short delay (typically 10ms). This prevents the stampede problem without explicit locking: at most one backend request recomputes any given cache entry, regardless of how many concurrent cache misses occur. The lease has a 10-second timeout as a safety net.

### Worked Example: Stripe Versioned Cache Keys

Stripe uses versioned cache keys with monotonically increasing generation numbers for their API response caches. When underlying data changes, the generation number is incremented atomically (a single Redis INCR operation). Cache invalidation is therefore a metadata update, not a cache purge. Old cache entries naturally expire via TTL. This approach eliminates the race condition between "delete old entry" and "write new entry" — the new version is simply a different key. It also provides implicit cache warmup: the old version continues serving until the new version is populated.

### Anti-Patterns

**Invalidating by deleting without stampede protection.** If a popular cache entry is deleted, N concurrent requests all see a cache miss simultaneously. All N requests hit the database. With 1,000 concurrent users and a 500ms query, that is 1,000 simultaneous database queries for the same data. Use locking, XFetch, or stale-while-revalidate.

**Using wallclock-based TTLs without jitter.** If 10,000 cache entries are all set with TTL=3600 at the same time (e.g., during cache warming), they all expire at the same second. Add 5-10% random jitter to spread expiry over a time window.

**Invalidating parent caches without derived caches.** If a user's name changes and you invalidate `user:123` but not `article:456` (which embeds the user's name), the article shows stale author information. Maintain dependency tracking for denormalized caches.

**Fire-and-forget invalidation without confirmation.** Network drops, Redis failovers, or message queue delays can silently prevent invalidation messages from arriving. Implement at-least-once delivery for critical invalidation events and use TTL as a safety net.

## Source

- "Scaling Memcache at Facebook" (NSDI 2013) — https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala
- "Optimal Probabilistic Cache Stampede Prevention" (XFetch algorithm) — https://cseweb.ucsd.edu/~avattani/papers/cache_stampede.pdf
- Redis documentation on distributed locking (Redlock) — https://redis.io/docs/manual/patterns/distributed-locks/
- Martin Kleppmann, "Designing Data-Intensive Applications" (O'Reilly), Chapter 5
- CDN purging best practices — Fastly, Cloudflare, Akamai documentation

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
- Cache stampede is prevented via locking, XFetch, or stale-while-revalidate on high-traffic entries.
- TTL-based expiry uses jitter to prevent synchronized cache expiration storms.
- Denormalized cache entries are invalidated when their source data changes.
