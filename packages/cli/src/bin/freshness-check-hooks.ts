import * as fs from 'fs';
import * as path from 'path';
import {
  isFreshnessCheckEnabled,
  shouldRunFreshnessCheck,
  readFreshnessState,
  spawnBackgroundFreshnessCheck,
  getFreshnessNotification,
} from '../registry/freshness-checker';
import { DEFAULT_INTERVAL_MS, readConfigInterval } from './update-check-hooks';
import { resolveGlobalSkillsDir, resolveGlobalCommunityBaseDir } from '../utils/paths';

/**
 * Resolve the global + project community lockfile paths (mirrors
 * install.ts resolveCommunityBase for both scopes), filtered to those that
 * actually exist. An absent lockfile means nothing to probe for that scope.
 */
function resolveCommunityLockfilePaths(): string[] {
  const globalPath = path.join(resolveGlobalCommunityBaseDir(), 'skills-lock.json');
  const projectCommunityBase = path.join(path.dirname(resolveGlobalSkillsDir()), 'community');
  const projectPath = path.join(projectCommunityBase, 'skills-lock.json');
  return [globalPath, projectPath].filter((p) => fs.existsSync(p));
}

/**
 * Called at CLI startup. Gated by the same enable/interval switches as the
 * version update check. Spawns the detached background freshness probe if the
 * cooldown has elapsed and at least one community lockfile exists.
 *
 * All errors are swallowed — this must never block or crash the CLI.
 */
export function runFreshnessCheckAtStartup(): void {
  try {
    const configInterval = readConfigInterval();
    if (!isFreshnessCheckEnabled(configInterval)) return;
    const interval = configInterval ?? DEFAULT_INTERVAL_MS;
    if (!shouldRunFreshnessCheck(readFreshnessState(), interval)) return;
    const lockfilePaths = resolveCommunityLockfilePaths();
    if (lockfilePaths.length === 0) return;
    spawnBackgroundFreshnessCheck(lockfilePaths);
  } catch {
    // Silent — freshness checks must never interfere with CLI operation.
  }
}

/**
 * Called after parseAsync. Appends the freshness nudge to the notification
 * surface (stderr) if any provider is outdated. Errors swallowed.
 */
export function printFreshnessNotification(): void {
  try {
    if (!isFreshnessCheckEnabled(readConfigInterval())) return;
    const message = getFreshnessNotification();
    if (message) {
      process.stderr.write(`\n${message}\n`);
    }
  } catch {
    // Silent — freshness checks must never interfere with CLI operation.
  }
}
