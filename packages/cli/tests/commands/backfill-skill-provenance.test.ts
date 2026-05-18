import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runBackfillSkillProvenance } from '../../src/commands/backfill-skill-provenance';

let tmpDir: string;

function writeSkill(host: string, name: string, yaml: string): string {
  const dir = path.join(tmpDir, 'agents', 'skills', host, name);
  fs.mkdirSync(dir, { recursive: true });
  const yamlFile = path.join(dir, 'skill.yaml');
  fs.writeFileSync(yamlFile, yaml);
  return yamlFile;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runBackfillSkillProvenance', () => {
  it('stamps user-authored on skills missing the field', () => {
    const f = writeSkill('claude-code', 'demo', 'name: demo\nversion: "0.1.0"\n');
    const result = runBackfillSkillProvenance(tmpDir);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.scanned).toBe(1);
    expect(fs.readFileSync(f, 'utf-8')).toContain('provenance: user-authored');
  });

  it('skips skills that already declare provenance', () => {
    writeSkill('claude-code', 'demo', 'name: demo\nversion: "0.1.0"\nprovenance: community\n');
    const result = runBackfillSkillProvenance(tmpDir);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('is idempotent across repeat runs', () => {
    writeSkill('claude-code', 'demo', 'name: demo\nversion: "0.1.0"\n');
    const a = runBackfillSkillProvenance(tmpDir);
    const b = runBackfillSkillProvenance(tmpDir);
    expect(a.updated).toBe(1);
    expect(b.updated).toBe(0);
    expect(b.skipped).toBe(1);
  });

  it('handles multiple hosts and skills', () => {
    writeSkill('claude-code', 'a', 'name: a\n');
    writeSkill('claude-code', 'b', 'name: b\n');
    writeSkill('cursor', 'c', 'name: c\n');
    const result = runBackfillSkillProvenance(tmpDir);
    expect(result.scanned).toBe(3);
    expect(result.updated).toBe(3);
  });

  it('returns gracefully when the skills root is absent', () => {
    const result = runBackfillSkillProvenance(path.join(tmpDir, 'nonexistent'));
    expect(result.scanned).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('records parse errors without throwing', () => {
    writeSkill('claude-code', 'bad', ':\n:\n:\n');
    const result = runBackfillSkillProvenance(tmpDir);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
