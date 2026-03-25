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
    if (latestTag) {
      const latestInfo = metadata.versions[latestTag];
      if (latestInfo) return latestInfo;
    }

    // Fallback: pick highest version
    const highest = semver.maxSatisfying(versions, '*');
    if (!highest || !metadata.versions[highest]) {
      throw new Error(`No versions available for ${metadata.name}.`);
    }
    return metadata.versions[highest]!;
  }

  const matched = semver.maxSatisfying(versions, versionRange);
  if (!matched || !metadata.versions[matched]) {
    throw new Error(
      `No version of ${metadata.name} matches range ${versionRange}. Available: ${versions.join(', ')}`
    );
  }
  return metadata.versions[matched]!;
}

/**
 * Find all installed skills that depend on the target skill.
 *
 * The lockfile `dependencyOf` field records "who caused me to be installed" —
 * so if docker-basics.dependencyOf === deployment, then deployment depends on
 * docker-basics. To find who depends on X, we check:
 * 1. X's own `dependencyOf` value (the parent that required X)
 * 2. Any other entries whose `dependencyOf` === X (children X pulled in — for
 *    cascade uninstall awareness)
 *
 * For the uninstall safety check, case 1 is the primary concern: "who needs me?"
 */
export function findDependentsOf(lockfile: SkillsLockfile, targetPackageName: string): string[] {
  const dependents: string[] = [];

  // The target's own dependencyOf tells us who required this package
  const targetEntry = lockfile.skills[targetPackageName];
  if (targetEntry?.dependencyOf) {
    dependents.push(targetEntry.dependencyOf);
  }

  return dependents;
}
