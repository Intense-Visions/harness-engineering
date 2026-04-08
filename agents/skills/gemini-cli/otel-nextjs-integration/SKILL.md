# OpenTelemetry Next.js Integration

> Add OpenTelemetry tracing to Next.js with the instrumentation hook for Server Components, API routes, and middleware

## When to Use

- Adding distributed tracing to a Next.js application
- Tracing Server Component rendering, API routes, and server actions
- Debugging slow page loads across data fetching and rendering
- Connecting Next.js traces to backend microservice traces

## Instructions

1. Create `instrumentation.ts` (or `instrumentation.node.ts`) in the project root — Next.js loads it automatically.
2. Export a `register` function that initializes the OpenTelemetry SDK. This runs once on server startup.
3. Enable the `instrumentationHook` in `next.config.js` (Next.js 13-14). In Next.js 15+, it is enabled by default.
4. Use `@vercel/otel` for simplified setup on Vercel, or configure the standard OTel SDK for any platform.
5. Next.js auto-creates spans for rendering, data fetching, and route resolution. Add custom spans for business logic.

```typescript
// instrumentation.ts (project root)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only initialize on the Node.js runtime, not edge
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } =
      await import('@opentelemetry/auto-instrumentations-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { Resource } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions');

    const sdk = new NodeSDK({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'nextjs-app',
      }),
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();
  }
}
```

```typescript
// next.config.js (Next.js 13-14, not needed in 15+)
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
```

```typescript
// Simplified setup with @vercel/otel
// instrumentation.ts
import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel({
    serviceName: 'nextjs-app',
    // Automatically configured for Vercel's tracing infrastructure
  });
}
```

## Details

**Next.js automatic spans:** With OpenTelemetry configured, Next.js creates spans for:

- `next.route` — route matching and resolution
- `next.render` — Server Component rendering
- `next.getServerSideProps` — data fetching (Pages Router)
- `next.fetch` — server-side fetch() calls
- `next.middleware` — middleware execution

**Custom spans in Server Components:**

```typescript
// app/dashboard/page.tsx
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('dashboard');

export default async function DashboardPage() {
  const data = await tracer.startActiveSpan('dashboard.loadData', async (span) => {
    try {
      const [users, metrics] = await Promise.all([
        fetchUsers(),
        fetchMetrics(),
      ]);
      span.setAttribute('users.count', users.length);
      return { users, metrics };
    } finally {
      span.end();
    }
  });

  return <Dashboard data={data} />;
}
```

**Custom spans in Route Handlers:**

```typescript
// app/api/orders/route.ts
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('orders-api');

export async function POST(request: Request) {
  return tracer.startActiveSpan('orders.create', async (span) => {
    try {
      const body = await request.json();
      span.setAttribute('order.items', body.items.length);
      const order = await createOrder(body);
      span.setAttribute('order.id', order.id);
      return Response.json(order, { status: 201 });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(error as Error);
      return Response.json({ error: 'Failed' }, { status: 500 });
    } finally {
      span.end();
    }
  });
}
```

**Edge runtime limitations:** The Edge runtime does not support the full Node.js OTel SDK. For edge middleware and edge routes, use `@vercel/otel` which provides a lightweight implementation, or check for `NEXT_RUNTIME === 'edge'` and use a compatible exporter.

**Vercel integration:** On Vercel, use `@vercel/otel` for zero-config tracing. Traces are sent to Vercel's observability dashboard and can be forwarded to external backends (Datadog, Honeycomb, Axiom).

## Source

https://nextjs.org/docs/app/building-your-application/optimizing/open-telemetry
