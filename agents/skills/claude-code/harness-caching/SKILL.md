# Harness Caching

> Advisory guide for cache strategies, invalidation patterns, and distributed caching. Detects existing cache usage, analyzes access patterns, designs cache layers with proper invalidation, and validates consistency guarantees.

## When to Use

- When adding a caching layer to an existing application (Redis, Memcached, in-memory)
- When designing cache invalidation strategies for data consistency
- When troubleshooting cache-related bugs (stale data, thundering herd, cache stampede)
- When evaluating HTTP caching headers (Cache-Control, ETag, Vary)
- When designing a distributed cache for a multi-instance deployment
- When reviewing CDN caching configuration for static or dynamic content
- NOT for database query optimization (use harness-database for indexing and query patterns)
- NOT for message queue pub/sub with Redis (use harness-event-driven for async messaging)
- NOT for session storage design (use harness-auth for session management patterns)
- NOT for in-memory data structures or algorithms (this skill focuses on caching as an architectural pattern)

## Process

### Phase 1: DETECT -- Identify Existing Cache Usage and Backends

1. **Detect cache backends.** Scan for stack signals: `docker-compose.*redis*` or `ioredis`/`redis` imports for Redis, `docker-compose.*memcached*` or `memcached` imports for Memcached, `node-cache` or `lru-cache` imports for in-memory caches. Check for CDN configuration in `vercel.json`, `netlify.toml`, `cloudfront`, or nginx config files.

2. **Map existing cache usage.** Scan for cache operations: `cache.get(`, `cache.set(`, `redis.get(`, `redis.set(`, `redis.hget(`, `.setex(`, `.getex(`, and memoization decorators (`@Cacheable`, `@CacheEvict`). For each cache call, record: the cache key pattern, the TTL, the data being cached, and the source module.

3. **Identify access patterns.** For each cached resource, classify the access pattern: read-heavy (high read:write ratio, good cache candidate), write-heavy (frequent updates, invalidation-critical), time-sensitive (TTL must be short), or session-scoped (per-user data). Count the approximate read:write ratio from code analysis.

4. **Detect cache invalidation logic.** Scan for cache deletion or expiration calls: `cache.del(`, `redis.del(`, `cache.invalidate(`, `redis.expire(`, `cache.clear(`. Map each invalidation to the corresponding write operation. Flag cached data that is written but never explicitly invalidated.

5. **Check for existing cache problems.** Look for common anti-patterns: unbounded caches (no maxSize or TTL), cache keys built from user input without sanitization, cache-aside with no error handling on cache miss, and string-concatenated keys without namespace prefixes.

### Phase 2: ANALYZE -- Evaluate Cache Effectiveness and Risks

1. **Assess TTL appropriateness.** For each cached resource, evaluate whether the TTL matches the data's volatility. WHERE a frequently-updated resource has a TTL greater than 60 seconds, THEN flag potential staleness. WHERE a rarely-updated resource has a TTL less than 60 seconds, THEN flag unnecessary cache churn.

2. **Check for thundering herd risk.** WHERE a popular cache key expires and multiple concurrent requests trigger simultaneous cache rebuilds, THEN flag the thundering herd. Identify keys with high read frequency and non-trivial rebuild cost (database query, external API call).

3. **Evaluate cache key design.** Check for: overly broad keys that cache too much data (reducing hit rate), overly specific keys that create too many entries (memory pressure), missing namespace prefixes (key collision risk across features), and keys that include volatile data (timestamp, random ID) making them un-cacheable.

4. **Assess memory pressure.** WHERE an in-memory cache has no `maxSize` configuration, THEN flag unbounded memory growth. WHERE Redis is used without a `maxmemory` policy, THEN flag the risk of Redis running out of memory and evicting keys unpredictably.

5. **Check cache-database consistency.** Trace each write path that modifies cached data. WHERE the database write succeeds but cache invalidation could fail (separate operations, no transaction), THEN flag the consistency risk. Classify as eventual consistency (acceptable) or strong consistency (requires synchronous invalidation).

### Phase 3: DESIGN -- Recommend Cache Strategies and Key Schemas

1. **Select the cache strategy per resource.** Based on the access pattern analysis:
   - **Cache-aside (lazy loading):** Application checks cache first, loads from database on miss, populates cache. Best for read-heavy data with tolerance for occasional staleness.
   - **Write-through:** Application writes to cache and database simultaneously. Best for data that must be fresh on the next read.
   - **Write-behind (write-back):** Application writes to cache, cache asynchronously flushes to database. Best for write-heavy workloads where some data loss risk is acceptable.
   - **Read-through:** Cache itself loads from the database on miss. Best when using a cache framework that supports it (e.g., Spring Cache, NestJS CacheModule).

2. **Design the key schema.** Produce a key naming convention: `{service}:{resource}:{identifier}:{variant}`. Examples: `api:user:123:profile`, `api:products:list:page=1&limit=20`, `api:config:feature-flags:v2`. Include version suffixes for keys whose structure may change during deployments.

3. **Design invalidation strategy.** For each cached resource:
   - **TTL-based:** Set a TTL that balances freshness with hit rate. Include jitter (randomize TTL +/- 10%) to prevent synchronized expiration.
   - **Event-based:** Invalidate on write events. Wire cache invalidation into the write path or subscribe to database change events.
   - **Tag-based:** Group related keys with tags. Invalidate all keys with a tag in a single operation (e.g., invalidate all `user:123:*` keys when user 123 updates their profile).

4. **Design thundering herd protection.** For high-traffic keys, implement one or more: lock-based recomputation (only one request rebuilds the cache, others wait), stale-while-revalidate (serve stale data while rebuilding in background), probabilistic early expiration (some requests refresh before TTL expires), or request coalescing (deduplicate identical concurrent requests).

5. **Design cache warming.** WHERE the application has predictable traffic patterns (e.g., morning spike), THEN recommend preloading popular cache keys during low-traffic periods. Define the warming strategy: full preload, top-N most accessed keys, or on-deploy warming for critical paths.

### Phase 4: VALIDATE -- Verify Consistency and Failure Modes

1. **Verify invalidation completeness.** For every write path that modifies cacheable data, confirm that the corresponding cache keys are invalidated. Trace through the code: database write -> cache invalidation. Flag any write path that modifies data without invalidating the cache.

2. **Test cache failure gracefully.** WHERE Redis or Memcached is unavailable, THEN the application must degrade gracefully to database-only mode, not crash. Check for try/catch around cache operations. WHERE cache errors bubble up as 500 errors to the user, THEN flag the missing fallback.

3. **Verify serialization roundtrip.** WHERE objects are cached as JSON, THEN verify that `JSON.parse(JSON.stringify(obj))` preserves all fields. Common losses: Date objects become strings, undefined fields are dropped, BigInt values throw. Flag any cached type that does not survive a serialization roundtrip.

4. **Check distributed cache consistency.** WHERE multiple application instances share a Redis cache, THEN verify: cache writes use appropriate Redis data structures (not race-prone read-modify-write), cache keys include a deployment version to prevent stale reads after schema changes, and Redis is configured with an appropriate eviction policy (`allkeys-lru` for general caching, `volatile-lru` for TTL-based).

5. **Validate HTTP caching headers.** For API responses that include `Cache-Control`, verify: `private` is set for user-specific data, `no-store` is set for sensitive data, `max-age` matches the backend TTL, `ETag` or `Last-Modified` headers enable conditional requests, and `Vary` headers include all relevant dimensions (e.g., `Vary: Authorization` for user-specific responses).

## Harness Integration

- **`harness validate`** -- Run after modifying cache configuration to confirm project health
- **`harness scan`** -- Refresh the knowledge graph after adding cache modules
- **`query_graph`** -- Trace which modules read from and write to a cached resource
- **`get_impact`** -- Understand blast radius when modifying a shared cache key schema

## Success Criteria

- Cache backends were correctly detected or explicitly specified
- All existing cache usage was mapped with key patterns, TTLs, and invalidation logic
- Every cached resource has a defined strategy (cache-aside, write-through, etc.)
- Cache key schema uses namespaced, versioned keys with no collision risk
- Invalidation covers every write path that modifies cached data
- Thundering herd protection is in place for high-traffic keys
- Cache failure degrades gracefully (no 500 errors when Redis is down)
- HTTP caching headers are correct for user-specific vs public data
- No unbounded caches exist without maxSize or eviction policy

## Examples

### Example: Redis Cache-Aside for User Profiles in Express

**Input:** "Add Redis caching for user profile lookups in our Express API."

**Phase 1 -- DETECT:**

```
Backend: Redis 7.x (ioredis 5.x, docker-compose with redis:7-alpine)
Existing cache usage: none (all reads hit PostgreSQL directly)
Access pattern: read-heavy (profile viewed ~100x per write)
Framework: Express 4.x, Prisma ORM
```

**Phase 3 -- DESIGN:**

```typescript
// src/cache/redis.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 1, // fail fast on Redis errors
  enableReadyCheck: true,
  lazyConnect: true,
});

// src/cache/user-cache.ts
const USER_TTL = 300; // 5 minutes
const USER_TTL_JITTER = 30; // +/- 30 seconds to prevent synchronized expiry

function userCacheKey(userId: string): string {
  return `api:user:${userId}:profile:v1`;
}

async function getCachedUser(userId: string): Promise<User | null> {
  try {
    const cached = await redis.get(userCacheKey(userId));
    if (cached) return JSON.parse(cached);
    return null;
  } catch {
    // Cache failure: degrade to database
    return null;
  }
}

async function setCachedUser(userId: string, user: User): Promise<void> {
  try {
    const jitter = Math.floor(Math.random() * USER_TTL_JITTER * 2) - USER_TTL_JITTER;
    await redis.setex(userCacheKey(userId), USER_TTL + jitter, JSON.stringify(user));
  } catch {
    // Cache write failure: log and continue
  }
}

async function invalidateUserCache(userId: string): Promise<void> {
  try {
    await redis.del(userCacheKey(userId));
  } catch {
    // Cache invalidation failure: TTL will expire the stale entry
  }
}
```

**Invalidation wiring:**

```typescript
// src/routes/users.ts -- PATCH /users/:id
app.patch('/users/:id', async (req, res) => {
  const user = await prisma.user.update({ where: { id: req.params.id }, data: req.body });
  await invalidateUserCache(req.params.id); // invalidate after write
  res.json({ data: user });
});
```

**Phase 4 -- VALIDATE:**

```
Invalidation: PASS -- PATCH /users/:id and DELETE /users/:id both call invalidateUserCache
Failure mode: PASS -- all cache operations wrapped in try/catch, degrade to DB
Serialization: WARN -- User.createdAt is a Date object, will become a string after JSON roundtrip
  -> Recommend: parse dates in getCachedUser or use superjson for serialization
Distributed: PASS -- stateless cache-aside, no read-modify-write races
HTTP headers: INFO -- consider adding Cache-Control: private, max-age=300 to GET /users/:id response
```

### Example: HTTP Caching for a Next.js API

**Input:** "Configure caching headers for our Next.js API routes."

**Phase 1 -- DETECT:**

```
Backend: Vercel Edge Cache (detected vercel.json)
Existing cache usage: no Cache-Control headers on API routes
CDN: Vercel Edge Network (automatic)
Routes analyzed: GET /api/products (public), GET /api/cart (user-specific), GET /api/config (rarely changes)
```

**Phase 3 -- DESIGN:**

```typescript
// GET /api/products -- public, cacheable
export async function GET() {
  const products = await db.product.findMany();
  return Response.json(
    { data: products },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        Vary: 'Accept-Encoding',
      },
    }
  );
}

// GET /api/cart -- user-specific, private
export async function GET(req: Request) {
  const cart = await getCartForUser(req);
  return Response.json(
    { data: cart },
    {
      headers: {
        'Cache-Control': 'private, no-cache', // revalidate every request
        ETag: generateETag(cart),
      },
    }
  );
}

// GET /api/config -- rarely changes, long cache
export async function GET() {
  const config = await db.config.findFirst();
  return Response.json(
    { data: config },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    }
  );
}
```

### Example: Distributed Cache Stampede Protection

**Input:** "Our product listing page causes a cache stampede every 5 minutes when the Redis key expires."

**Phase 2 -- ANALYZE:**

```
Key: api:products:list:all (TTL: 300s)
Read frequency: ~200 requests/second
Rebuild cost: 450ms (joins across 3 PostgreSQL tables)
Problem: when TTL expires, ~50 concurrent requests all trigger the same DB query
```

**Phase 3 -- DESIGN (stampede protection):**

```typescript
// Probabilistic early expiration (XFetch algorithm)
async function getProducts(): Promise<Product[]> {
  const raw = await redis.hgetall('api:products:list:all:v1');

  if (raw && raw.data) {
    const expiry = Number(raw.expiry);
    const delta = Number(raw.delta); // time to recompute in ms
    const beta = 1.0; // tuning parameter

    // Probabilistically recompute before actual expiry
    const now = Date.now();
    const shouldRecompute = now - delta * beta * Math.log(Math.random()) >= expiry;

    if (!shouldRecompute) {
      return JSON.parse(raw.data);
    }
  }

  // Recompute with distributed lock
  const lock = await redis.set('lock:products:list', '1', 'EX', 10, 'NX');
  if (!lock) {
    // Another instance is recomputing, serve stale if available
    if (raw?.data) return JSON.parse(raw.data);
    // No stale data, wait briefly and retry
    await sleep(100);
    return getProducts();
  }

  const start = Date.now();
  const products = await db.product.findMany({ include: { category: true, images: true } });
  const delta = Date.now() - start;

  await redis.hmset('api:products:list:all:v1', {
    data: JSON.stringify(products),
    expiry: String(Date.now() + 300_000),
    delta: String(delta),
  });
  await redis.expire('api:products:list:all:v1', 600); // hard expiry 2x TTL
  await redis.del('lock:products:list');

  return products;
}
```

## Gates

- **No unbounded caches.** Every cache (in-memory, Redis, Memcached) must have either a `maxSize`/`maxmemory` limit or a TTL on every key. An unbounded cache will grow until it causes memory exhaustion. WHERE a cache has no eviction policy configured, THEN the skill must halt and require one before proceeding.
- **Cache failure must not crash the application.** WHERE a cache operation (get, set, del) is not wrapped in error handling, THEN the skill must halt. Cache backends are external dependencies that fail independently. An unhandled Redis connection error must not return a 500 to the user.
- **Invalidation must cover every write path.** WHERE a cached resource can be modified through multiple code paths (API endpoint, background job, admin panel) and any path lacks invalidation, THEN the skill must flag the gap. Partial invalidation is worse than no caching -- it serves confidently wrong data.

## Escalation

- **Stale data causing business impact:** When analysis reveals cached data could be stale for longer than the business tolerates (e.g., pricing data cached for 5 minutes), report: "Product prices are cached with a 300-second TTL. A price change will not be visible for up to 5 minutes. If this is unacceptable, switch to write-through caching with event-based invalidation for the pricing resource."
- **Redis memory approaching limit:** When Redis `maxmemory` is configured but eviction policy is `noeviction`, report: "Redis is configured with `maxmemory 256mb` and `noeviction` policy. When memory is full, all SET operations will fail with OOM errors. Change to `allkeys-lru` for general caching or `volatile-lru` if mixing cached and persistent data."
- **Cache key collision across services:** When multiple services share a Redis instance without key namespacing, report: "Both the user-service and order-service write to key `user:123`. These are different data shapes from different services. Namespace keys by service: `user-svc:user:123` and `order-svc:user:123`."
- **Serialization data loss detected:** When a cached object contains types that do not survive JSON roundtrip (Date, BigInt, Map, Set, undefined), report: "The `Order` object contains `Date` fields that become strings after JSON serialization. Use `superjson` or a custom serializer, or convert dates before caching and parse on retrieval."
