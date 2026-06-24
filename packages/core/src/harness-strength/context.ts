import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, resolve, relative } from 'node:path';
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

/**
 * Convert an absolute path to a ROOT-RELATIVE, forward-slash-normalized path.
 * This is the single boundary that keeps every StrengthFinding.file root-relative
 * (no leading slash, no home-dir leak) regardless of where the file was scanned.
 */
function toRootRelative(root: string, abs: string): string {
  return relative(root, abs).replaceAll('\\', '/');
}

function readConfig(root: string): HarnessConfigSubset | null {
  const raw = readJsonOrNull(join(root, 'harness.config.json'));
  if (raw === null) return null;
  const parsed = HarnessConfigSubsetSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Collect script files directly under a directory (non-recursive), as HookFiles
 * with ROOT-RELATIVE paths.
 */
function readHookDir(root: string, dir: string): HookFile[] {
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
        path: toRootRelative(root, full),
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
  // Dedup keyed on ABSOLUTE path; the stored HookFile.path is ROOT-RELATIVE.
  const collected = new Map<string, HookFile>();
  for (const h of [
    ...readHookDir(root, join(root, '.husky')),
    ...readHookDir(root, join(root, '.claude', 'hooks')),
    ...readHookDir(root, join(root, '.harness', 'hooks')),
  ]) {
    collected.set(resolve(root, h.path), h);
  }

  // Scripts referenced from .claude/settings.json hook registrations.
  const settings = readJsonOrNull(join(root, '.claude', 'settings.json'));
  for (const ref of extractSettingsHookScripts(settings, root)) {
    const abs = resolve(root, ref);
    if (collected.has(abs)) continue;
    const text = readTextOrNull(abs);
    if (text !== null) {
      collected.set(abs, { name: basename(abs), path: toRootRelative(root, abs), text });
    }
  }
  return [...collected.values()];
}

/**
 * Matches a single script-path token inside a hook command string: a run of
 * non-whitespace, non-quote characters ending in a known script extension.
 * Keys on a real script extension so incidental tokens (e.g. build.js.map) are
 * not mistaken for the hook script.
 */
const HOOK_SCRIPT_TOKEN = /(?:^|[\s"'])([^\s"']+\.(?:sh|mjs|cjs|js|ts))(?=$|[\s"'])/g;

/**
 * Best-effort: pull the SCRIPT PATH out of each settings.hooks command string
 * (not the whole command). Normalizes a leading `$(git rev-parse
 * --show-toplevel)` (with surrounding quotes) to the project root so the path
 * resolves relative to root.
 */
function extractSettingsHookScripts(settings: unknown, root: string): string[] {
  const out: string[] = [];
  if (settings === null || typeof settings !== 'object') return out;
  const hooks = (settings as Record<string, unknown>).hooks;
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(HOOK_SCRIPT_TOKEN)) {
        const token = m[1];
        if (token) out.push(normalizeHookRef(token, root));
      }
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(hooks);
  return out;
}

/** Strip a leading repo-root command substitution / quotes so the ref resolves under root. */
function normalizeHookRef(token: string, root: string): string {
  let ref = token.replace(/^["']|["']$/g, '');
  // `$(git rev-parse --show-toplevel)/path` -> `<root>/path`
  ref = ref.replace(/^\$\(git rev-parse --show-toplevel\)\/?/, `${root}/`);
  return ref;
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
      .map((p) => ({ path: toRootRelative(root, p), text: readTextOrNull(p) ?? '' }));
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
      else if (name.endsWith('.hbs'))
        out.push({ path: toRootRelative(root, full), text: readTextOrNull(full) ?? '' });
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
