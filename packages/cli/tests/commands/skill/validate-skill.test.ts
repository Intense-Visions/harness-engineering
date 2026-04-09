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
