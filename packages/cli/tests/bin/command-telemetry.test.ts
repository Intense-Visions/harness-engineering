import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import {
  installCommandTelemetry,
  truncateAdoptionFile,
  _findProjectRoot,
  _resolveCommandName,
  _writeCommandRecordSync,
  _flushTelemetryBackground,
  _resetForTest,
} from '../../src/bin/command-telemetry';

const TEST_ROOT = path.join(import.meta.dirname, '__test-tmp-command-telemetry__');

function ensureClean(): void {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_ROOT, { recursive: true });
}

describe('command-telemetry', () => {
  beforeEach(() => {
    ensureClean();
    _resetForTest();
  });

  afterEach(() => {
    if (fs.existsSync(TEST_ROOT)) {
      fs.rmSync(TEST_ROOT, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('findProjectRoot', () => {
    it('finds project root with harness.config.json', () => {
      const projectDir = path.join(TEST_ROOT, 'project');
      const subDir = path.join(projectDir, 'packages', 'cli');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'harness.config.json'), '{}');

      expect(_findProjectRoot(subDir)).toBe(projectDir);
    });

    it('falls back to cwd when no config found', () => {
      // Use /tmp to avoid finding the real harness.config.json
      const dir = path.join('/tmp', '__harness-test-no-config__');
      fs.mkdirSync(dir, { recursive: true });
      try {
        expect(_findProjectRoot(dir)).toBe(dir);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('resolveCommandName', () => {
    it('returns cli/ prefixed name for top-level command', () => {
      const program = new Command('harness');
      const sub = program.command('validate');

      expect(_resolveCommandName(sub)).toBe('cli/validate');
    });

    it('returns dotted name for nested commands', () => {
      const program = new Command('harness');
      const hooks = program.command('hooks');
      const init = hooks.command('init');

      expect(_resolveCommandName(init)).toBe('cli/hooks.init');
    });

    it('returns empty string for root command with name harness', () => {
      const program = new Command('harness');

      expect(_resolveCommandName(program)).toBe('');
    });
  });

  describe('writeCommandRecordSync', () => {
    it('writes adoption record to adoption.jsonl', () => {
      const projectDir = path.join(TEST_ROOT, 'write-test');
      fs.mkdirSync(projectDir, { recursive: true });

      _writeCommandRecordSync(projectDir, 'cli/validate', 1500, 'completed');

      const adoptionFile = path.join(projectDir, '.harness', 'metrics', 'adoption.jsonl');
      expect(fs.existsSync(adoptionFile)).toBe(true);

      const content = fs.readFileSync(adoptionFile, 'utf-8').trim();
      const record = JSON.parse(content);

      expect(record.skill).toBe('cli/validate');
      expect(record.duration).toBe(1500);
      expect(record.outcome).toBe('completed');
      expect(record.phasesReached).toEqual([]);
      expect(record.session).toMatch(/^cli-\d+$/);
      expect(record.startedAt).toBeTruthy();
    });

    it('appends multiple records', () => {
      const projectDir = path.join(TEST_ROOT, 'append-test');
      fs.mkdirSync(projectDir, { recursive: true });

      _writeCommandRecordSync(projectDir, 'cli/validate', 100, 'completed');
      _writeCommandRecordSync(projectDir, 'cli/cleanup', 200, 'failed');

      const adoptionFile = path.join(projectDir, '.harness', 'metrics', 'adoption.jsonl');
      const lines = fs.readFileSync(adoptionFile, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).skill).toBe('cli/validate');
      expect(JSON.parse(lines[1]!).skill).toBe('cli/cleanup');
    });

    it('silently handles write errors', () => {
      // Pass a path that can't be created (file as directory)
      const blockingFile = path.join(TEST_ROOT, 'blocking');
      fs.writeFileSync(blockingFile, 'not a dir');

      // Should not throw
      expect(() => {
        _writeCommandRecordSync(path.join(blockingFile, 'nested'), 'cli/test', 100, 'completed');
      }).not.toThrow();
    });
  });

  describe('flushTelemetryBackground', () => {
    it('skips when no adoption.jsonl exists', () => {
      const projectDir = path.join(TEST_ROOT, 'no-adoption');
      fs.mkdirSync(projectDir, { recursive: true });

      const spawnSpy = vi.spyOn(require('node:child_process'), 'spawn');

      _flushTelemetryBackground(projectDir);

      expect(spawnSpy).not.toHaveBeenCalled();
    });

    it('skips when telemetry is disabled in config', () => {
      const projectDir = path.join(TEST_ROOT, 'disabled');
      const metricsDir = path.join(projectDir, '.harness', 'metrics');
      fs.mkdirSync(metricsDir, { recursive: true });
      fs.writeFileSync(path.join(metricsDir, 'adoption.jsonl'), '{"test":true}\n');
      fs.writeFileSync(
        path.join(projectDir, 'harness.config.json'),
        JSON.stringify({ telemetry: { enabled: false } })
      );

      const spawnSpy = vi.spyOn(require('node:child_process'), 'spawn');

      _flushTelemetryBackground(projectDir);

      expect(spawnSpy).not.toHaveBeenCalled();
    });

    it('skips when DO_NOT_TRACK=1', () => {
      const projectDir = path.join(TEST_ROOT, 'dnt');
      const metricsDir = path.join(projectDir, '.harness', 'metrics');
      fs.mkdirSync(metricsDir, { recursive: true });
      fs.writeFileSync(path.join(metricsDir, 'adoption.jsonl'), '{"test":true}\n');

      const orig = process.env.DO_NOT_TRACK;
      process.env.DO_NOT_TRACK = '1';

      const spawnSpy = vi.spyOn(require('node:child_process'), 'spawn');

      try {
        _flushTelemetryBackground(projectDir);
        expect(spawnSpy).not.toHaveBeenCalled();
      } finally {
        if (orig === undefined) delete process.env.DO_NOT_TRACK;
        else process.env.DO_NOT_TRACK = orig;
      }
    });

    it('skips when HARNESS_TELEMETRY_OPTOUT=1', () => {
      const projectDir = path.join(TEST_ROOT, 'optout');
      const metricsDir = path.join(projectDir, '.harness', 'metrics');
      fs.mkdirSync(metricsDir, { recursive: true });
      fs.writeFileSync(path.join(metricsDir, 'adoption.jsonl'), '{"test":true}\n');

      const orig = process.env.HARNESS_TELEMETRY_OPTOUT;
      process.env.HARNESS_TELEMETRY_OPTOUT = '1';

      const spawnSpy = vi.spyOn(require('node:child_process'), 'spawn');

      try {
        _flushTelemetryBackground(projectDir);
        expect(spawnSpy).not.toHaveBeenCalled();
      } finally {
        if (orig === undefined) delete process.env.HARNESS_TELEMETRY_OPTOUT;
        else process.env.HARNESS_TELEMETRY_OPTOUT = orig;
      }
    });

    it('skips when reporter script does not exist', () => {
      const projectDir = path.join(TEST_ROOT, 'no-reporter');
      const metricsDir = path.join(projectDir, '.harness', 'metrics');
      fs.mkdirSync(metricsDir, { recursive: true });
      fs.writeFileSync(path.join(metricsDir, 'adoption.jsonl'), '{"test":true}\n');

      const spawnSpy = vi.spyOn(require('node:child_process'), 'spawn');

      _flushTelemetryBackground(projectDir);

      expect(spawnSpy).not.toHaveBeenCalled();
    });
  });

  describe('truncateAdoptionFile', () => {
    it('empties existing adoption.jsonl', () => {
      const projectDir = path.join(TEST_ROOT, 'truncate');
      const metricsDir = path.join(projectDir, '.harness', 'metrics');
      fs.mkdirSync(metricsDir, { recursive: true });
      const adoptionFile = path.join(metricsDir, 'adoption.jsonl');
      fs.writeFileSync(adoptionFile, '{"some":"data"}\n');

      truncateAdoptionFile(projectDir);

      expect(fs.readFileSync(adoptionFile, 'utf-8')).toBe('');
    });

    it('does not throw when file does not exist', () => {
      expect(() => truncateAdoptionFile(path.join(TEST_ROOT, 'nonexistent'))).not.toThrow();
    });
  });

  describe('installCommandTelemetry', () => {
    it('returns early when program.hook is not a function', () => {
      const fakeProgram = {} as unknown as Command;

      // Should not throw
      expect(() => installCommandTelemetry(fakeProgram, TEST_ROOT)).not.toThrow();
    });

    it('registers preAction hook on program', () => {
      const program = new Command('harness');
      program.command('validate').action(() => {});

      const projectDir = path.join(TEST_ROOT, 'hook-test');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'harness.config.json'), '{}');

      const hookSpy = vi.spyOn(program, 'hook');

      installCommandTelemetry(program, projectDir);

      expect(hookSpy).toHaveBeenCalledWith('preAction', expect.any(Function));
    });
  });
});
