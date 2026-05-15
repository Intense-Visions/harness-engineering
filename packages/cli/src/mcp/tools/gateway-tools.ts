import type { ToolDefinition } from '../tool-types.js';

/**
 * Phase 2 Task 11: MCP wrappers around the new bridge primitives served
 * by the orchestrator's Gateway API.
 *
 * `trigger_maintenance_job` is tier-1 (standard): an agent can request
 * an ad-hoc maintenance run. `list_gateway_tokens` is tier-0 (core):
 * tooling routinely needs to introspect available scopes/auth.
 *
 * Both tools talk HTTP to the orchestrator. The base URL is read from
 * `HARNESS_ORCHESTRATOR_URL` (default `http://127.0.0.1:8080`). A bearer
 * token, if set in `HARNESS_API_TOKEN`, is forwarded as the
 * `Authorization` header so scope checks pass.
 */

function orchestratorBase(): string {
  return process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:8080';
}

function authHeader(): Record<string, string> {
  const tok = process.env['HARNESS_API_TOKEN'];
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

export const triggerMaintenanceJobDefinition: ToolDefinition = {
  name: 'trigger_maintenance_job',
  description:
    'Trigger a maintenance task ad-hoc via POST /api/v1/jobs/maintenance. Requires trigger-job scope.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Registered maintenance task identifier (e.g. cleanup-sessions)',
      },
      params: {
        type: 'object',
        description: 'Optional task-specific parameters',
        additionalProperties: true,
      },
    },
    required: ['taskId'],
  },
};

export async function handleTriggerMaintenanceJob(input: {
  taskId: string;
  params?: Record<string, unknown>;
}): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const body: Record<string, unknown> = { taskId: input.taskId };
  if (input.params !== undefined) body['params'] = input.params;
  const res = await fetch(`${orchestratorBase()}/api/v1/jobs/maintenance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      content: [{ type: 'text', text: `Trigger failed (${res.status}): ${text}` }],
      isError: true,
    };
  }
  return { content: [{ type: 'text', text }] };
}

export const listGatewayTokensDefinition: ToolDefinition = {
  name: 'list_gateway_tokens',
  description:
    'List Gateway API tokens via GET /api/v1/auth/tokens. Secrets are redacted. Requires admin scope.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
};

export async function handleListGatewayTokens(): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const res = await fetch(`${orchestratorBase()}/api/v1/auth/tokens`, {
    headers: { ...authHeader() },
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      content: [{ type: 'text', text: `List failed (${res.status}): ${text}` }],
      isError: true,
    };
  }
  return { content: [{ type: 'text', text }] };
}
