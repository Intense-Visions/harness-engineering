import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Invariant R (read-source invariant) — Phase 3, roadmap shard store.
 *
 * `docs/roadmap.md` is a GENERATED aggregate; the shards under `docs/roadmap.d/`
 * are the source of truth. Long-term, only the regenerator may read the
 * aggregate; every other tool must read the shard store. This module mechanically
 * enforces that no NEW code starts reading `docs/roadmap.md` by requiring the set
 * of source files that reference it to be a subset of `ROADMAP_READ_ALLOWLIST`.
 *
 * The allowlist enumerates TODAY's readers:
 *   - the regenerator + store (permanent — the sanctioned readers/writers);
 *   - the Phase-3 git/merge tooling that names the path in comments/messages
 *     (declares merge=ours, regen wrappers) rather than parse-reading it;
 *   - the unmigrated legacy readers, annotated `// Phase 4: remove …`, which
 *     shrink as writers move onto `RoadmapStore`.
 *
 * Enforced by the repo guard test (`roadmap-read-source.repo.test.ts`, runs under
 * pre-push `test:coverage`), NOT an adopter-facing `harness validate` rule — the
 * invariant is about harness's OWN source, which an adopter clone does not have.
 * The detector is a reusable core function so a future `ci check` rule can adopt it.
 */
export const ROADMAP_READ_ALLOWLIST: readonly string[] = [
  // ── Permanent: the sanctioned aggregate readers/writers ──────────────────
  'packages/core/src/roadmap/store/regenerator.ts',
  'packages/core/src/roadmap/store/monolith-store.ts',
  'packages/core/src/roadmap/store/index.ts',
  // Names the aggregate path as a constant for mode detection / regen target —
  // not a content read; permitted under invariant R.
  'packages/core/src/roadmap/store/factory.ts',
  // ── Permanent: Phase-3 git/merge tooling (names the path, not a parse-read) ─
  'packages/cli/src/commands/roadmap/regen.ts',
  'packages/cli/src/commands/roadmap/shard.ts',
  'packages/cli/src/commands/roadmap/unshard.ts',
  'packages/cli/src/commands/roadmap/migrate.ts',
  'packages/cli/src/commands/roadmap/migrate-lock.ts',
  'packages/cli/src/git/merge-driver-setup.ts',
  'packages/cli/src/commands/init.ts',
  'packages/cli/src/commands/validate.ts',
  'packages/core/src/validation/merge-driver.ts',
  // This detector itself references the path in its allowlist/comments.
  'packages/core/src/validation/roadmap-read-source.ts',
  // ── Phase 4: remove when migrated to RoadmapStore (legacy monolith readers) ─
  'packages/core/src/roadmap/pilot-scoring.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/core/src/roadmap/health.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/core/src/roadmap/assignee-lifecycle.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/core/src/roadmap/mode.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/core/src/roadmap/migrate/plan-builder.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/core/src/roadmap/migrate/run.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/core/src/roadmap/migrate/types.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/core/src/architecture/prediction-engine.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/core/src/validation/roadmap-mode.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/cli/src/config/schema.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/cli/src/mcp/tools/roadmap-file-less.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/cli/src/commands/publish-analyses.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/cli/src/commands/sync-analyses.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/dashboard/src/server/context.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/orchestrator/src/core/candidate-selection.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/orchestrator/src/orchestrator.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/orchestrator/src/workflow/config.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/orchestrator/src/workspace/manager.ts', // Phase 4: remove when migrated to RoadmapStore
  'packages/types/src/orchestrator.ts', // Phase 4: remove when migrated to RoadmapStore
] as const;

/** Matches the generated aggregate path. */
const ROADMAP_MD = /roadmap\.md/;

function walkTsFiles(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walkTsFiles(full, out);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
}

/**
 * Walk `packages/<pkg>/src/**\/*.ts` (skipping `*.test.ts`, `*.d.ts`, `dist/`,
 * `node_modules/`) and return the repo-relative, posix-separated paths of every
 * source file that references `roadmap.md` but is NOT in `allowlist`, sorted.
 *
 * An empty result means the invariant holds (every reader is accounted for).
 */
export function findRoadmapReadSourceViolations(
  repoRoot: string,
  allowlist: readonly string[] = ROADMAP_READ_ALLOWLIST
): string[] {
  const allow = new Set(allowlist);
  const packagesDir = path.join(repoRoot, 'packages');
  let pkgs: fs.Dirent[];
  try {
    pkgs = fs.readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const pkg of pkgs) {
    if (!pkg.isDirectory()) continue;
    walkTsFiles(path.join(packagesDir, pkg.name, 'src'), files);
  }

  const violations: string[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    if (!ROADMAP_MD.test(content)) continue;
    const rel = path.relative(repoRoot, file).replaceAll('\\', '/');
    if (!allow.has(rel)) violations.push(rel);
  }
  return violations.sort();
}
