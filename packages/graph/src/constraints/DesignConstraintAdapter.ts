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
}
