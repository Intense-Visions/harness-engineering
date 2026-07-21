import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateBlueprintDefinition, handleGenerateBlueprint } from './blueprint.js';

// Hoisted mock state so we can reconfigure ProjectScanner per-test without
// touching the filesystem. The handler dynamically imports
// '@harness-engineering/core', so we intercept the whole module.
const scanMock = vi.hoisted(() => vi.fn());
const scannerCtor = vi.hoisted(() => vi.fn());

vi.mock('@harness-engineering/core', () => ({
  ProjectScanner: class {
    constructor(projectPath: string) {
      scannerCtor(projectPath);
    }
    scan() {
      return scanMock();
    }
  },
}));

function parse(res: { content: Array<{ text: string }> }) {
  const first = res.content[0];
  if (!first) throw new Error('expected tool response content');
  return JSON.parse(first.text);
}

beforeEach(() => {
  scanMock.mockReset();
  scannerCtor.mockReset();
});

describe('generateBlueprintDefinition', () => {
  it('declares the generate_blueprint tool requiring a path', () => {
    expect(generateBlueprintDefinition.name).toBe('generate_blueprint');
    expect(generateBlueprintDefinition.inputSchema.required).toEqual(['path']);
    expect(generateBlueprintDefinition.inputSchema.properties.path.type).toBe('string');
  });
});

describe('handleGenerateBlueprint', () => {
  it('scans the sanitized path and returns the scan data as JSON', async () => {
    const scanData = { modules: [{ name: 'core' }], hotspots: [], dependencies: {} };
    scanMock.mockResolvedValue(scanData);

    const res = await handleGenerateBlueprint({ path: 'some/project' });

    // No error flag on the success path.
    expect('isError' in res).toBe(false);
    // The response echoes exactly what the scanner produced, JSON-encoded.
    expect(parse(res)).toEqual(scanData);
    expect(scanMock).toHaveBeenCalledTimes(1);
  });

  it('constructs the scanner with the resolved absolute path', async () => {
    scanMock.mockResolvedValue({});

    await handleGenerateBlueprint({ path: 'relative/dir' });

    expect(scannerCtor).toHaveBeenCalledTimes(1);
    const passedPath = scannerCtor.mock.calls[0]![0];
    // sanitizePath resolves to an absolute path before the scanner sees it.
    // Use path helpers so the assertion holds on Windows (backslash sep, drive root) too.
    expect(passedPath.endsWith(path.join('relative', 'dir'))).toBe(true);
    expect(path.isAbsolute(passedPath)).toBe(true);
  });

  it('rejects the filesystem root before ever constructing a scanner', async () => {
    const res = await handleGenerateBlueprint({ path: '/' });

    expect('isError' in res && res.isError).toBe(true);
    expect(res.content[0]!.text).toBe('Error: Invalid project path: cannot use filesystem root');
    // The sanitize failure short-circuits: the scanner is never built or run.
    expect(scannerCtor).not.toHaveBeenCalled();
    expect(scanMock).not.toHaveBeenCalled();
  });

  it('returns a structured blueprint-generation error when the scan throws', async () => {
    scanMock.mockRejectedValue(new Error('scan boom'));

    const res = await handleGenerateBlueprint({ path: 'some/project' });

    expect('isError' in res && res.isError).toBe(true);
    expect(res.content[0]!.text).toBe('Error generating blueprint: scan boom');
  });

  it('stringifies non-Error scan rejections in the error message', async () => {
    scanMock.mockRejectedValue('plain string failure');

    const res = await handleGenerateBlueprint({ path: 'some/project' });

    expect('isError' in res && res.isError).toBe(true);
    expect(res.content[0]!.text).toBe('Error generating blueprint: plain string failure');
  });
});
