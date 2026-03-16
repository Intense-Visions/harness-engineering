import { describe, it, expect } from 'vitest';
import {
  manageStateDefinition,
  handleManageState,
  manageHandoffDefinition,
  handleManageHandoff,
} from '../../src/tools/state';

describe('manage_state tool', () => {
  it('has correct definition', () => {
    expect(manageStateDefinition.name).toBe('manage_state');
    expect(manageStateDefinition.inputSchema.required).toContain('path');
    expect(manageStateDefinition.inputSchema.required).toContain('action');
  });

  it('has all expected actions in enum', () => {
    const actionProp = manageStateDefinition.inputSchema.properties.action as {
      type: string;
      enum: string[];
    };
    expect(actionProp.enum).toContain('show');
    expect(actionProp.enum).toContain('learn');
    expect(actionProp.enum).toContain('failure');
    expect(actionProp.enum).toContain('archive');
    expect(actionProp.enum).toContain('reset');
    expect(actionProp.enum).toContain('gate');
  });

  it('has optional learning, skillName, outcome, description, failureType properties', () => {
    const props = manageStateDefinition.inputSchema.properties;
    expect(props.learning).toBeDefined();
    expect(props.skillName).toBeDefined();
    expect(props.outcome).toBeDefined();
    expect(props.description).toBeDefined();
    expect(props.failureType).toBeDefined();
  });

  it('show action returns state for nonexistent path (returns default state)', async () => {
    const response = await handleManageState({ path: '/nonexistent/project', action: 'show' });
    expect(response.content).toHaveLength(1);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.decisions).toEqual([]);
    expect(parsed.blockers).toEqual([]);
  });

  it('learn action returns error when learning is missing', async () => {
    const response = await handleManageState({ path: '/nonexistent/project', action: 'learn' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('learning is required');
  });

  it('failure action returns error when description is missing', async () => {
    const response = await handleManageState({ path: '/nonexistent/project', action: 'failure' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('description is required');
  });

  it('failure action returns error when failureType is missing', async () => {
    const response = await handleManageState({
      path: '/nonexistent/project',
      action: 'failure',
      description: 'Something went wrong',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('failureType is required');
  });

  it('archive action succeeds even with no failures file', async () => {
    const response = await handleManageState({ path: '/nonexistent/project', action: 'archive' });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.archived).toBe(true);
  });
});

describe('manage_handoff tool', () => {
  it('has correct definition', () => {
    expect(manageHandoffDefinition.name).toBe('manage_handoff');
    expect(manageHandoffDefinition.inputSchema.required).toContain('path');
    expect(manageHandoffDefinition.inputSchema.required).toContain('action');
  });

  it('has save and load in action enum', () => {
    const actionProp = manageHandoffDefinition.inputSchema.properties.action as {
      type: string;
      enum: string[];
    };
    expect(actionProp.enum).toContain('save');
    expect(actionProp.enum).toContain('load');
  });

  it('has optional handoff property', () => {
    expect(manageHandoffDefinition.inputSchema.properties.handoff).toBeDefined();
  });

  it('load action returns null for nonexistent handoff', async () => {
    const response = await handleManageHandoff({ path: '/nonexistent/project', action: 'load' });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toBeNull();
  });

  it('save action returns error when handoff is missing', async () => {
    const response = await handleManageHandoff({ path: '/nonexistent/project', action: 'save' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('handoff is required');
  });
});
