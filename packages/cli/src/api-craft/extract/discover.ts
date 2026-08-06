/**
 * API-surface discovery — walks the project for the two kinds of authored API
 * surface api-craft critiques:
 *
 *   - OpenAPI / Swagger specification documents (YAML or JSON), and
 *   - route / handler definitions in code (Express, Fastify, Koa, Nest,
 *     LoopBack, Hono, Next.js route handlers, …).
 *
 * Route code is included only when it carries a route SIGNAL (a `.get(/.post(`
 * call, an `@Get()`/`@Controller()` decorator, an exported `GET`/`POST`
 * handler, …). A helper module that happens to live under `src/api` but defines
 * no endpoint is not an API surface and is skipped — the FP/cost-management
 * analogue of code-craft's zero-unit skip.
 *
 * Structural twin of cli-ergonomics-craft's command discovery.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ApiSurfaceKind } from '../catalog/rubrics/types.js';

/**
 * Candidate roots that conventionally hold route / handler definitions, tried
 * in order. Every root that exists is walked (a monorepo can have more than
 * one). harness itself does not ship an HTTP API, so these roots are for the
 * adopter projects that do.
 */
export const API_ROOTS: ReadonlyArray<string> = [
  'src/routes',
  'src/api',
  'src/controllers',
  'src/handlers',
  'src/server/routes',
  'app/api', // Next.js App Router
  'pages/api', // Next.js Pages Router
  'routes',
  'api',
  'controllers',
  'handlers',
];

/**
 * Roots searched for OpenAPI / Swagger documents, in addition to the project
 * root itself. A spec file is included wherever it is found under these.
 */
export const OPENAPI_ROOTS: ReadonlyArray<string> = [
  '.',
  'docs',
  'spec',
  'specs',
  'api',
  'openapi',
  'src',
];

/** Directory names never walked (build output, deps, VCS, generated trees). */
export const DEFAULT_EXCLUDED_DIRS: ReadonlyArray<string> = [
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '__snapshots__',
  '__tests__',
  'tests',
  'test',
  'fixtures',
];

/** Source extensions that can define a route / handler. */
const ROUTE_EXTENSIONS: ReadonlyArray<string> = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];

/** Extensions an OpenAPI / Swagger document can use. */
const OPENAPI_EXTENSIONS: ReadonlyArray<string> = ['.yaml', '.yml', '.json'];

/**
 * Route-definition signals across common HTTP frameworks. Cheap content
 * heuristics only — the LLM does the real judgment; this just filters out
 * modules that live under an API root but define no endpoint.
 */
const ROUTE_SIGNAL =
  /(?:\b(?:router|app|fastify|server|api)\s*\.\s*(?:get|post|put|patch|delete|del|options|head|all|route)\s*\()|(?:@(?:Get|Post|Put|Patch|Delete|All|Options|Head|Controller)\s*\()|(?:@(?:get|post|put|patch|del)\s*\()|(?:\.(?:route|addRoute|registerRoute)\s*\()|(?:export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b)|(?:export\s+const\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=)/;

/** OpenAPI / Swagger document markers (root key or filename). */
const OPENAPI_CONTENT = /(^|\n)\s*(?:openapi|swagger)\s*:/i;
const OPENAPI_JSON_CONTENT = /"(?:openapi|swagger)"\s*:/i;
const OPENAPI_FILENAME = /(?:openapi|swagger)\.(?:ya?ml|json)$/i;

export interface DiscoveredApiSurface {
  /** Absolute path to the API-surface file. */
  file: string;
  /** Path relative to the project root (POSIX separators) for display. */
  relative: string;
  /** Coarse classification used to filter rubrics + shape the prompt. */
  kind: ApiSurfaceKind;
}

/**
 * True when a file is a test / spec / type-declaration or a barrel — not an
 * authored route surface. Cheap filename heuristics only. (Applied to route
 * code; OpenAPI documents are matched by their own markers.)
 */
export function isNonRouteFile(relative: string): boolean {
  const base = path.basename(relative).toLowerCase();
  if (/\.(test|spec|d)\.[mc]?[tj]s$/.test(base)) return true;
  if (base.startsWith('_')) return true; // _registry.ts, _shared.ts, ...
  if (base === 'index.ts' || base === 'index.js' || base === 'index.mjs') return true;
  return false;
}

/** True when a file looks like an OpenAPI / Swagger document. */
export function isOpenApiSpec(relative: string, content: string): boolean {
  if (OPENAPI_FILENAME.test(path.basename(relative))) return true;
  const head = content.slice(0, 4000);
  return OPENAPI_CONTENT.test(head) || OPENAPI_JSON_CONTENT.test(head);
}

/** True when route-definition source carries at least one endpoint signal. */
export function hasRouteSignal(content: string): boolean {
  return ROUTE_SIGNAL.test(content);
}

/**
 * Classify an already-known API-surface file. A file matching an OpenAPI marker
 * is `openapi`; everything else that reaches this point is a `route` (the
 * caller only passes files that already carried a route signal or an OpenAPI
 * marker).
 */
export function classifyApiSurface(relative: string, content: string): ApiSurfaceKind {
  return isOpenApiSpec(relative, content) ? 'openapi' : 'route';
}

export function discoverApiSurfaces(
  projectRoot: string,
  opts: {
    routesDir?: string;
    specFile?: string;
    extraExcludeDirs?: ReadonlyArray<string>;
  } = {}
): DiscoveredApiSurface[] {
  const exclude = new Set<string>([...DEFAULT_EXCLUDED_DIRS, ...(opts.extraExcludeDirs ?? [])]);
  const out: DiscoveredApiSurface[] = [];
  const seen = new Set<string>();

  if (opts.specFile !== undefined) {
    addSpecFile(path.resolve(projectRoot, opts.specFile), projectRoot, out, seen);
  } else {
    collectOpenApiSpecs(projectRoot, out, exclude, seen);
  }

  const routeRoots =
    opts.routesDir !== undefined
      ? [path.resolve(projectRoot, opts.routesDir)]
      : API_ROOTS.map((r) => path.join(projectRoot, r));
  for (const root of routeRoots) {
    if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
      walkRoutes(root, projectRoot, out, exclude, seen);
    }
  }

  return out;
}

/** Search the OpenAPI roots (shallow-recursive) for spec documents. */
function collectOpenApiSpecs(
  projectRoot: string,
  out: DiscoveredApiSurface[],
  exclude: Set<string>,
  seen: Set<string>
): void {
  for (const rel of OPENAPI_ROOTS) {
    const root = path.join(projectRoot, rel);
    if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
      walkSpecs(root, projectRoot, out, exclude, seen);
    }
  }
}

function addSpecFile(
  full: string,
  projectRoot: string,
  out: DiscoveredApiSurface[],
  seen: Set<string>
): void {
  if (seen.has(full)) return;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return;
  const relative = path.relative(projectRoot, full).replaceAll('\\', '/');
  out.push({ file: full, relative, kind: 'openapi' });
  seen.add(full);
}

function walkSpecs(
  dir: string,
  projectRoot: string,
  out: DiscoveredApiSurface[],
  exclude: Set<string>,
  seen: Set<string>
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (exclude.has(entry.name)) continue;
      walkSpecs(full, projectRoot, out, exclude, seen);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!OPENAPI_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) continue;
    if (seen.has(full)) continue;
    let content: string;
    try {
      content = fs.readFileSync(full, 'utf-8');
    } catch {
      continue;
    }
    const relative = path.relative(projectRoot, full).replaceAll('\\', '/');
    if (!isOpenApiSpec(relative, content)) continue;
    out.push({ file: full, relative, kind: 'openapi' });
    seen.add(full);
  }
}

function walkRoutes(
  dir: string,
  projectRoot: string,
  out: DiscoveredApiSurface[],
  exclude: Set<string>,
  seen: Set<string>
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (exclude.has(entry.name)) continue;
      walkRoutes(full, projectRoot, out, exclude, seen);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!ROUTE_EXTENSIONS.includes(path.extname(entry.name))) continue;
    if (seen.has(full)) continue;
    const relative = path.relative(projectRoot, full).replaceAll('\\', '/');
    if (isNonRouteFile(relative)) continue;
    let content: string;
    try {
      content = fs.readFileSync(full, 'utf-8');
    } catch {
      continue;
    }
    if (!hasRouteSignal(content)) continue;
    out.push({ file: full, relative, kind: 'route' });
    seen.add(full);
  }
}
