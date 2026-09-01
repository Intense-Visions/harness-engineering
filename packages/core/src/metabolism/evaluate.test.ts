import { describe, it, expect } from 'vitest';
import { evaluateClassifier, type LabeledSpendEvent } from './evaluate';
import { SPEND_CLASSES } from './classify';

/**
 * A hand-labeled sample spanning every classification path. The human labels
 * are the ground truth the classifier is validated against (acceptance #1).
 */
const HAND_LABELED: LabeledSpendEvent[] = [
  // Anabolic: completed productive work.
  {
    event: { workflowClass: 'harness-autopilot', tokens: 500, outcome: 'completed' },
    expected: 'anabolic',
  },
  {
    event: { workflowClass: 'harness-brainstorming', tokens: 300, outcome: 'completed' },
    expected: 'anabolic',
  },
  {
    event: { workflowClass: 'custom-build', tokens: 200, producedArtifact: true },
    expected: 'anabolic',
  },
  // Basal: maintenance loops + failed/abandoned runs.
  {
    event: { workflowClass: 'graph-refresh', tokens: 100, outcome: 'completed' },
    expected: 'basal',
  },
  { event: { workflowClass: 'ci-rerun', tokens: 150, outcome: 'completed' }, expected: 'basal' },
  { event: { workflowClass: 'harness-verify', tokens: 80, outcome: 'failed' }, expected: 'basal' },
  {
    event: { workflowClass: 'harness-autopilot', tokens: 90, outcome: 'abandoned' },
    expected: 'basal',
  },
  {
    event: { workflowClass: 'reverification', tokens: 60, producedArtifact: false },
    expected: 'basal',
  },
  // Unattributable: no usable outcome linkage.
  { event: { workflowClass: 'unknown-tool', tokens: 40 }, expected: 'unattributable' },
  { event: { workflowClass: 'harness-code-review', tokens: 70 }, expected: 'unattributable' },
];

describe('evaluateClassifier', () => {
  it('publishes 100% accuracy on the hand-labeled sample', () => {
    const result = evaluateClassifier(HAND_LABELED);
    expect(result.total).toBe(HAND_LABELED.length);
    expect(result.correct).toBe(HAND_LABELED.length);
    expect(result.accuracy).toBe(1);
  });

  it('publishes a full confusion matrix over the taxonomy', () => {
    const result = evaluateClassifier(HAND_LABELED);
    for (const expected of SPEND_CLASSES) {
      for (const predicted of SPEND_CLASSES) {
        expect(typeof result.confusion[expected][predicted]).toBe('number');
      }
    }
    // Diagonal (correct) counts equal each class's support on a perfect run.
    expect(result.confusion.anabolic.anabolic).toBe(3);
    expect(result.confusion.basal.basal).toBe(5);
    expect(result.confusion.unattributable.unattributable).toBe(2);
    // Off-diagonal is zero on a perfect run.
    expect(result.confusion.basal.anabolic).toBe(0);
    expect(result.confusion.anabolic.basal).toBe(0);
  });

  it('publishes per-class precision/recall/support', () => {
    const result = evaluateClassifier(HAND_LABELED);
    const basal = result.perClass.find((r) => r.spendClass === 'basal')!;
    expect(basal.support).toBe(5);
    expect(basal.precision).toBe(1);
    expect(basal.recall).toBe(1);
  });

  it('reports confusion counts when the classifier is wrong', () => {
    // A mislabeled example: a completed run a human insists is basal
    // (re-verification of unchanged state that nonetheless "completed").
    const mislabeled: LabeledSpendEvent[] = [
      {
        event: { workflowClass: 'harness-autopilot', tokens: 100, outcome: 'completed' },
        expected: 'basal',
      },
    ];
    const result = evaluateClassifier(mislabeled);
    expect(result.accuracy).toBe(0);
    // Human said basal, classifier predicted anabolic.
    expect(result.confusion.basal.anabolic).toBe(1);
    // Recall for basal is 0 (its one example was missed); precision is null (never predicted).
    const basal = result.perClass.find((r) => r.spendClass === 'basal')!;
    expect(basal.recall).toBe(0);
    expect(basal.precision).toBeNull();
  });

  it('handles an empty sample without throwing', () => {
    const result = evaluateClassifier([]);
    expect(result.total).toBe(0);
    expect(result.accuracy).toBe(0);
  });
});
