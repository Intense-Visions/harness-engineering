export interface DocsRubric {
  id: string;
  title: string;
  description: string;
  /** Doc kinds this rubric applies to. `'*'` means every discovered doc. */
  appliesTo: ReadonlyArray<DocKind> | ['*'];
  source: string;
  contribution: { addedAt: string; addedBy: string };
  signal: { invocations: number; suppressedAt: string[] };
  version: number;
}

/**
 * Coarse classification of a discovered documentation file. Used to filter
 * rubrics (an API-reference rubric should not fire on a narrative guide) and
 * to shape the critique prompt.
 */
export type DocKind = 'reference' | 'guide' | 'readme' | 'prose';
