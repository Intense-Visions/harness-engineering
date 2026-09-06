import type { Convention, StructureValidation } from './types';
import type { Result } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import { Ok } from '../shared/result';
import { findFiles } from '../shared/fs-utils';
import { denominate } from '../metrics';

export async function validateFileStructure(
  projectPath: string,
  conventions: Convention[]
): Promise<Result<StructureValidation, ValidationError>> {
  const missing: string[] = [];
  const unexpected: string[] = [];
  let foundRequired = 0;
  const totalRequired = conventions.filter((c) => c.required).length;

  // Check each convention
  for (const convention of conventions) {
    const files = await findFiles(convention.pattern, projectPath);

    if (convention.required) {
      if (files.length === 0) {
        missing.push(convention.pattern);
      } else {
        foundRequired++;
      }
    }
  }

  // Conformance is a percentage OF the required conventions — so when there are
  // no required conventions there is no population, and no percentage (#1530).
  // This used to be `totalRequired === 0 ? 100 : ...`, which reported a perfect
  // 100% conformance for a project that had configured nothing to conform to:
  // "we checked nothing" was indistinguishable from "everything passed", and it
  // was the reassuring one of the two. A zero denominator is an abstention.
  const coverage = denominate({
    metric: 'validation.file_structure_conformance',
    numerator: foundRequired,
    denominator: totalRequired,
    population: {
      definition: 'file-structure conventions marked required',
      source: 'the project configuration',
    },
    unit: 'percent',
  });

  const validation: StructureValidation = {
    // An empty required-convention set cannot make the structure valid — there
    // was no structure requirement to satisfy. `valid` now says so rather than
    // inheriting the vacuous truth of `[].every()`.
    valid: coverage.basis === 'measured' && missing.length === 0,
    missing,
    unexpected,
    conformance: coverage.value,
    abstained: coverage.basis !== 'measured',
  };

  return Ok(validation);
}
