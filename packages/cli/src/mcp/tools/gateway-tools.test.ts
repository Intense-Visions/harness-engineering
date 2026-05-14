import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  triggerMaintenanceJobDefinition,
  listGatewayTokensDefinition,
  handleTriggerMaintenanceJob,
  handleListGatewayTokens,
} from './gateway-tools';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_BASE = process.env['HARNESS_ORCHESTRATOR_URL'];
const ORIGINAL_TOKEN = process.env['HARNESS_API_TOKEN'];

describe('gateway-tools — MCP tool definitions', () => {
  it('triggerMaintenanceJob: name + required input fields', () => {
    expect(triggerMaintenanceJobDefinition.name).toBe('trigger_maintenance_job');
    const schema = triggerMaintenanceJobDefinition.inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.required).toContain('taskId');
    expect(schema.properties).toHaveProperty('taskId');
    expect(schema.properties).toHaveProperty('params');
  });

  it('listGatewayTokens: name + empty input schema', () => {
    expect(listGatewayTokensDefinition.name).toBe('list_gateway_tokens');
    const schema = listGatewayTokensDefinition.inputSchema as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties)).toHaveLength(0);
  });
});

describe('gateway-tools — handlers exercise underlying HTTP routes', () => {
  beforeEach(() => {
    process.env['HARNESS_ORCHESTRATOR_URL'] = 'http://127.0.0.1:9999';
    process.env['HARNESS_API_TOKEN'] = 'tok_test.abc';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_BASE === undefined) delete process.env['HARNESS_ORCHESTRATOR_URL'];
    else process.env['HARNESS_ORCHESTRATOR_URL'] = ORIGINAL_BASE;
    if (ORIGINAL_TOKEN === undefined) delete process.env['HARNESS_API_TOKEN'];
    else process.env['HARNESS_API_TOKEN'] = ORIGINAL_TOKEN;
  });

  it('handleTriggerMaintenanceJob POSTs to /api/v1/jobs/maintenance with bearer auth', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = vi.fn(async (url: URL | string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true, taskId: 'x', runId: 'run_abc' }), {
        status: 200,
      });
    });
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const result = await handleTriggerMaintenanceJob({ taskId: 'cleanup-sessions' });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('http://127.0.0.1:9999/api/v1/jobs/maintenance');
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer tok_test.abc');
    expect(call.init.body).toBe(JSON.stringify({ taskId: 'cleanup-sessions' }));
    expect(result.isError).toBeUndefined();
  });

  it('handleTriggerMaintenanceJob surfaces non-2xx as isError', async () => {
    globalThis.fetch = (async () =>
      new Response('Unknown task', { status: 404 })) as unknown as typeof fetch;
    const result = await handleTriggerMaintenanceJob({ taskId: 'nope' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('404');
  });

  it('handleListGatewayTokens GETs /api/v1/auth/tokens with bearer auth', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = vi.fn(async (url: URL | string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify([{ id: 'tok_1', name: 'bot' }]), { status: 200 });
    });
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const result = await handleListGatewayTokens();

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('http://127.0.0.1:9999/api/v1/auth/tokens');
    expect(call.init.method).toBeUndefined();
    const headers = call.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok_test.abc');
    expect(result.isError).toBeUndefined();
  });

  it('handleListGatewayTokens surfaces non-2xx as isError', async () => {
    globalThis.fetch = (async () =>
      new Response('Forbidden', { status: 403 })) as unknown as typeof fetch;
    const result = await handleListGatewayTokens();
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('403');
  });

  it('handlers omit Authorization header when HARNESS_API_TOKEN is not set', async () => {
    delete process.env['HARNESS_API_TOKEN'];
    const calls: Array<{ headers: Record<string, string> }> = [];
    globalThis.fetch = (async (_url: URL | string, init?: RequestInit) => {
      calls.push({ headers: (init?.headers as Record<string, string>) ?? {} });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await handleListGatewayTokens();
    expect(calls[0]!.headers).not.toHaveProperty('Authorization');
  });
});
