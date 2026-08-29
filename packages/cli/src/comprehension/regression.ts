/**
 * ADR 0109 slice 4 — token-free semantic-regression detection for CI.
 *
 * The committed comprehension substrate is only worth keeping if ordinary edits
 * cannot silently strip a module's expensively-authored semantic understanding
 * down to static-only. This module answers one question against a base ref, using
 * ONLY frontmatter reads — no LLM, no provider, no token: did any module's unit
 * flip `semantic: present → absent`?
 *
 * A red result means "regenerate locally and push" (on the developer's own
 * session/subscription — see ADR 0109 §1-2), never "CI needs a key." The check
 * itself is pure git + string parsing, so it can be a required gate that imposes
 * no cost on adopters.
 */

import { spawnSync } from 'node:child_process';

export type SemanticState = 'present' | 'absent';

/**
 * Modules whose unit regressed `present → absent` from `base` to `head`. Only a
 * module present in BOTH maps that lost its semantic counts — a deleted module
 * (absent from `head`) or a brand-new module (absent from `base`) is never a
 * regression. Result is sorted for stable reporting.
 */
export function detectSemanticRegressions(
  base: Map<string, SemanticState>,
  head: Map<string, SemanticState>
): string[] {
  const regressed: string[] = [];
  for (const [module, state] of base) {
    if (state === 'present' && head.get(module) === 'absent') {
      regressed.push(module);
    }
  }
  return regressed.sort();
}

/**
 * Extract `{ module, semantic }` from a serialized `_module.md` shard via a
 * lightweight frontmatter scan (our serializer emits fixed-key-order, one scalar
 * per line, so a per-line match is exact — no YAML dependency, no core-barrel
 * coupling). Returns null when either field is missing/malformed.
 */
export function parseModuleSemantic(
  md: string
): { module: string; semantic: SemanticState } | null {
  const rawModule = /^module:\s*(.+)$/m.exec(md)?.[1];
  const rawSemantic = /^semantic:\s*(present|absent)\s*$/m.exec(md)?.[1];
  if (rawModule === undefined || rawSemantic === undefined) return null;
  // Strip surrounding single/double quotes emitted by quoteYamlScalar.
  const module = rawModule.trim().replace(/^['"]|['"]$/g, '');
  if (module.length === 0) return null;
  return { module, semantic: rawSemantic as SemanticState };
}

/** Git seams so ref reading is injectable (disk-/git-free in tests). */
export interface RefReadDeps {
  /** Repo-relative shard paths tracked at `ref` (the `_module.md` files). */
  listShardsAtRef(ref: string): string[];
  /** Contents of `path` at `ref`, or null when the path did not exist there. */
  showAtRef(ref: string, path: string): string | null;
}

/** Build the `module → semantic` map from every committed shard at `ref`. */
export function readSemanticMapAtRef(ref: string, deps: RefReadDeps): Map<string, SemanticState> {
  const map = new Map<string, SemanticState>();
  for (const path of deps.listShardsAtRef(ref)) {
    const md = deps.showAtRef(ref, path);
    if (md === null) continue;
    const parsed = parseModuleSemantic(md);
    if (parsed) map.set(parsed.module, parsed.semantic);
  }
  return map;
}

/** Default git seams over a working directory (spawnSync, never throws). */
export function defaultRefReadDeps(cwd: string, root = '.harness/comprehension'): RefReadDeps {
  return {
    listShardsAtRef(ref: string): string[] {
      const res = spawnSync('git', ['ls-tree', '-r', '--name-only', ref, '--', root], {
        cwd,
        encoding: 'utf8',
      });
      if (res.status !== 0 || typeof res.stdout !== 'string') return [];
      return res.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.endsWith('/_module.md') || l.endsWith('_module.md'));
    },
    showAtRef(ref: string, path: string): string | null {
      const res = spawnSync('git', ['show', `${ref}:${path}`], { cwd, encoding: 'utf8' });
      if (res.status !== 0 || typeof res.stdout !== 'string') return null;
      return res.stdout;
    },
  };
}
