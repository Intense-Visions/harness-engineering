import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { askGraph } from '../../src/nlq/index.js';
import { IntentClassifier } from '../../src/nlq/IntentClassifier.js';
import { ResponseFormatter } from '../../src/nlq/ResponseFormatter.js';
import type { GraphNode } from '../../src/types.js';
import type { StalenessQueryResult } from '../../src/nlq/types.js';

describe('NLQ staleness intent', () => {
  it('classifies staleness questions to the staleness intent', () => {
    const classifier = new IntentClassifier();
    for (const q of [
      'which learnings are stale?',
      'show me stale learnings',
      'what learnings need re-verify?',
      'list outdated learnings',
    ]) {
      const result = classifier.classify(q);
      expect(result.intent, `for "${q}"`).toBe('staleness');
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('does not steal existing intents', () => {
    const classifier = new IntentClassifier();
    expect(classifier.classify('what breaks if I change AuthService?').intent).toBe('impact');
    expect(classifier.classify('where is hashPassword?').intent).toBe('find');
  });

  it('formats a stale-learnings summary', () => {
    const formatter = new ResponseFormatter();
    const data: StalenessQueryResult = {
      evaluated: 2,
      stale: [
        {
          nodeId: 'learning:abc',
          type: 'learning',
          name: 'Fixed widget in packages/gone/x.ts',
          missingReferences: ['packages/gone/x.ts'],
          detectedAt: '2026-08-26T00:00:00.000Z',
        },
      ],
    };
    const summary = formatter.format('staleness', [], data, 'which learnings are stale?');
    expect(summary).toContain('1 stale learning');
    expect(summary).toContain('packages/gone/x.ts');
  });

  it('formats a clean summary when nothing is stale', () => {
    const formatter = new ResponseFormatter();
    const summary = formatter.format(
      'staleness',
      [],
      { evaluated: 3, stale: [] } satisfies StalenessQueryResult,
      'which learnings are stale?'
    );
    expect(summary).toContain('0 stale learnings');
  });

  it('surfaces flagged nodes through askGraph and ignores unflagged ones', async () => {
    const store = new GraphStore();
    const staleLearning: GraphNode = {
      id: 'learning:stale',
      type: 'learning',
      name: 'Fixed the widget in packages/gone/deleted.ts',
      metadata: {},
      staleness: {
        isStale: true,
        reason: 'referenced-file-missing',
        missingReferences: ['packages/gone/deleted.ts'],
        detectedAt: '2026-08-26T00:00:00.000Z',
      },
    };
    const freshLearning: GraphNode = {
      id: 'learning:fresh',
      type: 'learning',
      name: 'Improved logging in packages/core/src/index.ts',
      metadata: {},
    };
    store.addNode(staleLearning);
    store.addNode(freshLearning);

    const result = await askGraph(store, 'which learnings are stale?');

    expect(result.intent).toBe('staleness');
    const data = result.data as StalenessQueryResult;
    expect(data.stale).toHaveLength(1);
    // evaluated is the denominator: both learning nodes were inspected.
    expect(data.evaluated).toBe(2);
    expect(data.stale[0]!.nodeId).toBe('learning:stale');
    expect(result.summary).toContain('learning:stale');
    expect(result.summary).not.toContain('learning:fresh');
  });
});
