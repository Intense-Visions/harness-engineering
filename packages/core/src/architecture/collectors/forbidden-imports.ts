import type { Collector, ArchConfig, MetricResult, Violation, ConstraintRule } from '../types';
import { violationId, constraintRuleId } from './hash';
import { validateDependencies } from '../../constraints/dependencies';
import type { DependencyViolation } from '../../constraints/types';
import { relativePosix } from '../../shared/fs-utils';
import { getDefaultRegistry } from '../../shared/parsers/registry';

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
    const registry = getDefaultRegistry();
    // Use TypeScript parser as the default single parser for health check,
    // but the registry enables multi-language file resolution
    const parser = registry.getByLanguage('typescript') ?? registry.getByLanguage('javascript');
    const result = await validateDependencies({
      layers: [],
      rootDir,
      parser: parser as import('../../shared/parsers').LanguageParser,
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
