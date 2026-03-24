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
