import { describe, it, expect } from 'vitest';
import {
  addComponentDefinition,
  handleAddComponent,
  runAgentTaskDefinition,
  handleRunAgentTask,
} from '../../src/tools/agent';

describe('add_component tool', () => {
  it('has correct definition', () => {
    expect(addComponentDefinition.name).toBe('add_component');
    expect(addComponentDefinition.inputSchema.required).toContain('path');
    expect(addComponentDefinition.inputSchema.required).toContain('type');
    expect(addComponentDefinition.inputSchema.required).toContain('name');
  });

  it('type has correct enum values', () => {
    const typeProp = addComponentDefinition.inputSchema.properties.type as {
      type: string;
      enum: string[];
    };
    expect(typeProp.enum).toContain('layer');
    expect(typeProp.enum).toContain('doc');
    expect(typeProp.enum).toContain('component');
  });

  it('returns error for invalid type', async () => {
    const response = await handleAddComponent({
      path: '/nonexistent/project',
      type: 'invalid' as 'layer',
      name: 'test',
    });
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toContain('Invalid component type');
  });

  it('returns error when command fails for nonexistent project', async () => {
    const response = await handleAddComponent({
      path: '/nonexistent/project',
      type: 'layer',
      name: 'test',
    });
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toContain('add_component failed');
  });
});

describe('run_agent_task tool', () => {
  it('has correct definition', () => {
    expect(runAgentTaskDefinition.name).toBe('run_agent_task');
    expect(runAgentTaskDefinition.inputSchema.required).toContain('task');
  });

  it('has task, path, and timeout properties', () => {
    expect(runAgentTaskDefinition.inputSchema.properties).toHaveProperty('task');
    expect(runAgentTaskDefinition.inputSchema.properties).toHaveProperty('path');
    expect(runAgentTaskDefinition.inputSchema.properties).toHaveProperty('timeout');
  });

  it('returns error for invalid task name', async () => {
    const response = await handleRunAgentTask({
      task: 'not-a-real-task',
      path: '/nonexistent/project',
    });
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toContain('Invalid task');
  });

  it('returns error for nonexistent project with valid task', async () => {
    const response = await handleRunAgentTask({
      task: 'review',
      path: '/nonexistent/project',
    });
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toContain('run_agent_task failed');
  });
});
