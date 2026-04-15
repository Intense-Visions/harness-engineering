import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadPublishedIndex, savePublishedIndex } from '../../src/core/published-index';

describe('published-index', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-idx-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadPublishedIndex', () => {
    it('returns empty object when file does not exist', () => {
      expect(loadPublishedIndex(tmpDir)).toEqual({});
    });

    it('returns parsed index when file exists', () => {
      const indexPath = path.join(tmpDir, '.harness', 'metrics', 'published-analyses.json');
      fs.mkdirSync(path.dirname(indexPath), { recursive: true });
      fs.writeFileSync(indexPath, JSON.stringify({ 'issue-1': '2026-04-15T12:00:00Z' }));
      expect(loadPublishedIndex(tmpDir)).toEqual({ 'issue-1': '2026-04-15T12:00:00Z' });
    });

    it('returns empty object on malformed JSON', () => {
      const indexPath = path.join(tmpDir, '.harness', 'metrics', 'published-analyses.json');
      fs.mkdirSync(path.dirname(indexPath), { recursive: true });
      fs.writeFileSync(indexPath, 'not-json');
      expect(loadPublishedIndex(tmpDir)).toEqual({});
    });
  });

  describe('savePublishedIndex', () => {
    it('creates directories and writes JSON', () => {
      const index = { 'issue-1': '2026-04-15T12:00:00Z' };
      savePublishedIndex(tmpDir, index);
      const indexPath = path.join(tmpDir, '.harness', 'metrics', 'published-analyses.json');
      expect(fs.existsSync(indexPath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(indexPath, 'utf-8'))).toEqual(index);
    });

    it('overwrites existing index', () => {
      savePublishedIndex(tmpDir, { 'issue-1': '2026-04-15T12:00:00Z' });
      savePublishedIndex(tmpDir, { 'issue-1': '2026-04-15T12:00:00Z', 'issue-2': '2026-04-15T13:00:00Z' });
      const indexPath = path.join(tmpDir, '.harness', 'metrics', 'published-analyses.json');
      const loaded = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(Object.keys(loaded)).toHaveLength(2);
    });
  });
});
