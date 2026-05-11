import { Ok, type Result } from '@harness-engineering/types';
import * as path from 'node:path';
import type { RoadmapTrackerClient } from '../tracker';
import type { MigrationPlan, MigrationReport, MigrationOptions } from './types';

export interface RunDeps {
  readonly client: RoadmapTrackerClient;
  readonly readFile: (p: string) => string;
  readonly writeFile: (p: string, b: string) => void;
  readonly renameFile: (from: string, to: string) => void;
  readonly existsFile: (p: string) => boolean;
}

/**
 * Execute a migration plan. Steps 3-7 from the migration spec:
 *
 *   3. Create features that lack External-IDs.
 *   4. Update features whose body-meta diverges from canonical.
 *   5. Append assignment-history events that lack a hash comment.
 *   6. Archive `docs/roadmap.md` → `docs/roadmap.md.archived`.
 *   7. Backup `harness.config.json` → `.pre-migration`, then rewrite
 *      `roadmap.mode = 'file-less'`.
 *
 * Invariants:
 * - Any abort in steps 1-5 short-circuits the run BEFORE archive (6) or config
 *   rewrite (7). The report names which features were already created so the
 *   operator can hand-recover.
 * - `dryRun: true` runs steps 1-4 against the client but the test fixture wires
 *   them so write methods throw; CLI dry-run uses a different plan-only path.
 *   This core helper interprets `dryRun` as "skip steps 5-7": archive + config
 *   are never touched, and the report is `mode: 'dry-run'`.
 *   In tests we additionally route the client's write methods to fail, but that
 *   is a test-only assertion: this helper simply does not invoke create/update/
 *   appendHistory at all in dry-run.
 * - Ambiguous entries → instant abort (D-P5-E).
 * - Archive collision (`roadmap.md.archived` exists) → abort with reason
 *   `archive-collision` (D-P5-D).
 * - Config rewrite is byte-identical backup + `JSON.stringify(parsed, null, 2) + '\n'`
 *   (D-P5-F).
 */
export async function runMigrationPlan(
  plan: MigrationPlan,
  deps: RunDeps,
  opts: MigrationOptions
): Promise<Result<MigrationReport, Error>> {
  const projectRoot = opts.projectRoot;
  const roadmapPath = path.join(projectRoot, 'docs', 'roadmap.md');
  const archivedPath = path.join(projectRoot, 'docs', 'roadmap.md.archived');
  const configPath = path.join(projectRoot, 'harness.config.json');
  const configBackupPath = path.join(projectRoot, 'harness.config.json.pre-migration');

  const createdSoFar: Array<{ name: string; externalId: string }> = [];
  const report: MigrationReport = {
    created: 0,
    updated: 0,
    unchanged: plan.unchanged.length,
    historyAppended: 0,
    archivedFrom: null,
    archivedTo: null,
    configBackup: null,
    mode: 'applied',
  };

  // Step 1 (gate): ambiguous entries → abort.
  if (plan.ambiguous.length > 0) {
    const names = plan.ambiguous.map((a) => a.name).join(', ');
    return Ok({
      ...report,
      mode: 'aborted',
      abortReason: `ambiguous features (title-collision or dangling external-id): ${names}`,
    });
  }

  // Dry-run short-circuit: do NOT invoke any tracker write methods, do NOT
  // archive, do NOT rewrite config. The CLI is responsible for printing the
  // plan summary.
  if (opts.dryRun) {
    return Ok({ ...report, mode: 'dry-run' });
  }

  // Step 3 (create).
  for (const entry of plan.toCreate) {
    const r = await deps.client.create(entry.input);
    if (!r.ok) {
      return Ok({
        ...report,
        created: createdSoFar.length,
        createdSoFar,
        mode: 'aborted',
        abortReason: `create failed for "${entry.name}": ${r.error.message}`,
      });
    }
    createdSoFar.push({ name: entry.name, externalId: r.value.externalId });
  }
  report.created = createdSoFar.length;

  // Step 4 (update).
  for (const entry of plan.toUpdate) {
    const r = await deps.client.update(entry.externalId, entry.patch);
    if (!r.ok) {
      return Ok({
        ...report,
        createdSoFar,
        mode: 'aborted',
        abortReason: `update failed for "${entry.name}" (${entry.externalId}): ${r.error.message}`,
      });
    }
    report.updated++;
  }

  // Step 5 (append history).
  for (const entry of plan.historyToAppend) {
    const r = await deps.client.appendHistory(entry.externalId, entry.event);
    if (!r.ok) {
      return Ok({
        ...report,
        createdSoFar,
        mode: 'aborted',
        abortReason: `appendHistory failed for ${entry.externalId} (${entry.event.type}): ${r.error.message}`,
      });
    }
    report.historyAppended++;
  }

  // Step 6 (archive).
  if (deps.existsFile(archivedPath)) {
    return Ok({
      ...report,
      createdSoFar,
      mode: 'aborted',
      abortReason: `archive-collision: ${archivedPath} already exists; refusing to overwrite`,
    });
  }
  if (deps.existsFile(roadmapPath)) {
    try {
      deps.renameFile(roadmapPath, archivedPath);
      report.archivedFrom = roadmapPath;
      report.archivedTo = archivedPath;
    } catch (err) {
      return Ok({
        ...report,
        createdSoFar,
        mode: 'aborted',
        abortReason: `archive failed: ${(err as Error).message}`,
      });
    }
  }

  // Step 7 (config). Read-then-backup-then-rewrite.
  try {
    if (!deps.existsFile(configPath)) {
      return Ok({
        ...report,
        createdSoFar,
        mode: 'aborted',
        abortReason: `config rewrite failed: ${configPath} not found`,
      });
    }
    const original = deps.readFile(configPath);
    deps.writeFile(configBackupPath, original);
    report.configBackup = configBackupPath;

    const parsed = JSON.parse(original) as Record<string, unknown>;
    const roadmapSection: Record<string, unknown> =
      (parsed.roadmap as Record<string, unknown> | undefined) ?? {};
    roadmapSection.mode = 'file-less';
    parsed.roadmap = roadmapSection;
    deps.writeFile(configPath, JSON.stringify(parsed, null, 2) + '\n');
  } catch (err) {
    return Ok({
      ...report,
      createdSoFar,
      mode: 'aborted',
      abortReason: `config rewrite failed: ${(err as Error).message}`,
    });
  }

  return Ok(report);
}
