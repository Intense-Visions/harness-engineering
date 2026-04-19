import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOOK_SCRIPTS, PROFILES, type HookProfile } from '../../hooks/profiles';
import { logger } from '../../output/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_PROFILES: HookProfile[] = ['minimal', 'standard', 'strict'];

/**
 * Resolve the source directory containing hook .js scripts.
 * Works from both src/ (dev/vitest) and dist/ (compiled/bundled).
 *
 * In dev:  __dirname = src/commands/hooks/ → ../../hooks/ = src/hooks/
 * In dist: __dirname = dist/ (flat bundle)  → ./hooks/    = dist/hooks/
 */
function resolveHookSourceDir(): string {
  const candidates = [
    // Dev layout: src/commands/hooks/ → ../../hooks/
    path.resolve(__dirname, '..', '..', 'hooks'),
    // Bundled layout: dist/ → ./hooks/ (copied by copy-assets.mjs)
    path.resolve(__dirname, 'hooks'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Cannot locate hook scripts directory. Searched:\n${candidates.map((c) => `  - ${c}`).join('\n')}`
  );
}

/**
 * Build the hooks object for .claude/settings.json based on profile.
 */
export function buildSettingsHooks(
  profile: HookProfile
): Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>> {
  const activeHookNames = PROFILES[profile];
  const activeScripts = HOOK_SCRIPTS.filter((h) => activeHookNames.includes(h.name));

  const hooks: Record<
    string,
    Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>
  > = {};

  for (const script of activeScripts) {
    if (!hooks[script.event]) {
      hooks[script.event] = [];
    }
    hooks[script.event]!.push({
      matcher: script.matcher,
      hooks: [{ type: 'command', command: `node .harness/hooks/${script.name}.js` }],
    });
  }

  return hooks;
}

/**
 * Merge harness hook entries into existing settings.json content.
 * Preserves non-hooks keys. Replaces the hooks key entirely (harness owns it).
 */
export function mergeSettings(
  existing: Record<string, unknown>,
  hooksConfig: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...existing,
    hooks: hooksConfig,
  };
}

/**
 * Core init logic, extracted for testing.
 */
export function initHooks(options: { profile: HookProfile; projectDir: string }): {
  copiedScripts: string[];
  settingsPath: string;
  profilePath: string;
} {
  const { profile, projectDir } = options;

  // 1. Copy active hook scripts to .harness/hooks/
  const hooksDestDir = path.join(projectDir, '.harness', 'hooks');
  fs.mkdirSync(hooksDestDir, { recursive: true });

  // Clean stale scripts before copying (handles profile downgrade)
  if (fs.existsSync(hooksDestDir)) {
    for (const entry of fs.readdirSync(hooksDestDir)) {
      if (entry.endsWith('.js')) {
        fs.unlinkSync(path.join(hooksDestDir, entry));
      }
    }
  }

  const sourceDir = resolveHookSourceDir();
  const copiedScripts: string[] = [];

  const activeNames = PROFILES[profile];
  const activeScripts = HOOK_SCRIPTS.filter((h) => activeNames.includes(h.name));

  for (const script of activeScripts) {
    const srcFile = path.join(sourceDir, `${script.name}.js`);
    const destFile = path.join(hooksDestDir, `${script.name}.js`);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
      copiedScripts.push(script.name);
    }
  }

  // 2. Write profile.json
  const profilePath = path.join(hooksDestDir, 'profile.json');
  fs.writeFileSync(profilePath, JSON.stringify({ profile }, null, 2) + '\n');

  // 3. Read or create .claude/settings.json and merge hooks
  const claudeDir = path.join(projectDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const settingsPath = path.join(claudeDir, 'settings.json');
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (e) {
      throw new Error(
        `Malformed .claude/settings.json — fix the JSON syntax before running hooks init. ` +
          `Parse error: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e }
      );
    }
  }

  const hooksConfig = buildSettingsHooks(profile);
  const merged = mergeSettings(existing, hooksConfig);
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n');

  return { copiedScripts, settingsPath, profilePath };
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Install Claude Code hook configurations into the current project')
    .option('--profile <profile>', 'Hook profile: minimal, standard, or strict', 'standard')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const profile = opts.profile as HookProfile;

      if (!VALID_PROFILES.includes(profile)) {
        logger.error(`Invalid profile: ${profile}. Must be one of: ${VALID_PROFILES.join(', ')}`);
        process.exit(2);
      }

      const projectDir = process.cwd();

      try {
        const result = initHooks({ profile, projectDir });

        if (globalOpts.json) {
          console.log(
            JSON.stringify({
              profile,
              copiedScripts: result.copiedScripts,
              settingsPath: result.settingsPath,
              profilePath: result.profilePath,
            })
          );
        } else {
          logger.success(
            `Installed ${result.copiedScripts.length} hook scripts to .harness/hooks/`
          );
          logger.info(`Profile: ${profile}`);
          logger.info(
            `Settings: ${path.relative(projectDir, result.settingsPath).replaceAll('\\', '/')}`
          );
          logger.dim("Run 'harness hooks list' to see installed hooks");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to initialize hooks: ${message}`);
        process.exit(2);
      }
    });
}
