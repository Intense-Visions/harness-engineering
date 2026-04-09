# Rate Limiting and Throttling

> Protect APIs with rate limiting, throttling, and abuse prevention to mitigate brute force, scraping, and denial of service

## When to Use

- Protecting authentication endpoints from brute force attacks
- Preventing API abuse and scraping
- Limiting resource-intensive operations (file uploads, exports, search)
- Implementing fair usage policies for multi-tenant APIs
- Adding DDoS mitigation at the application layer

## Instructions

1. **Apply rate limiting at multiple layers.** Use different limits for different endpoint categories.

```typescript
import rateLimit from 'express-rate-limit';

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Strict limit for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 login attempts per 15 minutes
  skipSuccessfulRequests: true, // Only count failed attempts
  keyGenerator: (req) => req.body?.email ?? req.ip, // Rate limit per email, not just IP
});

// Strict limit for password reset
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset requests per hour
});

app.use('/api/', apiLimiter);
app.post('/api/auth/login', authLimiter, loginHandler);
app.post('/api/auth/reset-password', resetLimiter, resetHandler);
```

2. **Use Redis-backed rate limiting for distributed systems.** In-memory rate limiting does not work when you have multiple server instances behind a load balancer.

```typescript
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
});
```

3. **Implement progressive delays for failed authentication.** Instead of a hard lockout, add increasing delays between attempts.

```typescript
async function loginWithProgressiveDelay(email: string, password: string, ip: string) {
  const key = `login_attempts:${email}`;
  const attempts = await redis.incr(key);
  await redis.expire(key, 3600); // Reset after 1 hour

  if (attempts > 10) {
    throw new TooManyRequestsError('Account temporarily locked. Try again in 1 hour.');
  }

  if (attempts > 3) {
    // Progressive delay: 1s, 2s, 4s, 8s...
    const delayMs = Math.min(1000 * Math.pow(2, attempts - 4), 30000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const user = await authenticate(email, password);

  if (user) {
    await redis.del(key); // Reset on success
    return user;
  }

  logger.warn({ event: 'auth.login.failure', email, ip, attempts }, 'Login failed');
  throw new UnauthorizedError('Invalid credentials');
}
```

4. **Return standard rate limit headers** so clients can implement backoff.

```
RateLimit-Limit: 100
RateLimit-Remaining: 42
RateLimit-Reset: 1620000000
Retry-After: 120
```

5. **Rate limit by user ID for authenticated endpoints and by IP for unauthenticated endpoints.** IP-based limiting can be too broad (shared IPs behind NAT) or too narrow (attackers using multiple IPs).

```typescript
const keyGenerator = (req: Request) => {
  return req.user?.id ?? req.ip;
};
```

6. **Implement token bucket or sliding window for smoother rate limiting.** Fixed windows can allow bursts at window boundaries. Sliding windows provide more even distribution.

```typescript
import { RateLimiterRedis } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'api_limit',
  points: 100, // 100 requests
  duration: 60, // per 60 seconds
  blockDuration: 60, // block for 60 seconds if exceeded
  execEvenly: true, // distribute points evenly over duration
});

app.use(async (req, res, next) => {
  try {
    const key = req.user?.id ?? req.ip;
    const result = await rateLimiter.consume(key);

    res.setHeader('RateLimit-Limit', 100);
    res.setHeader('RateLimit-Remaining', result.remainingPoints);
    res.setHeader('RateLimit-Reset', new Date(Date.now() + result.msBeforeNext).toISOString());

    next();
  } catch (rejRes) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil(rejRes.msBeforeNext / 1000),
    });
  }
});
```

7. **Add cost-based rate limiting for expensive operations.** Not all requests are equal — a search query costs more than reading a profile.

```typescript
const costs: Record<string, number> = {
  'GET /api/users/:id': 1,
  'GET /api/search': 5,
  'POST /api/export': 20,
  'POST /api/upload': 10,
};

app.use(async (req, res, next) => {
  const routeKey = `${req.method} ${req.route?.path ?? req.path}`;
  const cost = costs[routeKey] ?? 1;

  try {
    await rateLimiter.consume(req.user?.id ?? req.ip, cost);
    next();
  } catch {
    res.status(429).json({ error: 'Rate limit exceeded' });
  }
});
```

8. **Implement CAPTCHA escalation** for repeated failures. After N failed attempts, require CAPTCHA before allowing another attempt.

## Details

**Rate limiting algorithms:**

- **Fixed window:** Count requests in fixed time windows (e.g., 100/minute starting at :00). Simple but allows bursts at window boundaries (200 requests by hitting end of one window and start of next).
- **Sliding window log:** Track timestamps of all requests, count within a sliding window. Accurate but memory-intensive.
- **Sliding window counter:** Weighted combination of current and previous window. Good balance of accuracy and efficiency.
- **Token bucket:** Tokens accumulate at a steady rate up to a maximum. Each request consumes a token. Allows short bursts while enforcing average rate.
- **Leaky bucket:** Requests queue and process at a fixed rate. Smoothest output but adds latency.

**Where to rate limit:**

1. **CDN/WAF (Cloudflare, AWS WAF):** First line of defense, blocks volumetric attacks before they reach your server
2. **Reverse proxy (Nginx):** Protects against moderate abuse with minimal application overhead
3. **Application middleware:** Fine-grained control per user, endpoint, and operation cost
4. **Business logic:** Domain-specific limits (e.g., 3 password resets per hour)

Layer 1-2 for DDoS protection, Layer 3-4 for business logic rate limiting.

**Common mistakes:**

- Only rate limiting by IP (shared IPs affect multiple users; attackers rotate IPs)
- Not rate limiting authenticated endpoints (authenticated users can still abuse APIs)
- Hard lockouts without recovery (legitimate users get locked out permanently)
- Rate limiting that can be bypassed by changing the API key or creating new accounts
- Not logging rate limit events (missed signal for attack detection)

## Source

https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html

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
