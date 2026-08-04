import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Test the section validation logic directly by exercising the validate command
// on tmp skill directories (avoiding complex Commander invocation).

// We test the exported helper — so export validateSkillEntry from validate.ts.

describe('skill validate — knowledge skill sections', () => {
  it('does not require behavioral sections for knowledge skills', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-validate-'));
    const skillDir = path.join(tmpDir, 'react-hooks-pattern');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, 'skill.yaml'),
      [
        'name: react-hooks-pattern',
        "version: '1.0.0'",
        'description: Custom hooks for stateful logic',
        'type: knowledge',
        'tier: 3',
        'cognitive_mode: advisory-guide',
        'triggers:',
        '  - manual',
        'platforms:',
        '  - claude-code',
        'tools: []',
        'paths:',
        "  - '**/*.tsx'",
        "  - '**/*.jsx'",
        'state:',
        '  persistent: false',
        '  files: []',
        'depends_on: []',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      [
        '# React Hooks Pattern',
        '',
        '> Reuse stateful logic across components via custom hooks',
        '',
        '## When to Use',
        '',
        '- When multiple components share the same stateful logic',
        '',
        '## Instructions',
        '',
        'Extract shared stateful logic into a custom hook prefixed with `use`.',
        '',
        '## Details',
        '',
        'Custom hooks follow React conventions and can use any built-in hook.',
        '',
        '## Source',
        '',
        'https://patterns.dev/react/hooks-pattern',
      ].join('\n')
    );

    const errors: string[] = [];
    const { validateSkillEntry } = await import('../../../src/commands/skill/validate.js');
    validateSkillEntry('react-hooks-pattern', tmpDir, errors);
    expect(errors).toEqual([]);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('reports error when knowledge skill is missing ## Instructions', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-validate-'));
    const skillDir = path.join(tmpDir, 'react-broken');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, 'skill.yaml'),
      [
        'name: react-broken',
        "version: '1.0.0'",
        'description: Broken knowledge skill',
        'type: knowledge',
        'tier: 3',
        'cognitive_mode: advisory-guide',
        'triggers: [manual]',
        'platforms: [claude-code]',
        'tools: []',
        'state: { persistent: false, files: [] }',
        'depends_on: []',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '# React Broken\n\n## Details\n\nsome content'
    );

    const errors: string[] = [];
    const { validateSkillEntry } = await import('../../../src/commands/skill/validate.js');
    validateSkillEntry('react-broken', tmpDir, errors);
    expect(errors.some((e) => e.includes('## Instructions'))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// Regression for #1011: `harness skill validate` scanned the installed CLI
// bundle, not the working tree — so a skill authored in a checkout was never
// examined and the validator's silence read as approval. It also ignored the
// skill-name argument and never reported the denominator.
describe('runSkillValidation — working-tree resolution (#1011)', () => {
  /** Build a `<root>/agents/skills/claude-code/` tree the way a checkout looks. */
  function makeProject(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-validate-wt-'));
    fs.mkdirSync(path.join(root, 'agents', 'skills', 'claude-code'), { recursive: true });
    return root;
  }

  function writeKnowledgeSkill(root: string, name: string, opts: { withInstructions: boolean }) {
    const dir = path.join(root, 'agents', 'skills', 'claude-code', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'skill.yaml'),
      [
        `name: ${name}`,
        "version: '1.0.0'",
        'description: A working-tree skill under authoring',
        'type: knowledge',
        'tier: 3',
        'cognitive_mode: advisory-guide',
        'triggers: [manual]',
        'platforms: [claude-code]',
        'tools: []',
        'state: { persistent: false, files: [] }',
        'depends_on: []',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      opts.withInstructions
        ? `# ${name}\n\n## Instructions\n\nDo the thing.`
        : `# ${name}\n\n## Details\n\nNo instructions section.`
    );
  }

  it('scans the working-tree skills when run inside a checkout', async () => {
    const root = makeProject();
    writeKnowledgeSkill(root, 'authored-skill', { withInstructions: true });

    const { runSkillValidation } = await import('../../../src/commands/skill/validate.js');
    const result = runSkillValidation({ cwd: root });

    // The dir scanned must be the working tree, not the installed bundle.
    expect(result.skillsDir).toBe(path.join(root, 'agents', 'skills', 'claude-code'));
    expect(result.scanned).toBe(1);
    expect(result.errors).toEqual([]);

    fs.rmSync(root, { recursive: true });
  });

  it('actually validates a newly authored skill (its break is reported, not ignored)', async () => {
    const root = makeProject();
    writeKnowledgeSkill(root, 'broken-authored-skill', { withInstructions: false });

    const { runSkillValidation } = await import('../../../src/commands/skill/validate.js');
    const result = runSkillValidation({ cwd: root });

    expect(result.scanned).toBe(1);
    expect(result.errors.some((e) => e.includes('broken-authored-skill'))).toBe(true);
    expect(result.errors.some((e) => e.includes('## Instructions'))).toBe(true);

    fs.rmSync(root, { recursive: true });
  });

  it('honours the skill-name argument and fails when it is not found', async () => {
    const root = makeProject();
    writeKnowledgeSkill(root, 'present-skill', { withInstructions: true });

    const { runSkillValidation } = await import('../../../src/commands/skill/validate.js');

    const found = runSkillValidation({ cwd: root, skillName: 'present-skill' });
    expect(found.scanned).toBe(1);
    expect(found.notFound).toBeUndefined();
    expect(found.errors).toEqual([]);

    const missing = runSkillValidation({ cwd: root, skillName: 'no-such-skill' });
    expect(missing.notFound).toBe('no-such-skill');
    expect(missing.scanned).toBe(0);

    fs.rmSync(root, { recursive: true });
  });
});
