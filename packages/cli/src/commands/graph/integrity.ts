import * as path from 'path';
import type { GraphIntegrityReport, IntegrityFinding } from '@harness-engineering/graph';
import type { SyncMetadata } from '@harness-engineering/graph';

export interface GraphIntegrityResult {
  readonly status: 'ok' | 'no_graph';
  readonly message?: string;
  readonly report?: GraphIntegrityReport;
}

/**
 * Reads `sync-metadata.json` in full.
 *
 * Deliberately distinct from the reader in `status.ts`, which narrows each
 * connector to a bare `lastSyncTimestamp` string and throws away the `errors`
 * and counts this check exists to inspect (#1336).
 */
async function readSyncMetadata(graphDir: string): Promise<SyncMetadata | undefined> {
  const fs = await import('node:fs/promises');
  try {
    const raw = await fs.readFile(path.join(graphDir, 'sync-metadata.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as SyncMetadata;
  } catch {
    // No sync metadata: connectors were never configured or never ran. That is
    // a zero denominator, reported as such by the caller — not a clean result.
    return undefined;
  }
}

/**
 * Checks a persisted graph for content that cannot be trusted.
 *
 * @param projectPath - Project root containing the `.harness` graph directory.
 * @returns The integrity report, or a `no_graph` status when there is nothing
 *   to inspect.
 */
export async function runGraphIntegrity(projectPath: string): Promise<GraphIntegrityResult> {
  const { GraphStore, resolveGraphDir, checkGraphIntegrity } =
    await import('@harness-engineering/graph');
  const graphDir = resolveGraphDir(projectPath);

  const store = new GraphStore();
  const loaded = await store.load(graphDir);
  if (!loaded) {
    return {
      status: 'no_graph',
      message: 'No graph found. Run `harness graph scan` first.',
    };
  }

  const syncMetadata = await readSyncMetadata(graphDir);
  const report = checkGraphIntegrity({ syncMetadata, nodes: store.findNodes({}) });

  return { status: 'ok', report };
}

function formatFinding(finding: IntegrityFinding): string {
  const label = finding.severity === 'error' ? 'ERROR' : 'WARN';
  const lines = [`  [${label}] ${finding.code} ${finding.subject}`, `    ${finding.message}`];
  if (finding.evidence) lines.push(`    evidence: ${finding.evidence}`);
  return lines.join('\n');
}

/**
 * Renders the report, always leading with what was examined so a zero
 * denominator can never be mistaken for a clean bill of health (#1146).
 */
export function printGraphIntegrity(result: GraphIntegrityResult): void {
  if (result.status === 'no_graph' || !result.report) {
    console.log(result.message ?? 'No graph found.');
    return;
  }

  const { findings, checked, checkedNothing } = result.report;
  console.log(
    `Checked: ${checked.connectors} connector(s), ${checked.extractedNodes} extractor-derived node(s)`
  );

  if (checkedNothing) {
    console.log(
      '\nABSTAINED: nothing to inspect - no connectors configured and no ' +
        'extractor-derived nodes in the graph. This is not a pass.\n'
    );
    return;
  }

  if (findings.length === 0) {
    console.log('\nGraph integrity: OK - no untrustworthy content found.\n');
    return;
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  console.log(`\nGraph integrity: ${errors} error(s), ${warnings} warning(s)\n`);
  for (const finding of findings) console.log(formatFinding(finding));
  console.log('');
}
