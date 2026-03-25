import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const NPM_REGISTRY = 'https://registry.npmjs.org';
const FETCH_TIMEOUT_MS = 30_000;
const HARNESS_SKILLS_SCOPE = '@harness-skills/';

export interface NpmSearchResult {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  date: string;
}

export interface NpmSearchResponse {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description: string;
      keywords: string[];
      date: string;
    };
  }>;
}

export interface NpmVersionDist {
  tarball: string;
  shasum: string;
  integrity: string;
}

export interface NpmVersionInfo {
  version: string;
  dist: NpmVersionDist;
}

export interface NpmPackageMetadata {
  name: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, NpmVersionInfo>;
}

/**
 * Resolve a skill name to a fully-qualified @harness-skills/ scoped package name.
 * - Bare name "deployment" -> "@harness-skills/deployment"
 * - Already scoped "@harness-skills/deployment" -> unchanged
 * - Other scopes throw
 */
export function resolvePackageName(name: string): string {
  if (name.startsWith(HARNESS_SKILLS_SCOPE)) {
    return name;
  }
  if (name.startsWith('@')) {
    throw new Error(`Only @harness-skills/ scoped packages are supported. Got: ${name}`);
  }
  return `${HARNESS_SKILLS_SCOPE}${name}`;
}

/**
 * Extract the short skill name from a fully-qualified package name.
 * "@harness-skills/deployment" -> "deployment"
 */
export function extractSkillName(packageName: string): string {
  if (packageName.startsWith(HARNESS_SKILLS_SCOPE)) {
    return packageName.slice(HARNESS_SKILLS_SCOPE.length);
  }
  return packageName;
}

/**
 * Read an auth token from .npmrc files for a given registry URL.
 * Checks project .npmrc first, then $HOME/.npmrc.
 * Looks for lines matching: //registry.host/:_authToken=TOKEN
 */
export function readNpmrcToken(registryUrl: string): string | null {
  const { hostname, pathname } = new URL(registryUrl);
  const registryPath = `//${hostname}${pathname.replace(/\/$/, '')}/:_authToken=`;

  const candidates = [path.join(process.cwd(), '.npmrc'), path.join(os.homedir(), '.npmrc')];

  for (const npmrcPath of candidates) {
    try {
      const content = fs.readFileSync(npmrcPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith(registryPath)) {
          return trimmed.slice(registryPath.length).trim();
        }
      }
    } catch {
      // File doesn't exist or not readable
    }
  }
  return null;
}

/**
 * Fetch package metadata from the npm registry.
 * Throws on network errors or non-200 responses.
 */
export async function fetchPackageMetadata(
  packageName: string,
  registryUrl?: string
): Promise<NpmPackageMetadata> {
  const registry = registryUrl ?? NPM_REGISTRY;
  const headers: Record<string, string> = {};
  if (registryUrl) {
    const token = readNpmrcToken(registryUrl);
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const encodedName = encodeURIComponent(packageName);
  const url = `${registry}/${encodedName}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error('Cannot reach npm registry. Check your network connection.');
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Package ${packageName} not found on npm registry.`);
    }
    throw new Error(
      `npm registry returned ${response.status} ${response.statusText} for ${packageName}.`
    );
  }

  return (await response.json()) as NpmPackageMetadata;
}

/**
 * Download a tarball from a URL. Retries once on failure.
 * Returns the tarball content as a Buffer.
 */
export async function downloadTarball(tarballUrl: string, authToken?: string): Promise<Buffer> {
  let lastError: Error | undefined;
  const headers: Record<string, string> = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(tarballUrl, {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(`Download failed for ${tarballUrl}. Try again. (${lastError?.message})`);
}

/**
 * Search the npm registry for @harness-skills packages.
 * Uses the npm search API: /-/v1/search?text=scope:harness-skills+<query>&size=20
 */
export async function searchNpmRegistry(
  query: string,
  registryUrl?: string
): Promise<NpmSearchResult[]> {
  const registry = registryUrl ?? NPM_REGISTRY;
  const headers: Record<string, string> = {};
  if (registryUrl) {
    const token = readNpmrcToken(registryUrl);
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const searchText = encodeURIComponent(`scope:harness-skills ${query}`);
  const url = `${registry}/-/v1/search?text=${searchText}&size=20`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error('Cannot reach npm registry. Check your network connection.');
  }

  if (!response.ok) {
    throw new Error(`npm registry search returned ${response.status} ${response.statusText}.`);
  }

  const data = (await response.json()) as NpmSearchResponse;
  return data.objects.map((obj) => ({
    name: obj.package.name,
    version: obj.package.version,
    description: obj.package.description,
    keywords: obj.package.keywords || [],
    date: obj.package.date,
  }));
}
