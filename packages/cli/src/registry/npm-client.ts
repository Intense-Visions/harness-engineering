const NPM_REGISTRY = 'https://registry.npmjs.org';
const FETCH_TIMEOUT_MS = 30_000;
const HARNESS_SKILLS_SCOPE = '@harness-skills/';

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
 * Fetch package metadata from the npm registry.
 * Throws on network errors or non-200 responses.
 */
export async function fetchPackageMetadata(packageName: string): Promise<NpmPackageMetadata> {
  const encodedName = encodeURIComponent(packageName);
  const url = `${NPM_REGISTRY}/${encodedName}`;

  let response: Response;
  try {
    response = await fetch(url, {
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
export async function downloadTarball(tarballUrl: string): Promise<Buffer> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(tarballUrl, {
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
