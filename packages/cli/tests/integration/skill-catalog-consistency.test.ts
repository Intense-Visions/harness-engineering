// packages/cli/tests/integration/skill-catalog-consistency.test.ts
//
// Phase 5 verification — skill catalog ↔ SKILL.md vocabulary consistency.
// Spec: docs/changes/init-design-roadmap-config/proposal.md (item #15).
// Plan: docs/changes/init-design-roadmap-config/plans/2026-05-03-phase5-verification-plan.md
//
// Three asserts:
//   (a) skill.yaml description appears verbatim in skills-catalog.md
//   (b) SKILL.md references both `harness-roadmap` (creator) and
//       `manage_roadmap` (entry-management MCP tool)
//   (c) SKILL.md does NOT contain the regression string "created via
//       manage_roadmap" (Phase 4 fixed; this guards future regressions).
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SKILL_YAML = path.join(
  REPO_ROOT,
  'agents',
  'skills',
  'claude-code',
  'initialize-harness-project',
  'skill.yaml'
);
const SKILL_MD = path.join(
  REPO_ROOT,
  'agents',
  'skills',
  'claude-code',
  'initialize-harness-project',
  'SKILL.md'
);
const CATALOG = path.join(REPO_ROOT, 'docs', 'reference', 'skills-catalog.md');

function extractDescription(yamlText: string): string {
  const match = yamlText.match(/^description:\s*(.*)$/m);
  if (!match) throw new Error('description field not found in skill.yaml');
  return match[1].trim().replace(/^["']|["']$/g, '');
}

describe('skill catalog ↔ SKILL.md consistency (spec #15)', () => {
  it('skill.yaml description appears verbatim in skills-catalog.md under initialize-harness-project', () => {
    const yamlText = fs.readFileSync(SKILL_YAML, 'utf-8');
    const description = extractDescription(yamlText);
    expect(description).toContain('design system');
    expect(description).toContain('roadmap configuration');

    const catalog = fs.readFileSync(CATALOG, 'utf-8');
    expect(catalog).toContain(description);
  });

  it('SKILL.md references both harness-roadmap (creator) and manage_roadmap (MCP tool)', () => {
    const md = fs.readFileSync(SKILL_MD, 'utf-8');
    expect(md).toContain('harness-roadmap');
    expect(md).toContain('manage_roadmap');
  });

  it('SKILL.md does NOT contain the regression string "created via manage_roadmap"', () => {
    const md = fs.readFileSync(SKILL_MD, 'utf-8');
    expect(md).not.toMatch(/created via manage_roadmap/);
  });
});
