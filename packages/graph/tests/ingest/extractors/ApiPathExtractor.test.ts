import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'path';
import { ApiPathExtractor } from '../../../src/ingest/extractors/ApiPathExtractor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../../__fixtures__/extractor-project');
const extractor = new ApiPathExtractor();

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf-8');
}

describe('ApiPathExtractor', () => {
  it('extracts Express routes from TypeScript', () => {
    const content = readFixture('routes.ts');
    const records = extractor.extract(content, 'routes.ts', 'typescript');

    expect(records.length).toBeGreaterThanOrEqual(5);
    expect(records.every((r) => r.nodeType === 'business_process')).toBe(true);

    const names = records.map((r) => r.name);
    expect(names).toContain('GET /api/users');
    expect(names).toContain('POST /api/users');
    expect(names).toContain('GET /api/users/:id');
    expect(names).toContain('GET /api/orders');

    const getUsers = records.find((r) => r.name === 'GET /api/users');
    expect(getUsers!.confidence).toBe(0.9);
    expect(getUsers!.metadata.method).toBe('GET');
    expect(getUsers!.metadata.path).toBe('/api/users');
  });

  it('extracts FastAPI decorators from Python', () => {
    const content = readFixture('routes.py');
    const records = extractor.extract(content, 'routes.py', 'python');

    expect(records.length).toBeGreaterThanOrEqual(5);

    const names = records.map((r) => r.name);
    expect(names).toContain('GET /api/users');
    expect(names).toContain('POST /api/users');
    expect(names).toContain('GET /api/users/{user_id}');
  });

  it('extracts Gin routes from Go', () => {
    const content = readFixture('routes.go');
    const records = extractor.extract(content, 'routes.go', 'go');

    expect(records.length).toBeGreaterThanOrEqual(5);

    const names = records.map((r) => r.name);
    expect(names).toContain('GET /api/users');
    expect(names).toContain('POST /api/users');
    expect(names).toContain('GET /api/users/:id');

    // http.HandleFunc should have lower confidence
    const healthCheck = records.find((r) => r.metadata.framework === 'net/http');
    expect(healthCheck).toBeDefined();
    expect(healthCheck!.confidence).toBe(0.6);
  });

  it('extracts Actix macros from Rust', () => {
    const content = readFixture('routes.rs');
    const records = extractor.extract(content, 'routes.rs', 'rust');

    expect(records.length).toBeGreaterThanOrEqual(5);

    const names = records.map((r) => r.name);
    expect(names).toContain('GET /api/users');
    expect(names).toContain('POST /api/users');
    expect(names).toContain('GET /api/users/{id}');
    expect(names).toContain('GET /api/orders');
  });

  it('extracts Spring annotations from Java', () => {
    const content = readFixture('Routes.java');
    const records = extractor.extract(content, 'Routes.java', 'java');

    expect(records.length).toBeGreaterThanOrEqual(5);

    const names = records.map((r) => r.name);
    expect(names).toContain('GET /api/users');
    expect(names).toContain('POST /api/users');
    expect(names).toContain('GET /api/orders');

    const getUsers = records.find((r) => r.name === 'GET /api/users');
    expect(getUsers!.metadata.framework).toBe('spring');
  });

  it('generates stable IDs', () => {
    const content = readFixture('routes.ts');
    const records1 = extractor.extract(content, 'routes.ts', 'typescript');
    const records2 = extractor.extract(content, 'routes.ts', 'typescript');

    expect(records1.map((r) => r.id)).toEqual(records2.map((r) => r.id));
  });
});
