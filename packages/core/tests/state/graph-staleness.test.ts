import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GraphStore, KnowledgeIngestor, askGraph } from '@harness-engineering/graph';
import type { StalenessQueryResult } from '@harness-engineering/graph';
import { flagStaleLearningNodes } from '../../src/state/graph-staleness';

/**
 * WIRED end-to-end coverage (#1514): ingest learnings that cite a deleted file and a
 * live file, flag staleness via the real `detectStaleLearnings` path, then drive the
 * outer NLQ surface and assert the stale learning surfaces while the fresh one does not.
 */
describe('flagStaleLearningNodes (end-to-end via NLQ)', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-staleness-'));
    // A live file that a fresh learning references.
    const liveDir = path.join(projectPath, 'packages', 'core', 'src');
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(liveDir, 'live.ts'), 'export const live = true;\n');

    // learnings.md with one dated bullet citing a deleted file and one citing a live
    // file. Dated-bullet format is what both the graph ingestor AND the core
    // learnings loader parse.
    const harnessDir = path.join(projectPath, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '## 2026-08-26',
        '- **2026-08-26 [skill:execution]:** Fixed the widget in packages/gone/deleted-file.ts by rewiring the handler.',
        '- **2026-08-26 [skill:execution]:** Improved logging in packages/core/src/live.ts for clarity.',
        '',
      ].join('\n')
    );
  });

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it('flags the learning citing a deleted file and surfaces it via askGraph', async () => {
    const store = new GraphStore();

    // Real node-build path: ingest learnings into the graph.
    await new KnowledgeIngestor(store).ingestLearnings(projectPath);
    const learningNodes = store.findNodes({ type: 'learning' });
    expect(learningNodes.length).toBe(2);

    // Compute + stamp staleness (reuses detectStaleLearnings).
    const result = await flagStaleLearningNodes(store, projectPath);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.scanned).toBe(2);
    expect(result.value.flagged).toBe(1);
    expect(result.value.missingReferences).toContain('packages/gone/deleted-file.ts');

    // Outer NLQ surface reports the stale learning end-to-end.
    const answer = await askGraph(store, 'which learnings are stale?');
    expect(answer.intent).toBe('staleness');
    const data = answer.data as StalenessQueryResult;
    expect(data.stale).toHaveLength(1);
    expect(data.stale[0]!.missingReferences).toContain('packages/gone/deleted-file.ts');
    expect(answer.summary).toContain('1 stale learning');

    // The learning citing a live file is not flagged.
    const staleNames = data.stale.map((s) => s.name).join(' ');
    expect(staleNames).toContain('packages/gone/deleted-file.ts');
    expect(staleNames).not.toContain('packages/core/src/live.ts');
  });

  it('flags nothing when every cited file still exists', async () => {
    // Remove the stale bullet, keep only the live one.
    fs.writeFileSync(
      path.join(projectPath, '.harness', 'learnings.md'),
      [
        '# Learnings',
        '',
        '## 2026-08-26',
        '- **2026-08-26 [skill:execution]:** Improved logging in packages/core/src/live.ts for clarity.',
        '',
      ].join('\n')
    );

    const store = new GraphStore();
    await new KnowledgeIngestor(store).ingestLearnings(projectPath);
    const result = await flagStaleLearningNodes(store, projectPath);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.flagged).toBe(0);

    const answer = await askGraph(store, 'which learnings are stale?');
    const data = answer.data as StalenessQueryResult;
    expect(data.stale).toHaveLength(0);
    expect(answer.summary).toContain('0 stale learnings');
  });
});
