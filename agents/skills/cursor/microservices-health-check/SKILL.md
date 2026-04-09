# Microservices: Health Check

> Implement /health and /ready endpoints for liveness and readiness probes in containers.

## When to Use

- You're running services in Kubernetes, ECS, or any container orchestration platform
- You need to prevent traffic from reaching instances that haven't finished starting up
- You want Kubernetes to restart containers that are stuck or deadlocked
- You need load balancers and service mesh to route only to healthy instances

## Instructions

**Two endpoints — always implement both:**

```
GET /health → liveness probe: "Is the process alive?"
  - Returns 200 if the process is running (even if dependencies are down)
  - Kubernetes restarts the container if this fails repeatedly
  - Should almost never fail (only if process is deadlocked)

GET /ready  → readiness probe: "Can this instance handle traffic?"
  - Returns 200 only if all critical dependencies are healthy
  - Kubernetes removes instance from load balancer if this fails
  - Common reasons it returns 503: DB not connected, cache not available, still starting
```

**Full implementation with Express:**

```typescript
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

const app = express();
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);

// Liveness — is the process alive?
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
  });
});

// Readiness — can we handle traffic?
app.get('/ready', async (req, res) => {
  const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; error?: string }> = {};
  let allHealthy = true;

  // Check database
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { status: 'error', error: (err as Error).message };
    allHealthy = false;
  }

  // Check Redis
  const redisStart = Date.now();
  try {
    await redis.ping();
    checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
  } catch (err) {
    checks.redis = { status: 'error', error: (err as Error).message };
    allHealthy = false; // or set false only if Redis is required
  }

  // Check external critical dependencies
  try {
    const response = await fetch(`${process.env.PAYMENT_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    checks.paymentService = {
      status: response.ok ? 'ok' : 'error',
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
    if (!response.ok) allHealthy = false;
  } catch (err) {
    checks.paymentService = { status: 'error', error: (err as Error).message };
    allHealthy = false;
  }

  const httpStatus = allHealthy ? 200 : 503;
  res.status(httpStatus).json({
    status: allHealthy ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// Example readiness response (healthy):
// {
//   "status": "ready",
//   "timestamp": "2024-01-15T10:30:00Z",
//   "checks": {
//     "database": { "status": "ok", "latencyMs": 3 },
//     "redis": { "status": "ok", "latencyMs": 1 },
//     "paymentService": { "status": "ok" }
//   }
// }
```

**Kubernetes probe configuration:**

```yaml
containers:
  - name: order-service
    livenessProbe:
      httpGet:
        path: /health
        port: 8080
      initialDelaySeconds: 10 # wait for app to start
      periodSeconds: 10 # check every 10s
      failureThreshold: 3 # restart after 3 consecutive failures
      timeoutSeconds: 5

    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      initialDelaySeconds: 5 # start checking earlier (just connectivity)
      periodSeconds: 5
      failureThreshold: 2 # remove from LB after 2 consecutive failures
      successThreshold: 1 # put back on LB after 1 success
      timeoutSeconds: 3

    startupProbe:
      # For apps with slow startup (loading large ML models, etc.)
      httpGet:
        path: /health
        port: 8080
      failureThreshold: 30 # 30 × 5s = 150 seconds to start
      periodSeconds: 5
```

**Graceful shutdown with readiness:**

```typescript
let isReady = true;

process.on('SIGTERM', async () => {
  console.log('SIGTERM received — starting graceful shutdown');

  // 1. Stop accepting new traffic
  isReady = false; // readiness probe starts returning 503

  // 2. Wait for in-flight requests to complete (give LB time to stop routing)
  await new Promise((r) => setTimeout(r, 5_000));

  // 3. Close connections
  await prisma.$disconnect();
  redis.disconnect();

  process.exit(0);
});

// In readiness endpoint
app.get('/ready', async (req, res) => {
  if (!isReady) {
    res.status(503).json({ status: 'shutting down' });
    return;
  }
  // ... other checks
});
```

## Details

**What to check in readiness vs. liveness:**
| | /health (liveness) | /ready (readiness) |
|---|---|---|
| Purpose | Is the process alive? | Can it handle traffic? |
| DB connectivity | No | Yes |
| Redis connectivity | No | Yes (if required) |
| External services | No | Critical ones only |
| Response time | Must be fast (<50ms) | Can check dependencies (< 3s) |

**Startup probes:** Use `startupProbe` for services with long startup times (model loading, schema migration). It replaces the liveness probe during startup — the service gets time to initialize before the liveness probe kicks in.

**Anti-patterns:**

- Liveness probe that checks database — if DB is down, Kubernetes restarts the service, which doesn't fix the DB
- Readiness probe without timeout — if a dependency hangs, the probe hangs and Kubernetes marks it as failed without a clear error
- Health endpoint on the same port as the app without auth — health responses may leak internal topology

**Security:** Health endpoints should not require auth (they're called by infrastructure). But they should not expose sensitive information like connection strings or internal IPs.

## Source

microservices.io/patterns/observability/health-check-api.html

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
