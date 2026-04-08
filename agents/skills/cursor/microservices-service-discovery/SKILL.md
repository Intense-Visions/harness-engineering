# Microservices: Service Discovery

> Implement service registration and dynamic discovery with health checks in microservices.

## When to Use

- Services are deployed dynamically (Kubernetes, ECS, auto-scaling groups) and their IPs change
- You need services to find each other without hardcoded hostnames
- You want health-check-aware routing — only route to healthy instances
- You're scaling services horizontally and need load balancing across instances

## Instructions

**Kubernetes DNS-based discovery (most common — no code needed):**

```yaml
# Kubernetes handles discovery automatically via DNS
# Service A calls Service B using the DNS name: http://order-service:8080
# Kubernetes resolves this to the correct pod IPs

apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
spec:
  selector:
    app: order-service
  ports:
    - port: 8080
      targetPort: 8080
  type: ClusterIP # internal only

---
# In your app code — just use the DNS name
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL ?? 'http://order-service:8080';
```

**Consul-based service registration (for non-Kubernetes environments):**

```typescript
import Consul from 'consul';

const consul = new Consul({ host: process.env.CONSUL_HOST ?? 'consul' });

async function registerService(): Promise<void> {
  const serviceId = `order-service-${process.env.POD_NAME ?? process.env.HOSTNAME}`;

  await consul.agent.service.register({
    id: serviceId,
    name: 'order-service',
    port: parseInt(process.env.PORT ?? '8080'),
    address: process.env.POD_IP ?? '0.0.0.0',
    tags: ['v1', 'production'],
    check: {
      http: `http://${process.env.POD_IP}:${process.env.PORT}/health`,
      interval: '10s',
      timeout: '5s',
      deregistercriticalserviceafter: '30s',
    },
  });

  console.log(`Registered service: ${serviceId}`);

  // Deregister gracefully on shutdown
  const cleanup = async () => {
    await consul.agent.service.deregister(serviceId);
    process.exit(0);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

// Client-side discovery — resolve service address from Consul
async function resolveService(name: string): Promise<string> {
  const services = await consul.health.service({
    service: name,
    passing: true, // only healthy instances
  });

  if (services.length === 0) throw new Error(`No healthy instances of ${name}`);

  // Simple round-robin
  const instance = services[Math.floor(Math.random() * services.length)];
  return `http://${instance.Service.Address}:${instance.Service.Port}`;
}

// Usage
const orderServiceUrl = await resolveService('order-service');
const order = await fetch(`${orderServiceUrl}/orders/${orderId}`);
```

**Service discovery with caching (avoid per-request lookup):**

```typescript
class ServiceRegistry {
  private cache = new Map<string, { url: string; expiresAt: number }>();
  private readonly ttlMs = 30_000; // cache for 30 seconds

  async resolve(serviceName: string): Promise<string> {
    const cached = this.cache.get(serviceName);
    if (cached && Date.now() < cached.expiresAt) return cached.url;

    const url = await this.lookup(serviceName);
    this.cache.set(serviceName, { url, expiresAt: Date.now() + this.ttlMs });
    return url;
  }

  private async lookup(name: string): Promise<string> {
    // Could be Consul, etcd, or DNS
    return resolveService(name);
  }

  invalidate(serviceName: string): void {
    this.cache.delete(serviceName);
  }
}

const registry = new ServiceRegistry();

// Use in HTTP client
async function callOrderService(path: string): Promise<Response> {
  const baseUrl = await registry.resolve('order-service');
  const response = await fetch(`${baseUrl}${path}`);

  if (response.status === 503) {
    // Service may have moved — invalidate cache and retry once
    registry.invalidate('order-service');
    const freshUrl = await registry.resolve('order-service');
    return fetch(`${freshUrl}${path}`);
  }

  return response;
}
```

## Details

**Client-side vs. server-side discovery:**
| | Client-Side | Server-Side |
|---|---|---|
| Who resolves | Each service | Load balancer / gateway |
| Example | Consul + client library | AWS ALB, Kubernetes Service |
| Complexity | Higher (each service implements) | Lower (transparent) |
| Flexibility | More control | Less control |

In Kubernetes, prefer server-side discovery — Services and DNS handle it for you.

**Health checks are required:** Discovery without health checks routes traffic to dead instances. Register health check endpoints and ensure Consul/k8s removes unhealthy instances quickly (see `microservices-health-check` skill).

**Anti-patterns:**

- Hardcoding service IPs or hostnames — breaks on any deployment change
- Resolving service addresses on every request without caching — hammers the registry
- No graceful deregistration on shutdown — registry keeps routing to the dead instance until health check catches it

**Environment variable pattern for configuration:**

```typescript
// Use environment variables for service URLs in all environments
// Development: http://localhost:8081
// Staging/Production: http://order-service (Kubernetes DNS)
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL;
if (!ORDER_SERVICE_URL) throw new Error('ORDER_SERVICE_URL is required');
```

## Source

microservices.io/patterns/service-registry.html
