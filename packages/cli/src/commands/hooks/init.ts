import { Command } from 'commander';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  installAgentRetrospectHooks,
  type AgentRetrospectResult,
} from '../../hooks/agent-retrospect';
import { HOOK_SCRIPTS, PROFILES, type HookProfile } from '../../hooks/profiles';
import { supportFilesFor } from '../../hooks/support-files';
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
export function resolveHookSourceDir(): string {
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
 * Build the settings.json `command` for a hook script.
 *
 * The generated command must resolve `.harness/hooks/<name>.js` against the
 * MAIN checkout, not the current working directory, and must never spam or
 * silently drop protection when that file is unreachable (#990). The previous
 * `node "$(git rev-parse --show-toplevel)/.harness/hooks/<name>.js"` form had
 * two production failure modes:
 *
 *   1. In a linked git worktree, `--show-toplevel` returns the *worktree* root,
 *      where the machine-local, gitignored `.harness/` does not exist —
 *      `MODULE_NOT_FOUND` on every tool call. Because the failure is
 *      non-blocking, the verify-bypass blocker and quality gate silently stop
 *      protecting worktree sessions (gates report as hook errors instead of
 *      running). With agent-per-worktree workflows, most agent work goes ungated.
 *   2. In a non-repo cwd, `git rev-parse` fails and spams
 *      `fatal: not a git repository` on every tool call.
 *
 * The fix:
 *   - `--git-common-dir` resolves to the MAIN checkout's `.git` even from a
 *     linked worktree, so `dirname` of it is the main repo root → gates run
 *     (and protect) in worktrees against the main repo's `.harness`.
 *   - `|| exit 0` and `[ -f "$f" ] || exit 0` make the hook a silent no-op
 *     outside a repo, or on a machine without `.harness`, instead of spamming.
 *   - `exec node` replaces the shell so the hook's blocking exit code (2) still
 *     propagates to Claude Code.
 */
export function buildHookCommand(name: string): string {
  return (
    `g="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0; ` +
    `f="$(dirname "$g")/.harness/hooks/${name}.js"; ` +
    `[ -f "$f" ] || exit 0; ` +
    `exec node "$f"`
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
      hooks: [
        {
          type: 'command',
          command: buildHookCommand(script.name),
        },
      ],
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
 * Hash hook-file content for local-modification detection.
 * Hashes of installed files are recorded in profile.json at install time; a
 * file whose current hash no longer matches its recorded hash was hand-edited
 * by the adopter and must not be silently clobbered on regeneration (#902).
 */
function hashHookContent(content: Buffer | string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Read the recorded install-time hashes from profile.json, if present.
 * Installs made before hash recording existed return an empty record.
 */
function readRecordedHashes(profilePath: string): Record<string, string> {
  try {
    const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    if (data && typeof data.fileHashes === 'object' && data.fileHashes !== null) {
      return data.fileHashes as Record<string, string>;
    }
  } catch {
    // Missing or malformed profile.json — no recorded hashes.
  }
  return {};
}

/**
 * Core init logic, extracted for testing.
 *
 * Local-modification guard (#902): a hook file whose content differs from the
 * hash recorded at install time was hand-edited by the adopter. Such files are
 * warned about and preserved (not overwritten, not wiped) unless `force` is
 * set. Files matching their recorded hash — or predating hash recording — are
 * refreshed as before.
 */
export function initHooks(options: { profile: HookProfile; projectDir: string; force?: boolean }): {
  copiedScripts: string[];
  settingsPath: string;
  profilePath: string;
  skippedModified: string[];
  agentRetrospect: AgentRetrospectResult[];
} {
  const { profile, projectDir, force = false } = options;

  // 1. Copy active hook scripts to .harness/hooks/
  const hooksDestDir = path.join(projectDir, '.harness', 'hooks');
  fs.mkdirSync(hooksDestDir, { recursive: true });

  const profilePath = path.join(hooksDestDir, 'profile.json');
  const recordedHashes = readRecordedHashes(profilePath);
  const skippedModified: string[] = [];

  const isLocallyModified = (fileName: string, filePath: string): boolean => {
    const recorded = recordedHashes[fileName];
    if (!recorded) return false; // pre-hash install — cannot verify, keep legacy refresh behavior
    return hashHookContent(fs.readFileSync(filePath)) !== recorded;
  };

  // Clean stale scripts before copying (handles profile downgrade), preserving
  // any file the adopter hand-edited since install.
  if (fs.existsSync(hooksDestDir)) {
    for (const entry of fs.readdirSync(hooksDestDir)) {
      if (!entry.endsWith('.js')) continue;
      const entryPath = path.join(hooksDestDir, entry);
      if (!force && isLocallyModified(entry, entryPath)) {
        skippedModified.push(entry);
        continue;
      }
      fs.unlinkSync(entryPath);
    }
  }

  const sourceDir = resolveHookSourceDir();
  const copiedScripts: string[] = [];
  const newHashes: Record<string, string> = {};

  const activeNames = PROFILES[profile];
  const activeScripts = HOOK_SCRIPTS.filter((h) => activeNames.includes(h.name));

  const installFile = (srcFile: string, destName: string): boolean => {
    if (!fs.existsSync(srcFile)) return false;
    const destFile = path.join(hooksDestDir, destName);
    if (skippedModified.includes(destName)) {
      // Hand-edited file preserved by the wipe above — keep its recorded hash
      // so it stays flagged (and preserved) on future runs.
      newHashes[destName] = recordedHashes[destName]!;
      return false;
    }
    const content = fs.readFileSync(srcFile);
    fs.writeFileSync(destFile, content);
    newHashes[destName] = hashHookContent(content);
    return true;
  };

  for (const script of activeScripts) {
    const srcFile = path.join(sourceDir, `${script.name}.js`);
    if (installFile(srcFile, `${script.name}.js`)) {
      copiedScripts.push(script.name);
    }
  }

  // Copy shared support modules required by the active hooks (e.g. format-check.js).
  // The stale-.js wipe above removed any prior copy; we re-copy here so the
  // sibling `import` resolves at the adopter, and so a downgrade that drops the
  // dependent hook also drops its now-orphaned support file.
  for (const supportFile of supportFilesFor(activeNames)) {
    installFile(path.join(sourceDir, supportFile), supportFile);
  }

  // Carry forward recorded hashes for preserved hand-edited files that are no
  // longer in the active set, so they stay flagged (and preserved) next run.
  for (const preserved of skippedModified) {
    if (!(preserved in newHashes) && recordedHashes[preserved]) {
      newHashes[preserved] = recordedHashes[preserved];
    }
  }

  // 2. Write profile.json (profile + install-time content hashes)
  fs.writeFileSync(profilePath, JSON.stringify({ profile, fileHashes: newHashes }, null, 2) + '\n');

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

  // 4. Wire the session-retrospect trigger into every OTHER detected agent
  //    (Gemini CLI, Codex CLI, Cursor) in that agent's native config format.
  //    Only when session-retrospect is in the active profile (standard+) — at
  //    minimal the Claude hook is absent and its support scripts are wiped, so
  //    there is nothing to trigger. Runtime remains gated by
  //    HARNESS_SESSION_RETROSPECTION, exactly like the Claude hook.
  let agentRetrospect: AgentRetrospectResult[] = [];
  if (PROFILES[profile].includes('session-retrospect')) {
    agentRetrospect = installAgentRetrospectHooks({ projectDir, buildCommand: buildHookCommand });
  }

  return { copiedScripts, settingsPath, profilePath, skippedModified, agentRetrospect };
}

/** Print the human-readable summary of an initHooks run. */
function printInitResult(
  result: ReturnType<typeof initHooks>,
  profile: HookProfile,
  projectDir: string
): void {
  logger.success(`Installed ${result.copiedScripts.length} hook scripts to .harness/hooks/`);
  if (result.skippedModified.length > 0) {
    logger.warn(
      `Preserved ${result.skippedModified.length} locally modified hook file(s): ` +
        `${result.skippedModified.join(', ')}. Re-run with --force to overwrite.`
    );
  }
  logger.info(`Profile: ${profile}`);
  logger.info(`Settings: ${path.relative(projectDir, result.settingsPath).replaceAll('\\', '/')}`);
  for (const agent of result.agentRetrospect) {
    const rel = path.relative(projectDir, agent.configPath).replaceAll('\\', '/');
    if (agent.status === 'installed') {
      logger.success(`Wired session-retrospect into ${agent.agent} (${rel})`);
    } else if (agent.status === 'skipped') {
      logger.dim(`session-retrospect already wired into ${agent.agent} (${rel})`);
    } else {
      logger.warn(
        `Skipped ${agent.agent} session-retrospect: ${agent.reason ?? 'config conflict'} (${rel})`
      );
    }
  }
  logger.dim("Run 'harness hooks list' to see installed hooks");
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Install Claude Code hook configurations into the current project')
    .option('--profile <profile>', 'Hook profile: minimal, standard, or strict', 'standard')
    .option('--force', 'Overwrite hook files even if they have local modifications')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const profile = opts.profile as HookProfile;

      if (!VALID_PROFILES.includes(profile)) {
        logger.error(`Invalid profile: ${profile}. Must be one of: ${VALID_PROFILES.join(', ')}`);
        process.exit(2);
      }

      const projectDir = process.cwd();

      try {
        const result = initHooks({ profile, projectDir, force: opts.force === true });

        if (globalOpts.json) {
          console.log(
            JSON.stringify({
              profile,
              copiedScripts: result.copiedScripts,
              skippedModified: result.skippedModified,
              settingsPath: result.settingsPath,
              profilePath: result.profilePath,
              agentRetrospect: result.agentRetrospect,
            })
          );
        } else {
          printInitResult(result, profile, projectDir);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to initialize hooks: ${message}`);
        process.exit(2);
      }
    });
}
