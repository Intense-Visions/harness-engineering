import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { generateOpenApiYaml } from './generate';

describe('generateOpenApiYaml', () => {
  it('emits a valid YAML file with the three auth routes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-openapi-'));
    const out = join(dir, 'openapi.yaml');
    generateOpenApiYaml(out);
    const yaml = readFileSync(out, 'utf8');
    expect(yaml).toContain('openapi: 3.1.0');
    expect(yaml).toContain('/api/v1/auth/token');
    expect(yaml).toContain('/api/v1/auth/tokens');
    expect(yaml).toContain('/api/v1/auth/tokens/{id}');
    expect(yaml).toContain('BearerAuth');
    rmSync(dir, { recursive: true, force: true });
  });

  it('is idempotent — running twice produces byte-identical output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-openapi-'));
    const out = join(dir, 'openapi.yaml');
    generateOpenApiYaml(out);
    const a = readFileSync(out, 'utf8');
    generateOpenApiYaml(out);
    const b = readFileSync(out, 'utf8');
    expect(a).toBe(b);
    rmSync(dir, { recursive: true, force: true });
  });

  // Phase 2 Task 9: v1 coverage. The composed document must include every
  // legacy alias plus the three Phase 2 bridge primitives. We lock the
  // path-count to catch silent drift (added/removed routes without an
  // explicit test update). Phase 3 Task 11: extended with webhook routes;
  // counts updated accordingly.
  it('exposes the Phase 2 bridge primitives + legacy aliases + Phase 3 webhooks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-openapi-'));
    const out = join(dir, 'openapi.yaml');
    generateOpenApiYaml(out);
    const yaml = readFileSync(out, 'utf8');

    // Bridge primitives (Phase 2).
    expect(yaml).toContain('/api/v1/jobs/maintenance');
    expect(yaml).toContain('/api/v1/interactions/{id}/resolve');
    expect(yaml).toContain('/api/v1/events');

    // Legacy aliases (representative spot-check).
    expect(yaml).toContain('/api/v1/state');
    expect(yaml).toContain('/api/v1/interactions');
    expect(yaml).toContain('/api/v1/maintenance/status');
    expect(yaml).toContain('/api/v1/maintenance/history');
    expect(yaml).toContain('/api/v1/sessions');
    expect(yaml).toContain('/api/v1/streams');
    expect(yaml).toContain('/api/v1/local-model');
    expect(yaml).toContain('/api/v1/local-models');

    // Phase 3 webhook routes.
    expect(yaml).toContain('/api/v1/webhooks');
    expect(yaml).toContain('/api/v1/webhooks/{id}');

    // Lock the path count to catch silent drift. 3 auth + 10 legacy GETs +
    // 3 Phase 2 bridge primitives + 2 Phase 3 webhook paths (collection +
    // {id}; POST/GET share /api/v1/webhooks) = 18 distinct paths.
    const doc = parseYaml(yaml) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths).length).toBe(18);

    rmSync(dir, { recursive: true, force: true });
  });

  it('reports v0.3.0 in the info block (Phase 3)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-openapi-'));
    const out = join(dir, 'openapi.yaml');
    generateOpenApiYaml(out);
    const yaml = readFileSync(out, 'utf8');
    expect(yaml).toContain('version: 0.3.0');
    rmSync(dir, { recursive: true, force: true });
  });
});
