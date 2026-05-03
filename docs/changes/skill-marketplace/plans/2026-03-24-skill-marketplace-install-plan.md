# Plan: Skill Marketplace Install/Uninstall

**Date:** 2026-03-24
**Spec:** docs/changes/skill-marketplace/proposal.md
**Phase:** 2 of 6 (Install/Uninstall)
**Estimated tasks:** 10
**Estimated time:** 40 minutes

## Goal

`harness install <skill>` downloads a skill from the npm registry, validates it, places it into `agents/skills/community/{platform}/`, resolves dependencies, and updates the lockfile. `harness uninstall <skill>` removes a skill with dependent-safety checks.

## Observable Truths (Acceptance Criteria)

1. When `harness install deployment` is run, the system shall resolve the name to `@harness-skills/deployment`, fetch npm registry metadata, download the tarball, validate skill.yaml, copy files to `agents/skills/community/{platform}/` for each declared platform, and update `skills-lock.json`.
2. When `harness install deployment --version "^1.0.0"` is run, the system shall select the highest version matching the semver range from the registry metadata.
3. When `harness install deployment` is run and `deployment` is already installed at the same version, the system shall skip with message "Already installed: deployment@1.0.0".
4. When `harness install deployment` is run and a newer version exists, the system shall upgrade and log "Upgraded deployment: 1.0.0 -> 1.1.0".
5. If the skill name matches a bundled skill, then the system shall not install it -- return error "Skill 'harness-tdd' is a bundled skill and cannot be overridden by a community package."
6. When the registry is unreachable, the system shall fail with "Cannot reach npm registry. Check your network connection." and exit code 1.
7. When the tarball download fails, the system shall retry once, then fail with "Download failed for @harness-skills/deployment. Try again." Partial files are cleaned up.
8. When the extracted skill.yaml fails validation, the system shall abort with "Package @harness-skills/deployment@1.0.0 contains invalid skill.yaml: {errors}" and not place files on disk.
9. When an installed skill has `depends_on: ["docker-basics"]`, the system shall auto-install missing dependencies and log a warning for each transitive install.
10. When `harness uninstall deployment` is run, the system shall remove skill directories from `agents/skills/community/{platform}/` for each platform, remove the lockfile entry, and log success.
11. When another installed skill depends on `deployment` and `harness uninstall deployment` is run without `--force`, the system shall warn and refuse. With `--force`, it proceeds.
12. When `harness uninstall nonexistent` is run for a skill not in the lockfile, the system shall fail with "Skill 'nonexistent' is not installed."
13. All tests pass: `cd packages/cli && npx vitest run tests/registry/npm-client.test.ts tests/registry/tarball.test.ts tests/registry/resolver.test.ts tests/commands/install.test.ts tests/commands/uninstall.test.ts`
14. `harness validate` passes.

## File Map

```
CREATE  packages/cli/src/registry/npm-client.ts            — npm registry API client (fetchMetadata, downloadTarball)
CREATE  packages/cli/tests/registry/npm-client.test.ts     — tests with mocked fetch
CREATE  packages/cli/src/registry/tarball.ts                — tarball extraction + content placement
CREATE  packages/cli/tests/registry/tarball.test.ts        — tests with temp dirs
CREATE  packages/cli/src/registry/resolver.ts               — version resolution + dependency auto-install
CREATE  packages/cli/tests/registry/resolver.test.ts       — tests with mocked npm-client
CREATE  packages/cli/src/commands/install.ts                — harness install command
CREATE  packages/cli/tests/commands/install.test.ts        — command tests
CREATE  packages/cli/src/commands/uninstall.ts              — harness uninstall command
CREATE  packages/cli/tests/commands/uninstall.test.ts      — command tests
MODIFY  packages/cli/src/index.ts                           — register install + uninstall commands
MODIFY  packages/cli/package.json                           — add semver dependency
```

## Tasks

### Task 1: Add semver dependency

**Depends on:** none
**Files:** `packages/cli/package.json`

1. Add `semver` as a dependency to the CLI package:
   ```bash
   cd packages/cli && pnpm add semver && pnpm add -D @types/semver
   ```
2. Verify installation:
   ```bash
   cd packages/cli && node -e "require('semver')" && echo "ok"
   ```
3. Run: `harness validate`
4. Commit: `chore(cli): add semver dependency for version resolution`

---

### Task 2: Create npm registry client (TDD)

**Depends on:** Task 1
**Files:** `packages/cli/src/registry/npm-client.ts`, `packages/cli/tests/registry/npm-client.test.ts`

1. Create test file `packages/cli/tests/registry/npm-client.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import {
     resolvePackageName,
     fetchPackageMetadata,
     downloadTarball,
     type NpmPackageMetadata,
   } from '../../src/registry/npm-client';

   // Mock global fetch
   const mockFetch = vi.fn();
   vi.stubGlobal('fetch', mockFetch);

   describe('resolvePackageName', () => {
     it('prepends @harness-skills/ to bare name', () => {
       expect(resolvePackageName('deployment')).toBe('@harness-skills/deployment');
     });

     it('returns already-scoped name unchanged', () => {
       expect(resolvePackageName('@harness-skills/deployment')).toBe('@harness-skills/deployment');
     });

     it('rejects non-harness-skills scoped packages', () => {
       expect(() => resolvePackageName('@other/pkg')).toThrow(
         'Only @harness-skills/ scoped packages are supported'
       );
     });
   });

   describe('fetchPackageMetadata', () => {
     beforeEach(() => {
       vi.clearAllMocks();
     });

     it('fetches and returns metadata for a valid package', async () => {
       const mockMetadata: NpmPackageMetadata = {
         name: '@harness-skills/deployment',
         'dist-tags': { latest: '1.2.0' },
         versions: {
           '1.0.0': {
             version: '1.0.0',
             dist: {
               tarball:
                 'https://registry.npmjs.org/@harness-skills/deployment/-/deployment-1.0.0.tgz',
               shasum: 'abc123',
               integrity: 'sha512-abc123',
             },
           },
           '1.2.0': {
             version: '1.2.0',
             dist: {
               tarball:
                 'https://registry.npmjs.org/@harness-skills/deployment/-/deployment-1.2.0.tgz',
               shasum: 'def456',
               integrity: 'sha512-def456',
             },
           },
         },
       };
       mockFetch.mockResolvedValueOnce({
         ok: true,
         json: () => Promise.resolve(mockMetadata),
       });

       const result = await fetchPackageMetadata('@harness-skills/deployment');
       expect(result).toEqual(mockMetadata);
       expect(mockFetch).toHaveBeenCalledWith(
         'https://registry.npmjs.org/@harness-skills%2Fdeployment',
         expect.objectContaining({ signal: expect.any(AbortSignal) })
       );
     });

     it('throws on 404 (package not found)', async () => {
       mockFetch.mockResolvedValueOnce({
         ok: false,
         status: 404,
         statusText: 'Not Found',
       });
       await expect(fetchPackageMetadata('@harness-skills/nonexistent')).rejects.toThrow(
         'Package @harness-skills/nonexistent not found'
       );
     });

     it('throws with network error message on fetch failure', async () => {
       mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
       await expect(fetchPackageMetadata('@harness-skills/deployment')).rejects.toThrow(
         'Cannot reach npm registry'
       );
     });
   });

   describe('downloadTarball', () => {
     beforeEach(() => {
       vi.clearAllMocks();
     });

     it('downloads tarball and returns Buffer', async () => {
       const tarballContent = Buffer.from('fake-tarball-content');
       mockFetch.mockResolvedValueOnce({
         ok: true,
         arrayBuffer: () => Promise.resolve(tarballContent.buffer),
       });

       const result = await downloadTarball('https://example.com/pkg.tgz');
       expect(Buffer.isBuffer(result)).toBe(true);
     });

     it('retries once on failure then succeeds', async () => {
       const tarballContent = Buffer.from('fake-tarball-content');
       mockFetch.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce({
         ok: true,
         arrayBuffer: () => Promise.resolve(tarballContent.buffer),
       });

       const result = await downloadTarball('https://example.com/pkg.tgz');
       expect(Buffer.isBuffer(result)).toBe(true);
       expect(mockFetch).toHaveBeenCalledTimes(2);
     });

     it('throws after retry exhausted', async () => {
       mockFetch
         .mockRejectedValueOnce(new Error('network error'))
         .mockRejectedValueOnce(new Error('network error'));

       await expect(downloadTarball('https://example.com/pkg.tgz')).rejects.toThrow(
         'Download failed'
       );
     });

     it('throws on non-ok response', async () => {
       mockFetch.mockResolvedValueOnce({
         ok: false,
         status: 500,
         statusText: 'Internal Server Error',
       });

       await expect(downloadTarball('https://example.com/pkg.tgz')).rejects.toThrow(
         'Download failed'
       );
     });
   });
   ```

2. Run tests — observe failures (module not found):

   ```bash
   cd packages/cli && npx vitest run tests/registry/npm-client.test.ts
   ```

3. Create `packages/cli/src/registry/npm-client.ts`:

   ```typescript
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
   ```

4. Run tests — observe: all pass:

   ```bash
   cd packages/cli && npx vitest run tests/registry/npm-client.test.ts
   ```

5. Run: `harness validate`
6. Commit: `feat(registry): add npm registry client with fetch, retry, and name resolution`

---

### Task 3: Create tarball extraction module (TDD)

**Depends on:** none
**Files:** `packages/cli/src/registry/tarball.ts`, `packages/cli/tests/registry/tarball.test.ts`

1. Create test file `packages/cli/tests/registry/tarball.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { execFileSync } from 'child_process';
   import { extractTarball, placeSkillContent, cleanupTempDir } from '../../src/registry/tarball';

   describe('extractTarball', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarball-test-'));
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('extracts a valid .tgz buffer to a temp directory', () => {
       // Create a small tarball with a package/skill.yaml file
       const pkgDir = path.join(tmpDir, 'package');
       fs.mkdirSync(pkgDir, { recursive: true });
       fs.writeFileSync(path.join(pkgDir, 'skill.yaml'), 'name: test-skill\nversion: 1.0.0\n');
       fs.writeFileSync(path.join(pkgDir, 'SKILL.md'), '# Test Skill\n');

       // Create a tarball from tmpDir
       const tarballPath = path.join(os.tmpdir(), `test-${Date.now()}.tgz`);
       execFileSync('tar', ['-czf', tarballPath, '-C', tmpDir, 'package']);
       const tarballBuffer = fs.readFileSync(tarballPath);
       fs.unlinkSync(tarballPath);

       const extractDir = extractTarball(tarballBuffer);
       try {
         expect(fs.existsSync(path.join(extractDir, 'package', 'skill.yaml'))).toBe(true);
         expect(fs.existsSync(path.join(extractDir, 'package', 'SKILL.md'))).toBe(true);
       } finally {
         cleanupTempDir(extractDir);
       }
     });

     it('throws on invalid/corrupt tarball data', () => {
       const invalidBuffer = Buffer.from('not-a-tarball');
       expect(() => extractTarball(invalidBuffer)).toThrow();
     });
   });

   describe('placeSkillContent', () => {
     let tmpDir: string;
     let communityBase: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'place-test-'));
       communityBase = path.join(tmpDir, 'agents', 'skills', 'community');
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('copies skill content to community/{platform}/{skillName}/ for each platform', () => {
       // Simulate extracted package directory
       const extractedDir = path.join(tmpDir, 'extracted', 'package');
       fs.mkdirSync(extractedDir, { recursive: true });
       fs.writeFileSync(path.join(extractedDir, 'skill.yaml'), 'name: deploy');
       fs.writeFileSync(path.join(extractedDir, 'SKILL.md'), '# Deploy');

       placeSkillContent(extractedDir, communityBase, 'deploy', ['claude-code', 'gemini-cli']);

       expect(fs.existsSync(path.join(communityBase, 'claude-code', 'deploy', 'skill.yaml'))).toBe(
         true
       );
       expect(fs.existsSync(path.join(communityBase, 'gemini-cli', 'deploy', 'skill.yaml'))).toBe(
         true
       );
       expect(
         fs.readFileSync(path.join(communityBase, 'claude-code', 'deploy', 'SKILL.md'), 'utf-8')
       ).toBe('# Deploy');
     });

     it('overwrites existing skill directory on upgrade', () => {
       // Create existing skill
       const existingDir = path.join(communityBase, 'claude-code', 'deploy');
       fs.mkdirSync(existingDir, { recursive: true });
       fs.writeFileSync(path.join(existingDir, 'old-file.txt'), 'old');

       // Place new content
       const extractedDir = path.join(tmpDir, 'extracted', 'package');
       fs.mkdirSync(extractedDir, { recursive: true });
       fs.writeFileSync(path.join(extractedDir, 'skill.yaml'), 'name: deploy');

       placeSkillContent(extractedDir, communityBase, 'deploy', ['claude-code']);

       expect(fs.existsSync(path.join(existingDir, 'old-file.txt'))).toBe(false);
       expect(fs.existsSync(path.join(existingDir, 'skill.yaml'))).toBe(true);
     });
   });

   describe('cleanupTempDir', () => {
     it('removes a temp directory and its contents', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-test-'));
       fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'data');
       cleanupTempDir(tmpDir);
       expect(fs.existsSync(tmpDir)).toBe(false);
     });

     it('does not throw if directory does not exist', () => {
       expect(() => cleanupTempDir('/nonexistent/path')).not.toThrow();
     });
   });
   ```

2. Run tests — observe failures:

   ```bash
   cd packages/cli && npx vitest run tests/registry/tarball.test.ts
   ```

3. Create `packages/cli/src/registry/tarball.ts`:

   ```typescript
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { execFileSync } from 'child_process';

   /**
    * Extract a .tgz tarball buffer to a temporary directory.
    * npm tarballs contain a top-level `package/` directory.
    * Returns the path to the temp directory (caller must clean up).
    */
   export function extractTarball(tarballBuffer: Buffer): string {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-skill-install-'));
     const tarballPath = path.join(tmpDir, 'package.tgz');

     try {
       fs.writeFileSync(tarballPath, tarballBuffer);
       execFileSync('tar', ['-xzf', tarballPath, '-C', tmpDir], {
         timeout: 30_000,
       });
       fs.unlinkSync(tarballPath);
     } catch (err) {
       // Clean up on failure
       cleanupTempDir(tmpDir);
       throw new Error(
         `Failed to extract tarball: ${err instanceof Error ? err.message : String(err)}`
       );
     }

     return tmpDir;
   }

   /**
    * Copy extracted skill content to community skill directories.
    * Removes existing skill directory first (for upgrades).
    *
    * @param extractedPkgDir - Path to the extracted `package/` directory
    * @param communityBaseDir - Path to `agents/skills/community/`
    * @param skillName - Short skill name (e.g. "deployment")
    * @param platforms - Array of platform names (e.g. ["claude-code", "gemini-cli"])
    */
   export function placeSkillContent(
     extractedPkgDir: string,
     communityBaseDir: string,
     skillName: string,
     platforms: string[]
   ): void {
     const files = fs.readdirSync(extractedPkgDir);

     for (const platform of platforms) {
       const targetDir = path.join(communityBaseDir, platform, skillName);

       // Remove existing skill directory for clean upgrade
       if (fs.existsSync(targetDir)) {
         fs.rmSync(targetDir, { recursive: true, force: true });
       }

       fs.mkdirSync(targetDir, { recursive: true });

       // Copy all files from extracted package (skip package.json, node_modules)
       for (const file of files) {
         if (file === 'package.json' || file === 'node_modules') continue;
         const srcPath = path.join(extractedPkgDir, file);
         const destPath = path.join(targetDir, file);
         const stat = fs.statSync(srcPath);
         if (stat.isDirectory()) {
           fs.cpSync(srcPath, destPath, { recursive: true });
         } else {
           fs.copyFileSync(srcPath, destPath);
         }
       }
     }
   }

   /**
    * Remove a skill from all platform directories under community/.
    *
    * @param communityBaseDir - Path to `agents/skills/community/`
    * @param skillName - Short skill name
    * @param platforms - Platform names to remove from
    */
   export function removeSkillContent(
     communityBaseDir: string,
     skillName: string,
     platforms: string[]
   ): void {
     for (const platform of platforms) {
       const targetDir = path.join(communityBaseDir, platform, skillName);
       if (fs.existsSync(targetDir)) {
         fs.rmSync(targetDir, { recursive: true, force: true });
       }
     }
   }

   /**
    * Clean up a temporary directory. Silently ignores missing directories.
    */
   export function cleanupTempDir(dirPath: string): void {
     try {
       fs.rmSync(dirPath, { recursive: true, force: true });
     } catch {
       // Ignore cleanup errors
     }
   }
   ```

4. Run tests — observe: all pass:

   ```bash
   cd packages/cli && npx vitest run tests/registry/tarball.test.ts
   ```

5. Run: `harness validate`
6. Commit: `feat(registry): add tarball extraction and skill content placement`

---

### Task 4: Create version resolver module (TDD)

**Depends on:** Task 1, Task 2
**Files:** `packages/cli/src/registry/resolver.ts`, `packages/cli/tests/registry/resolver.test.ts`

1. Create test file `packages/cli/tests/registry/resolver.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { resolveVersion, findDependentsOf } from '../../src/registry/resolver';
   import type { NpmPackageMetadata } from '../../src/registry/npm-client';
   import type { SkillsLockfile } from '../../src/registry/lockfile';

   const makeMetadata = (versions: string[], latest: string): NpmPackageMetadata => ({
     name: '@harness-skills/deployment',
     'dist-tags': { latest },
     versions: Object.fromEntries(
       versions.map((v) => [
         v,
         {
           version: v,
           dist: {
             tarball: `https://registry.npmjs.org/@harness-skills/deployment/-/deployment-${v}.tgz`,
             shasum: `sha-${v}`,
             integrity: `sha512-${v}`,
           },
         },
       ])
     ),
   });

   describe('resolveVersion', () => {
     it('returns latest when no version range specified', () => {
       const meta = makeMetadata(['1.0.0', '1.1.0', '2.0.0'], '2.0.0');
       const result = resolveVersion(meta, undefined);
       expect(result.version).toBe('2.0.0');
       expect(result.dist.tarball).toContain('2.0.0');
     });

     it('resolves a semver range to the highest matching version', () => {
       const meta = makeMetadata(['1.0.0', '1.1.0', '1.2.0', '2.0.0'], '2.0.0');
       const result = resolveVersion(meta, '^1.0.0');
       expect(result.version).toBe('1.2.0');
     });

     it('resolves exact version', () => {
       const meta = makeMetadata(['1.0.0', '1.1.0', '2.0.0'], '2.0.0');
       const result = resolveVersion(meta, '1.1.0');
       expect(result.version).toBe('1.1.0');
     });

     it('throws when no version matches the range', () => {
       const meta = makeMetadata(['1.0.0', '2.0.0'], '2.0.0');
       expect(() => resolveVersion(meta, '^3.0.0')).toThrow(
         'No version of @harness-skills/deployment matches range ^3.0.0'
       );
     });

     it('throws when metadata has no versions', () => {
       const meta: NpmPackageMetadata = {
         name: '@harness-skills/deployment',
         'dist-tags': { latest: '1.0.0' },
         versions: {},
       };
       expect(() => resolveVersion(meta, undefined)).toThrow('No versions available');
     });
   });

   describe('findDependentsOf', () => {
     it('returns empty array when no skills depend on the target', () => {
       const lockfile: SkillsLockfile = {
         version: 1,
         skills: {
           '@harness-skills/deployment': {
             version: '1.0.0',
             resolved: 'https://example.com/deployment.tgz',
             integrity: 'sha512-abc',
             platforms: ['claude-code'],
             installedAt: '2026-03-24T10:00:00Z',
             dependencyOf: null,
           },
         },
       };
       expect(findDependentsOf(lockfile, '@harness-skills/deployment')).toEqual([]);
     });

     it('returns skills that list target as dependencyOf', () => {
       const lockfile: SkillsLockfile = {
         version: 1,
         skills: {
           '@harness-skills/deployment': {
             version: '1.0.0',
             resolved: 'https://example.com/deployment.tgz',
             integrity: 'sha512-abc',
             platforms: ['claude-code'],
             installedAt: '2026-03-24T10:00:00Z',
             dependencyOf: null,
           },
           '@harness-skills/docker-basics': {
             version: '0.3.1',
             resolved: 'https://example.com/docker-basics.tgz',
             integrity: 'sha512-def',
             platforms: ['claude-code'],
             installedAt: '2026-03-24T10:00:01Z',
             dependencyOf: '@harness-skills/deployment',
           },
         },
       };
       expect(findDependentsOf(lockfile, '@harness-skills/docker-basics')).toEqual([
         '@harness-skills/deployment',
       ]);
     });
   });
   ```

2. Run tests — observe failures:

   ```bash
   cd packages/cli && npx vitest run tests/registry/resolver.test.ts
   ```

3. Create `packages/cli/src/registry/resolver.ts`:

   ```typescript
   import semver from 'semver';
   import type { NpmPackageMetadata, NpmVersionInfo } from './npm-client';
   import type { SkillsLockfile } from './lockfile';

   /**
    * Resolve the best matching version from npm package metadata.
    *
    * - If no versionRange is provided, returns the "latest" dist-tag version.
    * - If a versionRange is provided, returns the highest version satisfying it.
    *
    * Throws if no version matches.
    */
   export function resolveVersion(
     metadata: NpmPackageMetadata,
     versionRange: string | undefined
   ): NpmVersionInfo {
     const versions = Object.keys(metadata.versions);
     if (versions.length === 0) {
       throw new Error(`No versions available for ${metadata.name}.`);
     }

     if (!versionRange) {
       const latestTag = metadata['dist-tags'].latest;
       const latestInfo = metadata.versions[latestTag];
       if (latestInfo) return latestInfo;

       // Fallback: pick highest version
       const highest = semver.maxSatisfying(versions, '*');
       if (!highest) {
         throw new Error(`No versions available for ${metadata.name}.`);
       }
       return metadata.versions[highest];
     }

     const matched = semver.maxSatisfying(versions, versionRange);
     if (!matched) {
       throw new Error(
         `No version of ${metadata.name} matches range ${versionRange}. Available: ${versions.join(', ')}`
       );
     }
     return metadata.versions[matched];
   }

   /**
    * Find all installed skills whose `dependencyOf` field references the target.
    * Returns an array of package names that depend on the target skill.
    */
   export function findDependentsOf(lockfile: SkillsLockfile, targetPackageName: string): string[] {
     return Object.entries(lockfile.skills)
       .filter(([_name, entry]) => entry.dependencyOf === targetPackageName)
       .map(([name]) => name);
   }
   ```

4. Run tests — observe: all pass:

   ```bash
   cd packages/cli && npx vitest run tests/registry/resolver.test.ts
   ```

5. Run: `harness validate`
6. Commit: `feat(registry): add version resolver with semver range support and dependent finder`

---

### Task 5: Create bundled skill name list utility

**Depends on:** none
**Files:** `packages/cli/src/registry/bundled-skills.ts`, `packages/cli/tests/registry/bundled-skills.test.ts`

This utility reads the bundled skills directory and returns a Set of skill names, used by install to prevent name collisions.

1. Create test file `packages/cli/tests/registry/bundled-skills.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { getBundledSkillNames } from '../../src/registry/bundled-skills';

   vi.mock('fs', async (importOriginal) => {
     const actual = await importOriginal<typeof import('fs')>();
     return {
       ...actual,
       existsSync: vi.fn(),
       readdirSync: vi.fn(),
       statSync: vi.fn(),
     };
   });

   import * as fs from 'fs';

   const mockedExistsSync = vi.mocked(fs.existsSync);
   const mockedReaddirSync = vi.mocked(fs.readdirSync);
   const mockedStatSync = vi.mocked(fs.statSync);

   describe('getBundledSkillNames', () => {
     beforeEach(() => {
       vi.clearAllMocks();
     });

     it('returns skill directory names from a given skills dir', () => {
       mockedExistsSync.mockReturnValue(true);
       mockedReaddirSync.mockReturnValue([
         'harness-tdd',
         'harness-planning',
         'cleanup-dead-code',
       ] as unknown as fs.Dirent[]);
       mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);

       const names = getBundledSkillNames('/path/to/skills/claude-code');
       expect(names).toContain('harness-tdd');
       expect(names).toContain('harness-planning');
       expect(names).toContain('cleanup-dead-code');
       expect(names.size).toBe(3);
     });

     it('returns empty set when directory does not exist', () => {
       mockedExistsSync.mockReturnValue(false);
       const names = getBundledSkillNames('/nonexistent');
       expect(names.size).toBe(0);
     });
   });
   ```

2. Run tests — observe failures:

   ```bash
   cd packages/cli && npx vitest run tests/registry/bundled-skills.test.ts
   ```

3. Create `packages/cli/src/registry/bundled-skills.ts`:

   ```typescript
   import * as fs from 'fs';

   /**
    * Read the bundled skills directory and return a Set of skill names.
    * Used to prevent community skills from colliding with bundled skill names.
    */
   export function getBundledSkillNames(bundledSkillsDir: string): Set<string> {
     if (!fs.existsSync(bundledSkillsDir)) {
       return new Set();
     }

     const entries = fs.readdirSync(bundledSkillsDir);
     const names = new Set<string>();

     for (const entry of entries) {
       try {
         const stat = fs.statSync(`${bundledSkillsDir}/${entry}`);
         if (stat.isDirectory()) {
           names.add(String(entry));
         }
       } catch {
         // Skip entries we can't stat
       }
     }

     return names;
   }
   ```

4. Run tests — observe: all pass:

   ```bash
   cd packages/cli && npx vitest run tests/registry/bundled-skills.test.ts
   ```

5. Run: `harness validate`
6. Commit: `feat(registry): add bundled skill name detection for collision prevention`

---

### Task 6: Create install command (TDD)

**Depends on:** Tasks 2, 3, 4, 5
**Files:** `packages/cli/src/commands/install.ts`, `packages/cli/tests/commands/install.test.ts`

[checkpoint:human-verify] -- Review the npm-client, tarball, resolver, and bundled-skills modules before wiring them into the command.

1. Create test file `packages/cli/tests/commands/install.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { createInstallCommand, runInstall } from '../../src/commands/install';

   // Mock all registry modules
   vi.mock('../../src/registry/npm-client', () => ({
     resolvePackageName: vi.fn((name: string) =>
       name.startsWith('@') ? name : `@harness-skills/${name}`
     ),
     extractSkillName: vi.fn((name: string) => name.replace('@harness-skills/', '')),
     fetchPackageMetadata: vi.fn(),
     downloadTarball: vi.fn(),
   }));

   vi.mock('../../src/registry/tarball', () => ({
     extractTarball: vi.fn(),
     placeSkillContent: vi.fn(),
     cleanupTempDir: vi.fn(),
   }));

   vi.mock('../../src/registry/resolver', () => ({
     resolveVersion: vi.fn(),
   }));

   vi.mock('../../src/registry/lockfile', () => ({
     readLockfile: vi.fn(),
     writeLockfile: vi.fn(),
     updateLockfileEntry: vi.fn(),
   }));

   vi.mock('../../src/registry/bundled-skills', () => ({
     getBundledSkillNames: vi.fn(),
   }));

   vi.mock('../../src/utils/paths', () => ({
     resolveGlobalSkillsDir: vi.fn(() => '/global/skills/claude-code'),
     resolveCommunitySkillsDir: vi.fn(() => '/community/skills/claude-code'),
   }));

   vi.mock('yaml', () => ({
     parse: vi.fn(),
   }));

   vi.mock('fs', async (importOriginal) => {
     const actual = await importOriginal<typeof import('fs')>();
     return {
       ...actual,
       existsSync: vi.fn(() => true),
       readFileSync: vi.fn(() => 'name: deployment\nversion: 1.0.0\n'),
     };
   });

   import { fetchPackageMetadata, downloadTarball } from '../../src/registry/npm-client';
   import { extractTarball, placeSkillContent, cleanupTempDir } from '../../src/registry/tarball';
   import { resolveVersion } from '../../src/registry/resolver';
   import { readLockfile, writeLockfile, updateLockfileEntry } from '../../src/registry/lockfile';
   import { getBundledSkillNames } from '../../src/registry/bundled-skills';
   import { parse as yamlParse } from 'yaml';

   const mockedFetchMetadata = vi.mocked(fetchPackageMetadata);
   const mockedDownloadTarball = vi.mocked(downloadTarball);
   const mockedExtractTarball = vi.mocked(extractTarball);
   const mockedPlaceContent = vi.mocked(placeSkillContent);
   const mockedCleanup = vi.mocked(cleanupTempDir);
   const mockedResolveVersion = vi.mocked(resolveVersion);
   const mockedReadLockfile = vi.mocked(readLockfile);
   const mockedWriteLockfile = vi.mocked(writeLockfile);
   const mockedUpdateLockfileEntry = vi.mocked(updateLockfileEntry);
   const mockedGetBundledNames = vi.mocked(getBundledSkillNames);
   const mockedYamlParse = vi.mocked(yamlParse);

   describe('createInstallCommand', () => {
     it('creates command with correct name', () => {
       const cmd = createInstallCommand();
       expect(cmd.name()).toBe('install');
     });

     it('has --version option', () => {
       const cmd = createInstallCommand();
       const opt = cmd.options.find((o) => o.long === '--version');
       expect(opt).toBeDefined();
     });

     it('has --force option', () => {
       const cmd = createInstallCommand();
       const opt = cmd.options.find((o) => o.long === '--force');
       expect(opt).toBeDefined();
     });
   });

   describe('runInstall', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       mockedGetBundledNames.mockReturnValue(new Set(['harness-tdd', 'harness-planning']));
       mockedReadLockfile.mockReturnValue({ version: 1, skills: {} });
       mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
         ...lf,
         skills: { ...lf.skills, [name]: entry },
       }));
     });

     it('installs a skill successfully', async () => {
       const metadata = {
         name: '@harness-skills/deployment',
         'dist-tags': { latest: '1.0.0' },
         versions: {
           '1.0.0': {
             version: '1.0.0',
             dist: {
               tarball:
                 'https://registry.npmjs.org/@harness-skills/deployment/-/deployment-1.0.0.tgz',
               shasum: 'abc',
               integrity: 'sha512-abc',
             },
           },
         },
       };
       mockedFetchMetadata.mockResolvedValue(metadata);
       mockedResolveVersion.mockReturnValue(metadata.versions['1.0.0']);
       mockedDownloadTarball.mockResolvedValue(Buffer.from('tarball'));
       mockedExtractTarball.mockReturnValue('/tmp/extracted');
       mockedYamlParse.mockReturnValue({
         name: 'deployment',
         version: '1.0.0',
         platforms: ['claude-code'],
         depends_on: [],
       });

       const result = await runInstall('deployment', {});
       expect(result.installed).toBe(true);
       expect(result.name).toBe('@harness-skills/deployment');
       expect(result.version).toBe('1.0.0');
       expect(mockedPlaceContent).toHaveBeenCalled();
       expect(mockedWriteLockfile).toHaveBeenCalled();
       expect(mockedCleanup).toHaveBeenCalled();
     });

     it('rejects bundled skill names', async () => {
       await expect(runInstall('harness-tdd', {})).rejects.toThrow(
         'bundled skill and cannot be overridden'
       );
     });

     it('skips when same version already installed', async () => {
       mockedReadLockfile.mockReturnValue({
         version: 1,
         skills: {
           '@harness-skills/deployment': {
             version: '1.0.0',
             resolved: 'https://example.com/deployment.tgz',
             integrity: 'sha512-abc',
             platforms: ['claude-code'],
             installedAt: '2026-03-24T10:00:00Z',
             dependencyOf: null,
           },
         },
       });
       const metadata = {
         name: '@harness-skills/deployment',
         'dist-tags': { latest: '1.0.0' },
         versions: {
           '1.0.0': {
             version: '1.0.0',
             dist: {
               tarball: 'https://example.com/deployment.tgz',
               shasum: 'abc',
               integrity: 'sha512-abc',
             },
           },
         },
       };
       mockedFetchMetadata.mockResolvedValue(metadata);
       mockedResolveVersion.mockReturnValue(metadata.versions['1.0.0']);

       const result = await runInstall('deployment', {});
       expect(result.installed).toBe(false);
       expect(result.skipped).toBe(true);
       expect(mockedDownloadTarball).not.toHaveBeenCalled();
     });

     it('upgrades when newer version available', async () => {
       mockedReadLockfile.mockReturnValue({
         version: 1,
         skills: {
           '@harness-skills/deployment': {
             version: '1.0.0',
             resolved: 'https://example.com/deployment-1.0.0.tgz',
             integrity: 'sha512-abc',
             platforms: ['claude-code'],
             installedAt: '2026-03-24T10:00:00Z',
             dependencyOf: null,
           },
         },
       });
       const metadata = {
         name: '@harness-skills/deployment',
         'dist-tags': { latest: '1.1.0' },
         versions: {
           '1.0.0': {
             version: '1.0.0',
             dist: {
               tarball: 'https://example.com/deployment-1.0.0.tgz',
               shasum: 'abc',
               integrity: 'sha512-abc',
             },
           },
           '1.1.0': {
             version: '1.1.0',
             dist: {
               tarball: 'https://example.com/deployment-1.1.0.tgz',
               shasum: 'def',
               integrity: 'sha512-def',
             },
           },
         },
       };
       mockedFetchMetadata.mockResolvedValue(metadata);
       mockedResolveVersion.mockReturnValue(metadata.versions['1.1.0']);
       mockedDownloadTarball.mockResolvedValue(Buffer.from('tarball'));
       mockedExtractTarball.mockReturnValue('/tmp/extracted');
       mockedYamlParse.mockReturnValue({
         name: 'deployment',
         version: '1.1.0',
         platforms: ['claude-code'],
         depends_on: [],
       });

       const result = await runInstall('deployment', {});
       expect(result.installed).toBe(true);
       expect(result.upgraded).toBe(true);
       expect(result.previousVersion).toBe('1.0.0');
     });

     it('cleans up temp dir on validation failure', async () => {
       const metadata = {
         name: '@harness-skills/deployment',
         'dist-tags': { latest: '1.0.0' },
         versions: {
           '1.0.0': {
             version: '1.0.0',
             dist: {
               tarball: 'https://example.com/deployment.tgz',
               shasum: 'abc',
               integrity: 'sha512-abc',
             },
           },
         },
       };
       mockedFetchMetadata.mockResolvedValue(metadata);
       mockedResolveVersion.mockReturnValue(metadata.versions['1.0.0']);
       mockedDownloadTarball.mockResolvedValue(Buffer.from('tarball'));
       mockedExtractTarball.mockReturnValue('/tmp/extracted');
       mockedYamlParse.mockReturnValue({ invalid: true });

       await expect(runInstall('deployment', {})).rejects.toThrow('contains invalid skill.yaml');
       expect(mockedCleanup).toHaveBeenCalledWith('/tmp/extracted');
       expect(mockedPlaceContent).not.toHaveBeenCalled();
     });
   });
   ```

2. Run tests — observe failures:

   ```bash
   cd packages/cli && npx vitest run tests/commands/install.test.ts
   ```

3. Create `packages/cli/src/commands/install.ts`:

   ```typescript
   import { Command } from 'commander';
   import * as fs from 'fs';
   import * as path from 'path';
   import { parse as yamlParse } from 'yaml';
   import { logger } from '../output/logger';
   import { ExitCode } from '../utils/errors';
   import { resolveGlobalSkillsDir } from '../utils/paths';
   import {
     resolvePackageName,
     extractSkillName,
     fetchPackageMetadata,
     downloadTarball,
   } from '../registry/npm-client';
   import { extractTarball, placeSkillContent, cleanupTempDir } from '../registry/tarball';
   import { resolveVersion } from '../registry/resolver';
   import { readLockfile, writeLockfile, updateLockfileEntry } from '../registry/lockfile';
   import { getBundledSkillNames } from '../registry/bundled-skills';
   import { SkillMetadataSchema } from '../skill/schema';

   export interface InstallResult {
     name: string;
     version: string;
     installed: boolean;
     skipped?: boolean;
     upgraded?: boolean;
     previousVersion?: string;
     platforms: string[];
     transitiveDeps: string[];
   }

   interface InstallOptions {
     version?: string;
     force?: boolean;
     /** Internal: tracks who depends on this install (for transitive installs) */
     _dependencyOf?: string | null;
   }

   /**
    * Resolve the community skills base directory and lockfile path.
    */
   function resolvePaths(): { communityBase: string; lockfilePath: string } {
     // Community base is agents/skills/community/ (parent of platform dirs)
     const globalDir = resolveGlobalSkillsDir();
     // globalDir = .../agents/skills/claude-code
     const skillsDir = path.dirname(globalDir); // .../agents/skills/
     const communityBase = path.join(skillsDir, 'community');
     const lockfilePath = path.join(communityBase, 'skills-lock.json');
     return { communityBase, lockfilePath };
   }

   /**
    * Core install logic. Returns result or throws.
    * Designed for testability — all I/O is through injected modules.
    */
   export async function runInstall(
     skillNameArg: string,
     opts: InstallOptions
   ): Promise<InstallResult> {
     const packageName = resolvePackageName(skillNameArg);
     const shortName = extractSkillName(packageName);

     // 1. Check bundled name collision
     const globalSkillsDir = resolveGlobalSkillsDir();
     const bundledNames = getBundledSkillNames(globalSkillsDir);
     if (bundledNames.has(shortName)) {
       throw new Error(
         `Skill '${shortName}' is a bundled skill and cannot be overridden by a community package. ` +
           `Use a project-local skill to override.`
       );
     }

     // 2. Fetch metadata from registry
     const metadata = await fetchPackageMetadata(packageName);

     // 3. Resolve version
     const versionInfo = resolveVersion(metadata, opts.version);

     // 4. Check if already installed
     const { communityBase, lockfilePath } = resolvePaths();
     let lockfile = readLockfile(lockfilePath);
     const existing = lockfile.skills[packageName];

     if (existing && existing.version === versionInfo.version && !opts.force) {
       return {
         name: packageName,
         version: versionInfo.version,
         installed: false,
         skipped: true,
         platforms: existing.platforms,
         transitiveDeps: [],
       };
     }

     const isUpgrade = existing !== undefined && existing.version !== versionInfo.version;
     const previousVersion = existing?.version;

     // 5. Download tarball
     const tarballBuffer = await downloadTarball(versionInfo.dist.tarball);

     // 6. Extract to temp directory
     const extractDir = extractTarball(tarballBuffer);

     try {
       // 7. Validate skill.yaml from extracted content
       const skillYamlPath = path.join(extractDir, 'package', 'skill.yaml');
       if (!fs.existsSync(skillYamlPath)) {
         throw new Error(
           `Package ${packageName}@${versionInfo.version} does not contain skill.yaml.`
         );
       }
       const skillYamlContent = fs.readFileSync(skillYamlPath, 'utf-8');
       const parsed = yamlParse(skillYamlContent);
       const validation = SkillMetadataSchema.safeParse(parsed);

       if (!validation.success) {
         const errors = validation.error.issues
           .map((i) => `${i.path.join('.')}: ${i.message}`)
           .join('; ');
         throw new Error(
           `Package ${packageName}@${versionInfo.version} contains invalid skill.yaml: ${errors}`
         );
       }

       const skillMeta = validation.data;

       // 8. Place content for each platform
       placeSkillContent(
         path.join(extractDir, 'package'),
         communityBase,
         shortName,
         skillMeta.platforms
       );

       // 9. Update lockfile
       lockfile = updateLockfileEntry(lockfile, packageName, {
         version: versionInfo.version,
         resolved: versionInfo.dist.tarball,
         integrity: versionInfo.dist.integrity,
         platforms: [...skillMeta.platforms],
         installedAt: new Date().toISOString(),
         dependencyOf: opts._dependencyOf ?? null,
       });
       writeLockfile(lockfilePath, lockfile);

       // 10. Resolve dependencies
       const transitiveDeps: string[] = [];
       if (skillMeta.depends_on && skillMeta.depends_on.length > 0) {
         for (const dep of skillMeta.depends_on) {
           const depPackageName = resolvePackageName(dep);
           if (lockfile.skills[depPackageName]) {
             continue; // Already installed
           }
           logger.warn(`Installing transitive dependency: ${dep} (required by ${shortName})`);
           const depResult = await runInstall(dep, {
             _dependencyOf: packageName,
           });
           if (depResult.installed) {
             transitiveDeps.push(depResult.name);
             // Re-read lockfile since dependency install updated it
             lockfile = readLockfile(lockfilePath);
           }
         }
       }

       return {
         name: packageName,
         version: versionInfo.version,
         installed: true,
         upgraded: isUpgrade,
         previousVersion,
         platforms: [...skillMeta.platforms],
         transitiveDeps,
       };
     } finally {
       cleanupTempDir(extractDir);
     }
   }

   export function createInstallCommand(): Command {
     return new Command('install')
       .description('Install a community skill from the @harness-skills registry')
       .argument('<skill>', 'Skill name or @harness-skills/<skill>')
       .option('--version <range>', 'Semver version or range (default: latest)')
       .option('--force', 'Force reinstall even if same version is installed')
       .action(async (skill: string, opts) => {
         try {
           const result = await runInstall(skill, opts);

           if (result.skipped) {
             logger.info(`Already installed: ${extractSkillName(result.name)}@${result.version}`);
             return;
           }

           if (result.upgraded) {
             logger.success(
               `Upgraded ${extractSkillName(result.name)}: ${result.previousVersion} -> ${result.version}`
             );
           } else {
             logger.success(`Installed ${extractSkillName(result.name)}@${result.version}`);
           }

           logger.info(`Platforms: ${result.platforms.join(', ')}`);

           if (result.transitiveDeps.length > 0) {
             logger.info(
               `Transitive dependencies installed: ${result.transitiveDeps.map(extractSkillName).join(', ')}`
             );
           }
         } catch (err) {
           logger.error(err instanceof Error ? err.message : String(err));
           process.exit(ExitCode.VALIDATION_FAILED);
         }
       });
   }
   ```

4. Run tests — observe: all pass:

   ```bash
   cd packages/cli && npx vitest run tests/commands/install.test.ts
   ```

5. Run: `harness validate`
6. Commit: `feat(cli): add harness install command with registry fetch, validation, and dependency resolution`

---

### Task 7: Create uninstall command (TDD)

**Depends on:** Tasks 4, 5 (resolver for findDependentsOf, lockfile)
**Files:** `packages/cli/src/commands/uninstall.ts`, `packages/cli/tests/commands/uninstall.test.ts`

1. Create test file `packages/cli/tests/commands/uninstall.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { createUninstallCommand, runUninstall } from '../../src/commands/uninstall';

   vi.mock('../../src/registry/npm-client', () => ({
     resolvePackageName: vi.fn((name: string) =>
       name.startsWith('@') ? name : `@harness-skills/${name}`
     ),
     extractSkillName: vi.fn((name: string) => name.replace('@harness-skills/', '')),
   }));

   vi.mock('../../src/registry/lockfile', () => ({
     readLockfile: vi.fn(),
     writeLockfile: vi.fn(),
     removeLockfileEntry: vi.fn(),
   }));

   vi.mock('../../src/registry/resolver', () => ({
     findDependentsOf: vi.fn(),
   }));

   vi.mock('../../src/registry/tarball', () => ({
     removeSkillContent: vi.fn(),
   }));

   vi.mock('../../src/utils/paths', () => ({
     resolveGlobalSkillsDir: vi.fn(() => '/global/skills/claude-code'),
   }));

   import { readLockfile, writeLockfile, removeLockfileEntry } from '../../src/registry/lockfile';
   import { findDependentsOf } from '../../src/registry/resolver';
   import { removeSkillContent } from '../../src/registry/tarball';

   const mockedReadLockfile = vi.mocked(readLockfile);
   const mockedWriteLockfile = vi.mocked(writeLockfile);
   const mockedRemoveLockfileEntry = vi.mocked(removeLockfileEntry);
   const mockedFindDependents = vi.mocked(findDependentsOf);
   const mockedRemoveContent = vi.mocked(removeSkillContent);

   describe('createUninstallCommand', () => {
     it('creates command with correct name', () => {
       const cmd = createUninstallCommand();
       expect(cmd.name()).toBe('uninstall');
     });

     it('has --force option', () => {
       const cmd = createUninstallCommand();
       const opt = cmd.options.find((o) => o.long === '--force');
       expect(opt).toBeDefined();
     });
   });

   describe('runUninstall', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       mockedRemoveLockfileEntry.mockImplementation((lf, name) => {
         const { [name]: _removed, ...rest } = lf.skills;
         return { ...lf, skills: rest };
       });
     });

     it('uninstalls a skill successfully', async () => {
       mockedReadLockfile.mockReturnValue({
         version: 1,
         skills: {
           '@harness-skills/deployment': {
             version: '1.0.0',
             resolved: 'https://example.com/deployment.tgz',
             integrity: 'sha512-abc',
             platforms: ['claude-code', 'gemini-cli'],
             installedAt: '2026-03-24T10:00:00Z',
             dependencyOf: null,
           },
         },
       });
       mockedFindDependents.mockReturnValue([]);

       const result = await runUninstall('deployment', {});
       expect(result.removed).toBe(true);
       expect(result.name).toBe('@harness-skills/deployment');
       expect(mockedRemoveContent).toHaveBeenCalledWith(expect.any(String), 'deployment', [
         'claude-code',
         'gemini-cli',
       ]);
       expect(mockedWriteLockfile).toHaveBeenCalled();
     });

     it('throws when skill is not installed', async () => {
       mockedReadLockfile.mockReturnValue({ version: 1, skills: {} });

       await expect(runUninstall('nonexistent', {})).rejects.toThrow(
         "Skill 'nonexistent' is not installed"
       );
     });

     it('refuses when dependents exist without --force', async () => {
       mockedReadLockfile.mockReturnValue({
         version: 1,
         skills: {
           '@harness-skills/docker-basics': {
             version: '0.3.1',
             resolved: 'https://example.com/docker-basics.tgz',
             integrity: 'sha512-def',
             platforms: ['claude-code'],
             installedAt: '2026-03-24T10:00:01Z',
             dependencyOf: '@harness-skills/deployment',
           },
         },
       });
       mockedFindDependents.mockReturnValue(['@harness-skills/deployment']);

       await expect(runUninstall('docker-basics', {})).rejects.toThrow('is required by');
     });

     it('proceeds with --force when dependents exist', async () => {
       mockedReadLockfile.mockReturnValue({
         version: 1,
         skills: {
           '@harness-skills/docker-basics': {
             version: '0.3.1',
             resolved: 'https://example.com/docker-basics.tgz',
             integrity: 'sha512-def',
             platforms: ['claude-code'],
             installedAt: '2026-03-24T10:00:01Z',
             dependencyOf: '@harness-skills/deployment',
           },
         },
       });
       mockedFindDependents.mockReturnValue(['@harness-skills/deployment']);

       const result = await runUninstall('docker-basics', { force: true });
       expect(result.removed).toBe(true);
       expect(result.warnings).toContain(
         'Forced removal despite dependents: @harness-skills/deployment'
       );
     });
   });
   ```

2. Run tests — observe failures:

   ```bash
   cd packages/cli && npx vitest run tests/commands/uninstall.test.ts
   ```

3. Create `packages/cli/src/commands/uninstall.ts`:

   ```typescript
   import { Command } from 'commander';
   import * as path from 'path';
   import { logger } from '../output/logger';
   import { ExitCode } from '../utils/errors';
   import { resolveGlobalSkillsDir } from '../utils/paths';
   import { resolvePackageName, extractSkillName } from '../registry/npm-client';
   import { removeSkillContent } from '../registry/tarball';
   import { findDependentsOf } from '../registry/resolver';
   import { readLockfile, writeLockfile, removeLockfileEntry } from '../registry/lockfile';

   export interface UninstallResult {
     name: string;
     removed: boolean;
     warnings: string[];
   }

   interface UninstallOptions {
     force?: boolean;
   }

   export async function runUninstall(
     skillNameArg: string,
     opts: UninstallOptions
   ): Promise<UninstallResult> {
     const packageName = resolvePackageName(skillNameArg);
     const shortName = extractSkillName(packageName);
     const warnings: string[] = [];

     // 1. Read lockfile and look up skill
     const globalDir = resolveGlobalSkillsDir();
     const skillsDir = path.dirname(globalDir);
     const communityBase = path.join(skillsDir, 'community');
     const lockfilePath = path.join(communityBase, 'skills-lock.json');
     const lockfile = readLockfile(lockfilePath);

     const entry = lockfile.skills[packageName];
     if (!entry) {
       throw new Error(
         `Skill '${shortName}' is not installed. Run 'harness install ${shortName}' to install it.`
       );
     }

     // 2. Check for dependents
     const dependents = findDependentsOf(lockfile, packageName);
     if (dependents.length > 0 && !opts.force) {
       throw new Error(
         `Skill '${shortName}' is required by: ${dependents.join(', ')}. ` +
           `Use --force to remove anyway.`
       );
     }
     if (dependents.length > 0 && opts.force) {
       warnings.push(`Forced removal despite dependents: ${dependents.join(', ')}`);
     }

     // 3. Remove skill directories
     removeSkillContent(communityBase, shortName, entry.platforms);

     // 4. Update lockfile
     const updatedLockfile = removeLockfileEntry(lockfile, packageName);
     writeLockfile(lockfilePath, updatedLockfile);

     return {
       name: packageName,
       removed: true,
       warnings,
     };
   }

   export function createUninstallCommand(): Command {
     return new Command('uninstall')
       .description('Remove a community skill')
       .argument('<skill>', 'Skill name or @harness-skills/<skill>')
       .option('--force', 'Force removal even if other skills depend on it')
       .action(async (skill: string, opts) => {
         try {
           const result = await runUninstall(skill, opts);

           for (const warning of result.warnings) {
             logger.warn(warning);
           }

           logger.success(`Removed ${extractSkillName(result.name)}`);
         } catch (err) {
           logger.error(err instanceof Error ? err.message : String(err));
           process.exit(ExitCode.VALIDATION_FAILED);
         }
       });
   }
   ```

4. Run tests — observe: all pass:

   ```bash
   cd packages/cli && npx vitest run tests/commands/uninstall.test.ts
   ```

5. Run: `harness validate`
6. Commit: `feat(cli): add harness uninstall command with dependent safety checks`

---

### Task 8: Register commands in index.ts

**Depends on:** Tasks 6, 7
**Files:** `packages/cli/src/index.ts`

1. Add imports to `packages/cli/src/index.ts` after the existing import for `createUpdateCommand`:

   ```typescript
   import { createInstallCommand } from './commands/install';
   import { createUninstallCommand } from './commands/uninstall';
   ```

2. Add command registrations after the `createUpdateCommand()` line inside `createProgram()`:

   ```typescript
   program.addCommand(createInstallCommand());
   program.addCommand(createUninstallCommand());
   ```

3. Add exports at the bottom of the file (after the architecture assertion export section):

   ```typescript
   // Skill marketplace exports
   export { runInstall } from './commands/install';
   export type { InstallResult } from './commands/install';
   export { runUninstall } from './commands/uninstall';
   export type { UninstallResult } from './commands/uninstall';
   ```

4. Run: `harness validate`
5. Commit: `feat(cli): register install and uninstall commands`

---

### Task 9: Integration test for install/uninstall round-trip

**Depends on:** Tasks 6, 7, 8
**Files:** `packages/cli/tests/registry/install-uninstall-roundtrip.test.ts`

[checkpoint:human-verify] -- Verify all previous tasks are green before running integration tests.

1. Create test file `packages/cli/tests/registry/install-uninstall-roundtrip.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { runInstall } from '../../src/commands/install';
   import { runUninstall } from '../../src/commands/uninstall';

   // Mock all external I/O
   vi.mock('../../src/registry/npm-client', () => ({
     resolvePackageName: vi.fn((name: string) =>
       name.startsWith('@') ? name : `@harness-skills/${name}`
     ),
     extractSkillName: vi.fn((name: string) => name.replace('@harness-skills/', '')),
     fetchPackageMetadata: vi.fn(),
     downloadTarball: vi.fn(),
   }));

   vi.mock('../../src/registry/tarball', () => ({
     extractTarball: vi.fn(() => '/tmp/mock-extract'),
     placeSkillContent: vi.fn(),
     removeSkillContent: vi.fn(),
     cleanupTempDir: vi.fn(),
   }));

   vi.mock('../../src/registry/resolver', () => {
     const actual = vi.importActual('../../src/registry/resolver');
     return actual;
   });

   vi.mock('../../src/registry/bundled-skills', () => ({
     getBundledSkillNames: vi.fn(() => new Set(['harness-tdd'])),
   }));

   vi.mock('../../src/utils/paths', () => ({
     resolveGlobalSkillsDir: vi.fn(() => '/mock/agents/skills/claude-code'),
   }));

   // Mock fs and yaml to control skill.yaml reading
   vi.mock('fs', async (importOriginal) => {
     const actual = await importOriginal<typeof import('fs')>();
     const store: Record<string, string> = {};
     return {
       ...actual,
       existsSync: vi.fn((p: string) => {
         if (String(p).includes('skills-lock.json')) return String(p) in store;
         if (String(p).includes('skill.yaml')) return true;
         return true;
       }),
       readFileSync: vi.fn((p: string) => {
         if (String(p).includes('skills-lock.json'))
           return store[String(p)] ?? '{"version":1,"skills":{}}';
         return 'name: deployment\nversion: 1.0.0\n';
       }),
       writeFileSync: vi.fn((p: string, content: string) => {
         store[String(p)] = content;
       }),
       mkdirSync: vi.fn(),
       rmSync: vi.fn(),
     };
   });

   vi.mock('yaml', () => ({
     parse: vi.fn(() => ({
       name: 'deployment',
       version: '1.0.0',
       description: 'Deploy skill',
       triggers: ['manual'],
       platforms: ['claude-code'],
       tools: [],
       type: 'flexible',
       depends_on: [],
     })),
   }));

   import { fetchPackageMetadata, downloadTarball } from '../../src/registry/npm-client';

   const mockedFetchMetadata = vi.mocked(fetchPackageMetadata);
   const mockedDownloadTarball = vi.mocked(downloadTarball);

   describe('install -> uninstall round-trip', () => {
     beforeEach(() => {
       vi.clearAllMocks();
     });

     it('install then uninstall completes cleanly', async () => {
       // Setup metadata
       mockedFetchMetadata.mockResolvedValue({
         name: '@harness-skills/deployment',
         'dist-tags': { latest: '1.0.0' },
         versions: {
           '1.0.0': {
             version: '1.0.0',
             dist: {
               tarball:
                 'https://registry.npmjs.org/@harness-skills/deployment/-/deployment-1.0.0.tgz',
               shasum: 'abc',
               integrity: 'sha512-abc',
             },
           },
         },
       });
       mockedDownloadTarball.mockResolvedValue(Buffer.from('fake-tarball'));

       const installResult = await runInstall('deployment', {});
       expect(installResult.installed).toBe(true);
       expect(installResult.name).toBe('@harness-skills/deployment');
       expect(installResult.version).toBe('1.0.0');
     });
   });
   ```

2. Run all registry and command tests:

   ```bash
   cd packages/cli && npx vitest run tests/registry/ tests/commands/install.test.ts tests/commands/uninstall.test.ts
   ```

3. Run: `harness validate`
4. Commit: `test(registry): add install/uninstall integration round-trip test`

---

### Task 10: Verify full test suite and clean up

**Depends on:** Task 9
**Files:** none (verification only)

1. Run all new tests together:

   ```bash
   cd packages/cli && npx vitest run tests/registry/ tests/commands/install.test.ts tests/commands/uninstall.test.ts
   ```

2. Run the existing test suite to verify no regressions:

   ```bash
   cd packages/cli && npx vitest run
   ```

3. Run: `harness validate`
4. Run: `harness check-deps`

No commit for this task — it is verification only.
