import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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

  it('has task and phase lifecycle actions in enum', () => {
    const actionProp = manageStateDefinition.inputSchema.properties.action as {
      type: string;
      enum: string[];
    };
    expect(actionProp.enum).toContain('task-start');
    expect(actionProp.enum).toContain('task-complete');
    expect(actionProp.enum).toContain('phase-start');
    expect(actionProp.enum).toContain('phase-complete');
  });

  it('task-start action returns synced response', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    try {
      const response = await handleManageState({ path: tmpDir, action: 'task-start' });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.synced).toBe(true);
      expect(parsed.trigger).toBe('task-start');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('task-complete action returns synced response', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    try {
      const response = await handleManageState({ path: tmpDir, action: 'task-complete' });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.synced).toBe(true);
      expect(parsed.trigger).toBe('task-complete');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('phase-start action returns synced response', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    try {
      const response = await handleManageState({ path: tmpDir, action: 'phase-start' });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.synced).toBe(true);
      expect(parsed.trigger).toBe('phase-start');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('phase-complete action returns synced response', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    try {
      const response = await handleManageState({ path: tmpDir, action: 'phase-complete' });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.synced).toBe(true);
      expect(parsed.trigger).toBe('phase-complete');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('manage_state session section actions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-tool-session-test-'));
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('read_sections returns empty sections for new session', async () => {
    const response = await handleManageState({
      path: tmpDir,
      action: 'read_sections',
      session: 'test-session',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.terminology).toEqual([]);
    expect(parsed.decisions).toEqual([]);
    expect(parsed.constraints).toEqual([]);
    expect(parsed.risks).toEqual([]);
    expect(parsed.openQuestions).toEqual([]);
    expect(parsed.evidence).toEqual([]);
  });

  it('append_entry creates entry and returns it', async () => {
    const response = await handleManageState({
      path: tmpDir,
      action: 'append_entry',
      session: 'test-session',
      section: 'decisions',
      authorSkill: 'harness-planning',
      content: 'Chose TypeScript for implementation',
    });
    expect(response.isError).toBeFalsy();
    const entry = JSON.parse(response.content[0].text);
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(entry.authorSkill).toBe('harness-planning');
    expect(entry.content).toBe('Chose TypeScript for implementation');
    expect(entry.status).toBe('active');
  });

  it('read_section returns entries after append', async () => {
    await handleManageState({
      path: tmpDir,
      action: 'append_entry',
      session: 'test-session',
      section: 'risks',
      authorSkill: 'harness-brainstorming',
      content: 'Concurrent writes not protected',
    });
    const response = await handleManageState({
      path: tmpDir,
      action: 'read_section',
      session: 'test-session',
      section: 'risks',
    });
    expect(response.isError).toBeFalsy();
    const entries = JSON.parse(response.content[0].text);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('Concurrent writes not protected');
  });

  it('update_entry_status changes entry status', async () => {
    const appendResponse = await handleManageState({
      path: tmpDir,
      action: 'append_entry',
      session: 'test-session',
      section: 'openQuestions',
      authorSkill: 'harness-brainstorming',
      content: 'Should we use Redis?',
    });
    const appendedEntry = JSON.parse(appendResponse.content[0].text);

    const response = await handleManageState({
      path: tmpDir,
      action: 'update_entry_status',
      session: 'test-session',
      section: 'openQuestions',
      entryId: appendedEntry.id,
      newStatus: 'resolved',
    });
    expect(response.isError).toBeFalsy();
    const updated = JSON.parse(response.content[0].text);
    expect(updated.id).toBe(appendedEntry.id);
    expect(updated.status).toBe('resolved');
  });

  it('archive_session archives the session directory', async () => {
    // Ensure session has content
    await handleManageState({
      path: tmpDir,
      action: 'append_entry',
      session: 'test-session',
      section: 'terminology',
      authorSkill: 'harness-brainstorming',
      content: 'Widget: a UI component',
    });
    const response = await handleManageState({
      path: tmpDir,
      action: 'archive_session',
      session: 'test-session',
    });
    expect(response.isError).toBeFalsy();
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.archived).toBe(true);
    // Original session dir should no longer exist
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    expect(fs.existsSync(sessionDir)).toBe(false);
    // Archive dir should exist
    const archiveBase = path.join(tmpDir, '.harness', 'archive', 'sessions');
    expect(fs.existsSync(archiveBase)).toBe(true);
  });
});
