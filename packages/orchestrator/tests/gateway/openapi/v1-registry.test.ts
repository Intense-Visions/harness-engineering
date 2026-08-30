import { describe, it, expect } from 'vitest';
import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { buildV1Registry, buildV1Document } from '../../../src/gateway/openapi/v1-registry';

// Behavior characterization of the Phase-2 /api/v1 OpenAPI surface.
//
// FORK A (resolved: characterize current Phase-2 output as-is): the legacy-alias
// GET paths are intentionally lightweight in Phase 2 (path + method + 200/4xx,
// with a loose `z.unknown()` 200 body). These tests pin that current contract;
// when Phase 4 narrows the alias schemas into @harness-engineering/types the
// "lightweight body" assertions below are the ones expected to tighten.
//
// Assumptions made: coverage authored via the test-fleet tdd/test-craft flow;
// knowledge graph was unavailable at selection time (static-analysis fallback),
// so this target was characterized directly from source.

/** Generate the OpenAPI 3.1 document from the built registry's definitions. */
function generateDoc() {
  const generator = new OpenApiGeneratorV31(buildV1Registry().definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: { title: 'test', version: '0.0.0' },
  });
}

describe('buildV1Registry — legacy alias GET paths', () => {
  const doc = generateDoc();
  const paths = doc.paths ?? {};

  const legacyAliases = [
    '/api/v1/state',
    '/api/v1/interactions',
    '/api/v1/plans',
    '/api/v1/analyses',
    '/api/v1/maintenance/status',
    '/api/v1/maintenance/history',
    '/api/v1/sessions',
    '/api/v1/streams',
    '/api/v1/local-model',
    '/api/v1/local-models',
  ];

  it('registers all 10 legacy GET aliases', () => {
    for (const alias of legacyAliases) {
      expect(paths[alias], `missing path ${alias}`).toBeDefined();
      expect(paths[alias].get, `${alias} should expose GET`).toBeDefined();
    }
  });

  it('guards every legacy alias with BearerAuth security', () => {
    for (const alias of legacyAliases) {
      expect(paths[alias].get.security).toEqual([{ BearerAuth: [] }]);
    }
  });

  it('documents 200/401/403 responses on every legacy alias', () => {
    for (const alias of legacyAliases) {
      const responses = paths[alias].get.responses;
      expect(Object.keys(responses).sort()).toEqual(['200', '401', '403']);
    }
  });

  it('carries the scope hint in each alias description', () => {
    // Scope text is how consumers learn which token scope a route needs.
    expect(paths['/api/v1/state'].get.description).toContain('Scope: read-status.');
    expect(paths['/api/v1/interactions'].get.description).toContain('Scope: resolve-interaction.');
    expect(paths['/api/v1/maintenance/status'].get.description).toContain('Scope: trigger-job.');
  });

  it('keeps the legacy alias 200 body intentionally lightweight (Phase-2 as-is)', () => {
    // FORK A characterization: Phase 2 leaves the success body schema wide open.
    // Phase 4 is expected to replace this loose object with a narrowed schema.
    const schema = paths['/api/v1/state'].get.responses['200'].content['application/json'].schema;
    expect(schema).toBeDefined();
    // A narrowed schema would carry `type`/`properties`; the lightweight Phase-2
    // body does not constrain the payload shape.
    expect(schema.properties).toBeUndefined();
  });
});

describe('buildV1Registry — bridge primitives', () => {
  const doc = generateDoc();
  const paths = doc.paths ?? {};

  it('exposes POST /api/v1/jobs/maintenance with a taskId request body', () => {
    const op = paths['/api/v1/jobs/maintenance']?.post;
    expect(op).toBeDefined();
    const reqSchema = op.requestBody.content['application/json'].schema;
    expect(reqSchema.type).toBe('object');
    expect(Object.keys(reqSchema.properties)).toContain('taskId');
    // Response documents ok/taskId/runId.
    const resSchema = op.responses['200'].content['application/json'].schema;
    expect(Object.keys(resSchema.properties).sort()).toEqual(['ok', 'runId', 'taskId']);
  });

  it('exposes POST /api/v1/interactions/{id}/resolve with a path param and 404/409', () => {
    const op = paths['/api/v1/interactions/{id}/resolve']?.post;
    expect(op).toBeDefined();
    // {id} path parameter is documented.
    expect(
      op.parameters.some((p: { name: string; in: string }) => p.name === 'id' && p.in === 'path')
    ).toBe(true);
    expect(op.responses['404']).toBeDefined();
    expect(op.responses['409']).toBeDefined();
  });

  it('exposes GET /api/v1/events as a text/event-stream SSE endpoint', () => {
    const op = paths['/api/v1/events']?.get;
    expect(op).toBeDefined();
    expect(op.responses['200'].content['text/event-stream']).toBeDefined();
  });
});

describe('buildV1Registry — webhook surface', () => {
  const doc = generateDoc();
  const paths = doc.paths ?? {};

  it('exposes POST and GET on /api/v1/webhooks and DELETE on /api/v1/webhooks/{id}', () => {
    expect(paths['/api/v1/webhooks']?.post).toBeDefined();
    expect(paths['/api/v1/webhooks']?.get).toBeDefined();
    expect(paths['/api/v1/webhooks/{id}']?.delete).toBeDefined();
  });

  it('validates the webhook subscription request body (url + non-empty events)', () => {
    const reqSchema = paths['/api/v1/webhooks'].post.requestBody.content['application/json'].schema;
    expect(reqSchema.properties.url.format).toBe('uri');
    expect(reqSchema.properties.events.type).toBe('array');
    expect(reqSchema.properties.events.minItems).toBe(1);
  });

  it('returns the secret once in the webhook creation response', () => {
    const resSchema =
      paths['/api/v1/webhooks'].post.responses['200'].content['application/json'].schema;
    expect(Object.keys(resSchema.properties)).toContain('secret');
  });

  it('documents GET /api/v1/webhooks/queue/stats with a 503 for an unavailable queue', () => {
    const op = paths['/api/v1/webhooks/queue/stats']?.get;
    expect(op).toBeDefined();
    expect(op.responses['503']).toBeDefined();
    const counters = op.responses['200'].content['application/json'].schema.properties;
    expect(Object.keys(counters).sort()).toEqual([
      'dead',
      'delivered',
      'failed',
      'inFlight',
      'pending',
    ]);
  });

  it('documents GET /api/v1/telemetry/cache/stats with a 503 for a missing recorder', () => {
    const op = paths['/api/v1/telemetry/cache/stats']?.get;
    expect(op).toBeDefined();
    expect(op.responses['503']).toBeDefined();
    expect(op.responses['200'].content['application/json'].schema).toBeDefined();
  });
});

describe('buildV1Registry — composition with the auth registry', () => {
  it('includes the Phase-1 auth registry paths alongside the v1 surface', () => {
    const doc = generateDoc();
    const pathKeys = Object.keys(doc.paths ?? {});
    // The v1 registry extends buildAuthRegistry(); auth paths live under
    // /api/v1/auth/*. Their presence proves the v1 surface is composed on top
    // of the Phase-1 auth registry rather than replacing it.
    expect(pathKeys).toContain('/api/v1/auth/token');
    expect(pathKeys).toContain('/api/v1/auth/tokens');
    expect(pathKeys).toContain('/api/v1/auth/tokens/{id}');
  });
});

describe('buildV1Document', () => {
  it('produces a valid OpenAPI 3.1.0 document with info and servers', () => {
    const doc = buildV1Document();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('Harness Gateway API');
    expect(doc.info.version).toBe('0.3.0');
    expect(doc.servers?.[0]?.url).toBe('http://127.0.0.1:8080');
  });

  it('documents the full versioned surface (auth + legacy + bridge + webhooks)', () => {
    const doc = buildV1Document();
    const pathKeys = Object.keys(doc.paths ?? {});
    // A representative path from each cohort must be present in one document.
    expect(pathKeys).toContain('/api/v1/state');
    expect(pathKeys).toContain('/api/v1/jobs/maintenance');
    expect(pathKeys).toContain('/api/v1/webhooks');
    expect(pathKeys).toContain('/api/v1/telemetry/cache/stats');
  });

  it('registers the BearerAuth security scheme in components', () => {
    const doc = buildV1Document();
    expect(doc.components?.securitySchemes?.BearerAuth).toBeDefined();
  });
});
