import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HOOK_SCRIPTS, PROFILES, type HookProfile } from '../../hooks/profiles';
import { logger } from '../../output/logger';

export interface ListResult {
  installed: boolean;
  profile: HookProfile | null;
  hooks: Array<{ name: string; event: string; matcher: string; scriptPath: string }>;
}

/**
 * Core list logic, extracted for testing.
 */
export function listHooks(projectDir: string): ListResult {
  const hooksDir = path.join(projectDir, '.harness', 'hooks');
  const profilePath = path.join(hooksDir, 'profile.json');

  if (!fs.existsSync(profilePath)) {
    return { installed: false, profile: null, hooks: [] };
  }

  let profile: HookProfile = 'standard';
  try {
    const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    if (data.profile && ['minimal', 'standard', 'strict'].includes(data.profile)) {
      profile = data.profile;
    }
  } catch {
    // Malformed profile.json -- assume standard
  }

  const activeNames = PROFILES[profile];
  const hooks = HOOK_SCRIPTS.filter((h) => activeNames.includes(h.name)).map((h) => ({
    name: h.name,
    event: h.event,
    matcher: h.matcher,
    scriptPath: path.join('.harness', 'hooks', `${h.name}.js`),
  }));

  return { installed: true, profile, hooks };
}

export function createListCommand(): Command {
  return new Command('list')
    .description('Show installed hooks and active profile')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectDir = process.cwd();
      const result = listHooks(projectDir);

      if (globalOpts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (!result.installed) {
        logger.info("No harness hooks installed. Run 'harness hooks init' to set up hooks.");
        return;
      }

      logger.info(`Profile: ${result.profile}`);
      logger.info(`Hooks (${result.hooks.length}):`);
      for (const hook of result.hooks) {
        console.log(`  ${hook.name}  ${hook.event}:${hook.matcher}  ${hook.scriptPath}`);
      }
    });
}
