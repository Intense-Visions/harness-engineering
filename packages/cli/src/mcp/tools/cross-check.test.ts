import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateCrossCheckDefinition, handleValidateCrossCheck } from './cross-check.js';

// The handler dynamically imports the command module, so we intercept the whole
// module and drive runCrossCheck per-test. These tests pin the handler's
// current contract: path guarding, the JSON response shape on success, and how
// Result failures and thrown errors surface (F3a: response shape is contract).
const runCrossCheck = vi.hoisted(() => vi.fn());

vi.mock('../../commands/validate-cross-check.js', () => ({
  runCrossCheck,
}));

function firstText(res: { content: Array<{ text: string }> }): string {
  const first = res.content[0];
  if (!first) throw new Error('expected tool response content');
  return first.text;
}

beforeEach(() => {
  runCrossCheck.mockReset();
});

describe('validateCrossCheckDefinition', () => {
  it('declares the validate_cross_check tool requiring only path', () => {
    expect(validateCrossCheckDefinition.name).toBe('validate_cross_check');
    expect(validateCrossCheckDefinition.inputSchema.required).toEqual(['path']);
    expect(validateCrossCheckDefinition.inputSchema.properties.specsDir.type).toBe('string');
    expect(validateCrossCheckDefinition.inputSchema.properties.plansDir.type).toBe('string');
  });
});

describe('handleValidateCrossCheck', () => {
  const projectRoot = path.resolve('some/project');

  it('returns the runCrossCheck value as JSON on success without an error flag', async () => {
    const value = { specs: 3, plans: 3, stale: [] };
    runCrossCheck.mockResolvedValue({ ok: true, value });

    const res = await handleValidateCrossCheck({ path: projectRoot });

    expect('isError' in res).toBe(false);
    expect(JSON.parse(firstText(res))).toEqual(value);
    expect(runCrossCheck).toHaveBeenCalledTimes(1);
  });

  it('resolves default specs/plans dirs under the project root', async () => {
    runCrossCheck.mockResolvedValue({ ok: true, value: {} });

    await handleValidateCrossCheck({ path: projectRoot });

    expect(runCrossCheck).toHaveBeenCalledWith({
      projectPath: projectRoot,
      specsDir: path.join(projectRoot, 'docs/specs'),
      plansDir: path.join(projectRoot, 'docs/plans'),
    });
  });

  it('surfaces a Result failure as an error carrying the error message', async () => {
    runCrossCheck.mockResolvedValue({ ok: false, error: { message: 'no specs found' } });

    const res = await handleValidateCrossCheck({ path: projectRoot });

    expect(res.isError).toBe(true);
    expect(firstText(res)).toBe('no specs found');
  });

  it('catches a thrown error and reports it as an Error: message', async () => {
    runCrossCheck.mockRejectedValue(new Error('disk exploded'));

    const res = await handleValidateCrossCheck({ path: projectRoot });

    expect(res.isError).toBe(true);
    expect(firstText(res)).toBe('Error: disk exploded');
  });

  it('rejects the filesystem root before ever invoking the command', async () => {
    const res = await handleValidateCrossCheck({ path: '/' });

    expect(res.isError).toBe(true);
    expect(firstText(res)).toMatch(/^Error: /);
    expect(runCrossCheck).not.toHaveBeenCalled();
  });

  it('rejects a specsDir that escapes the project root', async () => {
    const res = await handleValidateCrossCheck({
      path: projectRoot,
      specsDir: '../../../../etc',
    });

    expect(res.isError).toBe(true);
    expect(firstText(res)).toBe('Error: specsDir escapes project root');
    expect(runCrossCheck).not.toHaveBeenCalled();
  });

  it('rejects a plansDir that escapes the project root', async () => {
    const res = await handleValidateCrossCheck({
      path: projectRoot,
      plansDir: '../../../../etc',
    });

    expect(res.isError).toBe(true);
    expect(firstText(res)).toBe('Error: plansDir escapes project root');
    expect(runCrossCheck).not.toHaveBeenCalled();
  });
});
