import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadProjectRoadmapMode } from '../../src/roadmap/load-mode';

describe('loadProjectRoadmapMode', () => {
  it('returns file-backed when no harness.config.json exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpm-'));
    expect(loadProjectRoadmapMode(dir)).toBe('file-backed');
  });
  it('returns file-backed when config has no roadmap field', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpm-'));
    fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ version: 1 }));
    expect(loadProjectRoadmapMode(dir)).toBe('file-backed');
  });
  it('returns file-less when config sets it explicitly', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpm-'));
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { mode: 'file-less' } })
    );
    expect(loadProjectRoadmapMode(dir)).toBe('file-less');
  });
  it('returns file-backed on malformed config', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpm-'));
    fs.writeFileSync(path.join(dir, 'harness.config.json'), '{ not json');
    expect(loadProjectRoadmapMode(dir)).toBe('file-backed');
  });
});
