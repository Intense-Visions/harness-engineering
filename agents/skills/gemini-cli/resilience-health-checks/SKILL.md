# Health Checks

> Implement health check endpoints for service readiness, liveness, and dependency monitoring

## When to Use

- Deploying to Kubernetes or any orchestrator that uses health probes
- Load balancers need to know if an instance can handle traffic
- Monitoring dashboards need service status at a glance
- Graceful shutdown requires draining connections before terminating

## Instructions

1. Implement three endpoints: `/health/live` (liveness), `/health/ready` (readiness), `/health/startup` (startup).
2. **Liveness** — Is the process alive and not deadlocked? Should be lightweight (no dependency checks). Returns 200 if the process can respond.
3. **Readiness** — Can this instance handle traffic? Checks database connections, cache availability, and critical dependencies. Returns 200 when ready, 503 when not.
4. **Startup** — Has the service finished initializing? Used for slow-starting services to prevent premature liveness failures.
5. Set the readiness check to return 503 during graceful shutdown to stop receiving new traffic.
6. Health check responses should include component-level detail for debugging.

```typescript
// health/health-controller.ts
interface HealthComponent {
  name: string;
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  details?: string;
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  uptime: number;
  timestamp: string;
  components: HealthComponent[];
}

export class HealthChecker {
  private ready = false;
  private shuttingDown = false;
  private startTime = Date.now();
  private checks: Array<{ name: string; check: () => Promise<HealthComponent> }> = [];

  registerCheck(name: string, check: () => Promise<HealthComponent>) {
    this.checks.push({ name, check });
  }

  setReady(ready: boolean) {
    this.ready = ready;
  }
  setShuttingDown() {
    this.shuttingDown = true;
    this.ready = false;
  }

  async liveness(): Promise<{ status: number; body: object }> {
    return {
      status: 200,
      body: { status: 'alive', uptime: Date.now() - this.startTime },
    };
  }

  async readiness(): Promise<{ status: number; body: HealthResponse }> {
    if (this.shuttingDown || !this.ready) {
      return {
        status: 503,
        body: {
          status: 'unhealthy',
          uptime: Date.now() - this.startTime,
          timestamp: new Date().toISOString(),
          components: [
            {
              name: 'server',
              status: 'down',
              details: this.shuttingDown ? 'shutting down' : 'not ready',
            },
          ],
        },
      };
    }

    const components = await Promise.all(
      this.checks.map(async ({ name, check }) => {
        try {
          return await check();
        } catch (err) {
          return { name, status: 'down' as const, details: String(err) };
        }
      })
    );

    const allUp = components.every((c) => c.status === 'up');
    const anyDown = components.some((c) => c.status === 'down');

    return {
      status: anyDown ? 503 : 200,
      body: {
        status: anyDown ? 'unhealthy' : allUp ? 'healthy' : 'degraded',
        uptime: Date.now() - this.startTime,
        timestamp: new Date().toISOString(),
        components,
      },
    };
  }
}
```

```typescript
// Registering checks
const health = new HealthChecker();

health.registerCheck('database', async () => {
  const start = Date.now();
  await pool.query('SELECT 1');
  return { name: 'database', status: 'up', latency: Date.now() - start };
});

health.registerCheck('redis', async () => {
  const start = Date.now();
  await redis.ping();
  return { name: 'redis', status: 'up', latency: Date.now() - start };
});

// Graceful shutdown
process.on('SIGTERM', () => {
  health.setShuttingDown();
  // Allow in-flight requests to complete
  setTimeout(() => process.exit(0), 30000);
});
```

## Details

**Kubernetes probe configuration:**

```yaml
livenessProbe:
  httpGet: { path: /health/live, port: 3000 }
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3 # Restart after 3 failures

readinessProbe:
  httpGet: { path: /health/ready, port: 3000 }
  periodSeconds: 5
  failureThreshold: 2 # Remove from service after 2 failures

startupProbe:
  httpGet: { path: /health/startup, port: 3000 }
  periodSeconds: 5
  failureThreshold: 30 # Allow up to 150s for startup
```

**Liveness vs readiness:** Liveness failure triggers a pod restart. Readiness failure removes the pod from the service endpoint (no traffic routed to it). Making liveness too strict causes unnecessary restarts. Making readiness too lenient routes traffic to broken instances.

**Health check anti-patterns:**

- Checking dependencies in the liveness probe (a database outage restarts all pods)
- Not setting timeouts on dependency checks (health check hangs)
- Returning 200 during shutdown (new requests arrive after drain starts)
- Exposing sensitive information in health responses (connection strings, credentials)

## Source

https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
