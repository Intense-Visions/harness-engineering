import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../../output/logger';

export interface RemoveResult {
  removed: boolean;
  hooksDir: string;
  settingsCleaned: boolean;
}

/**
 * Core remove logic, extracted for testing.
 */
export function removeHooks(projectDir: string): RemoveResult {
  const hooksDir = path.join(projectDir, '.harness', 'hooks');
  const settingsPath = path.join(projectDir, '.claude', 'settings.json');
  let removed = false;
  let settingsCleaned = false;

  // 1. Remove .harness/hooks/ directory
  if (fs.existsSync(hooksDir)) {
    fs.rmSync(hooksDir, { recursive: true, force: true });
    removed = true;
  }

  // 2. Clean hooks entries from .claude/settings.json
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (settings.hooks !== undefined) {
        delete settings.hooks;
        settingsCleaned = true;

        // If settings is now empty (only had hooks), remove the file
        if (Object.keys(settings).length === 0) {
          fs.unlinkSync(settingsPath);
        } else {
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        }
      }
    } catch {
      // Malformed settings.json -- leave it alone
    }
  }

  return { removed, hooksDir, settingsCleaned };
}

export function createRemoveCommand(): Command {
  return new Command('remove')
    .description('Remove harness-managed hooks from the current project')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectDir = process.cwd();
      const result = removeHooks(projectDir);

      if (globalOpts.json) {
        console.log(JSON.stringify(result));
        return;
      }

      if (!result.removed && !result.settingsCleaned) {
        logger.info('No harness hooks found to remove.');
        return;
      }

      if (result.removed) {
        logger.success('Removed .harness/hooks/ directory');
      }
      if (result.settingsCleaned) {
        logger.success('Cleaned hook entries from .claude/settings.json');
      }
    });
}
