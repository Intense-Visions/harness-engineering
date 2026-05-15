import { z } from 'zod';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { PromptCacheStatsSchema } from '@harness-engineering/types';
import { buildAuthRegistry } from './registry';

extendZodWithOpenApi(z);

/**
 * Extends the Phase 1 auth registry with:
 *   - 10 legacy-alias GET paths under /api/v1/* (state, interactions, plans,
 *     analyses, maintenance/{status,history}, sessions, streams,
 *     local-model, local-models)
 *   - 3 Phase 2 bridge primitives (jobs/maintenance, interactions/{id}/resolve,
 *     events)
 *
 * Schemas for the legacy aliases are intentionally lightweight in Phase 2
 * (just path + method + 200 / 4xx contract). Phase 4 narrows them when the
 * dashboard wire types are unified into @harness-engineering/types as part
 * of the Phase 0 finalization step.
 */
export function buildV1Registry(): OpenAPIRegistry {
  const registry = buildAuthRegistry();

  // Helper: register a plain GET/200 path with a minimal schema.
  const registerGetPath = (path: string, description: string, scope: string): void => {
    registry.registerPath({
      method: 'get',
      path,
      description: `${description} Scope: ${scope}.`,
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: z.unknown() } },
        },
        401: { description: 'Unauthorized' },
        403: { description: 'Insufficient scope' },
      },
    });
  };
  const registerPostPath = (
    path: string,
    description: string,
    scope: string,
    reqSchema: z.ZodTypeAny,
    resSchema: z.ZodTypeAny
  ): void => {
    registry.registerPath({
      method: 'post',
      path,
      description: `${description} Scope: ${scope}.`,
      security: [{ BearerAuth: [] }],
      request: { body: { content: { 'application/json': { schema: reqSchema } } } },
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: resSchema } } },
        400: { description: 'Invalid body' },
        401: { description: 'Unauthorized' },
        403: { description: 'Insufficient scope' },
        404: { description: 'Not found' },
        409: { description: 'Conflict' },
      },
    });
  };

  // ── Legacy aliases ──
  registerGetPath('/api/v1/state', 'Orchestrator snapshot.', 'read-status');
  registerGetPath('/api/v1/interactions', 'List interactions.', 'resolve-interaction');
  registerGetPath('/api/v1/plans', 'List plans.', 'read-status');
  registerGetPath('/api/v1/analyses', 'List analyses.', 'read-status');
  registerGetPath('/api/v1/maintenance/status', 'Maintenance status.', 'trigger-job');
  registerGetPath('/api/v1/maintenance/history', 'Maintenance history.', 'trigger-job');
  registerGetPath('/api/v1/sessions', 'List session metadata.', 'read-status');
  registerGetPath('/api/v1/streams', 'List recorded streams.', 'read-status');
  registerGetPath('/api/v1/local-model', 'Local model status.', 'read-status');
  registerGetPath('/api/v1/local-models', 'Local models statuses.', 'read-status');

  // ── Bridge primitives ──
  registerPostPath(
    '/api/v1/jobs/maintenance',
    'Trigger a maintenance task ad-hoc.',
    'trigger-job',
    z.object({ taskId: z.string(), params: z.record(z.unknown()).optional() }),
    z.object({ ok: z.boolean(), taskId: z.string(), runId: z.string() })
  );

  registry.registerPath({
    method: 'post',
    path: '/api/v1/interactions/{id}/resolve',
    description: 'Resolve a pending interaction. Scope: resolve-interaction.',
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: { 'application/json': { schema: z.object({ answer: z.unknown().optional() }) } },
      },
    },
    responses: {
      200: {
        description: 'Resolved',
        content: { 'application/json': { schema: z.object({ resolved: z.literal(true) }) } },
      },
      404: { description: 'Interaction not found' },
      409: { description: 'Already resolved' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/events',
    description: 'Server-Sent Events stream of GatewayEvent frames. Scope: read-telemetry.',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'SSE stream',
        content: { 'text/event-stream': { schema: z.string() } },
      },
    },
  });

  // ── Phase 3 webhooks ──
  registerPostPath(
    '/api/v1/webhooks',
    'Subscribe to outbound webhook fan-out. Returns the secret once.',
    'subscribe-webhook',
    z.object({ url: z.string().url(), events: z.array(z.string()).min(1) }),
    z.object({
      id: z.string(),
      tokenId: z.string(),
      url: z.string(),
      events: z.array(z.string()),
      secret: z.string(),
      createdAt: z.string(),
    })
  );
  registry.registerPath({
    method: 'get',
    path: '/api/v1/webhooks',
    description: 'List webhook subscriptions (secrets redacted). Scope: subscribe-webhook.',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: z.array(z.unknown()) } },
      },
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/api/v1/webhooks/{id}',
    description: 'Delete a webhook subscription. Scope: subscribe-webhook.',
    security: [{ BearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: 'Deleted',
        content: { 'application/json': { schema: z.object({ deleted: z.literal(true) }) } },
      },
      403: { description: 'Forbidden — cross-token revocation refused' },
      404: { description: 'Subscription not found' },
    },
  });

  // ── Phase 4 — webhook delivery queue stats ──
  // Phase 0 FINAL_REVIEW #3: this route was wired in v1-bridge-routes.ts and
  // implemented in routes/v1/webhooks.ts, but the OpenAPI artifact never
  // documented it. External adapters discovering the contract via the
  // published YAML had no machine-readable path entry to bind against.
  registry.registerPath({
    method: 'get',
    path: '/api/v1/webhooks/queue/stats',
    description:
      'Webhook delivery queue depth + DLQ stats. Scope: subscribe-webhook. Returns 503 when the queue dependency is unavailable (e.g. ephemeral test orchestrators).',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'Queue counter snapshot',
        content: {
          'application/json': {
            schema: z.object({
              pending: z.number().int().nonnegative(),
              inFlight: z.number().int().nonnegative(),
              failed: z.number().int().nonnegative(),
              dead: z.number().int().nonnegative(),
              delivered: z.number().int().nonnegative(),
            }),
          },
        },
      },
      401: { description: 'Unauthorized' },
      403: { description: 'Insufficient scope' },
      503: { description: 'Queue not available' },
    },
  });

  // ── Phase 5 — prompt-cache telemetry stats ──
  // Phase 0 FINAL_REVIEW #3: same gap as queue/stats — handler shipped in
  // Phase 5 Task 11 (routes/v1/telemetry.ts) but the OpenAPI registry never
  // grew the documentation. Backed by PromptCacheStatsSchema from
  // @harness-engineering/types so the wire shape and the OpenAPI shape can
  // never drift.
  registry.registerPath({
    method: 'get',
    path: '/api/v1/telemetry/cache/stats',
    description:
      'Prompt-cache hit/miss snapshot (rolling window). Scope: read-telemetry. Returns 503 when no CacheMetricsRecorder is wired (e.g. exporter-disabled configs).',
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: 'Cache stats snapshot',
        content: { 'application/json': { schema: PromptCacheStatsSchema } },
      },
      401: { description: 'Unauthorized' },
      403: { description: 'Insufficient scope' },
      503: { description: 'Cache metrics recorder not available' },
    },
  });

  return registry;
}

/**
 * Phase 2 Task 9: composed document covering auth + legacy aliases +
 * bridge primitives. Lives here (rather than in registry.ts) so
 * registry.ts has zero imports from this file; the previous cross-
 * file dependency was a circular pair flagged by `harness check-deps`.
 */
export function buildV1Document(): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  const generator = new OpenApiGeneratorV31(buildV1Registry().definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Harness Gateway API',
      version: '0.3.0',
      description:
        'Hermes Phase 0 — Phase 3: versioned /api/v1/* surface with auth, bridge primitives, and webhook subscriptions.',
    },
    servers: [{ url: 'http://127.0.0.1:8080' }],
  });
}
