# Microservices: Sidecar Pattern

> Inject cross-cutting concerns like observability and security via a sidecar proxy.

## When to Use

- You need to add cross-cutting infrastructure concerns (TLS, metrics, logging, tracing, auth) to services without changing service code
- You're running a heterogeneous system (multiple languages/runtimes) and want consistent infrastructure
- You're adopting a service mesh (Istio, Linkerd, Envoy) for mTLS and traffic management
- You want to update cross-cutting concerns (e.g., rotate TLS certs, update rate limiting config) without redeploying services

## Instructions

**What the sidecar handles:**

```yaml
# In Kubernetes: sidecar runs as a second container in the same pod
# They share the same network namespace (localhost:port)

apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  template:
    spec:
      containers:
        # Main application
        - name: order-service
          image: myapp/order-service:1.2.3
          ports:
            - containerPort: 8080
          env:
            # App talks to its dependencies via localhost (sidecar intercepts)
            - name: DATABASE_URL
              value: 'postgresql://localhost:5432/orders' # sidecar handles auth

        # Sidecar proxy (e.g., Envoy)
        - name: envoy-proxy
          image: envoyproxy/envoy:v1.28
          ports:
            - containerPort: 9901 # admin
            - containerPort: 15000 # outbound
            - containerPort: 15001 # inbound
          volumeMounts:
            - name: envoy-config
              mountPath: /etc/envoy
      volumes:
        - name: envoy-config
          configMap:
            name: envoy-config
```

**Envoy sidecar configuration for mTLS + rate limiting:**

```yaml
# envoy-config.yaml
static_resources:
  listeners:
    # Intercept inbound traffic on port 80 → add mTLS
    - name: inbound
      address: { socket_address: { address: 0.0.0.0, port_value: 80 } }
      filter_chains:
        - transport_socket:
            name: envoy.transport_sockets.tls
            typed_config:
              '@type': type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.DownstreamTlsContext
              require_client_certificate: true
          filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                route_config:
                  virtual_hosts:
                    - domains: ['*']
                      routes:
                        - match: { prefix: '/' }
                          route: { cluster: local_app }
                http_filters:
                  - name: envoy.filters.http.local_ratelimit
                    # 100 req/s per service
                  - name: envoy.filters.http.router

  clusters:
    - name: local_app
      connect_timeout: 5s
      load_assignment:
        cluster_name: local_app
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address: { socket_address: { address: 127.0.0.1, port_value: 8080 } }
```

**Application-side sidecar (Node.js example — Datadog agent pattern):**

```typescript
// The application doesn't directly call observability APIs
// It sends metrics/traces to localhost (sidecar agent) using lightweight protocols
import { StatsD } from 'node-statsd';
import { tracer } from 'dd-trace'; // auto-instruments at startup

// StatsD client sends to localhost:8125 — Datadog agent (sidecar) forwards to cloud
const statsd = new StatsD({ host: '127.0.0.1', port: 8125 });

// Metrics automatically forwarded to Datadog by the sidecar agent
statsd.increment('orders.created');
statsd.timing('orders.processing_time', durationMs);
statsd.gauge('orders.queue_depth', depth);

// Traces automatically forwarded too
const span = tracer.startSpan('process-order');
span.setTag('order.id', orderId);
try {
  await processOrder(orderId);
  span.finish();
} catch (err) {
  span.setTag('error', true);
  span.finish();
  throw err;
}
```

**Configuring Istio sidecar injection:**

```yaml
# Enable automatic sidecar injection for a namespace
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    istio-injection: enabled # Istio auto-injects Envoy into every pod

---
# Per-pod annotation override (opt-out)
spec:
  template:
    metadata:
      annotations:
        sidecar.istio.io/inject: 'false' # disable for this pod
```

**Capabilities the sidecar adds without code changes:**

```
mTLS between services: Envoy/Istio handles certificate rotation and mutual auth
Traffic shaping: canary deployments, A/B testing, fault injection for testing
Retries and timeouts: configured in service mesh, not application code
Distributed tracing: trace context propagated across services automatically
Rate limiting: per-service, per-client limits enforced at the proxy
Circuit breaking: configured in mesh control plane
Access control: policy-based authorization at the mesh layer
```

## Details

**When NOT to use a sidecar:** If you have a small, homogeneous system (one language, one team), implementing cross-cutting concerns in a shared library is simpler and has lower overhead. Sidecar/service mesh adds operational complexity that only pays off at scale or with heterogeneous tech stacks.

**Sidecar vs. Library:** Library approach: each service imports and configures the observability/security library. Sidecar: the infrastructure concerns live outside the service. Library is simpler; sidecar gives uniform enforcement across polyglot services.

**Anti-patterns:**

- Sidecar that does business logic — it should only handle infrastructure concerns
- Not understanding the performance overhead — Envoy adds ~1-3ms latency per hop; measure before adopting
- Deploying service mesh without a platform team to manage it — the complexity is significant

**Startup sequencing:** The application must not start processing until the sidecar is ready (especially for mTLS). Use init containers or readiness probes to ensure the sidecar is healthy before the main container starts accepting traffic.

## Source

microservices.io/patterns/deployment/sidecar.html
