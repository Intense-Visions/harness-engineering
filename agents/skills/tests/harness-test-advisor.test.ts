// agents/skills/tests/harness-test-advisor.test.ts
//
// Contract tests for the harness-test-advisor skill. Locks in the Coverage
// Audit mode contract from GH issue 488: skill exposes an audit entry point,
// SKILL.md documents the three audit phases (INVENTORY, QUALITY REVIEW,
// GAP REPORT), and the canary plugin agents are named as the remediation
// path. Generic schema/structure/parity checks live in the sibling
// *.test.ts files.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');

const SKILL_NAME = 'harness-test-advisor';
const PLATFORMS = ['claude-code', 'gemini-cli', 'cursor', 'codex'] as const;

function readSkillYaml(platform: string): Record<string, unknown> {
  const path = resolve(SKILLS_DIR, platform, SKILL_NAME, 'skill.yaml');
  return parse(readFileSync(path, 'utf-8'));
}

function readSkillMd(platform: string): string {
  return readFileSync(resolve(SKILLS_DIR, platform, SKILL_NAME, 'SKILL.md'), 'utf-8');
}

describe('harness-test-advisor Coverage Audit metadata', () => {
  it.each(PLATFORMS)('%s skill.yaml exposes an audit CLI arg', (platform) => {
    const meta = readSkillYaml(platform) as {
      cli: { args: Array<{ name: string }> };
    };
    const argNames = meta.cli.args.map((a) => a.name);
    expect(argNames).toContain('audit');
  });

  it.each(PLATFORMS)(
    '%s skill.yaml description advertises coverage audit alongside selection',
    (platform) => {
      const meta = readSkillYaml(platform) as { description: string };
      expect(meta.description).toMatch(/coverage/i);
    }
  );
});

describe('harness-test-advisor SKILL.md surfaces Coverage Audit mode', () => {
  it.each(PLATFORMS)('%s SKILL.md advertises Coverage Audit in When to Use', (platform) => {
    const body = readSkillMd(platform);
    const whenToUse = body.split('## Prerequisites')[0] ?? '';
    expect(whenToUse).toMatch(/Coverage Audit/);
  });

  const AUDIT_PHASES = ['INVENTORY', 'QUALITY REVIEW', 'GAP REPORT'];

  it.each(PLATFORMS)('%s SKILL.md declares the three Coverage Audit phases', (platform) => {
    const body = readSkillMd(platform);
    for (const phase of AUDIT_PHASES) {
      expect(body, `missing Coverage Audit phase "${phase}" in ${platform}`).toContain(phase);
    }
  });

  const CANARY_SKILLS = [
    'canary:canary-review-test',
    'canary:canary-write-test',
    'canary:canary-pick-framework',
  ];

  it.each(PLATFORMS)('%s SKILL.md routes audit follow-ups to canary plugin skills', (platform) => {
    const body = readSkillMd(platform);
    for (const skill of CANARY_SKILLS) {
      expect(body, `missing canary skill reference "${skill}" in ${platform}`).toContain(skill);
    }
  });
});
