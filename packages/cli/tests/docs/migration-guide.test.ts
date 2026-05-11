import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REQUIRED_SECTIONS = [
  'pre-flight checklist',
  'dry run',
  'real run',
  'verification',
  'rollback recipe',
  'recovery from partial failure',
  'title-only collision',
  'archive collision',
];

describe('migration guide', () => {
  it('exists and contains every required section', () => {
    const guidePath = path.resolve(
      __dirname,
      '../../../../docs/changes/roadmap-tracker-only/migration.md'
    );
    expect(fs.existsSync(guidePath)).toBe(true);
    const lower = fs.readFileSync(guidePath, 'utf-8').toLowerCase();
    for (const heading of REQUIRED_SECTIONS) {
      expect(lower, `missing section: ${heading}`).toContain(heading);
    }
  });

  it('mentions the dry-run command verbatim', () => {
    const guidePath = path.resolve(
      __dirname,
      '../../../../docs/changes/roadmap-tracker-only/migration.md'
    );
    const text = fs.readFileSync(guidePath, 'utf-8');
    expect(text).toContain('harness roadmap migrate --to=file-less --dry-run');
    expect(text).toContain('harness roadmap migrate --to=file-less');
  });

  it('mentions the rollback command sequence verbatim', () => {
    const guidePath = path.resolve(
      __dirname,
      '../../../../docs/changes/roadmap-tracker-only/migration.md'
    );
    const text = fs.readFileSync(guidePath, 'utf-8');
    expect(text).toContain('mv docs/roadmap.md.archived docs/roadmap.md');
    expect(text).toContain('mv harness.config.json.pre-migration harness.config.json');
  });
});
