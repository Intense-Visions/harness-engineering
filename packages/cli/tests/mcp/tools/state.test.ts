import { describe, it, expect } from 'vitest';
import { manageStateDefinition, handleManageState } from '../../../src/mcp/tools/state';

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

  it('has save-handoff and load-handoff in action enum', () => {
    const actionProp = manageStateDefinition.inputSchema.properties.action as {
      type: string;
      enum: string[];
    };
    expect(actionProp.enum).toContain('save-handoff');
    expect(actionProp.enum).toContain('load-handoff');
  });

  it('has optional handoff property', () => {
    expect(manageStateDefinition.inputSchema.properties.handoff).toBeDefined();
  });

  it('load-handoff action returns null for nonexistent handoff', async () => {
    const response = await handleManageState({
      path: '/nonexistent/project',
      action: 'load-handoff',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toBeNull();
  });

  it('save-handoff action returns error when handoff is missing', async () => {
    const response = await handleManageState({
      path: '/nonexistent/project',
      action: 'save-handoff',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('handoff is required');
  });

  it('has session section actions in enum', () => {
    const actionProp = manageStateDefinition.inputSchema.properties.action as {
      type: string;
      enum: string[];
    };
    expect(actionProp.enum).toContain('append_entry');
    expect(actionProp.enum).toContain('update_entry_status');
    expect(actionProp.enum).toContain('read_section');
    expect(actionProp.enum).toContain('read_sections');
    expect(actionProp.enum).toContain('archive_session');
  });

  it('has session section input properties', () => {
    const props = manageStateDefinition.inputSchema.properties;
    expect(props.section).toBeDefined();
    expect(props.authorSkill).toBeDefined();
    expect(props.content).toBeDefined();
    expect(props.entryId).toBeDefined();
    expect(props.newStatus).toBeDefined();
  });

  it('append_entry returns error when session is missing', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'append_entry',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('session is required');
  });

  it('append_entry returns error when section is missing', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'append_entry',
      session: 'test-session',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('section is required');
  });

  it('append_entry returns error when authorSkill is missing', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'append_entry',
      session: 'test-session',
      section: 'decisions',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('authorSkill is required');
  });

  it('append_entry returns error when content is missing', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'append_entry',
      session: 'test-session',
      section: 'decisions',
      authorSkill: 'harness-planning',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('content is required');
  });

  it('update_entry_status returns error when session is missing', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'update_entry_status',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('session is required');
  });

  it('update_entry_status returns error when entryId is missing', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'update_entry_status',
      session: 'test-session',
      section: 'decisions',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('entryId is required');
  });

  it('update_entry_status returns error when newStatus is missing', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'update_entry_status',
      session: 'test-session',
      section: 'decisions',
      entryId: 'abc123',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('newStatus is required');
  });

  it('read_section returns error when session is missing', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'read_section',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('session is required');
  });

  it('read_section returns error when section is missing', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'read_section',
      session: 'test-session',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('section is required');
  });

  it('read_sections returns error when session is missing', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'read_sections',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('session is required');
  });

  it('archive_session returns error when session is missing', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'archive_session',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('session is required');
  });
});
