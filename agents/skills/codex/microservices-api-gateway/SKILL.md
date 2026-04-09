# Microservices: API Gateway

> Route, aggregate, and secure client requests through an API gateway or BFF pattern.

## When to Use

- Multiple clients (web, mobile, 3rd party) need to call multiple backend services
- You want a single entry point for auth, rate limiting, logging, and routing
- Frontend apps need aggregated data from multiple services in one request (BFF)
- You want to decouple clients from backend service URLs and topology

## Instructions

**Custom API gateway with Express (for BFF pattern):**

```typescript
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

// --- Cross-cutting concerns — apply to all routes ---

// 1. Auth middleware
app.use(async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    req.user = await verifyJWT(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// 2. Rate limiting
import rateLimit from 'express-rate-limit';
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    keyGenerator: (req) => req.user?.id ?? req.ip,
  })
);

// 3. Request ID
app.use((req, res, next) => {
  req.id = (req.headers['x-request-id'] as string) ?? crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// --- Routing to backend services ---
app.use(
  '/api/orders',
  createProxyMiddleware({
    target: process.env.ORDER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/orders': '' },
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader('X-User-Id', req.user!.id);
        proxyReq.setHeader('X-Request-Id', req.id!);
      },
      error: (err, req, res) => {
        (res as express.Response).status(503).json({ error: 'Service unavailable' });
      },
    },
  })
);

app.use(
  '/api/products',
  createProxyMiddleware({
    target: process.env.CATALOG_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/api/products': '' },
  })
);
```

**BFF (Backend for Frontend) — aggregation:**

```typescript
// Mobile app needs order + product details in one call
// Without BFF: mobile makes 3 requests (order, products × N, user)
// With BFF: one call, gateway aggregates

app.get('/bff/mobile/order-detail/:orderId', async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user!.id;

  try {
    // Parallel fetch from backend services
    const [order, user] = await Promise.all([
      orderServiceClient.getOrder(orderId),
      userServiceClient.getUser(userId),
    ]);

    // Verify ownership
    if (order.userId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Fetch product details for each item in parallel
    const products = await Promise.all(
      order.items.map((item) => catalogServiceClient.getProduct(item.productId))
    );

    // Shape the response for mobile — only what the app needs
    res.json({
      orderId: order.id,
      status: order.status,
      createdAt: order.createdAt,
      customerName: user.name,
      items: order.items.map((item, i) => ({
        name: products[i].name,
        imageUrl: products[i].imageUrl,
        quantity: item.quantity,
        price: item.unitPrice,
      })),
      total: order.total,
      tracking: order.trackingNumber,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load order' });
  }
});
```

**Service client with circuit breaker:**

```typescript
import CircuitBreaker from 'opossum';

class OrderServiceClient {
  private breaker: CircuitBreaker;

  constructor(private readonly baseUrl: string) {
    this.breaker = new CircuitBreaker(this.rawFetch.bind(this), {
      timeout: 5_000,
      errorThresholdPercentage: 50,
      resetTimeout: 30_000,
    });

    this.breaker.fallback(() => null);
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return this.breaker.fire(orderId) as Promise<Order | null>;
  }

  private async rawFetch(orderId: string): Promise<Order> {
    const res = await fetch(`${this.baseUrl}/orders/${orderId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}
```

## Details

**Gateway vs. BFF:** An API Gateway handles routing and cross-cutting concerns for all clients. A BFF (Backend for Frontend) is a specialized gateway for one client type (web BFF, mobile BFF), aggregating and shaping responses for that client's specific needs.

**What belongs in the gateway:**

- Authentication / JWT validation
- Rate limiting and throttling
- Request correlation (IDs, tracing)
- SSL termination
- Routing

**What does NOT belong in the gateway:**

- Business logic
- Data transformation beyond response shaping for clients
- Database queries

**Anti-patterns:**

- Gateway that becomes a monolith — it should route, not implement business logic
- Synchronous fan-out to 10+ services per request — use async patterns or pre-materialized views
- No fallback when a downstream service is down — always return partial responses gracefully

**Managed options:** AWS API Gateway, Kong, Nginx, Traefik, Envoy. Use these for production instead of building your own unless you have very specific BFF aggregation needs.

## Source

microservices.io/patterns/apigateway.html

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
