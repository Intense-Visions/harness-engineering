import { describe, it, expect } from 'vitest';
import {
  describeCraftResolution,
  formatCraftDiagnostic,
} from '../../../src/shared/craft/diagnostics';
import type { CraftLlmResolution } from '../../../src/shared/craft/llm/provider';

describe('describeCraftResolution', () => {
  it('names a bare mode without a backend', () => {
    expect(describeCraftResolution({ mode: 'in-session' })).toBe('in-session');
  });

  it('names the resolved backend alongside its type', () => {
    const resolution: CraftLlmResolution = { mode: 'local', backendName: 'ollama' };
    expect(describeCraftResolution(resolution)).toBe('local (backend "ollama")');
  });
});

describe('formatCraftDiagnostic', () => {
  it('always names the resolved provider/mode (issue #896, mode 1)', () => {
    const line = formatCraftDiagnostic({ resolution: { mode: 'in-session' } });
    expect(line).toContain('provider=in-session');
    expect(line.startsWith('Diagnostic:')).toBe(true);
  });

  it('reports "0 analyzable files" when nothing was analyzable (issue #896, mode 2)', () => {
    const line = formatCraftDiagnostic({
      resolution: { mode: 'mock' },
      scan: {
        unit: 'files',
        analyzed: 0,
        skipped: 0,
        skipReason: 'no source files for supported languages (.ts, .tsx, .js, .jsx)',
      },
    });
    expect(line).toContain('0 analyzable files');
    expect(line).toContain('supported languages');
  });

  it('distinguishes "analyzed N, 0 findings" from "analyzed nothing"', () => {
    const analyzedSomething = formatCraftDiagnostic({
      resolution: { mode: 'mock' },
      scan: { unit: 'files', analyzed: 200, skipped: 12, skipReason: 'no security signal' },
    });
    const analyzedNothing = formatCraftDiagnostic({
      resolution: { mode: 'mock' },
      scan: { unit: 'files', analyzed: 0, skipped: 0, skipReason: 'unsupported language' },
    });
    expect(analyzedSomething).toContain('analyzed 200 files, skipped 12 — no security signal');
    expect(analyzedNothing).not.toContain('analyzed 200');
    expect(analyzedSomething).not.toEqual(analyzedNothing);
  });
});
