import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOOK_SCRIPTS } from '../../hooks/profiles';
import { logger } from '../../output/logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALIASES: Record<string, string[]> = {
  sentinel: ['sentinel-pre', 'sentinel-post'],
};

function hookSourceDir(): string {
  const d = path.resolve(__dirname, '..', '..', 'hooks');
  if (fs.existsSync(d)) return d;
  throw new Error(`Hook scripts not found: ${d}`);
}

export interface AddResult {
  added: string[];
  alreadyInstalled: string[];
  notFound: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic JSON settings structure
type JsonObject = Record<string, any>;

function readJson(p: string): JsonObject {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : {};
}

function registerHook(s: JsonObject, ev: string, matcher: string, name: string): void {
  if (!s.hooks[ev]) s.hooks[ev] = [];
  const cmd = `node "$(git rev-parse --show-toplevel)/.harness/hooks/${name}.js"`;
  if (!s.hooks[ev].some((e: JsonObject) => e.hooks?.some((h: JsonObject) => h.command === cmd))) {
    s.hooks[ev].push({ matcher, hooks: [{ type: 'command', command: cmd }] });
  }
}

export function addHooks(hookName: string, projectDir: string): AddResult {
  const names = ALIASES[hookName] ?? [hookName];
  const result: AddResult = { added: [], alreadyInstalled: [], notFound: [] };
  const srcDir = hookSourceDir();
  const destDir = path.join(projectDir, '.harness', 'hooks');
  fs.mkdirSync(destDir, { recursive: true });

  const claudeDir = path.join(projectDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const settingsPath = path.join(claudeDir, 'settings.json');
  const settings = readJson(settingsPath);
  if (!settings.hooks) settings.hooks = {};

  for (const name of names) {
    const def = HOOK_SCRIPTS.find((h) => h.name === name);
    if (!def) {
      result.notFound.push(name);
      continue;
    }
    const src = path.join(srcDir, `${name}.js`);
    const dest = path.join(destDir, `${name}.js`);

    if (fs.existsSync(dest)) {
      result.alreadyInstalled.push(name);
    } else if (!fs.existsSync(src)) {
      result.notFound.push(name);
      continue;
    } else {
      fs.copyFileSync(src, dest);
      result.added.push(name);
    }
    registerHook(settings, def.event, def.matcher, name);
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return result;
}

export function createAddCommand(): Command {
  return new Command('add')
    .argument('<hook-name>', 'Hook name or alias (e.g., sentinel)')
    .description('Add a hook without changing the profile')
    .action(async (hookName: string, _opts: unknown, cmd: Command) => {
      const projectDir = process.cwd();
      try {
        const res = addHooks(hookName, projectDir);
        if (cmd.optsWithGlobals().json) {
          console.log(JSON.stringify(res));
          return;
        }
        if (res.notFound.length > 0) {
          logger.error(`Unknown hook(s): ${res.notFound.join(', ')}`);
          logger.info(`Available: ${HOOK_SCRIPTS.map((h) => h.name).join(', ')}`);
          logger.info(`Aliases: ${Object.keys(ALIASES).join(', ')}`);
          process.exit(2);
        }
        for (const n of res.added) logger.success(`Added hook: ${n}`);
        for (const n of res.alreadyInstalled) logger.info(`Already installed: ${n}`);
      } catch (err: unknown) {
        logger.error(`Failed to add hook: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(2);
      }
    });
}
