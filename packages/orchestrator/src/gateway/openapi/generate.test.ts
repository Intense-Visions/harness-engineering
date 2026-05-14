import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});
