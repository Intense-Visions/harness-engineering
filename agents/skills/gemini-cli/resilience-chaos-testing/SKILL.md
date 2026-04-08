# Chaos Testing

> Validate resilience by injecting controlled failures to verify that fallbacks, retries, and circuit breakers work under real conditions

## When to Use

- Validating that resilience patterns (circuit breakers, retries, fallbacks) actually work
- Preparing for production incidents by simulating them in controlled environments
- Building confidence that the system degrades gracefully under partial failure
- Discovering hidden dependencies and single points of failure

## Instructions

1. Start with a steady state hypothesis: "Users can still check out even when the recommendation service is down."
2. Inject one failure at a time. Do not combine failures until individual effects are understood.
3. Start in development/staging. Move to production only with tight blast radius controls.
4. Types of failure injection: latency, errors, resource exhaustion, dependency unavailability, clock skew.
5. Measure impact on user-facing metrics (error rate, latency p99, success rate), not just internal metrics.
6. Build failure injection as middleware or wrappers that can be toggled on/off.

```typescript
// chaos/fault-injector.ts
interface FaultConfig {
  enabled: boolean;
  latencyMs?: number; // Add artificial latency
  errorRate?: number; // 0.0 to 1.0 probability of error
  errorCode?: number; // HTTP status to return
  timeoutRate?: number; // 0.0 to 1.0 probability of timeout
  targetServices?: string[]; // Only affect specific services
}

export class FaultInjector {
  private config: FaultConfig = { enabled: false };

  configure(config: Partial<FaultConfig>) {
    this.config = { ...this.config, ...config };
  }

  async maybeInjectFault(serviceName: string): Promise<void> {
    if (!this.config.enabled) return;
    if (this.config.targetServices && !this.config.targetServices.includes(serviceName)) return;

    // Inject latency
    if (this.config.latencyMs) {
      await new Promise((r) => setTimeout(r, this.config.latencyMs));
    }

    // Inject timeout (never resolves until AbortController cancels)
    if (this.config.timeoutRate && Math.random() < this.config.timeoutRate) {
      await new Promise(() => {}); // Hang forever — caller's timeout should catch this
    }

    // Inject error
    if (this.config.errorRate && Math.random() < this.config.errorRate) {
      throw new ChaosError(`Injected fault for ${serviceName}`, this.config.errorCode ?? 500);
    }
  }
}

export class ChaosError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'ChaosError';
  }
}
```

```typescript
// Integration with services
const faultInjector = new FaultInjector();

// Enable in test/staging via environment variable
if (process.env.CHAOS_ENABLED === 'true') {
  faultInjector.configure({
    enabled: true,
    targetServices: ['payment-api'],
    errorRate: 0.3, // 30% of payment API calls fail
    latencyMs: 2000, // Add 2s latency to all calls
  });
}

// Wrap service calls
export async function callPaymentAPI(orderId: string): Promise<PaymentResult> {
  await faultInjector.maybeInjectFault('payment-api');
  return fetch(`https://payment.example.com/charge/${orderId}`).then((r) => r.json());
}
```

```typescript
// Chaos test scenario
describe('checkout resilience', () => {
  it('completes checkout when payment service has 50% error rate', async () => {
    faultInjector.configure({
      enabled: true,
      targetServices: ['payment-api'],
      errorRate: 0.5,
    });

    // Circuit breaker + retry should handle transient failures
    const result = await checkout(testOrder);
    expect(result.status).toBe('completed');

    faultInjector.configure({ enabled: false });
  });

  it('uses cached prices when pricing service is down', async () => {
    faultInjector.configure({
      enabled: true,
      targetServices: ['pricing-api'],
      errorRate: 1.0, // 100% failure
    });

    const result = await getProductPrice('sku-123');
    expect(result.source).toBe('cache');
    expect(result.price).toBeGreaterThan(0);

    faultInjector.configure({ enabled: false });
  });
});
```

## Details

**Chaos engineering principles (Netflix):**

1. Define steady state (what "normal" looks like in metrics)
2. Hypothesize that steady state continues during failure
3. Introduce real-world failures (network, disk, process)
4. Try to disprove the hypothesis
5. Fix weaknesses found

**Failure types to test:**

- **Latency injection:** Simulate slow responses (100ms, 1s, 5s, 30s)
- **Error injection:** Return 500, 503, connection refused
- **Resource exhaustion:** Fill disk, exhaust memory, saturate CPU
- **Dependency death:** Kill a database, cache, or downstream service entirely
- **Clock skew:** Jump time forward/backward (affects TTLs, JWT expiry)
- **Network partition:** Split services so they cannot communicate

**Tools:** `toxiproxy` (TCP proxy with configurable toxics), `chaos-mesh` (Kubernetes-native), `litmus` (Kubernetes chaos), `gremlin` (SaaS platform), `pumba` (Docker container chaos).

**Production chaos safety:**

- Always have a kill switch to stop the experiment immediately
- Limit blast radius (specific percentage of traffic, specific instances)
- Run during business hours when the team is available
- Start with the smallest possible impact and scale up
- Monitor user-facing metrics, not just infrastructure metrics

## Source

https://principlesofchaos.org/
