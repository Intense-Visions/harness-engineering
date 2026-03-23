import { describe, it, expect } from 'vitest';
import { checkDependenciesDefinition } from '../../../src/mcp/tools/architecture';

describe('check_dependencies tool', () => {
  it('has correct definition', () => {
    expect(checkDependenciesDefinition.name).toBe('check_dependencies');
    expect(checkDependenciesDefinition.inputSchema.required).toContain('path');
  });
});
