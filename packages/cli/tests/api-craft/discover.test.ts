import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  discoverApiSurfaces,
  classifyApiSurface,
  isNonRouteFile,
  isOpenApiSpec,
  hasRouteSignal,
} from '../../src/api-craft/extract/discover';

const ROUTE = "router.get('/widgets/:id', async (req, res) => { res.json({}); });";
const HELPER = 'export function toDto(row) { return { id: row.id }; }';
const OPENAPI_YAML = 'openapi: 3.0.0\ninfo:\n  title: Widgets\n  version: 1.0.0\npaths: {}\n';
const OPENAPI_JSON = '{"openapi":"3.0.0","info":{"title":"W","version":"1"},"paths":{}}';

describe('discoverApiSurfaces', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-craft-discover-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content = ROUTE): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('returns empty array when no API surface exists', () => {
    expect(discoverApiSurfaces(tmpDir)).toEqual([]);
  });

  it('discovers route definitions under a conventional root (src/routes)', () => {
    writeFile('src/routes/widgets.ts');
    writeFile('src/routes/orders.ts');
    const surfaces = discoverApiSurfaces(tmpDir);
    expect(surfaces.map((s) => s.relative).sort()).toEqual([
      'src/routes/orders.ts',
      'src/routes/widgets.ts',
    ]);
    for (const s of surfaces) expect(s.kind).toBe('route');
  });

  it('skips files under an API root that carry no route signal (helpers)', () => {
    writeFile('src/api/widgets.ts', ROUTE);
    writeFile('src/api/mapper.ts', HELPER);
    const surfaces = discoverApiSurfaces(tmpDir);
    expect(surfaces.map((s) => s.relative)).toEqual(['src/api/widgets.ts']);
  });

  it('discovers an OpenAPI YAML document anywhere under a spec root', () => {
    writeFile('docs/openapi.yaml', OPENAPI_YAML);
    const surfaces = discoverApiSurfaces(tmpDir);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.kind).toBe('openapi');
    expect(surfaces[0]!.relative).toBe('docs/openapi.yaml');
  });

  it('discovers an OpenAPI JSON document by its root key even with a non-standard name', () => {
    writeFile('spec/service.json', OPENAPI_JSON);
    const surfaces = discoverApiSurfaces(tmpDir);
    expect(surfaces.some((s) => s.kind === 'openapi' && s.relative === 'spec/service.json')).toBe(
      true
    );
  });

  it('discovers both an OpenAPI doc and route code together', () => {
    writeFile('openapi.yaml', OPENAPI_YAML);
    writeFile('src/routes/widgets.ts', ROUTE);
    const surfaces = discoverApiSurfaces(tmpDir);
    const kinds = surfaces.map((s) => s.kind).sort();
    expect(kinds).toEqual(['openapi', 'route']);
  });

  it('excludes tests, barrels (index/_registry), and type decls from route discovery', () => {
    writeFile('src/routes/widgets.ts', ROUTE);
    writeFile('src/routes/widgets.test.ts', ROUTE);
    writeFile('src/routes/index.ts', ROUTE);
    writeFile('src/routes/_registry.ts', ROUTE);
    writeFile('src/routes/types.d.ts', ROUTE);
    const surfaces = discoverApiSurfaces(tmpDir);
    expect(surfaces.map((s) => s.relative)).toEqual(['src/routes/widgets.ts']);
  });

  it('excludes build/dep dirs (node_modules, dist)', () => {
    writeFile('src/routes/real.ts', ROUTE);
    writeFile('src/routes/node_modules/pkg/cmd.ts', ROUTE);
    writeFile('src/routes/dist/cmd.ts', ROUTE);
    const surfaces = discoverApiSurfaces(tmpDir);
    expect(surfaces.map((s) => s.relative)).toEqual(['src/routes/real.ts']);
  });

  it('honors an explicit routesDir override', () => {
    writeFile('src/routes/ignored.ts', ROUTE);
    writeFile('server/http/api.ts', ROUTE);
    const surfaces = discoverApiSurfaces(tmpDir, { routesDir: 'server/http' });
    const routes = surfaces.filter((s) => s.kind === 'route');
    expect(routes.map((s) => s.relative)).toEqual(['server/http/api.ts']);
  });

  it('honors an explicit specFile override', () => {
    writeFile('contracts/my-spec.yaml', OPENAPI_YAML);
    const surfaces = discoverApiSurfaces(tmpDir, { specFile: 'contracts/my-spec.yaml' });
    expect(surfaces.some((s) => s.kind === 'openapi')).toBe(true);
  });

  it('honors extraExcludeDirs', () => {
    writeFile('src/routes/keep.ts', ROUTE);
    writeFile('src/routes/legacy/old.ts', ROUTE);
    const surfaces = discoverApiSurfaces(tmpDir, { extraExcludeDirs: ['legacy'] });
    expect(surfaces.map((s) => s.relative)).toEqual(['src/routes/keep.ts']);
  });

  it('detects Nest controller decorators as a route signal', () => {
    writeFile('src/controllers/widget.controller.ts', "@Controller('widgets')\nclass C {}");
    const surfaces = discoverApiSurfaces(tmpDir);
    expect(surfaces.map((s) => s.relative)).toEqual(['src/controllers/widget.controller.ts']);
  });

  it('detects a Next.js App Router exported handler as a route signal', () => {
    writeFile(
      'app/api/widgets/route.ts',
      'export async function GET() { return Response.json({}); }'
    );
    const surfaces = discoverApiSurfaces(tmpDir);
    expect(surfaces.some((s) => s.relative === 'app/api/widgets/route.ts')).toBe(true);
  });
});

describe('classifyApiSurface', () => {
  it('classifies an OpenAPI document as openapi', () => {
    expect(classifyApiSurface('openapi.yaml', OPENAPI_YAML)).toBe('openapi');
    expect(classifyApiSurface('service.json', OPENAPI_JSON)).toBe('openapi');
  });

  it('classifies route code as route', () => {
    expect(classifyApiSurface('widgets.ts', ROUTE)).toBe('route');
  });
});

describe('isOpenApiSpec / hasRouteSignal / isNonRouteFile', () => {
  it('isOpenApiSpec matches by filename and by root key', () => {
    expect(isOpenApiSpec('openapi.yaml', 'anything')).toBe(true);
    expect(isOpenApiSpec('swagger.json', '{}')).toBe(true);
    expect(isOpenApiSpec('random.yaml', OPENAPI_YAML)).toBe(true);
    expect(isOpenApiSpec('random.yaml', 'name: not-a-spec')).toBe(false);
  });

  it('hasRouteSignal recognizes common frameworks', () => {
    expect(hasRouteSignal("app.post('/x', h)")).toBe(true);
    expect(hasRouteSignal('@Get()')).toBe(true);
    expect(hasRouteSignal('export const POST = () => {}')).toBe(true);
    expect(hasRouteSignal('export function toDto() {}')).toBe(false);
  });

  it('isNonRouteFile flags tests, specs, decls, barrels, and underscore-prefixed files', () => {
    for (const f of [
      'src/routes/x.test.ts',
      'src/routes/x.spec.ts',
      'src/routes/x.d.ts',
      'src/routes/index.ts',
      'src/routes/_registry.ts',
    ]) {
      expect(isNonRouteFile(f)).toBe(true);
    }
    expect(isNonRouteFile('src/routes/widgets.ts')).toBe(false);
  });
});
