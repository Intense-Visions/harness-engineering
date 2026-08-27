/**
 * SF4.1 — dispatch pre-warm (spec D6, push-primary half).
 *
 * At leaf dispatch the orchestrator has no diff yet, so "the leaf's blast-radius
 * modules" have no edited-file seed. The accepted minimal seed (phase-5 decision)
 * is the modules REFERENCED by the issue (paths mentioned in title/description/
 * spec/plans) plus, when a graph is present, their direct deps — degrading
 * gracefully to an empty pre-warm when nothing resolves.
 *
 * For each seed module this serves its committed comprehension unit through the
 * canonical LLM-free `serveGate` and renders it with `renderServedUnit` — the
 * SAME primitives the CLI serve path uses. It NEVER throws and NEVER calls an
 * LLM: a missing/stale/unreadable unit is simply skipped, and with no fresh units
 * the block is `''` (so the stage prompt renders byte-identical to today).
 */

import {
  serveGate,
  renderServedUnit,
  CHARS_PER_TOKEN,
  type ComprehensionUnit,
  type ComprehensionSourceFile,
  type Result,
} from '@harness-engineering/core';
import type { Issue, LeafContextSource } from '@harness-engineering/types';

/** IO seams so the helper is disk- and graph-free in tests. */
export interface LeafPrewarmDeps {
  projectRoot: string;
  store: { read(module: string): Promise<Result<ComprehensionUnit>> };
  reader: { readModuleSource(module: string): Promise<ComprehensionSourceFile[] | null> };
  /**
   * Optional direct-dep enrichment. Present only when a graph is available at
   * dispatch; absent ⇒ the seed is the issue-referenced modules alone (SC3
   * graceful degradation).
   */
  resolveDirectDeps?: (module: string) => string[];
}

/** The rendered pre-warm block + its per-source token breakdown. */
export interface LeafPrewarmResult {
  /** Rendered served units joined into one block; `''` when nothing is fresh. */
  block: string;
  /** One entry per served unit ({label: module, tokens: served estimate}). */
  sources: LeafContextSource[];
}

/** Extract path-like tokens (segments joined by `/`) from free text. */
function extractPathTokens(text: string): string[] {
  return text.match(/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+/g) ?? [];
}

/**
 * Map a path token to its owning module DIRECTORY: a trailing `name.ext` segment
 * is a file (take its dirname); a trailing plain segment is already a directory.
 * `null` for a token with no `/` (a bare filename has no owning module dir).
 */
function toModuleDir(token: string): string | null {
  const posix = token.replaceAll('\\', '/').replace(/\/+$/, '');
  const slash = posix.lastIndexOf('/');
  if (slash === -1) return null;
  const last = posix.slice(slash + 1);
  return last.lastIndexOf('.') > 0 ? posix.slice(0, slash) : posix;
}

/**
 * Derive the minimal seed module set from an issue: the module directories
 * referenced in its title, description, spec path, and plan paths. Posix-
 * normalized, de-duplicated, sorted. Empty when the issue names no paths.
 */
export function deriveSeedModules(issue: Issue): string[] {
  const free = extractPathTokens(`${issue.title ?? ''} ${issue.description ?? ''}`);
  // Spec/plan paths are explicit file references — strong seeds.
  const explicit = [issue.spec, ...(issue.plans ?? [])].filter((p): p is string => Boolean(p));
  const mods = new Set<string>();
  for (const token of [...free, ...explicit]) {
    const module = toModuleDir(token);
    if (module) mods.add(module);
  }
  return [...mods].sort();
}

/** Serve one module's unit if fresh; null when absent/stale/unreadable. */
async function serveFresh(
  module: string,
  deps: LeafPrewarmDeps
): Promise<{ module: string; rendered: string } | null> {
  try {
    const read = await deps.store.read(module);
    if (!read.ok) return null;
    const verdict = await serveGate(read.value, deps.reader);
    if (!verdict.serve) return null;
    return { module, rendered: renderServedUnit(verdict.unit) };
  } catch {
    return null; // graceful — a serve failure never breaks dispatch
  }
}

/**
 * Resolve a leaf's pre-warm block from its issue-referenced (and optionally
 * dep-enriched) modules. Serves only fresh units; returns an empty block when
 * none are available. Best-effort — never throws, never calls an LLM.
 */
export async function resolveLeafPrewarm(
  issue: Issue,
  deps: LeafPrewarmDeps
): Promise<LeafPrewarmResult> {
  const seed = deriveSeedModules(issue);
  const modules = deps.resolveDirectDeps
    ? [...new Set(seed.flatMap((m) => [m, ...deps.resolveDirectDeps!(m)]))]
    : seed;

  const rendered: string[] = [];
  const sources: LeafContextSource[] = [];
  for (const module of modules) {
    const served = await serveFresh(module, deps);
    if (!served) continue;
    rendered.push(served.rendered);
    sources.push({
      label: served.module,
      tokens: Math.ceil(served.rendered.length / CHARS_PER_TOKEN),
    });
  }

  if (rendered.length === 0) return { block: '', sources: [] };
  return { block: rendered.join('\n\n---\n\n'), sources };
}
