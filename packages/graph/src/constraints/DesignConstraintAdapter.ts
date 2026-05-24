import type { GraphStore } from '../store/GraphStore.js';

export interface DesignViolation {
  code: string;
  file: string;
  message: string;
  severity: 'error' | 'warn' | 'info';
  value?: string;
  suggestion?: string;
}

export type DesignStrictness = 'strict' | 'standard' | 'permissive';

/**
 * Generic finding shape accepted by `recordFindings()` — covers ANAT-*
 * (audit-component-anatomy, design-pipeline #2) and CRAFT-*
 * (harness-design-craft, design-pipeline #6) namespaces. Skills convert
 * their internal finding types into this shape before recording.
 */
export interface CraftFindingRecord {
  /** Finding code, e.g. "ANAT-D023", "CRAFT-C001", "CRAFT-P001" */
  code: string;
  /** Project-relative file path (becomes the `file` node id) */
  file: string;
  /** Line number, if known */
  line?: number;
  /** Human-readable message */
  message: string;
  /** Severity at emission time */
  severity: 'error' | 'warn' | 'info';
  /** Optional evidence snippet */
  evidence?: string;
  /** Optional run identifier so #4 verifier can detect fixpoint across runs */
  runId?: string;
}

/**
 * Reserved finding-code prefixes that the adapter recognizes. Used to
 * derive a human-readable `design_rule` node name when one doesn't
 * already exist in the graph.
 */
const CODE_PREFIX_LABELS: Record<string, string> = {
  'ANAT-D': 'Component anatomy (definition)',
  'ANAT-P': 'Component anatomy (pattern presence)',
  'ANAT-U': 'Component anatomy (usage)',
  'CRAFT-C': 'Design craft (critique)',
  'CRAFT-P': 'Design craft (polish)',
  'CRAFT-B': 'Design craft (benchmark)',
  'DESIGN-': 'Design constraint (legacy)',
  'A11Y-': 'Accessibility',
};

export class DesignConstraintAdapter {
  constructor(private readonly store: GraphStore) {}

  checkForHardcodedColors(
    source: string,
    file: string,
    strictness?: DesignStrictness
  ): DesignViolation[] {
    const severity = this.mapSeverity(strictness);

    // Get all color token values from the graph
    const tokenNodes = this.store.findNodes({ type: 'design_token' });
    const colorValues = new Set<string>();
    for (const node of tokenNodes) {
      if (node.metadata.tokenType === 'color' && typeof node.metadata.value === 'string') {
        colorValues.add(node.metadata.value.toLowerCase());
      }
    }

    // Extract hex colors from source
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
    const violations: DesignViolation[] = [];
    let match: RegExpExecArray | null;

    while ((match = hexPattern.exec(source)) !== null) {
      const hexValue = match[0]!;
      if (!colorValues.has(hexValue.toLowerCase())) {
        violations.push({
          code: 'DESIGN-001',
          file,
          message: `Hardcoded color ${hexValue} is not in the design token set`,
          severity,
          value: hexValue,
        });
      }
    }

    return violations;
  }

  checkForHardcodedFonts(
    source: string,
    file: string,
    strictness?: DesignStrictness
  ): DesignViolation[] {
    const severity = this.mapSeverity(strictness);

    // Get all typography token font families from the graph
    const tokenNodes = this.store.findNodes({ type: 'design_token' });
    const fontFamilies = new Set<string>();
    for (const node of tokenNodes) {
      if (node.metadata.tokenType === 'typography') {
        const value = node.metadata.value;
        if (typeof value === 'object' && value !== null && 'fontFamily' in value) {
          fontFamilies.add((value as { fontFamily: string }).fontFamily.toLowerCase());
        }
      }
    }

    // Extract font family names from source
    const fontPatterns = [/fontFamily:\s*['"]([^'"]+)['"]/g, /font-family:\s*['"]([^'"]+)['"]/g];

    const violations: DesignViolation[] = [];
    const seen = new Set<string>();

    for (const pattern of fontPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const fontName = match[1]!;
        if (seen.has(fontName.toLowerCase())) continue;
        seen.add(fontName.toLowerCase());

        if (!fontFamilies.has(fontName.toLowerCase())) {
          violations.push({
            code: 'DESIGN-002',
            file,
            message: `Hardcoded font family "${fontName}" is not in the design token set`,
            severity,
            value: fontName,
          });
        }
      }
    }

    return violations;
  }

  checkAll(source: string, file: string, strictness?: DesignStrictness): DesignViolation[] {
    return [
      ...this.checkForHardcodedColors(source, file, strictness),
      ...this.checkForHardcodedFonts(source, file, strictness),
    ];
  }

  private mapSeverity(strictness: DesignStrictness = 'standard'): DesignViolation['severity'] {
    switch (strictness) {
      case 'permissive':
        return 'info';
      case 'standard':
        return 'warn';
      case 'strict':
        return 'error';
    }
  }

  /**
   * Record externally-computed craft findings (audit-component-anatomy,
   * harness-design-craft, etc.) as graph state. Idempotent — re-running on
   * the same findings produces no duplicate nodes or edges thanks to
   * GraphStore's keyed merge semantics.
   *
   * Each finding becomes:
   *   • a `design_constraint` node keyed by finding code (created lazily
   *     if absent; metadata merged on re-record so the most recent message
   *     / severity wins)
   *   • a `violates_design` edge from the source file (id = file path) to
   *     the constraint node, with per-finding metadata (line, severity,
   *     message, evidence, runId)
   *
   * The file node is NOT created here — it's assumed to already exist in
   * the graph from a prior ingest. If it does not, the edge will still be
   * created (graph stores edges by key, not by referential integrity) and
   * a subsequent ingest will populate the file node.
   */
  recordFindings(findings: readonly CraftFindingRecord[]): {
    constraintsAdded: number;
    edgesAdded: number;
  } {
    let constraintsAdded = 0;
    let edgesAdded = 0;
    const seenConstraintIds = new Set<string>();

    for (const finding of findings) {
      const constraintId = `design_constraint:${finding.code}`;

      // Lazily create the design_constraint node (one per code, regardless of
      // how many files violate it). safeMerge means re-records update metadata.
      if (!seenConstraintIds.has(finding.code)) {
        const existing = this.store.getNode(constraintId);
        if (!existing) constraintsAdded += 1;
        this.store.addNode({
          id: constraintId,
          type: 'design_constraint',
          name: finding.code,
          metadata: {
            code: finding.code,
            label: this.labelForCode(finding.code),
            mostRecentMessage: finding.message,
            mostRecentSeverity: finding.severity,
          },
        });
        seenConstraintIds.add(finding.code);
      }

      // Edge: file --violates_design--> constraint
      const fileId = finding.file;
      const edgeMetadata: Record<string, unknown> = {
        message: finding.message,
        severity: finding.severity,
      };
      if (finding.line !== undefined) edgeMetadata.line = finding.line;
      if (finding.evidence !== undefined) edgeMetadata.evidence = finding.evidence;
      if (finding.runId !== undefined) edgeMetadata.runId = finding.runId;

      // Track whether the edge was new (the store dedupes by from\0to\0type key)
      const before = this.store.getEdges({
        from: fileId,
        to: constraintId,
        type: 'violates_design',
      });
      this.store.addEdge({
        from: fileId,
        to: constraintId,
        type: 'violates_design',
        metadata: edgeMetadata,
      });
      if (before.length === 0) edgesAdded += 1;
    }

    return { constraintsAdded, edgesAdded };
  }

  private labelForCode(code: string): string {
    for (const prefix of Object.keys(CODE_PREFIX_LABELS)) {
      if (code.startsWith(prefix)) return CODE_PREFIX_LABELS[prefix]!;
    }
    return 'Design constraint';
  }
}
