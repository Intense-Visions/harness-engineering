import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { HarnessConfigSubsetSchema } from './types';
import type { HarnessConfigSubset, HookFile, Mode, ProjectContext } from './types';

export interface ModeOptions {
  mode?: Mode; // explicit override wins
}

/** Explicit override wins; else toolkit iff BOTH templates/ and agents/skills/ exist; else adopter. */
export function resolveMode(opts: ModeOptions, root: string): Mode {
  if (opts.mode) return opts.mode;
  const hasTemplates = existsSync(join(root, 'templates'));
  const hasSkills = existsSync(join(root, 'agents', 'skills'));
  return hasTemplates && hasSkills ? 'toolkit' : 'adopter';
}

function readTextOrNull(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

function readJsonOrNull(path: string): unknown {
  const text = readTextOrNull(path);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readConfig(root: string): HarnessConfigSubset | null {
  const raw = readJsonOrNull(join(root, 'harness.config.json'));
  if (raw === null) return null;
  const parsed = HarnessConfigSubsetSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Collect script files directly under a directory (non-recursive), as HookFiles. */
function readHookDir(dir: string): HookFile[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .map((name) => ({ name, full: join(dir, name) }))
      .filter(({ full }) => {
        try {
          return statSync(full).isFile();
        } catch {
          return false;
        }
      })
      .map(({ name, full }) => ({
        name,
        path: full,
        text: readTextOrNull(full) ?? '',
      }));
  } catch {
    return [];
  }
}

/**
 * Phase 1 file-based hook resolution: union of scripts under .husky/ and
 * .claude/hooks/, plus any scripts referenced by .claude/settings.json hook
 * registrations. Deduplicated by absolute path. Profile mapping is Phase 2.
 */
function resolveHookFiles(root: string): HookFile[] {
  const collected = new Map<string, HookFile>();
  for (const h of [
    ...readHookDir(join(root, '.husky')),
    ...readHookDir(join(root, '.claude', 'hooks')),
  ]) {
    collected.set(resolve(h.path), h);
  }

  // Scripts referenced from .claude/settings.json hook registrations.
  const settings = readJsonOrNull(join(root, '.claude', 'settings.json'));
  for (const ref of extractSettingsHookScripts(settings)) {
    const abs = resolve(root, ref);
    if (collected.has(abs)) continue;
    const text = readTextOrNull(abs);
    if (text !== null) {
      collected.set(abs, { name: basename(abs), path: abs, text });
    }
  }
  return [...collected.values()];
}

/** Best-effort: pull any string that looks like a script path out of settings.hooks. */
function extractSettingsHookScripts(settings: unknown): string[] {
  const out: string[] = [];
  if (settings === null || typeof settings !== 'object') return out;
  const hooks = (settings as Record<string, unknown>).hooks;
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      if (/\.(sh|mjs|cjs|js|ts)\b/.test(v) || v.includes('hooks/')) out.push(v);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(hooks);
  return out;
}

function readWorkflows(root: string): { path: string; text: string }[] {
  const dir = join(root, '.github', 'workflows');
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
      .map((n) => join(dir, n))
      .filter((p) => {
        try {
          return statSync(p).isFile();
        } catch {
          return false;
        }
      })
      .map((p) => ({ path: p, text: readTextOrNull(p) ?? '' }));
  } catch {
    return [];
  }
}

/** Toolkit-only: collect .hbs templates recursively under templates/. */
function readTemplates(root: string): { path: string; text: string }[] {
  const dir = join(root, 'templates');
  if (!existsSync(dir)) return [];
  const out: { path: string; text: string }[] = [];
  const walk = (d: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(d, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (name.endsWith('.hbs')) out.push({ path: full, text: readTextOrNull(full) ?? '' });
    }
  };
  walk(dir);
  return out;
}

/** Toolkit-only: the init skill's SKILL.md text, or null. */
function readInitSkill(root: string): string | null {
  return readTextOrNull(
    join(root, 'agents', 'skills', 'claude-code', 'initialize-harness-project', 'SKILL.md')
  );
}

/** Reads every input once. Missing files -> null/[]; never throws. */
export function buildProjectContext(root: string, mode: Mode): ProjectContext {
  const ctx: ProjectContext = {
    root,
    mode,
    config: readConfig(root),
    preCommit: readTextOrNull(join(root, '.husky', 'pre-commit')),
    hookFiles: resolveHookFiles(root),
    workflows: readWorkflows(root),
    healthSnapshot: readJsonOrNull(join(root, '.harness', 'health-snapshot.json')),
  };
  if (mode === 'toolkit') {
    ctx.templates = readTemplates(root);
    ctx.initSkill = readInitSkill(root);
  }
  return ctx;
}
