// src/utils/workspace-packages.ts
//
// Workspace-package specifier resolution for `no-layer-violation` (#2216).
//
// The rule only follows relative specifiers, so in a monorepo every
// package-to-package import (`@scope/pkg`, `@scope/pkg/sub`) was skipped and a
// cross-package layer violation could never be reported. This module maps a
// bare specifier naming a workspace package to a source file inside that
// package, so the rule can check it against the layer config.
//
// Deliberately cheap, synchronous and best-effort (ESLint rules are sync): it
// reads `pnpm-workspace.yaml` (or the root `package.json` `workspaces` field),
// each member's `package.json` name and `exports`, and maps a `dist/`-style
// export target back to `src/`. Anything it cannot resolve returns `null`,
// which is exactly the behaviour without the option.
//
// NOTE: this mirrors the async resolver proposed for
// `@harness-engineering/core` in #2572 (constraints/workspace-packages.ts).
// eslint-plugin does not depend on core today and must stay synchronous, so
// the logic is duplicated here; consolidate once a sync variant lives in core.
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

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
/** Directories never descended into while expanding workspace globs. */
const SKIP_DIRS = new Set(['node_modules', '.git']);

interface WorkspaceCacheEntry {
  packages: Map<string, WorkspacePackage>;
  resolved: Map<string, string | null>;
}

/**
 * Per-root cache. ESLint invokes `create()` once per linted file, so the
 * workspace map is built once per workspace root per process (i.e. per lint
 * run) and specifier resolutions are memoised alongside it.
 */
const workspaceCache = new Map<string, WorkspaceCacheEntry>();

/** Clear the workspace cache (for testing / long-lived processes). */
export function clearWorkspaceCache(): void {
  workspaceCache.clear();
}

function readJson(file: string): PackageManifest | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' ? (parsed as PackageManifest) : null;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function unquote(value: string): string {
  const v = value.trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Minimal reader for the `packages:` list of `pnpm-workspace.yaml` — block
 * sequence (`- 'packages/*'`) or flow sequence (`packages: ['a/*', 'b']`).
 * Avoids a YAML dependency for the one key we need.
 */
export function parsePnpmWorkspacePackages(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const globs: string[] = [];
  let inPackages = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!inPackages) {
      const m = /^packages\s*:\s*(.*)$/.exec(line);
      if (!m) continue;
      const rest = m[1]!.trim();
      if (rest.startsWith('[')) {
        return rest
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map(unquote)
          .filter((g) => g.length > 0);
      }
      inPackages = true;
      continue;
    }
    if (line.trim() === '') continue;
    const item = /^\s*-\s*(.+)$/.exec(line);
    if (item) {
      globs.push(unquote(item[1]!));
      continue;
    }
    // Any other non-indented key ends the list.
    if (/^\S/.test(line)) break;
  }
  return globs;
}

/** The workspace member globs: pnpm-workspace.yaml first, then package.json `workspaces`. */
function workspaceGlobs(rootDir: string): string[] {
  const pnpmFile = path.join(rootDir, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmFile)) {
    try {
      return parsePnpmWorkspacePackages(fs.readFileSync(pnpmFile, 'utf-8'));
    } catch {
      return [];
    }
  }
  const root = readJson(path.join(rootDir, 'package.json'));
  const ws = root?.workspaces;
  if (Array.isArray(ws)) return stringArray(ws);
  if (ws && typeof ws === 'object') return stringArray((ws as { packages?: unknown }).packages);
  return [];
}

function listDirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Expand a workspace directory glob (e.g. `packages/*`, `apps/**`, `docs`)
 * into root-relative directories, segment by segment.
 */
function expandDirGlob(rootDir: string, glob: string): string[] {
  const segments = glob
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter((s) => s.length > 0);
  let current: string[] = [''];
  for (const segment of segments) {
    const next: string[] = [];
    for (const rel of current) {
      const abs = path.join(rootDir, rel);
      if (segment === '**') {
        // Zero or more directories.
        const stack = [rel];
        while (stack.length > 0) {
          const r = stack.pop()!;
          next.push(r);
          for (const child of listDirs(path.join(rootDir, r))) {
            stack.push(r ? `${r}/${child}` : child);
          }
        }
      } else if (/[*?[{]/.test(segment)) {
        for (const child of listDirs(abs)) {
          if (minimatch(child, segment)) next.push(rel ? `${rel}/${child}` : child);
        }
      } else {
        next.push(rel ? `${rel}/${segment}` : segment);
      }
    }
    current = next;
  }
  return current.filter((r) => r.length > 0);
}

/**
 * Map every workspace package name to its directory and manifest.
 * Returns an empty map for a repo that declares no workspace.
 */
export function loadWorkspacePackages(rootDir: string): Map<string, WorkspacePackage> {
  const globs = workspaceGlobs(rootDir);
  const include = globs.filter((g) => !g.startsWith('!'));
  const exclude = globs.filter((g) => g.startsWith('!')).map((g) => g.slice(1).replace(/\/+$/, ''));

  const packages = new Map<string, WorkspacePackage>();
  for (const pattern of include) {
    const dirs = expandDirGlob(rootDir, pattern)
      .filter((d) => !exclude.some((ex) => minimatch(d, ex)))
      .sort();
    for (const rel of dirs) {
      const dir = path.join(rootDir, rel);
      const manifestPath = path.join(dir, 'package.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = readJson(manifestPath);
      if (!manifest || typeof manifest.name !== 'string' || packages.has(manifest.name)) continue;
      packages.set(manifest.name, { name: manifest.name, dir, manifest });
    }
  }
  return packages;
}

/** Split `@scope/pkg/a/b` into the package name and its `./a/b` subpath. */
export function splitBareSpecifier(specifier: string): { name: string; subpath: string } | null {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.includes(':')) {
    return null;
  }
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

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * First existing source file for a package-relative path, trying source
 * extensions and `index` files. Build output (`dist/` etc.) is never source —
 * {@link candidateTargets} supplies its `src/` twin instead.
 */
function firstSourceFile(dir: string, rel: string): string | null {
  if (BUILD_DIRS.includes(rel.split('/')[0]!)) return null;
  const abs = path.join(dir, rel);
  const ext = path.extname(abs);
  let base = abs;
  if (abs.endsWith('.d.ts')) {
    base = abs.slice(0, -'.d.ts'.length);
  } else if (SOURCE_EXTS.includes(ext)) {
    if (isFile(abs)) return abs;
    base = abs.slice(0, -ext.length);
  }
  const candidates = [
    ...SOURCE_EXTS.map((e) => base + e),
    ...SOURCE_EXTS.map((e) => path.join(base, 'index' + e)),
  ];
  return candidates.find(isFile) ?? null;
}

/**
 * Resolve a bare specifier to an absolute source file (forward slashes) inside
 * a workspace package, or `null` when it names no workspace package or no
 * source file is found.
 */
export function resolveWorkspaceSpecifier(
  specifier: string,
  packages: ReadonlyMap<string, WorkspacePackage>
): string | null {
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
    const found = firstSourceFile(pkg.dir, rel);
    if (found) return found.replace(/\\/g, '/');
  }
  return null;
}

/**
 * Cached entry point used by the rule: resolve `specifier` against the
 * workspace rooted at `rootDir`. The workspace map and each resolution are
 * computed once per root per process.
 */
export function resolveWorkspaceImport(specifier: string, rootDir: string): string | null {
  const key = path.resolve(rootDir);
  let entry = workspaceCache.get(key);
  if (!entry) {
    entry = { packages: loadWorkspacePackages(key), resolved: new Map() };
    workspaceCache.set(key, entry);
  }
  if (entry.resolved.has(specifier)) return entry.resolved.get(specifier)!;
  const result =
    entry.packages.size > 0 ? resolveWorkspaceSpecifier(specifier, entry.packages) : null;
  entry.resolved.set(specifier, result);
  return result;
}
