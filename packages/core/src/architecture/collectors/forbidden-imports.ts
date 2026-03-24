import { relative } from 'node:path';
import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { validateDependencies } from '../../constraints/dependencies';
import type { DependencyViolation } from '../../constraints/types';

export class ForbiddenImportCollector implements Collector {
  readonly category = 'forbidden-imports' as const;

  getRules(_config: ArchConfig, _rootDir: string): ConstraintRule[] {
    const description = 'No forbidden imports allowed';
    return [
      {
        id: constraintRuleId(this.category, 'project', description),
        category: this.category,
        description,
        scope: 'project',
      },
    ];
  }

  async collect(_config: ArchConfig, rootDir: string): Promise<MetricResult[]> {
    const result = await validateDependencies({
      layers: [],
      rootDir,
      parser: {
        name: 'typescript',
        extensions: ['.ts', '.tsx'],
        parseFile: async () => ({ ok: false, error: { code: 'PARSE_ERROR', message: '' } }) as any,
        extractImports: () => ({ ok: false, error: { code: 'EXTRACT_ERROR', message: '' } }) as any,
        extractExports: () => ({ ok: false, error: { code: 'EXTRACT_ERROR', message: '' } }) as any,
        health: async () => ({ ok: true, value: { available: true } }) as any,
      },
      fallbackBehavior: 'skip',
    });

    if (!result.ok) {
      return [
        {
          category: this.category,
          scope: 'project',
          value: 0,
          violations: [],
          metadata: { error: 'Failed to validate dependencies' },
        },
      ];
    }

    const forbidden = result.value.violations.filter(
      (v: DependencyViolation) => v.reason === 'FORBIDDEN_IMPORT'
    );

    const violations: Violation[] = forbidden.map((v: DependencyViolation) => {
      const relFile = relative(rootDir, v.file);
      const relImport = relative(rootDir, v.imports);
      const detail = `forbidden import: ${relFile} -> ${relImport}`;
      return {
        id: violationId(relFile, this.category, detail),
        file: relFile,
        detail,
        severity: 'error' as const,
      };
    });

    return [
      {
        category: this.category,
        scope: 'project',
        value: violations.length,
        violations,
      },
    ];
  }
}
