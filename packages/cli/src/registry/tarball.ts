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
