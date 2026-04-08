# OpenTelemetry SDK Setup

> Initialize the OpenTelemetry Node.js SDK with resource attributes, exporters, and auto-instrumentation

## When to Use

- Setting up OpenTelemetry in a new Node.js application
- Migrating from vendor-specific SDKs (Datadog, New Relic) to OpenTelemetry
- Configuring auto-instrumentation for HTTP, database, and framework libraries
- Establishing the telemetry foundation before adding custom spans and metrics

## Instructions

1. Install the core SDK and auto-instrumentation packages.
2. Create the instrumentation file (`instrumentation.ts`) — it must run before any other application code.
3. Define the resource with service name, version, and environment.
4. Configure exporters for traces, metrics, and logs (OTLP is the standard protocol).
5. Register auto-instrumentations for libraries your application uses.
6. Load the instrumentation file first: `node --require ./instrumentation.ts` or `import './instrumentation'` at the top of your entry point.

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
```

```typescript
// instrumentation.ts — must be loaded before application code
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';

const resource = new Resource({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'my-service',
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
  [ATTR_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
});

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/metrics',
    }),
    exportIntervalMillis: 15000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy instrumentations
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    }),
  ],
});

sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown().then(
    () => console.log('Telemetry shut down'),
    (err) => console.error('Telemetry shutdown error', err)
  );
});
```

```typescript
// package.json — load instrumentation first
{
  "scripts": {
    "start": "node --require ./dist/instrumentation.js ./dist/index.js",
    "dev": "tsx --require ./src/instrumentation.ts ./src/index.ts"
  }
}
```

## Details

**Load order is critical.** OpenTelemetry hooks into library internals (HTTP, pg, express) by monkey-patching. If you import `express` before OpenTelemetry initializes, the instrumentation will not work. Always load `instrumentation.ts` first.

**Auto-instrumentations included:**

- `@opentelemetry/instrumentation-http` — HTTP/HTTPS client and server
- `@opentelemetry/instrumentation-express` — Express routes and middleware
- `@opentelemetry/instrumentation-pg` — PostgreSQL queries
- `@opentelemetry/instrumentation-redis` — Redis commands
- `@opentelemetry/instrumentation-mongodb` — MongoDB operations
- `@opentelemetry/instrumentation-grpc` — gRPC calls
- And many more via `auto-instrumentations-node`

**Environment variables (standard):**

- `OTEL_SERVICE_NAME` — service name (overrides code)
- `OTEL_EXPORTER_OTLP_ENDPOINT` — collector URL
- `OTEL_EXPORTER_OTLP_PROTOCOL` — `grpc` or `http/protobuf`
- `OTEL_TRACES_SAMPLER` — `always_on`, `always_off`, `traceidratio`
- `OTEL_TRACES_SAMPLER_ARG` — sampler argument (e.g., `0.1` for 10%)

**Local development:** Run the OpenTelemetry Collector and Jaeger locally:

```bash
docker run -d -p 4318:4318 -p 16686:16686 jaegertracing/all-in-one:latest
```

Then view traces at `http://localhost:16686`.

**Common mistakes:**

- Importing the instrumentation file after application modules
- Not calling `sdk.shutdown()` on process exit (traces may be lost)
- Configuring the exporter URL without the path suffix (`/v1/traces`)

## Source

https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
