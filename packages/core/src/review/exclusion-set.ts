import type { MechanicalFinding } from './types/mechanical';

/**
 * An index of mechanical findings, queryable by file + line range.
 * Used in Phase 5 (VALIDATE) to determine whether an AI-produced finding
 * overlaps with a mechanical finding and should be excluded.
 */
export class ExclusionSet {
  /** Findings indexed by file path for O(1) file lookup */
  private byFile: Map<string, MechanicalFinding[]>;
  private allFindings: MechanicalFinding[];

  constructor(findings: MechanicalFinding[]) {
    this.allFindings = [...findings];
    this.byFile = new Map();

    for (const f of findings) {
      const existing = this.byFile.get(f.file);
      if (existing) {
        existing.push(f);
      } else {
        this.byFile.set(f.file, [f]);
      }
    }
  }

  /**
   * Returns true if any mechanical finding covers the given file + line range.
   *
   * A mechanical finding "covers" a range if:
   * - The file matches, AND
   * - The finding has no line (file-level finding — covers everything), OR
   * - The finding's line falls within [startLine, endLine] inclusive.
   */
  isExcluded(file: string, lineRange: [number, number]): boolean {
    const fileFindings = this.byFile.get(file);
    if (!fileFindings) return false;

    const [start, end] = lineRange;
    return fileFindings.some((f) => {
      if (f.line === undefined) return true; // file-level finding
      return f.line >= start && f.line <= end;
    });
  }

  /** Number of findings in the set */
  get size(): number {
    return this.allFindings.length;
  }

  /** Returns a copy of all findings */
  getFindings(): MechanicalFinding[] {
    return [...this.allFindings];
  }
}

/**
 * Build an ExclusionSet from mechanical findings.
 */
export function buildExclusionSet(findings: MechanicalFinding[]): ExclusionSet {
  return new ExclusionSet(findings);
}
