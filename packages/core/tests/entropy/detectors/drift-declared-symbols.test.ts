import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { detectDocDrift } from '../../../src/entropy/detectors/drift';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import type { DocumentationDrift } from '../../../src/entropy/types';

// Issue #2078: the api-signature tier reported symbols that EXIST as
// RENAMED / NOT_FOUND. The three fixtures below are the issue's verified
// examples, reproduced verbatim:
//   - `export type HookProfile = ...`                (type alias)
//   - `const TOOL_HANDLERS: Record<...> = {`          (typed, unexported const)
//   - `export interface CheckResult {`               (interface)
// The export index only recorded value declarations (function/class/const),
// so type-only declarations and file-local declarations looked missing.
// `GhostSymbol` is the positive control: it is declared nowhere and must
// still be reported.

const parser = new TypeScriptParser();
let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'drift-2078-'));
  await mkdir(join(projectDir, 'src'), { recursive: true });
  await mkdir(join(projectDir, 'docs'), { recursive: true });
  // An entry point so `buildSnapshot` can resolve one (it fails closed otherwise).
  await writeFile(join(projectDir, 'src', 'index.ts'), "export * from './profiles';\n");
  await writeFile(
    join(projectDir, 'src', 'profiles.ts'),
    "export type HookProfile = 'minimal' | 'standard' | 'strict';\n"
  );
  await writeFile(
    join(projectDir, 'src', 'server.ts'),
    [
      'type ToolHandler = (input: unknown) => unknown;',
      'const TOOL_HANDLERS: Record<string, ToolHandler> = {',
      '  ping: () => "pong",',
      '};',
      'export function dispatch(name: string) { return TOOL_HANDLERS[name]; }',
      // A SCREAMING_SNAKE export, as this repo has: without one the detector
      // suppresses every SCREAMING_SNAKE doc token and the case is vacuous.
      'export const MAX_RETRIES = 3;',
      '',
    ].join('\n')
  );
  await writeFile(
    join(projectDir, 'src', 'doctor.ts'),
    ['export interface CheckResult {', '  name: string;', '  ok: boolean;', '}', ''].join('\n')
  );
  await writeFile(
    join(projectDir, 'src', 'enums.ts'),
    'export enum Severity { Low, High }\nexport default function main() { return 0; }\n'
  );
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

async function apiDrifts(doc: string): Promise<DocumentationDrift[]> {
  await writeFile(join(projectDir, 'docs', 'ref.md'), doc);
  const snapshot = await buildSnapshot({
    rootDir: projectDir,
    parser,
    analyze: { drift: true },
    include: ['src/**/*.ts'],
    docPaths: ['docs/**/*.md'],
  });
  expect(snapshot.ok).toBe(true);
  if (!snapshot.ok) throw new Error('snapshot failed');
  const result = await detectDocDrift(snapshot.value, {
    checkApiSignatures: true,
    checkExamples: false,
    checkStructure: false,
    docPaths: [],
    ignorePatterns: [],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('drift failed');
  return result.value.drifts.filter((d) => d.type === 'api-signature');
}

describe('api-signature drift resolves every declared symbol (#2078)', () => {
  it('does not report an exported type alias', async () => {
    const drifts = await apiDrifts('# Ref\n\nProfiles are typed by `HookProfile`.\n');
    expect(drifts.map((d) => d.reference)).not.toContain('HookProfile');
  });

  it('does not report a typed, file-local const', async () => {
    const drifts = await apiDrifts('# Ref\n\nHandlers live in `TOOL_HANDLERS`.\n');
    expect(drifts.map((d) => d.reference)).not.toContain('TOOL_HANDLERS');
  });

  it('does not report an exported interface', async () => {
    const drifts = await apiDrifts('# Ref\n\nEach check returns a `CheckResult`.\n');
    expect(drifts.map((d) => d.reference)).not.toContain('CheckResult');
  });

  it('does not report an exported enum or a file-local type alias', async () => {
    const drifts = await apiDrifts('# Ref\n\nSee `Severity` and `ToolHandler`.\n');
    expect(drifts.map((d) => d.reference)).toEqual([]);
  });

  it('resolves an inline `type` modifier from a code-block import', async () => {
    const drifts = await apiDrifts(
      [
        '# Ref',
        '',
        '```typescript',
        "import { type CheckResult, type HookProfile as Profile } from './doctor';",
        '```',
        '',
      ].join('\n')
    );
    expect(drifts.map((d) => d.reference)).toEqual([]);
  });

  it('still reports a symbol that is declared nowhere (positive control)', async () => {
    const drifts = await apiDrifts(
      '# Ref\n\nProfiles are typed by `HookProfile`; call `GhostSymbol` to start.\n'
    );
    expect(drifts.map((d) => d.reference)).toEqual(['GhostSymbol']);
  });

  it('still reports a code-block import of an undeclared type (positive control)', async () => {
    const drifts = await apiDrifts(
      ['# Ref', '', '```ts', "import { type GhostType } from './doctor';", '```', ''].join('\n')
    );
    expect(drifts).toHaveLength(1);
    expect(drifts[0]?.reference).toContain('GhostType');
  });
});
