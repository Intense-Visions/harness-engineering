import type { Fix, FixType } from '../types';

export interface ForbiddenImportViolation {
  file: string;
  line: number;
  forbiddenImport: string;
  alternative?: string;
}

/**
 * Create fixes for forbidden imports that have a configured alternative
 */
export function createForbiddenImportFixes(violations: ForbiddenImportViolation[]): Fix[] {
  return violations
    .filter((v) => v.alternative !== undefined)
    .map((v) => ({
      type: 'forbidden-import-replacement' as FixType,
      file: v.file,
      description: `Replace forbidden import '${v.forbiddenImport}' with '${v.alternative}'`,
      action: 'replace' as const,
      line: v.line,
      oldContent: `from '${v.forbiddenImport}'`,
      newContent: `from '${v.alternative}'`,
      safe: true as const,
      reversible: true,
    }));
}
