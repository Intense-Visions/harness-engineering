# Rate Limiting

> Control request throughput with token bucket, sliding window, and fixed window algorithms to protect services from overload

## When to Use

- Protecting APIs from abuse, scraping, or accidental overload
- Enforcing usage quotas per user, API key, or IP address
- Preventing downstream services from being overwhelmed
- Implementing tiered access (free tier: 100 req/min, pro tier: 1000 req/min)

## Instructions

1. Choose an algorithm: token bucket for burst-friendly limits, sliding window for smooth enforcement, fixed window for simplicity.
2. Identify the rate limit key: IP address, user ID, API key, or combination.
3. Return HTTP 429 (Too Many Requests) with `Retry-After` header when the limit is exceeded.
4. Include rate limit headers in all responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
5. Use Redis for distributed rate limiting across multiple server instances.
6. Apply different limits to different endpoints — authentication endpoints get stricter limits.

```typescript
// middleware/rate-limiter.ts — sliding window with Redis
import { Redis } from 'ioredis';

interface RateLimitConfig {
  windowMs: number; // Window size in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix: string;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp (seconds)
  retryAfter?: number; // Seconds until next allowed request
}

export class SlidingWindowRateLimiter {
  constructor(
    private redis: Redis,
    private config: RateLimitConfig
  ) {}

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const redisKey = `${this.config.keyPrefix}:${key}`;

    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(redisKey, 0, windowStart); // Remove expired entries
    pipeline.zadd(redisKey, now.toString(), `${now}:${Math.random()}`); // Add current request
    pipeline.zcard(redisKey); // Count requests in window
    pipeline.pexpire(redisKey, this.config.windowMs); // Set TTL

    const results = await pipeline.exec();
    const count = results![2][1] as number;

    const allowed = count <= this.config.maxRequests;
    const resetAt = Math.ceil((now + this.config.windowMs) / 1000);

    if (!allowed) {
      // Remove the request we just added since it's denied
      await this.redis.zrem(redisKey, `${now}:${Math.random()}`);
    }

    return {
      allowed,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - count),
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil(this.config.windowMs / 1000),
    };
  }
}
```

```typescript
// Express middleware
import { Request, Response, NextFunction } from 'express';

const apiLimiter = new SlidingWindowRateLimiter(redis, {
  windowMs: 60_000, // 1 minute
  maxRequests: 100,
  keyPrefix: 'rl:api',
});

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = (req.headers['x-api-key'] as string) || req.ip;
  const result = await apiLimiter.check(key);

  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', result.resetAt);

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter!);
    return res.status(429).json({ error: 'Too many requests' });
  }

  next();
}
```

## Details

**Algorithm comparison:**

| Algorithm              | Burst handling              | Memory | Accuracy |
| ---------------------- | --------------------------- | ------ | -------- |
| Fixed window           | Allows 2x burst at boundary | Low    | Low      |
| Sliding window log     | No burst                    | High   | High     |
| Sliding window counter | Small burst                 | Medium | Medium   |
| Token bucket           | Configurable burst          | Low    | High     |

**Token bucket** (alternative implementation):

```typescript
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillRate: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  consume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}
```

**Libraries:** `rate-limiter-flexible` (Redis/in-memory, multiple algorithms), `express-rate-limit` (simple Express middleware), `bottleneck` (client-side rate limiting for API calls).

**Distributed considerations:** In-memory rate limiters only work for single-instance deployments. For multi-instance deployments, use Redis-backed rate limiting. The Lua script approach in Redis ensures atomicity.

## Source

https://cloud.google.com/architecture/rate-limiting-strategies-techniques

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
