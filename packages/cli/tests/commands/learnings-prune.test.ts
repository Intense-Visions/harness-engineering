import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createProgram } from '../../src/index';

describe('harness learnings prune', () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-prune-'));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should report nothing to prune when few entries exist', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    const today = new Date().toISOString().split('T')[0];
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      `# Learnings\n\n- **${today} [skill:a]:** Learning 1\n\n- **${today} [skill:b]:** Learning 2\n`
    );

    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'learnings', 'prune', '--path', tmpDir]);

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should prune and show proposals when entries exceed threshold', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });

    const entries = Array.from({ length: 35 }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = i < 28 ? '01' : '02';
      const skill = i < 5 ? 'harness-execution' : `skill-${i}`;
      return `- **2026-${month}-${day} [skill:${skill}]:** Learning ${i}`;
    });

    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      `# Learnings\n\n${entries.join('\n\n')}\n`
    );

    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'learnings', 'prune', '--path', tmpDir]);

    expect(exitSpy).toHaveBeenCalledWith(0);

    // Should show proposal for harness-execution pattern
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('harness-execution');
    expect(output).toContain('5 learnings');

    // Verify file state
    const remaining = fs.readFileSync(path.join(harnessDir, 'learnings.md'), 'utf-8');
    const remainingCount = (remaining.match(/^- \*\*/gm) || []).length;
    expect(remainingCount).toBe(20);

    // Verify archive exists
    const archiveDir = path.join(harnessDir, 'learnings-archive');
    expect(fs.existsSync(archiveDir)).toBe(true);
  });

  it('should handle missing learnings file gracefully', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'learnings', 'prune', '--path', tmpDir]);

    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
