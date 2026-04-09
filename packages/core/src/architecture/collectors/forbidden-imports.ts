import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { validateDependencies } from '../../constraints/dependencies';
import type { DependencyViolation } from '../../constraints/types';
import { relativePosix } from '../../shared/fs-utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub parser; real wiring deferred
function makeForbiddenStubParser(): any {
  return {
    name: 'typescript',
    extensions: ['.ts', '.tsx'],
    parseFile: async () => ({ ok: false, error: { code: 'PARSE_ERROR', message: '' } }),
    extractImports: () => ({ ok: false, error: { code: 'EXTRACT_ERROR', message: '' } }),
    extractExports: () => ({ ok: false, error: { code: 'EXTRACT_ERROR', message: '' } }),
    health: async () => ({ ok: true, value: { available: true } }),
  };
}

function mapForbiddenImportViolations(
  forbidden: DependencyViolation[],
  rootDir: string,
  category: Violation['category']
): Violation[] {
  return forbidden.map((v) => {
    const relFile = relativePosix(rootDir, v.file);
    const relImport = relativePosix(rootDir, v.imports);
    const detail = `forbidden import: ${relFile} -> ${relImport}`;
    return {
      id: violationId(relFile, category ?? '', detail),
      file: relFile,
      category,
      detail,
      severity: 'error' as const,
    };
  });
}

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
      parser: makeForbiddenStubParser(),
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

    const violations = mapForbiddenImportViolations(
      result.value.violations.filter((v: DependencyViolation) => v.reason === 'FORBIDDEN_IMPORT'),
      rootDir,
      this.category
    );

    return [{ category: this.category, scope: 'project', value: violations.length, violations }];
  }
}
