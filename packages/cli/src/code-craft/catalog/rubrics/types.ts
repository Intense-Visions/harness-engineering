import type { UnitKind } from '../../findings/schema.js';

export type { UnitKind };

export interface CodeRubric {
  id: string;
  title: string;
  description: string;
  source: string;
  /** Unit kinds this rubric is critique-relevant for. */
  appliesToKinds: ReadonlyArray<UnitKind>;
  contribution: { addedAt: string; addedBy: string };
  signal: { invocations: number; suppressedAt: string[] };
  version: number;
}

/**
 * Returns true if the rubric should be invoked for the given unit kind.
 * Pre-filtering avoids LLM calls that would return null anyway (the analogue
 * of security-craft's appliesToSignals gate and docs-craft's rubricsForKind).
 */
export function rubricApplies(rubric: CodeRubric, kind: UnitKind): boolean {
  return rubric.appliesToKinds.includes(kind);
}
