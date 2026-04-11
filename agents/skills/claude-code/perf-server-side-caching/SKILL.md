# Server-Side Caching

> Design and implement server-side caching strategies — cache-aside, read-through, write-through, and write-behind patterns with Redis and Memcached, multi-tier caching architectures, serialization optimization, and distributed cache consistency.

## When to Use

- Database queries are repeated with identical parameters across multiple requests
- API endpoint response times exceed 100ms for data that changes infrequently
- Database CPU utilization is high and read-heavy workload dominates
- Application needs sub-millisecond read latency for frequently accessed data
- You need to choose between Redis and Memcached for a caching layer
- User sessions, authentication tokens, or rate-limiting counters need fast storage
- A multi-tier caching strategy (in-process + distributed) is being designed
- Write-heavy workloads need buffering to reduce database write pressure
- Cache warming is needed after deployments or cache failures
- Microservices share data that would benefit from a centralized cache

## Instructions

1. **Choose a caching pattern.** Select based on read/write ratio and consistency requirements:

   ```
   Cache-Aside (Lazy Loading):
   Read:  App → Cache → [miss] → DB → Write to Cache → Return
   Write: App → DB → Invalidate Cache

   Read-Through:
   Read:  App → Cache → [miss] → Cache fetches from DB → Return
   Write: App → DB → Invalidate Cache

   Write-Through:
   Read:  App → Cache → [miss] → DB → Return
   Write: App → Cache → Cache writes to DB → Return

   Write-Behind (Write-Back):
   Read:  App → Cache → [miss] → DB → Return
   Write: App → Cache → Return (async write to DB later)
   ```

2. **Implement cache-aside pattern.** The most common server-side caching pattern:

   ```javascript
   async function getUser(userId) {
     const cacheKey = `user:${userId}`;

     // Try cache first
     const cached = await redis.get(cacheKey);
     if (cached) {
       return JSON.parse(cached);
     }

     // Cache miss: fetch from database
     const user = await db.users.findById(userId);

     // Write to cache with TTL
     await redis.setex(cacheKey, 3600, JSON.stringify(user));

     return user;
   }

   async function updateUser(userId, data) {
     // Write to database
     await db.users.update(userId, data);

     // Invalidate cache (not update — avoids race conditions)
     await redis.del(`user:${userId}`);
   }
   ```

3. **Choose between Redis and Memcached.**

   | Feature           | Redis                                                 | Memcached                            |
   | ----------------- | ----------------------------------------------------- | ------------------------------------ |
   | Data structures   | Strings, hashes, lists, sets, sorted sets, streams    | Strings only                         |
   | Persistence       | RDB snapshots, AOF log                                | None (pure cache)                    |
   | Replication       | Built-in primary/replica                              | None native                          |
   | Memory efficiency | Slightly higher overhead per key                      | Lower overhead, slab allocator       |
   | Max value size    | 512MB                                                 | 1MB (default)                        |
   | Multi-threaded    | Single-threaded (event loop) + I/O threads (Redis 6+) | Multi-threaded                       |
   | Use case          | Complex data, pub/sub, persistence needed             | Simple key-value, maximum throughput |

   **Default recommendation:** Redis for most applications (richer feature set). Memcached for simple key-value with very high throughput requirements.

4. **Implement multi-tier caching.** Combine in-process (L1) and distributed (L2) caches:

   ```javascript
   const lruCache = new Map(); // L1: in-process, ~1000 entries
   const LRU_MAX = 1000;
   const LRU_TTL = 30000; // 30 seconds

   async function getCached(key) {
     // L1: check in-process cache (sub-microsecond)
     const l1 = lruCache.get(key);
     if (l1 && Date.now() - l1.timestamp < LRU_TTL) {
       return l1.value;
     }

     // L2: check Redis (~0.5-1ms)
     const l2 = await redis.get(key);
     if (l2) {
       const value = JSON.parse(l2);
       lruCache.set(key, { value, timestamp: Date.now() });
       if (lruCache.size > LRU_MAX) {
         const firstKey = lruCache.keys().next().value;
         lruCache.delete(firstKey);
       }
       return value;
     }

     return null; // Cache miss — caller fetches from DB
   }
   ```

5. **Optimize serialization.** JSON is human-readable but not the most efficient. For high-throughput caching:
   - **JSON** — universally supported, ~100-500MB/s serialization
   - **MessagePack** — binary JSON, 30-50% smaller, 2-3x faster
   - **Protocol Buffers** — schema-based, smallest size, fastest decode, requires schema management

6. **Set appropriate TTLs.** TTL prevents stale data accumulation and bounds memory growth:
   - Session data: 30 minutes - 24 hours
   - User profiles: 5-15 minutes
   - Product catalog: 1-5 minutes
   - Rate-limiting counters: match the rate window (1 minute, 1 hour)
   - Config/feature flags: 30-60 seconds

7. **Handle cache failures gracefully.** The cache is not the source of truth — the database is:

   ```javascript
   async function getUserWithFallback(userId) {
     try {
       const cached = await redis.get(`user:${userId}`);
       if (cached) return JSON.parse(cached);
     } catch (error) {
       // Cache is down — fall through to database
       logger.warn('Cache unavailable, falling back to DB', { error });
     }
     return db.users.findById(userId);
   }
   ```

## Details

### Cache Consistency in Distributed Systems

In a distributed system, cache consistency depends on the invalidation pattern:

- **Delete on write** (preferred) — delete cache entry when source data changes. Next read triggers cache-aside refill. Avoids race conditions where two concurrent updates write conflicting values.
- **Update on write** (risky) — update cache with new value on write. Race condition: if two writes happen concurrently, cache may contain the loser's value while DB has the winner's value.
- **TTL-based expiry** — accept eventual consistency. Cache may be stale for up to TTL seconds. Simplest to implement.

### Worked Example: Instagram Redis Caching

Instagram uses Redis for caching user timelines, storing 300 million user sessions with sub-millisecond read latency. Their architecture uses consistent hashing across a Redis cluster to distribute keys evenly. Each Redis node handles ~100,000 operations per second. They use Redis hashes for user profile data (storing fields individually rather than serializing the entire profile), enabling partial reads and updates without deserializing the full object. Session data uses Redis strings with 24-hour TTL for automatic cleanup.

### Worked Example: GitHub Multi-Tier Caching

GitHub reduced database load by 50% by implementing a three-tier caching strategy for repository metadata: (1) per-process LRU cache (L1, ~5MB per process, 10-second TTL) handles repeated reads within a single request lifecycle, (2) Redis cluster (L2, 100GB total) handles cross-process caching with 5-minute TTL, (3) CDN edge caching (L3) handles public repository pages with 60-second TTL. A single page view for a popular repository like `torvalds/linux` hits L1 for repeated reads of the same repo metadata during template rendering, L2 for repo stats and contributor data, and L3 for the rendered HTML.

### Anti-Patterns

**Caching without TTL.** Without TTL, cache entries live forever. Stale data accumulates, eventually consuming all available memory. Redis will evict keys using its eviction policy (default: `noeviction`, which rejects new writes when memory is full). Always set explicit TTLs.

**Serializing entire ORM objects.** ORM objects include metadata, lazy-loaded relation proxies, and internal state. A User ORM object might serialize to 5KB when the actual data is 500 bytes. Extract plain data objects before caching.

**Using cache as primary data store without persistence.** Redis can persist data (RDB/AOF), but cache instances are often configured without persistence for performance. If the cache restarts, all data is lost. Never use a non-persistent cache as the sole store for important data.

**Not handling cache failures gracefully.** If every request requires cache and cache goes down, the entire application fails. Implement circuit breakers and database fallback for when cache is unavailable.

## Source

- Redis documentation — https://redis.io/docs/
- Memcached wiki — https://github.com/memcached/memcached/wiki
- "Scaling Memcache at Facebook" (NSDI 2013) — https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala
- Martin Kleppmann, "Designing Data-Intensive Applications" (O'Reilly), Chapter 5
- AWS ElastiCache best practices — https://docs.aws.amazon.com/AmazonElastiCache/latest/mem-ug/BestPractices.html

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
- Cache hit rate exceeds 80% for read-heavy workloads with appropriate TTLs set per data type.
- Cache failures do not cascade to application failures (graceful degradation to database).
- Memory consumption is bounded with explicit TTLs and eviction policies configured.
