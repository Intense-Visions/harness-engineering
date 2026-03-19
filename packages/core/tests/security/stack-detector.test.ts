import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import { detectStack } from '../../src/security/stack-detector';

vi.mock('node:fs');

describe('detectStack', () => {
  it('detects node and express from package.json', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return String(p).endsWith('package.json');
    });
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        dependencies: { express: '^4.18.0' },
      })
    );
    const stacks = detectStack('/project');
    expect(stacks).toContain('node');
    expect(stacks).toContain('express');
  });

  it('detects react from package.json', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return String(p).endsWith('package.json');
    });
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
      })
    );
    const stacks = detectStack('/project');
    expect(stacks).toContain('node');
    expect(stacks).toContain('react');
  });

  it('detects go from go.mod', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return String(p).endsWith('go.mod');
    });
    vi.mocked(fs.readFileSync).mockReturnValue('module example.com/myapp\n\ngo 1.21\n');
    const stacks = detectStack('/project');
    expect(stacks).toContain('go');
  });

  it('returns empty array when no stack detected', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const stacks = detectStack('/project');
    expect(stacks).toEqual([]);
  });
});
