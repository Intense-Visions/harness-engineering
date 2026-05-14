import { z } from 'zod';
import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
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

  return registry;
}
