import type { Convention, StructureValidation } from './types';
import type { Result } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import { Ok } from '../shared/result';
import { findFiles } from '../shared/fs-utils';

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

  // Calculate conformance
  const conformance = totalRequired === 0 ? 100 : (foundRequired / totalRequired) * 100;

  const validation: StructureValidation = {
    valid: missing.length === 0,
    missing,
    unexpected,
    conformance,
  };

  return Ok(validation);
}
