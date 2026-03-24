import { describe, it, expect } from 'vitest';
import { ProjectScanner } from '../../src/blueprint/scanner';

describe('ProjectScanner', () => {
  it('should identify project name', async () => {
    const scanner = new ProjectScanner(process.cwd());
    const info = await scanner.scan();
    expect(info.projectName).toBeDefined();
    expect(info.modules.length).toBe(4);
  });
});
