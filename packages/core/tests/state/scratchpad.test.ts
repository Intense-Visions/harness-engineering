import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { writeScratchpad, readScratchpad, clearScratchpad } from '../../src/state/scratchpad';

describe('scratchpad', () => {
  let tmpDir: string;
  const session = 'test-session';
  const phase = 'planning';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-scratchpad-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  describe('writeScratchpad', () => {
    it('writes content and returns absolute path', () => {
      const opts = { session, phase, projectPath: tmpDir };
      const result = writeScratchpad(opts, 'research.md', '# Research notes');

      expect(path.isAbsolute(result)).toBe(true);
      expect(result).toContain(
        path.join('.harness', 'sessions', session, 'scratchpad', phase, 'research.md')
      );
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.readFileSync(result, 'utf-8')).toBe('# Research notes');
    });

    it('creates nested directories if they do not exist', () => {
      const opts = { session, phase: 'deep/nested', projectPath: tmpDir };
      const result = writeScratchpad(opts, 'notes.md', 'content');
      expect(fs.existsSync(result)).toBe(true);
    });

    it('overwrites existing file', () => {
      const opts = { session, phase, projectPath: tmpDir };
      writeScratchpad(opts, 'data.md', 'version 1');
      writeScratchpad(opts, 'data.md', 'version 2');
      const content = fs.readFileSync(
        path.join(tmpDir, '.harness', 'sessions', session, 'scratchpad', phase, 'data.md'),
        'utf-8'
      );
      expect(content).toBe('version 2');
    });
  });

  describe('readScratchpad', () => {
    it('returns content when file exists', () => {
      const opts = { session, phase, projectPath: tmpDir };
      writeScratchpad(opts, 'existing.md', 'hello');
      const content = readScratchpad(opts, 'existing.md');
      expect(content).toBe('hello');
    });

    it('returns null when file does not exist', () => {
      const opts = { session, phase, projectPath: tmpDir };
      const content = readScratchpad(opts, 'nonexistent.md');
      expect(content).toBeNull();
    });
  });

  describe('clearScratchpad', () => {
    it('deletes the phase scratchpad directory', () => {
      const opts = { session, phase, projectPath: tmpDir };
      writeScratchpad(opts, 'file1.md', 'content1');
      writeScratchpad(opts, 'file2.md', 'content2');

      const phaseDir = path.join(tmpDir, '.harness', 'sessions', session, 'scratchpad', phase);
      expect(fs.existsSync(phaseDir)).toBe(true);

      clearScratchpad(opts);
      expect(fs.existsSync(phaseDir)).toBe(false);
    });

    it('does not throw when directory does not exist', () => {
      const opts = { session, phase: 'nonexistent', projectPath: tmpDir };
      expect(() => clearScratchpad(opts)).not.toThrow();
    });

    it('does not delete other phase directories', () => {
      const opts1 = { session, phase: 'phase1', projectPath: tmpDir };
      const opts2 = { session, phase: 'phase2', projectPath: tmpDir };
      writeScratchpad(opts1, 'file.md', 'content1');
      writeScratchpad(opts2, 'file.md', 'content2');

      clearScratchpad(opts1);

      const phase2Dir = path.join(tmpDir, '.harness', 'sessions', session, 'scratchpad', 'phase2');
      expect(fs.existsSync(phase2Dir)).toBe(true);
    });
  });

  describe('path traversal protection', () => {
    it('rejects filenames with path traversal', () => {
      const opts = { session, phase, projectPath: tmpDir };
      expect(() => writeScratchpad(opts, '../../etc/passwd', 'malicious')).toThrow(
        'must not escape scratchpad directory'
      );
    });

    it('rejects filenames with path traversal on read', () => {
      const opts = { session, phase, projectPath: tmpDir };
      expect(() => readScratchpad(opts, '../../../.env')).toThrow(
        'must not escape scratchpad directory'
      );
    });
  });
});
