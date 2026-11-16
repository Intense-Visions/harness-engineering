/**
 * Workspace-package resolution for layer validation (#2216).
 *
 * The dependency graph only follows relative specifiers, so in a monorepo every
 * package-to-package import (`@scope/pkg`, `@scope/pkg/sub`) was dropped and a
 * cross-package layer violation could never be reported. This module maps a
 * bare specifier naming a workspace package to a source file inside that
 * package, so the layer check sees the edge.
 *
 * Deliberately cheap and best-effort: it reads `pnpm-workspace.yaml` (or the
 * root `package.json` `workspaces` field), each member's `package.json` name and
 * `exports`, and maps a `dist/`-style export target back to `src/`. Anything it
 * cannot resolve returns `null`, which is exactly the old behaviour.
 */
import { join, dirname, extname } from 'path';
import { parse as parseYaml } from 'yaml';
import { findFiles, fileExists, readFileContent } from '../shared/fs-utils';

/** A workspace member, keyed by its `package.json` name. */
export interface WorkspacePackage {
  name: string;
  /** Absolute directory containing the package's `package.json`. */
  dir: string;
  manifest: PackageManifest;
}

interface PackageManifest {
  name?: unknown;
  exports?: unknown;
  main?: unknown;
  module?: unknown;
  source?: unknown;
  workspaces?: unknown;
}

const SOURCE_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
/** Condition keys tried, in order, when an export entry is a conditions object. */
const CONDITION_ORDER = ['source', 'development', 'import', 'default', 'require', 'node', 'types'];
/** Build-output directories whose files are mapped back to `src/`. */
const BUILD_DIRS = ['dist', 'build', 'lib', 'out'];

async function readJson(file: string): Promise<PackageManifest | null> {
  const content = await readFileContent(file);
  if (!content.ok) return null;
  try {
    const parsed: unknown = JSON.parse(content.value);
    return parsed && typeof parsed === 'object' ? (parsed as PackageManifest) : null;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** The workspace member globs: pnpm-workspace.yaml first, then package.json `workspaces`. */
async function workspaceGlobs(rootDir: string): Promise<string[]> {
  const pnpm = await readFileContent(join(rootDir, 'pnpm-workspace.yaml'));
  if (pnpm.ok) {
    try {
      const doc = parseYaml(pnpm.value) as { packages?: unknown } | null;
      return stringArray(doc?.packages);
    } catch {
      return [];
    }
  }
  const root = await readJson(join(rootDir, 'package.json'));
  const ws = root?.workspaces;
  if (Array.isArray(ws)) return stringArray(ws);
  if (ws && typeof ws === 'object') return stringArray((ws as { packages?: unknown }).packages);
  return [];
}

/**
 * Map every workspace package name to its directory and manifest.
 * Returns an empty map for a repo that declares no workspace.
 */
export async function loadWorkspacePackages(
  rootDir: string
): Promise<Map<string, WorkspacePackage>> {
  const globs = await workspaceGlobs(rootDir);
  const include = globs.filter((g) => !g.startsWith('!'));
  const exclude = globs
    .filter((g) => g.startsWith('!'))
    .map((g) => g.slice(1).replace(/\/+$/, '') + '/package.json');

  const packages = new Map<string, WorkspacePackage>();
  for (const pattern of include) {
    const manifests = await findFiles(
      pattern.replace(/\/+$/, '') + '/package.json',
      rootDir,
      exclude
    );
    for (const manifestPath of manifests.sort()) {
      const manifest = await readJson(manifestPath);
      if (!manifest || typeof manifest.name !== 'string' || packages.has(manifest.name)) continue;
      packages.set(manifest.name, { name: manifest.name, dir: dirname(manifestPath), manifest });
    }
  }
  return packages;
}

/** Split `@scope/pkg/a/b` into the package name and its `./a/b` subpath. */
export function splitBareSpecifier(specifier: string): { name: string; subpath: string } | null {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.includes(':'))
    return null;
  const parts = specifier.split('/');
  const nameLength = specifier.startsWith('@') ? 2 : 1;
  if (parts.length < nameLength || parts.slice(0, nameLength).some((p) => p.length === 0)) {
    return null;
  }
  const name = parts.slice(0, nameLength).join('/');
  const rest = parts.slice(nameLength).join('/');
  return { name, subpath: rest ? `./${rest}` : '.' };
}

/** Pick a string target out of an export entry (string, conditions object, or array). */
function exportTarget(entry: unknown): string | null {
  if (typeof entry === 'string') return entry;
  if (Array.isArray(entry)) {
    for (const item of entry) {
      const target = exportTarget(item);
      if (target) return target;
    }
    return null;
  }
  if (entry && typeof entry === 'object') {
    const conditions = entry as Record<string, unknown>;
    for (const key of CONDITION_ORDER) {
      if (key in conditions) {
        const target = exportTarget(conditions[key]);
        if (target) return target;
      }
    }
  }
  return null;
}

/** The manifest's declared target for a subpath, or null when it declares none. */
function declaredTarget(manifest: PackageManifest, subpath: string): string | null {
  const { exports } = manifest;
  if (exports !== undefined && exports !== null) {
    const isSubpathMap =
      typeof exports === 'object' &&
      !Array.isArray(exports) &&
      Object.keys(exports).some((k) => k.startsWith('.'));
    if (isSubpathMap) return exportTarget((exports as Record<string, unknown>)[subpath]);
    return subpath === '.' ? exportTarget(exports) : null;
  }
  if (subpath !== '.') return subpath;
  for (const field of [manifest.source, manifest.module, manifest.main]) {
    if (typeof field === 'string') return field;
  }
  return null;
}

/** Relative targets to try: the declared one, then its `src/` twin for a build dir. */
function candidateTargets(target: string): string[] {
  const rel = target.replace(/^\.\//, '');
  const candidates = [rel];
  const first = rel.split('/')[0]!;
  if (BUILD_DIRS.includes(first)) candidates.push('src/' + rel.slice(first.length + 1));
  return candidates;
}

/**
 * First existing source file for a package-relative path, trying source
 * extensions and `index` files. Build output (`dist/` etc.) is never source —
 * {@link candidateTargets} supplies its `src/` twin instead.
 */
async function firstSourceFile(dir: string, rel: string): Promise<string | null> {
  if (BUILD_DIRS.includes(rel.split('/')[0]!)) return null;
  const abs = join(dir, rel);
  const ext = extname(abs);
  let base = abs;
  if (abs.endsWith('.d.ts')) {
    base = abs.slice(0, -'.d.ts'.length);
  } else if (SOURCE_EXTS.includes(ext)) {
    if (await fileExists(abs)) return abs;
    base = abs.slice(0, -ext.length);
  }
  const candidates = [
    ...SOURCE_EXTS.map((e) => base + e),
    ...SOURCE_EXTS.map((e) => join(base, 'index' + e)),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve a bare specifier to an absolute source file inside a workspace
 * package, or `null` when it names no workspace package or no source is found.
 */
export async function resolveWorkspaceSpecifier(
  specifier: string,
  packages: ReadonlyMap<string, WorkspacePackage>
): Promise<string | null> {
  const split = splitBareSpecifier(specifier);
  if (!split) return null;
  const pkg = packages.get(split.name);
  if (!pkg) return null;

  const targets: string[] = [];
  const declared = declaredTarget(pkg.manifest, split.subpath);
  if (declared) targets.push(...candidateTargets(declared));
  // Conventional fallback: `src/index` for the root, `src/<subpath>` otherwise.
  targets.push(split.subpath === '.' ? 'src/index' : 'src/' + split.subpath.slice(2));

  for (const rel of targets) {
    const found = await firstSourceFile(pkg.dir, rel);
    if (found) return found.replace(/\\/g, '/');
  }
  return null;
}
