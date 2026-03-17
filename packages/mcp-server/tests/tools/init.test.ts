import { describe, it, expect } from 'vitest';
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

  it('returns error for nonexistent path', async () => {
    const response = await handleInitProject({ path: '/nonexistent/project' });
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toBeDefined();
  });
});
