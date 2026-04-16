import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  handleManageState,
  handleListStreams,
  listStreamsDefinition,
} from '../../../src/mcp/tools/state';

describe('handleManageState — additional coverage', () => {
  it('returns error for unknown action', async () => {
    const response = await handleManageState({
      path: '/tmp/test-project',
      action: 'nonexistent_action',
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('unknown action');
  });

  it('returns error when sanitizePath rejects filesystem root', async () => {
    const response = await handleManageState({ path: '/', action: 'show' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('Error');
  });

  describe('reset action', () => {
    let tmpDir: string;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-reset-'));
      fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
    });
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('resets state to default', async () => {
      const response = await handleManageState({ path: tmpDir, action: 'reset' });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.reset).toBe(true);
    });
  });

  describe('gate action', () => {
    let tmpDir: string;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-gate-'));
      fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify({ name: 'test' }));
    });
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('runs gate check without error', async () => {
      const response = await handleManageState({ path: tmpDir, action: 'gate' });
      // Gate check may fail (no test/lint commands), but should not throw
      expect(response.content).toHaveLength(1);
    });
  });

  describe('learn action with all fields', () => {
    let tmpDir: string;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-learn-'));
      fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
    });
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('records a learning successfully', async () => {
      const response = await handleManageState({
        path: tmpDir,
        action: 'learn',
        learning: 'Always validate inputs',
        skillName: 'test-skill',
        outcome: 'Prevented XSS attack',
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.recorded).toBe(true);
    });
  });

  describe('failure action with all fields', () => {
    let tmpDir: string;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-failure-'));
      fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
    });
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('records a failure successfully', async () => {
      const response = await handleManageState({
        path: tmpDir,
        action: 'failure',
        description: 'Test failed',
        failureType: 'test-failure',
        skillName: 'test-skill',
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.recorded).toBe(true);
    });
  });

  describe('update_entry_status missing section', () => {
    it('returns error when section is missing', async () => {
      const response = await handleManageState({
        path: '/tmp/test-project',
        action: 'update_entry_status',
        session: 'test-session',
      });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('section is required');
    });
  });
});

describe('list_streams tool', () => {
  describe('definition', () => {
    it('has correct name', () => {
      expect(listStreamsDefinition.name).toBe('list_streams');
    });

    it('requires path', () => {
      expect(listStreamsDefinition.inputSchema.required).toContain('path');
    });
  });

  describe('handler', () => {
    it('returns streams data for nonexistent path (empty streams)', async () => {
      const response = await handleListStreams({ path: '/nonexistent/project-streams' });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('streams');
    });

    it('returns error for filesystem root path', async () => {
      const response = await handleListStreams({ path: '/' });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Error');
    });

    let tmpDir: string;

    it('returns streams from a real project dir', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streams-test-'));
      fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
      try {
        const response = await handleListStreams({ path: tmpDir });
        expect(response.isError).toBeFalsy();
        const parsed = JSON.parse(response.content[0].text);
        expect(parsed).toHaveProperty('activeStream');
        expect(parsed).toHaveProperty('streams');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
