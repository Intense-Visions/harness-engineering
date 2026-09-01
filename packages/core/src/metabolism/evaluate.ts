/**
 * Basal token metabolism — classifier evaluator (#1628).
 *
 * Validates the {@link classifySpend} classifier against a hand-labeled sample
 * and publishes confusion rates (acceptance criterion #1). Pure over its
 * inputs.
 */

import {
  classifySpend,
  DEFAULT_METABOLISM_CONFIG,
  SPEND_CLASSES,
  type MetabolismConfig,
  type SpendClass,
  type SpendEvent,
} from './classify';

/** One hand-labeled example: an event and the class a human assigned it. */
export interface LabeledSpendEvent {
  event: SpendEvent;
  expected: SpendClass;
}

/** Per-class precision/recall/support. */
export interface PerClassRates {
  spendClass: SpendClass;
  /** Predicted-this-class ∧ correct, over predicted-this-class. `null` when never predicted. */
  precision: number | null;
  /** Predicted-this-class ∧ correct, over labeled-this-class. `null` when no support. */
  recall: number | null;
  /** Number of labeled examples of this class. */
  support: number;
}

/** The evaluation result. */
export interface ClassifierEvaluation {
  /** Number of labeled examples. */
  total: number;
  /** Number correctly classified. */
  correct: number;
  /** correct / total; 0 when the sample is empty. */
  accuracy: number;
  /**
   * Confusion matrix: `matrix[expected][predicted]` counts. Indexed by the
   * {@link SPEND_CLASSES} order, exposed as a nested record for readability.
   */
  confusion: Record<SpendClass, Record<SpendClass, number>>;
  /** Per-class precision/recall/support, in {@link SPEND_CLASSES} order. */
  perClass: PerClassRates[];
}

function emptyConfusion(): Record<SpendClass, Record<SpendClass, number>> {
  const outer = {} as Record<SpendClass, Record<SpendClass, number>>;
  for (const expected of SPEND_CLASSES) {
    const inner = {} as Record<SpendClass, number>;
    for (const predicted of SPEND_CLASSES) inner[predicted] = 0;
    outer[expected] = inner;
  }
  return outer;
}

/**
 * Evaluate the classifier against a hand-labeled sample.
 *
 * @param labeled - the hand-labeled examples.
 * @param config - classifier configuration (default: {@link DEFAULT_METABOLISM_CONFIG}).
 */
export function evaluateClassifier(
  labeled: readonly LabeledSpendEvent[],
  config: MetabolismConfig = DEFAULT_METABOLISM_CONFIG
): ClassifierEvaluation {
  const confusion = emptyConfusion();
  let correct = 0;

  for (const { event, expected } of labeled) {
    const predicted = classifySpend(event, config);
    confusion[expected][predicted] += 1;
    if (predicted === expected) correct += 1;
  }

  const total = labeled.length;

  const perClass: PerClassRates[] = SPEND_CLASSES.map((spendClass) => {
    const support = SPEND_CLASSES.reduce((s, p) => s + confusion[spendClass][p], 0);
    const predictedCount = SPEND_CLASSES.reduce((s, e) => s + confusion[e][spendClass], 0);
    const truePositives = confusion[spendClass][spendClass];
    return {
      spendClass,
      precision: predictedCount > 0 ? truePositives / predictedCount : null,
      recall: support > 0 ? truePositives / support : null,
      support,
    };
  });

  return {
    total,
    correct,
    accuracy: total > 0 ? correct / total : 0,
    confusion,
    perClass,
  };
}
