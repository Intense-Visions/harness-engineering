import { INTENTS } from './types.js';
import type { Intent, ClassificationResult } from './types.js';

/**
 * Signal configuration for a single intent.
 */
interface SignalSet {
  readonly keywords: readonly string[];
  readonly questionWords: readonly string[];
  readonly verbPatterns: readonly RegExp[];
}

/**
 * Signal weights for combining scores.
 */
type SignalName = 'keyword' | 'questionWord' | 'verbPattern';

const SIGNAL_WEIGHTS: Readonly<Record<SignalName, number>> = {
  keyword: 0.35,
  questionWord: 0.2,
  verbPattern: 0.45,
} as const;

/**
 * Per-intent signal configuration.
 */
const INTENT_SIGNALS: Readonly<Record<Intent, SignalSet>> = {
  impact: {
    keywords: [
      'break',
      'affect',
      'impact',
      'change',
      'depend',
      'blast',
      'radius',
      'cascade',
      'risk',
      'delete',
      'remove',
    ],
    questionWords: ['what', 'if'],
    verbPatterns: [
      /what\s+(breaks|happens|is affected)/,
      /if\s+i\s+(change|modify|remove|delete)/,
      /blast\s+radius/,
      /cascad/,
      /what\s+(depend|relies)/,
    ],
  },
  find: {
    keywords: ['find', 'where', 'locate', 'search', 'list', 'all', 'every'],
    questionWords: ['where'],
    verbPatterns: [
      /where\s+is/,
      /find\s+(the|all|every)/,
      /show\s+me/,
      /show\s+(all|every|the)/,
      /locate\s+/,
      /list\s+(all|every|the)/,
    ],
  },
  relationships: {
    keywords: [
      'connect',
      'call',
      'import',
      'use',
      'depend',
      'link',
      'neighbor',
      'caller',
      'callee',
    ],
    questionWords: ['what', 'who'],
    verbPatterns: [/connects?\s+to/, /depends?\s+on/, /\bcalls?\b/, /\bimports?\b/],
  },
  explain: {
    keywords: ['describe', 'explain', 'tell', 'about', 'overview', 'summary', 'work'],
    questionWords: ['what', 'how'],
    verbPatterns: [
      /what\s+is\s+\w/,
      /describe\s+/,
      /tell\s+me\s+about/,
      /how\s+does/,
      /overview\s+of/,
      /give\s+me\s+/,
    ],
  },
  anomaly: {
    keywords: [
      'wrong',
      'problem',
      'anomaly',
      'smell',
      'issue',
      'outlier',
      'hotspot',
      'suspicious',
      'risk',
    ],
    questionWords: ['what'],
    verbPatterns: [
      /what.*(wrong|problem|smell)/,
      /find.*(issue|anomal|problem)/,
      /code\s+smell/,
      /suspicious/,
      /hotspot/,
    ],
  },
} as const;

/**
 * Scored multi-signal intent classifier.
 *
 * Combines keyword presence, question-word matching, and verb-pattern matching
 * to classify natural language questions into one of 5 intents with a confidence
 * score between 0 and 1.
 */
export class IntentClassifier {
  /**
   * Classify a natural language question into an intent.
   *
   * @param question - The natural language question to classify
   * @returns ClassificationResult with intent, confidence, and per-signal scores
   */
  classify(question: string): ClassificationResult {
    const normalized = question.toLowerCase().trim();

    const scores: Array<{
      readonly intent: Intent;
      readonly confidence: number;
      readonly signals: Record<SignalName, number>;
    }> = [];

    for (const intent of INTENTS) {
      const signals = this.scoreIntent(normalized, INTENT_SIGNALS[intent]);
      const confidence = this.combineSignals(signals);
      scores.push({ intent, confidence, signals });
    }

    // Sort descending by confidence
    scores.sort((a, b) => b.confidence - a.confidence);

    const best = scores[0]!;
    return {
      intent: best.intent,
      confidence: best.confidence,
      signals: best.signals,
    };
  }

  /**
   * Score individual signals for an intent against the normalized query.
   */
  private scoreIntent(normalized: string, signalSet: SignalSet): Record<SignalName, number> {
    return {
      keyword: this.scoreKeywords(normalized, signalSet.keywords),
      questionWord: this.scoreQuestionWord(normalized, signalSet.questionWords),
      verbPattern: this.scoreVerbPatterns(normalized, signalSet.verbPatterns),
    };
  }

  /**
   * Score keyword signal: uses word-stem matching (checks if any word in the
   * query starts with the keyword). Saturates at 2 matches to avoid penalizing
   * intents with many keywords when only a few appear in the query.
   */
  private scoreKeywords(normalized: string, keywords: readonly string[]): number {
    if (keywords.length === 0) return 0;

    const words = normalized.split(/\s+/);
    let matched = 0;

    for (const keyword of keywords) {
      if (words.some((w) => w.startsWith(keyword))) {
        matched++;
      }
    }

    // Saturate at 2 matches: 1 match = 0.5, 2+ matches = 1.0
    return Math.min(matched / 2, 1.0);
  }

  /**
   * Score question-word signal: 1.0 if the query starts with a matching
   * question word, 0 otherwise.
   */
  private scoreQuestionWord(normalized: string, questionWords: readonly string[]): number {
    const firstWord = normalized.split(/\s+/)[0] ?? '';
    return questionWords.includes(firstWord) ? 1.0 : 0.0;
  }

  /**
   * Score verb-pattern signal: any matching pattern yields a strong score.
   * Multiple matches increase score but saturate quickly.
   */
  private scoreVerbPatterns(normalized: string, patterns: readonly RegExp[]): number {
    if (patterns.length === 0) return 0;

    let matched = 0;
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        matched++;
      }
    }

    // Any match = 0.8, 2+ matches = 1.0
    return matched === 0 ? 0 : Math.min(0.6 + matched * 0.2, 1.0);
  }

  /**
   * Combine individual signal scores into a single confidence score
   * using additive weighted scoring. Each signal contributes weight * score,
   * and the total weights sum to 1.0 so the result is naturally bounded [0, 1].
   */
  private combineSignals(signals: Record<SignalName, number>): number {
    let total = 0;

    for (const key of Object.keys(signals) as SignalName[]) {
      const weight = SIGNAL_WEIGHTS[key];
      total += signals[key] * weight;
    }

    return total;
  }
}
