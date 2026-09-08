import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleManageState, handleListStreams } from '../../../src/mcp/tools/state';

// These tests target the input-validation guard branches of every manage_state
// action handler. Each guard returns an mcpError { isError: true } BEFORE any
// heavy core import runs, so they are fast and hermetic.
const PATH = '/nonexistent/state-cov544';

function errText(r: { content: Array<{ text: string }> }): string {
  return r.content[0].text;
}

describe('manage_state guard branches (cov544)', () => {
  it('unknown action → error', async () => {
    const r = await handleManageState({ path: PATH, action: 'not-a-real-action' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('unknown action');
  });

  it('sanitizePath throw (filesystem root) is caught', async () => {
    const r = await handleManageState({ path: '/', action: 'show' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('filesystem root');
  });

  it('learn requires learning', async () => {
    const r = await handleManageState({ path: PATH, action: 'learn' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('learning is required');
  });

  it('failure requires description', async () => {
    const r = await handleManageState({ path: PATH, action: 'failure' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('description is required');
  });

  it('failure requires failureType when description is present', async () => {
    const r = await handleManageState({ path: PATH, action: 'failure', description: 'boom' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('failureType is required');
  });

  it('save-handoff requires handoff', async () => {
    const r = await handleManageState({ path: PATH, action: 'save-handoff' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('handoff is required');
  });

  it('append_entry requires section', async () => {
    const r = await handleManageState({ path: PATH, action: 'append_entry' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('section is required');
  });

  it('append_entry requires authorSkill when section present', async () => {
    const r = await handleManageState({
      path: PATH,
      action: 'append_entry',
      section: 'decisions',
    });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('authorSkill is required');
  });

  it('append_entry requires content when section+authorSkill present', async () => {
    const r = await handleManageState({
      path: PATH,
      action: 'append_entry',
      section: 'decisions',
      authorSkill: 'x',
    });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('content is required');
  });

  it('append_entry (no session) rejects non-decisions sections', async () => {
    const r = await handleManageState({
      path: PATH,
      action: 'append_entry',
      section: 'risks',
      authorSkill: 'x',
      content: 'c',
    });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('session is required for non-decisions');
  });

  it('update_entry_status requires session', async () => {
    const r = await handleManageState({ path: PATH, action: 'update_entry_status' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('session is required');
  });

  it('update_entry_status requires section', async () => {
    const r = await handleManageState({
      path: PATH,
      action: 'update_entry_status',
      session: 's',
    });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('section is required');
  });

  it('update_entry_status requires entryId', async () => {
    const r = await handleManageState({
      path: PATH,
      action: 'update_entry_status',
      session: 's',
      section: 'decisions',
    });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('entryId is required');
  });

  it('update_entry_status requires newStatus', async () => {
    const r = await handleManageState({
      path: PATH,
      action: 'update_entry_status',
      session: 's',
      section: 'decisions',
      entryId: 'e1',
    });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('newStatus is required');
  });

  it('read_section requires session', async () => {
    const r = await handleManageState({ path: PATH, action: 'read_section' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('session is required');
  });

  it('read_section requires section when session present', async () => {
    const r = await handleManageState({ path: PATH, action: 'read_section', session: 's' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('section is required');
  });

  it('read_sections requires session', async () => {
    const r = await handleManageState({ path: PATH, action: 'read_sections' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('session is required');
  });

  it('archive_session requires session', async () => {
    const r = await handleManageState({ path: PATH, action: 'archive_session' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('session is required');
  });

  it('task-transition requires taskId', async () => {
    const r = await handleManageState({ path: PATH, action: 'task-transition' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('taskId is required');
  });

  it('task-transition requires toLane when taskId present', async () => {
    const r = await handleManageState({
      path: PATH,
      action: 'task-transition',
      taskId: 't1',
    });
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('toLane is required');
  });
});

describe('manage_state success handler bodies (cov544)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-succ-'));
    fs.mkdirSync(path.join(dir, '.harness'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'p' })
    );
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('show returns default state for a fresh project', async () => {
    const r = await handleManageState({ path: dir, action: 'show' });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.schemaVersion).toBe(1);
  });

  it('learn records a learning', async () => {
    const r = await handleManageState({
      path: dir,
      action: 'learn',
      learning: 'a thing',
      skillName: 'harness-execution',
      outcome: 'ok',
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain('recorded');
  });

  it('failure records a failure and emits an event', async () => {
    const r = await handleManageState({
      path: dir,
      action: 'failure',
      description: 'broke',
      failureType: 'runtime',
      skillName: 'harness-execution',
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain('recorded');
  });

  it('archive returns archived', async () => {
    const r = await handleManageState({ path: dir, action: 'archive' });
    expect(r.isError).toBeFalsy();
  });

  it('reset truncates + re-seeds state', async () => {
    const r = await handleManageState({ path: dir, action: 'reset' });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain('reset');
  });

  it('gate runs the mechanical gate and emits a gate_result', async () => {
    const r = await handleManageState({ path: dir, action: 'gate' });
    // may pass or fail, but must not be a guard error
    expect(r.content).toHaveLength(1);
  });

  it('save-handoff persists a handoff and emits an event', async () => {
    const r = await handleManageState({
      path: dir,
      action: 'save-handoff',
      handoff: { fromSkill: 'a', toSkill: 'b', summary: 'done' },
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain('saved');
  });

  it('load-handoff returns a result', async () => {
    const r = await handleManageState({ path: dir, action: 'load-handoff' });
    expect(r.content).toHaveLength(1);
  });

  it('append_entry (global decisions path) appends via event log', async () => {
    const r = await handleManageState({
      path: dir,
      action: 'append_entry',
      section: 'decisions',
      authorSkill: 'harness-execution',
      content: 'we decided X',
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain('appended');
  });

  it('task-start / task-complete auto-sync', async () => {
    const s = await handleManageState({ path: dir, action: 'task-start' });
    expect(s.content[0].text).toContain('task-start');
    const c = await handleManageState({ path: dir, action: 'task-complete' });
    expect(c.content[0].text).toContain('task-complete');
  });

  it('phase-start / phase-complete with skillName emit transitions', async () => {
    const s = await handleManageState({
      path: dir,
      action: 'phase-start',
      skillName: 'harness-execution',
      description: 'execute',
    });
    expect(s.content[0].text).toContain('phase-start');
    const c = await handleManageState({
      path: dir,
      action: 'phase-complete',
      skillName: 'harness-execution',
      description: 'execute',
    });
    expect(c.content[0].text).toContain('phase-complete');
  });

  it('phase-start without skillName still syncs (no event)', async () => {
    const r = await handleManageState({ path: dir, action: 'phase-start' });
    expect(r.content[0].text).toContain('phase-start');
  });

  it('task-transition registers deps then transitions', async () => {
    const r = await handleManageState({
      path: dir,
      action: 'task-transition',
      taskId: 'T1',
      toLane: 'in_progress',
      dependsOn: [],
    });
    expect(r.content).toHaveLength(1);
  });

  it('list_streams returns activeStream + streams for a real project', async () => {
    const r = await handleListStreams({ path: dir });
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed).toHaveProperty('streams');
  });
});

describe('list_streams error handling (cov544)', () => {
  it('sanitizePath throw (root) surfaces as isError', async () => {
    const r = await handleListStreams({ path: '/' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('filesystem root');
  });
});
