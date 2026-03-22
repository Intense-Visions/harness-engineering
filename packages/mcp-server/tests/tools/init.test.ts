import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { initProjectDefinition, handleInitProject } from '../../src/tools/init';

describe('init_project tool', () => {
  it('has correct definition', () => {
    expect(initProjectDefinition.name).toBe('init_project');
    expect(initProjectDefinition.inputSchema.required).toContain('path');
  });

  it('has path, name, level, and framework properties', () => {
    expect(initProjectDefinition.inputSchema.properties).toHaveProperty('path');
    expect(initProjectDefinition.inputSchema.properties).toHaveProperty('name');
    expect(initProjectDefinition.inputSchema.properties).toHaveProperty('level');
    expect(initProjectDefinition.inputSchema.properties).toHaveProperty('framework');
  });

  it('level has correct enum values', () => {
    const level = initProjectDefinition.inputSchema.properties.level as {
      type: string;
      enum: string[];
    };
    expect(level.enum).toContain('basic');
    expect(level.enum).toContain('intermediate');
    expect(level.enum).toContain('advanced');
  });

  it('returns error for invalid path', async () => {
    // Use a path under a file (not a directory) to guarantee write failure
    // on all platforms — package.json is a file, so writing inside it fails
    const invalidPath = join(__dirname, '..', '..', 'package.json', 'nested', 'project');
    const response = await handleInitProject({ path: invalidPath });
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0]!.text).toBeDefined();
  });
});
