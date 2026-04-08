# OpenTelemetry Exporter Configuration

> Configure OTLP exporters to send traces, metrics, and logs to observability backends and collectors

## When to Use

- Connecting your OpenTelemetry SDK to a backend (Jaeger, Grafana Tempo, Datadog, Honeycomb)
- Setting up an OpenTelemetry Collector as a telemetry pipeline
- Choosing between direct export and collector-mediated export
- Configuring export batching, compression, and retry behavior

## Instructions

1. Prefer OTLP (OpenTelemetry Protocol) exporters — they work with all major backends.
2. Choose HTTP (`@opentelemetry/exporter-trace-otlp-http`) or gRPC (`@opentelemetry/exporter-trace-otlp-grpc`). HTTP is simpler; gRPC has better performance for high-volume telemetry.
3. In production, export to an OpenTelemetry Collector, not directly to the backend. The Collector handles batching, retries, and routing.
4. Configure exporters via environment variables for deployment flexibility.
5. Set appropriate batch sizes and export intervals to balance latency and resource usage.

```typescript
// Direct export to backend (simple setup)
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

// Traces
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
  headers: {
    Authorization: `Bearer ${process.env.OTEL_EXPORTER_API_KEY}`,
  },
  compression: 'gzip',
});

const spanProcessor = new BatchSpanProcessor(traceExporter, {
  maxQueueSize: 2048,
  maxExportBatchSize: 512,
  scheduledDelayMillis: 5000,
  exportTimeoutMillis: 30000,
});

// Metrics
const metricReader = new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter({
    url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics',
  }),
  exportIntervalMillis: 15000,
});
```

```yaml
# otel-collector-config.yaml — Collector as telemetry pipeline
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
  attributes:
    actions:
      - key: environment
        value: production
        action: upsert

exporters:
  otlphttp/grafana:
    endpoint: https://tempo.grafana.net
    headers:
      Authorization: 'Basic ${GRAFANA_API_KEY}'
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, attributes]
      exporters: [otlphttp/grafana]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

## Details

**Direct export vs Collector:**

- **Direct export:** Simpler setup, fewer moving parts. Good for small deployments and development.
- **Collector:** Decouples app from backend, handles retries/batching/sampling, can route to multiple backends, filters sensitive data. Recommended for production.

**Environment variables (standard):**

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer token
OTEL_EXPORTER_OTLP_COMPRESSION=gzip
OTEL_EXPORTER_OTLP_TIMEOUT=10000
```

**Backend-specific configurations:**

```typescript
// Honeycomb
new OTLPTraceExporter({
  url: 'https://api.honeycomb.io/v1/traces',
  headers: { 'x-honeycomb-team': process.env.HONEYCOMB_API_KEY },
});

// Grafana Cloud
new OTLPTraceExporter({
  url: 'https://tempo-us-central1.grafana.net/tempo',
  headers: { Authorization: `Basic ${btoa(`${instanceId}:${apiKey}`)}` },
});

// Datadog (via OTLP)
new OTLPTraceExporter({
  url: 'http://datadog-agent:4318/v1/traces',
});
```

**Console exporter for development:**

```typescript
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(), // Prints traces to stdout
});
```

**Batch processor tuning:**

- `maxQueueSize: 2048` — max spans held in memory before dropping
- `maxExportBatchSize: 512` — spans sent per export call
- `scheduledDelayMillis: 5000` — export interval
- Increase batch size for high-throughput services; decrease delay for lower latency

## Source

https://opentelemetry.io/docs/languages/js/exporters/
