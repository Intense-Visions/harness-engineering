import { join, resolve } from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { EntropyError } from './types';
import { createEntropyError } from '../shared/errors';
import { fileExists, readFileContent, findFiles } from '../shared/fs-utils';

type Language = 'typescript' | 'python' | 'go' | 'rust' | 'java';

interface LanguageResolution {
  language: Language;
  detected: boolean;
  entries: string[];
  hints: string[];
}

function collectFieldEntries(rootDir: string, field: unknown): string[] {
  if (typeof field === 'string') return [resolve(rootDir, field)];
  if (typeof field === 'object' && field !== null) {
    return Object.values(field as Record<string, unknown>)
      .filter((v): v is string => typeof v === 'string')
      .map((v) => resolve(rootDir, v));
  }
  return [];
}

function extractPackageEntries(rootDir: string, pkg: Record<string, unknown>): string[] {
  const entries: string[] = [];
  entries.push(...collectFieldEntries(rootDir, pkg['exports']));
  if (entries.length === 0 && typeof pkg['main'] === 'string') {
    entries.push(resolve(rootDir, pkg['main']));
  }
  if (pkg['bin']) entries.push(...collectFieldEntries(rootDir, pkg['bin']));
  return entries;
}

const TS_HINTS = ['Add "exports" or "main" to package.json', 'Create src/index.ts'];
const TS_CONVENTIONS = ['src/index.ts', 'src/main.ts', 'src/index.tsx', 'index.ts', 'main.ts'];

async function readPackageJsonEntries(rootDir: string, pkgPath: string): Promise<string[]> {
  const content = await readFileContent(pkgPath);
  if (!content.ok) return [];
  try {
    const pkg = JSON.parse(content.value) as Record<string, unknown>;
    return extractPackageEntries(rootDir, pkg);
  } catch {
    return [];
  }
}

async function resolveTypeScript(rootDir: string): Promise<LanguageResolution> {
  const pkgPath = join(rootDir, 'package.json');
  const detected = await fileExists(pkgPath);

  if (detected) {
    const entries = await readPackageJsonEntries(rootDir, pkgPath);
    if (entries.length > 0) {
      return { language: 'typescript', detected: true, entries, hints: TS_HINTS };
    }
  }

  for (const conv of TS_CONVENTIONS) {
    const p = join(rootDir, conv);
    if (await fileExists(p)) {
      return { language: 'typescript', detected: true, entries: [p], hints: TS_HINTS };
    }
  }

  return { language: 'typescript', detected, entries: [], hints: TS_HINTS };
}

const PYTHON_HINTS = [
  'Add an entry to [project.scripts] in pyproject.toml',
  'Create main.py or <package>/__main__.py',
];

const PYTHON_CONVENTIONS = [
  '__main__.py',
  'main.py',
  'app.py',
  'src/__main__.py',
  'src/main.py',
  'src/app.py',
];

async function detectPython(rootDir: string): Promise<boolean> {
  return (
    (await fileExists(join(rootDir, 'pyproject.toml'))) ||
    (await fileExists(join(rootDir, 'setup.py'))) ||
    (await fileExists(join(rootDir, 'requirements.txt')))
  );
}

async function readPyProject(rootDir: string): Promise<PyProjectInfo> {
  const pyproject = join(rootDir, 'pyproject.toml');
  if (!(await fileExists(pyproject))) return { scriptTargets: [] };
  const content = await readFileContent(pyproject);
  if (!content.ok) return { scriptTargets: [] };
  return parsePyProject(content.value);
}

async function resolveScriptTargetEntry(
  rootDir: string,
  target: string
): Promise<string | undefined> {
  const mod = target.split(':')[0];
  if (!mod) return undefined;
  const relPath = mod.replaceAll('.', '/') + '.py';
  for (const candidate of [join(rootDir, relPath), join(rootDir, 'src', relPath)]) {
    if (await fileExists(candidate)) return candidate;
  }
  return undefined;
}

async function resolvePythonFromScripts(rootDir: string, targets: string[]): Promise<string[]> {
  const entries: string[] = [];
  for (const target of targets) {
    const entry = await resolveScriptTargetEntry(rootDir, target);
    if (entry) entries.push(entry);
  }
  return entries;
}

async function resolvePythonFromProjectName(
  rootDir: string,
  projectName: string | undefined
): Promise<string[]> {
  if (!projectName) return [];
  const normalized = projectName.replaceAll('-', '_');
  const candidates = [
    join(rootDir, normalized, '__init__.py'),
    join(rootDir, normalized, '__main__.py'),
    join(rootDir, 'src', normalized, '__init__.py'),
    join(rootDir, 'src', normalized, '__main__.py'),
  ];
  const entries: string[] = [];
  for (const c of candidates) {
    if (await fileExists(c)) entries.push(c);
  }
  return entries;
}

async function resolvePythonConventions(rootDir: string): Promise<string[]> {
  const entries: string[] = [];
  for (const conv of PYTHON_CONVENTIONS) {
    const p = join(rootDir, conv);
    if (await fileExists(p)) entries.push(p);
  }
  return entries;
}

async function findPythonTopLevelPackages(rootDir: string): Promise<string[]> {
  const found = await findFiles('*/__init__.py', rootDir);
  if (found.length > 0) return found;
  return findFiles('src/*/__init__.py', rootDir);
}

async function resolvePython(rootDir: string): Promise<LanguageResolution> {
  if (!(await detectPython(rootDir))) {
    return { language: 'python', detected: false, entries: [], hints: PYTHON_HINTS };
  }

  const info = await readPyProject(rootDir);
  const strategies: Array<() => Promise<string[]>> = [
    () => resolvePythonFromScripts(rootDir, info.scriptTargets),
    () => resolvePythonFromProjectName(rootDir, info.projectName),
    () => resolvePythonConventions(rootDir),
    () => findPythonTopLevelPackages(rootDir),
  ];

  for (const strategy of strategies) {
    const entries = await strategy();
    if (entries.length > 0) {
      return { language: 'python', detected: true, entries, hints: PYTHON_HINTS };
    }
  }

  return { language: 'python', detected: true, entries: [], hints: PYTHON_HINTS };
}

async function resolveGo(rootDir: string): Promise<LanguageResolution> {
  const hints = ['Create main.go at the project root, or use the cmd/<name>/main.go layout'];
  const detected = await fileExists(join(rootDir, 'go.mod'));
  if (!detected) return { language: 'go', detected: false, entries: [], hints };

  const entries: string[] = [];
  const mainGo = join(rootDir, 'main.go');
  if (await fileExists(mainGo)) entries.push(mainGo);
  entries.push(...(await findFiles('cmd/*/main.go', rootDir)));

  return { language: 'go', detected: true, entries, hints };
}

async function resolveRust(rootDir: string): Promise<LanguageResolution> {
  const hints = [
    'Create src/main.rs or src/lib.rs',
    'Declare [[bin]] entries with a `path` in Cargo.toml',
  ];
  const cargoPath = join(rootDir, 'Cargo.toml');
  const detected = await fileExists(cargoPath);
  if (!detected) return { language: 'rust', detected: false, entries: [], hints };

  const entries: string[] = [];

  const content = await readFileContent(cargoPath);
  if (content.ok) {
    for (const bp of parseCargoBinPaths(content.value)) {
      const abs = resolve(rootDir, bp);
      if (await fileExists(abs)) entries.push(abs);
    }
  }

  if (entries.length === 0) {
    for (const conv of ['src/main.rs', 'src/lib.rs']) {
      const p = join(rootDir, conv);
      if (await fileExists(p)) entries.push(p);
    }
    entries.push(...(await findFiles('src/bin/*.rs', rootDir)));
  }

  return { language: 'rust', detected: true, entries, hints };
}

async function resolveJava(rootDir: string): Promise<LanguageResolution> {
  const hints = [
    'Place an entry class at src/main/java/**/Main.java (or *Application.java for Spring Boot)',
  ];
  const detected =
    (await fileExists(join(rootDir, 'pom.xml'))) ||
    (await fileExists(join(rootDir, 'build.gradle'))) ||
    (await fileExists(join(rootDir, 'build.gradle.kts')));

  if (!detected) return { language: 'java', detected: false, entries: [], hints };

  const entries: string[] = [];
  entries.push(...(await findFiles('src/main/java/**/Main.java', rootDir)));
  entries.push(...(await findFiles('src/main/java/**/*Application.java', rootDir)));

  return { language: 'java', detected: true, entries, hints };
}

interface PyProjectInfo {
  projectName?: string;
  scriptTargets: string[];
}

function parseTomlLine(raw: string): { section?: string; key?: string; value?: string } {
  const line = raw.replace(/(^|\s)#.*$/, '').trim();
  if (!line) return {};

  const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
  if (sectionMatch) return { section: sectionMatch[1] ?? '' };

  const eq = line.indexOf('=');
  if (eq <= 0) return {};
  return {
    key: line.slice(0, eq).trim(),
    value: stripTomlString(line.slice(eq + 1).trim()),
  };
}

function parsePyProject(content: string): PyProjectInfo {
  const result: PyProjectInfo = { scriptTargets: [] };
  let section: string | null = null;

  for (const raw of content.split(/\r?\n/)) {
    const parsed = parseTomlLine(raw);
    if (parsed.section !== undefined) {
      section = parsed.section;
      continue;
    }
    if (parsed.key === undefined || parsed.value === undefined) continue;

    if (section === 'project' && parsed.key === 'name') result.projectName = parsed.value;
    else if (section === 'project.scripts') result.scriptTargets.push(parsed.value);
  }

  return result;
}

function parseCargoBinPaths(content: string): string[] {
  const paths: string[] = [];
  let inBin = false;

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) continue;

    if (line === '[[bin]]') {
      inBin = true;
      continue;
    }
    if (line.startsWith('[')) {
      inBin = false;
      continue;
    }
    if (!inBin) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key === 'path') paths.push(stripTomlString(line.slice(eq + 1).trim()));
  }

  return paths;
}

function stripTomlString(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Resolve entry points for dead-code and drift analysis across supported languages.
 *
 * Resolution order:
 * 1. Explicit entries provided as arguments
 * 2. Per-language resolvers in priority order: TypeScript, Python, Go, Rust, Java.
 *    First language with declared or conventional entries wins (preserves prior
 *    JS/TS-first behavior on polyglot repos).
 *
 * On failure, the returned error's suggestions are tailored to whichever
 * language(s) were detected by manifest (pyproject.toml, go.mod, Cargo.toml,
 * pom.xml/build.gradle); if no manifest is present at all, generic suggestions
 * across all supported languages are returned.
 */
export async function resolveEntryPoints(
  rootDir: string,
  explicitEntries?: string[]
): Promise<Result<string[], EntropyError>> {
  if (explicitEntries && explicitEntries.length > 0) {
    return Ok(explicitEntries.map((e) => resolve(rootDir, e)));
  }

  const resolvers = [resolveTypeScript, resolvePython, resolveGo, resolveRust, resolveJava];
  const resolutions: LanguageResolution[] = [];

  for (const resolver of resolvers) {
    const res = await resolver(rootDir);
    resolutions.push(res);
    if (res.entries.length > 0) return Ok(res.entries);
  }

  const detectedLangs = resolutions.filter((r) => r.detected);
  const suggestions =
    detectedLangs.length > 0
      ? detectedLangs.flatMap((r) => r.hints)
      : resolutions.flatMap((r) => r.hints);
  suggestions.push('Specify entryPoints in config');

  const reason =
    detectedLangs.length > 0
      ? `Detected ${detectedLangs.map((r) => r.language).join(', ')} project but found no entry points`
      : 'No language manifest (package.json, pyproject.toml, go.mod, Cargo.toml, pom.xml) and no conventional entry files found';

  return Err(
    createEntropyError(
      'ENTRY_POINT_NOT_FOUND',
      'Could not resolve entry points',
      { reason },
      suggestions
    )
  );
}
