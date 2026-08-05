import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import {
  SkillMetadataSchema,
  capabilityDriftErrors,
  deriveCapabilities,
} from '../../src/skill/schema';
import { isHarnessAuthoredSkill } from '../../src/commands/skill/validate';

/**
 * Wired enforcement for #558: the harness's own skills must ship a consistent
 * `capabilities:` envelope. This runs against the real `agents/skills/claude-code`
 * tree in CI, so a harness skill that adds a tool without updating capabilities
 * (or drops the declaration entirely) fails here.
 */
function findSkillsDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'agents', 'skills', 'claude-code');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate agents/skills/claude-code from test');
}

const skillsDir = findSkillsDir();
const harnessSkills = fs
  .readdirSync(skillsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && isHarnessAuthoredSkill(d.name))
  .map((d) => d.name)
  .sort();

describe('harness-authored skill capabilities (#558)', () => {
  it('finds harness-authored skills to check', () => {
    // Dynamic count — never hardcode. Guards against a resolution regression
    // silently checking nothing.
    expect(harnessSkills.length).toBeGreaterThan(0);
  });

  it.each(harnessSkills)('%s declares a capabilities envelope', (name) => {
    const raw = fs.readFileSync(path.join(skillsDir, name, 'skill.yaml'), 'utf-8');
    const parsed = SkillMetadataSchema.safeParse(parse(raw));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.capabilities).toBeDefined();
  });

  it.each(harnessSkills)('%s capabilities are consistent with its tools', (name) => {
    const raw = fs.readFileSync(path.join(skillsDir, name, 'skill.yaml'), 'utf-8');
    const parsed = SkillMetadataSchema.safeParse(parse(raw));
    expect(parsed.success).toBe(true);
    if (!parsed.success || !parsed.data.capabilities) return;
    const drift = capabilityDriftErrors(parsed.data.tools ?? [], parsed.data.capabilities);
    expect(drift, `${name}: ${drift.join('; ')}`).toEqual([]);
    // The declared envelope equals what derivation would produce from tools.
    expect(parsed.data.capabilities).toEqual(deriveCapabilities(parsed.data.tools ?? []));
  });
});
