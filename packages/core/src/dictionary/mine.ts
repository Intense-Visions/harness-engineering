/**
 * Trained context dictionaries — recurring-span mining (#1635).
 *
 * Zstd's largest wins on small documents come from a *trained dictionary*: learn
 * the corpus's recurring substrings once, then encode every new document against
 * the dictionary. The context analog: a large fraction of every assembled prompt
 * is recurring knowledge — conventions, schemas, standing instructions,
 * architectural facts — re-sent verbatim thousands of times. This module is the
 * trainer's mining half: it reduces a corpus of past assembled contexts into
 * candidate dictionary terms, each scored by `frequency × length` — the
 * amortization quantity that decides whether binding the span to a short handle
 * ever pays for itself.
 *
 * Pure and IO-free: the corpus is passed in already segmented into labeled
 * spans (the CLI/adapter layer owns reading assembled-context / comprehension /
 * telemetry sources). A "span" is keyed by a stable **label** (a knowledge
 * identifier — a comprehension-unit module, a section heading, a node id) whose
 * **text** (the definition) may drift over time; keying by label is what lets
 * the governed codebook detect a definition change and bump a version rather
 * than mint a brand-new term (see `./codebook`). When a source has no meaningful
 * label, the adapter sets `label = text`, and identical texts group naturally.
 *
 * Scope note (#1635): this slice mines, scores, and reports candidate terms.
 * Wiring handle-substitution into the serving/assembly path is deferred.
 */

/** One labeled span within a single assembled-context document. */
export interface CorpusSpan {
  /**
   * Stable concept key for the span — a knowledge identifier that survives
   * definition edits (e.g. a comprehension module path, a section heading, a
   * graph node id). When no stable key exists the adapter sets this equal to
   * {@link text}, so identical texts still group.
   */
  label: string;
  /** The span's text — the candidate definition bound to {@link label}. */
  text: string;
}

/** One assembled-context document in the training corpus. */
export interface CorpusDocument {
  /** Document identifier (e.g. a run id / assembled-context id). */
  id: string;
  /** The labeled spans this document contained. */
  spans: readonly CorpusSpan[];
}

/** A mined candidate term: a label that recurs across the corpus, scored. */
export interface MinedTerm {
  /** The stable concept key (see {@link CorpusSpan.label}). */
  label: string;
  /**
   * The canonical definition for this label: the most frequent exact text seen
   * for the label across the corpus (deterministic — ties broken by longest,
   * then lexicographically). This is what a codebook entry binds and expands to.
   */
  definition: string;
  /** Character length of {@link definition}. */
  length: number;
  /**
   * Document frequency: the number of DISTINCT corpus documents that contained
   * this label. Document frequency (not raw occurrence count) so a span repeated
   * many times within one document does not inflate the amortization case.
   */
  frequency: number;
  /**
   * The amortization score `frequency × length` — the quantity #1635 scores
   * membership against a threshold. Larger = more total bytes re-transmitted =
   * a stronger case for binding the span to a short handle.
   */
  frequencyTimesLength: number;
  /**
   * Number of DISTINCT texts observed for this label across the corpus. `> 1`
   * means the definition drifted — the governed-codebook signal that a version
   * bump may be due (jargon's known failure mode; see `./codebook`).
   */
  variants: number;
}

/** Mining configuration. */
export interface MineConfig {
  /**
   * Minimum document frequency for a label to be mined at all. A span seen in
   * fewer than this many documents is not a recurring span. Default: 2.
   */
  minFrequency: number;
  /**
   * Collapse runs of whitespace (incl. newlines) to a single space and trim
   * before grouping, so trivially-reformatted spans still group as one term.
   * Default: true.
   */
  normalizeWhitespace: boolean;
}

/** The default mining configuration. */
export const DEFAULT_MINE_CONFIG: MineConfig = {
  minFrequency: 2,
  normalizeWhitespace: true,
};

/** Normalize a span's text for grouping (whitespace-collapse + trim). */
export function normalizeSpanText(text: string, normalizeWhitespace: boolean): string {
  if (!normalizeWhitespace) return text;
  return text.replace(/\s+/g, ' ').trim();
}

interface LabelAccumulator {
  /** documents this label appeared in (dedup within a doc via the outer guard). */
  documentCount: number;
  /** normalized text -> occurrence count, for canonical-definition selection. */
  textCounts: Map<string, number>;
}

/**
 * Pick the canonical definition for a label: the most frequent normalized text,
 * ties broken by longest then lexicographically. Deterministic for a given
 * corpus (no dependence on Map insertion order for the winner).
 */
function pickCanonical(textCounts: Map<string, number>): string {
  let best: string | undefined;
  let bestCount = -1;
  for (const [text, count] of textCounts) {
    if (
      count > bestCount ||
      (count === bestCount &&
        best !== undefined &&
        (text.length > best.length || (text.length === best.length && text < best)))
    ) {
      best = text;
      bestCount = count;
    }
  }
  return best ?? '';
}

/**
 * Mine recurring spans from a corpus of assembled-context documents.
 *
 * For every label, counts the number of distinct documents it appeared in
 * (document frequency), selects the canonical definition, computes the
 * `frequency × length` amortization score, and returns the candidates that meet
 * {@link MineConfig.minFrequency}, sorted by score descending (deterministic
 * label tiebreak). Pure and total — an empty corpus yields `[]`.
 */
export function mineRecurringSpans(
  corpus: readonly CorpusDocument[],
  config: MineConfig = DEFAULT_MINE_CONFIG
): MinedTerm[] {
  const byLabel = new Map<string, LabelAccumulator>();

  for (const doc of corpus) {
    // Dedup labels within a single document so document frequency is honest.
    const seenInDoc = new Set<string>();
    for (const span of doc.spans) {
      const acc = byLabel.get(span.label) ?? { documentCount: 0, textCounts: new Map() };
      if (!seenInDoc.has(span.label)) {
        acc.documentCount += 1;
        seenInDoc.add(span.label);
      }
      const normalized = normalizeSpanText(span.text, config.normalizeWhitespace);
      acc.textCounts.set(normalized, (acc.textCounts.get(normalized) ?? 0) + 1);
      byLabel.set(span.label, acc);
    }
  }

  const terms: MinedTerm[] = [];
  for (const [label, acc] of byLabel) {
    if (acc.documentCount < config.minFrequency) continue;
    const definition = pickCanonical(acc.textCounts);
    const length = definition.length;
    terms.push({
      label,
      definition,
      length,
      frequency: acc.documentCount,
      frequencyTimesLength: acc.documentCount * length,
      variants: acc.textCounts.size,
    });
  }

  terms.sort(
    (a, b) => b.frequencyTimesLength - a.frequencyTimesLength || a.label.localeCompare(b.label)
  );
  return terms;
}
