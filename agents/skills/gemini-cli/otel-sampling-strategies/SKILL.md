# OpenTelemetry Sampling Strategies

> Control trace volume and costs with head sampling, tail sampling, and priority-based strategies

## When to Use

- Trace volume exceeds backend capacity or budget
- High-traffic services generating millions of traces per hour
- Needing to keep 100% of error traces while sampling normal traffic
- Balancing observability coverage with storage costs

## Instructions

1. **Start with AlwaysOn** in development and staging. Add sampling only when volume is a problem.
2. **Head sampling** (SDK-level): decide whether to record at trace start. Simple but cannot consider outcome.
3. **Tail sampling** (Collector-level): decide whether to export after the trace is complete. Can keep all errors and sample successes.
4. Use `TraceIdRatioBasedSampler` for probabilistic head sampling.
5. Use `ParentBasedSampler` to respect upstream sampling decisions (if the parent was sampled, the child should be too).
6. For tail sampling, deploy the OpenTelemetry Collector with the `tailsampling` processor.

```typescript
// Head sampling — SDK-level
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  TraceIdRatioBasedSampler,
  ParentBasedSampler,
  AlwaysOnSampler,
} from '@opentelemetry/sdk-trace-base';

// Sample 10% of traces, but respect parent decisions
const sampler = new ParentBasedSampler({
  root: new TraceIdRatioBasedSampler(0.1), // 10% of root spans
  // If parent was sampled, always sample child
  // If parent was not sampled, never sample child
});

const sdk = new NodeSDK({
  sampler,
  // ...
});
```

```typescript
// Custom sampler — always sample errors and slow requests
import { Sampler, SamplingDecision, SamplingResult } from '@opentelemetry/sdk-trace-base';

class PrioritySampler implements Sampler {
  private ratioSampler = new TraceIdRatioBasedSampler(0.1);

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes
  ): SamplingResult {
    // Always sample health checks out
    if (spanName.includes('/health')) {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    // Always sample specific routes
    if (spanName.includes('/api/payments')) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Default: ratio-based
    return this.ratioSampler.shouldSample(context, traceId, spanName, spanKind, attributes);
  }

  toString(): string {
    return 'PrioritySampler';
  }
}
```

```yaml
# Tail sampling in OpenTelemetry Collector
processors:
  tail_sampling:
    decision_wait: 10s # Wait for all spans in a trace
    num_traces: 100000 # Max traces held in memory
    policies:
      # Always keep error traces
      - name: errors
        type: status_code
        status_code:
          status_codes: [ERROR]

      # Always keep slow traces (> 2s)
      - name: slow-traces
        type: latency
        latency:
          threshold_ms: 2000

      # Sample 10% of everything else
      - name: default
        type: probabilistic
        probabilistic:
          sampling_percentage: 10

      # Always keep payment-related traces
      - name: payments
        type: string_attribute
        string_attribute:
          key: http.route
          values: ['/api/payments.*']

service:
  pipelines:
    traces:
      processors: [tail_sampling, batch]
```

## Details

**Head vs tail sampling:**

|                      | Head Sampling            | Tail Sampling            |
| -------------------- | ------------------------ | ------------------------ |
| Decision point       | Trace start              | Trace end                |
| Can consider outcome | No                       | Yes (errors, latency)    |
| Resource cost        | Low (decide once)        | High (buffer all spans)  |
| Implementation       | SDK sampler              | Collector processor      |
| Consistency          | All spans in trace agree | All spans in trace agree |

**Recommended strategy for production:**

1. Head sampling at 100% for critical services, 10-25% for high-volume services
2. Tail sampling in the Collector: keep 100% of errors, keep 100% of slow traces, probabilistic sample the rest
3. Always sample out health checks and readiness probes

**ParentBasedSampler is critical:** Without it, a sampled parent trace can have unsampled children, creating broken traces. Always wrap your root sampler with `ParentBasedSampler`.

**Cost estimation:** A typical span is 200-500 bytes. At 1000 requests/second with 10 spans per request, that is 10K spans/second. At 10% sampling, 1K spans/second (roughly 500 KB/s or 1.3 TB/month).

**Environment variable control:**

```bash
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  # 10%
```

## Source

https://opentelemetry.io/docs/concepts/sampling/

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
