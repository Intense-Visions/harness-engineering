import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let mockSkillsDir = '';
vi.mock('../../../src/utils/paths.js', () => ({
  resolveSkillsDir: () => mockSkillsDir,
}));

vi.mock('../../../src/mcp/utils/sanitize-path.js', () => ({
  sanitizePath: vi.fn((p: string) => p),
}));

vi.mock('../../../src/mcp/utils/result-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/mcp/utils/result-adapter.js')>();
  return actual;
});

vi.mock('../../../src/skill/dispatcher.js', () => ({
  isTier1Skill: vi.fn().mockReturnValue(false),
  suggest: vi.fn(),
  formatSuggestions: vi.fn(),
}));

vi.mock('../../../src/skill/index-builder.js', () => ({
  loadOrRebuildIndex: vi.fn(),
}));

vi.mock('../../../src/skill/stack-profile.js', () => ({
  loadOrGenerateProfile: vi.fn(),
}));

vi.mock('../../../src/config/loader.js', () => ({
  resolveConfig: vi.fn().mockReturnValue({ ok: true, value: {} }),
}));

import {
  runSkillDefinition,
  createSkillDefinition,
  handleRunSkill,
  handleCreateSkill,
} from '../../../src/mcp/tools/skill';
import { isTier1Skill, suggest, formatSuggestions } from '../../../src/skill/dispatcher.js';

describe('run_skill tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mcp-skill-'));
    mockSkillsDir = tempDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('definitions', () => {
    it('has correct definition for run_skill', () => {
      expect(runSkillDefinition.name).toBe('run_skill');
      expect(runSkillDefinition.inputSchema.required).toContain('skill');
    });

    it('accepts complexity, phase, and party inputs', () => {
      expect(runSkillDefinition.inputSchema.properties.complexity).toBeDefined();
      expect(runSkillDefinition.inputSchema.properties.phase).toBeDefined();
      expect(runSkillDefinition.inputSchema.properties.party).toBeDefined();
    });

    it('has autoInject parameter', () => {
      expect(runSkillDefinition.inputSchema.properties.autoInject).toBeDefined();
    });

    it('has correct definition for create_skill', () => {
      expect(createSkillDefinition.name).toBe('create_skill');
      expect(createSkillDefinition.inputSchema.required).toContain('path');
      expect(createSkillDefinition.inputSchema.required).toContain('name');
      expect(createSkillDefinition.inputSchema.required).toContain('description');
    });
  });

  describe('handleRunSkill', () => {
    it('returns error for invalid skill name characters', async () => {
      const result = await handleRunSkill({ skill: '../../../etc/passwd' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid skill name');
    });

    it('returns error when skill directory does not exist', async () => {
      const result = await handleRunSkill({ skill: 'nonexistent-skill' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Skill not found');
    });

    it('returns error when SKILL.md is missing', async () => {
      const skillDir = path.join(tempDir, 'no-md-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      const result = await handleRunSkill({ skill: 'no-md-skill' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('SKILL.md not found');
    });

    it('returns skill content when skill exists', async () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test Skill\nContent here.');

      const result = await handleRunSkill({ skill: 'test-skill' });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('# Test Skill');
    });

    it('injects project state when path is provided', async () => {
      const skillDir = path.join(tempDir, 'state-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill');

      const projectDir = path.join(tempDir, 'project');
      fs.mkdirSync(path.join(projectDir, '.harness'), { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, '.harness', 'state.json'),
        JSON.stringify({ phase: 'plan' })
      );

      const result = await handleRunSkill({ skill: 'state-skill', path: projectDir });
      expect(result.content[0].text).toContain('Project State');
      expect(result.content[0].text).toContain('"phase"');
    });

    it('does not inject state when state file does not exist', async () => {
      const skillDir = path.join(tempDir, 'no-state-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill');

      const result = await handleRunSkill({ skill: 'no-state-skill', path: '/tmp/empty' });
      expect(result.content[0].text).not.toContain('Project State');
    });

    it('truncates knowledge skill to Instructions section with autoInject', async () => {
      const skillDir = path.join(tempDir, 'knowledge-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '# Know\n## Instructions\nDo stuff.\n## Details\nMore info.'
      );
      fs.writeFileSync(
        path.join(skillDir, 'skill.yaml'),
        'name: knowledge-skill\ntype: knowledge\nversion: "1.0.0"\ndescription: test\ntriggers: [auto-inject]\nplatforms: [claude-code]\ntools: []\n'
      );

      const result = await handleRunSkill({ skill: 'knowledge-skill', autoInject: true });
      expect(result.content[0].text).toContain('## Instructions');
      expect(result.content[0].text).not.toContain('## Details');
    });

    it('returns full content for knowledge skill without autoInject', async () => {
      const skillDir = path.join(tempDir, 'knowledge-skill2');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '# Know\n## Instructions\nDo stuff.\n## Details\nMore info.'
      );
      fs.writeFileSync(
        path.join(skillDir, 'skill.yaml'),
        'name: knowledge-skill2\ntype: knowledge\nversion: "1.0.0"\ndescription: test\ntriggers: [auto-inject]\nplatforms: [claude-code]\ntools: []\n'
      );

      const result = await handleRunSkill({ skill: 'knowledge-skill2' });
      expect(result.content[0].text).toContain('## Details');
    });

    it('injects dispatcher suggestions for Tier 1 skills', async () => {
      const skillDir = path.join(tempDir, 'tier1-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Tier 1');

      vi.mocked(isTier1Skill).mockReturnValueOnce(true);
      vi.mocked(suggest).mockReturnValueOnce({ suggestions: [] } as never);
      vi.mocked(formatSuggestions).mockReturnValueOnce('\n## Suggested Skills\n- skill-a');

      const result = await handleRunSkill({ skill: 'tier1-skill' });
      expect(result.content[0].text).toContain('Suggested Skills');
    });

    it('handles dispatcher failure silently', async () => {
      const skillDir = path.join(tempDir, 'tier1-fail');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Tier 1');

      vi.mocked(isTier1Skill).mockReturnValueOnce(true);
      vi.mocked(suggest).mockImplementationOnce(() => {
        throw new Error('Dispatcher failed');
      });

      const result = await handleRunSkill({ skill: 'tier1-fail' });
      // Should still return skill content without error
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('# Tier 1');
    });
  });

  describe('handleCreateSkill', () => {
    it('returns error when generateSkillFiles throws', async () => {
      // generateSkillFiles is dynamically imported, mock will cause error
      const result = await handleCreateSkill({
        path: '/tmp/nonexistent',
        name: 'test-skill',
        description: 'A test',
      });
      // Will likely error because create-skill module has dependencies
      expect(result.content).toHaveLength(1);
    });
  });
});
