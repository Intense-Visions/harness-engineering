import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  recordRefinement,
  readRefinementDemand,
  REFINEMENT_EVENTS_FILE,
} from '../../../src/mcp/tools/refinement-telemetry';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'refinement-telemetry-'));
  tmpDirs.push(d);
  return d;
}

function readLines(dir: string): string[] {
  const filePath = path.join(dir, '.harness', 'metrics', 'refinement-events.jsonl');
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim());
}

describe('REFINEMENT_EVENTS_FILE', () => {
  it('lives under .harness/metrics as refinement-events.jsonl', () => {
    expect(REFINEMENT_EVENTS_FILE).toContain('metrics');
    expect(REFINEMENT_EVENTS_FILE).toContain('refinement-events.jsonl');
  });
});

describe('recordRefinement', () => {
  it('appends one classified JSONL line with a stamped timestamp', () => {
    const dir = tmp();
    recordRefinement(dir, { operation: 'outline', target: 'x.ts' });
    const lines = readLines(dir);
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]);
    expect(rec.operation).toBe('outline');
    expect(rec.contextClass).toBe('file-content');
    expect(rec.target).toBe('x.ts');
    expect(typeof rec.timestamp).toBe('string');
  });

  it('lets an explicit contextClass override the operation default', () => {
    const dir = tmp();
    recordRefinement(dir, { operation: 'unfold', contextClass: 'knowledge' });
    const rec = JSON.parse(readLines(dir)[0]);
    expect(rec.operation).toBe('unfold');
    expect(rec.contextClass).toBe('knowledge');
  });

  it('appends successive calls', () => {
    const dir = tmp();
    recordRefinement(dir, { operation: 'outline' });
    recordRefinement(dir, { operation: 'search' });
    recordRefinement(dir, { operation: 'unfold' });
    expect(readLines(dir)).toHaveLength(3);
  });

  it('never throws on an unwritable path (non-fatal, Truth 4)', () => {
    expect(() => recordRefinement('/nonexistent\0bad', { operation: 'search' })).not.toThrow();
  });
});

describe('readRefinementDemand', () => {
  it('returns the all-zero 4-class report when the file is missing', () => {
    const dir = tmp();
    const report = readRefinementDemand(dir);
    expect(report.total).toBe(0);
    expect(report.byClass).toHaveLength(4);
    for (const c of report.byClass) {
      expect(c.count).toBe(0);
      expect(c.frequency).toBe(0);
    }
  });

  it('aggregates a seeded mix and tolerates malformed lines', () => {
    const dir = tmp();
    recordRefinement(dir, { operation: 'outline' });
    recordRefinement(dir, { operation: 'search' });
    recordRefinement(dir, { operation: 'unfold' });
    recordRefinement(dir, { operation: 'expand-rationale' });
    // Inject a garbage line — must be skipped, not throw.
    const filePath = path.join(dir, '.harness', 'metrics', 'refinement-events.jsonl');
    fs.appendFileSync(filePath, 'not-json{{{\n');

    const report = readRefinementDemand(dir);
    expect(report.total).toBe(4);
    const byClass = new Map(report.byClass.map((c) => [c.contextClass, c]));
    expect(byClass.get('file-content')).toMatchObject({ count: 3, frequency: 0.75 });
    expect(byClass.get('knowledge')).toMatchObject({ count: 1, frequency: 0.25 });
  });
});
