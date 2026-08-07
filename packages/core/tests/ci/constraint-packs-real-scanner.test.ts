import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CICheckName } from '@harness-engineering/types';
import { runCIChecks } from '../../src/ci/check-orchestrator';

// This suite deliberately exercises the REAL security scanner and REAL security
// config parsing (no mocks). The force-enable blast-radius fix is a property of
// how the overlay's `'SEC-*': 'off'` base interacts with real rule resolution,
// so mocking either would make the test vacuous.

// Every check except `security` is skipped so the scanner is the only thing
// that runs against the temp project.
const SKIP_ALL_BUT_SECURITY: CICheckName[] = [
  'validate',
  'deps',
  'docs',
  'entropy',
  'perf',
  'phase-gate',
  'arch',
  'traceability',
];

/** Rule ids parsed out of the security check's error issues. */
function securityErrorRuleIds(report: Awaited<ReturnType<typeof runCIChecks>>): string[] {
  if (!report.ok) return [];
  const security = report.value.checks.find((c) => c.name === 'security');
  return (security?.issues ?? [])
    .filter((i) => i.severity === 'error' && typeof i.ruleId === 'string')
    .map((i) => i.ruleId as string);
}

describe('constraint packs — real scanner, force-enable blast radius', () => {
  let projectRoot: string;

  beforeAll(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-pack-scanner-'));
    // One source file that trips BOTH a pack-covered error rule (SEC-INJ-001,
    // eval) AND a non-pack default-error rule (SEC-XSS-001, innerHTML). Neither
    // rule is stack-gated, so both are active for a bare .ts file.
    await fs.writeFile(
      path.join(projectRoot, 'app.ts'),
      [
        'export function run(userInput: string, el: HTMLElement) {',
        '  const result = eval(userInput);',
        '  el.innerHTML = userInput;',
        '  return result;',
        '}',
        '',
      ].join('\n'),
      'utf-8'
    );
  });

  afterAll(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('scanner disabled + pack opt-in blocks ONLY the pack prefixes, not the whole scanner', async () => {
    const report = await runCIChecks({
      projectRoot,
      config: {
        name: 'temp',
        security: { enabled: false },
        constraintPacks: ['secrets-and-injection'],
      },
      skip: SKIP_ALL_BUT_SECURITY,
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;

    const errorRuleIds = securityErrorRuleIds(report);
    // The pack's prefix (SEC-INJ-*) blocks.
    expect(errorRuleIds).toContain('SEC-INJ-001');
    // The non-pack default-error rule (SEC-XSS-001) is held at `off` by the
    // force-enable base and must NOT block — this is the whole point of the fix.
    expect(errorRuleIds).not.toContain('SEC-XSS-001');
    // No SEC-* rule outside the opted-in prefixes may block.
    for (const id of errorRuleIds) {
      expect(id.startsWith('SEC-SEC-') || id.startsWith('SEC-INJ-')).toBe(true);
    }

    // The governed finding fails the gate and marks the pack non-compliant.
    expect(report.value.exitCode).toBe(1);
    const pack = report.value.constraintPacks?.find((p) => p.pack === 'secrets-and-injection');
    expect(pack).toBeDefined();
    expect(pack!.stages.some((s) => s.status === 'non-compliant')).toBe(true);
  });

  it('same opt-in on a clean file leaves no residual non-pack blocking', async () => {
    const cleanRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-pack-clean-'));
    try {
      // Trips only the non-pack rule (innerHTML). With the scanner disabled and
      // only secrets-and-injection opted in, nothing should block.
      await fs.writeFile(
        path.join(cleanRoot, 'view.ts'),
        'export function paint(el: HTMLElement, s: string) { el.innerHTML = s; }\n',
        'utf-8'
      );
      const report = await runCIChecks({
        projectRoot: cleanRoot,
        config: {
          name: 'temp-clean',
          security: { enabled: false },
          constraintPacks: ['secrets-and-injection'],
        },
        skip: SKIP_ALL_BUT_SECURITY,
      });
      expect(report.ok).toBe(true);
      if (!report.ok) return;
      expect(securityErrorRuleIds(report)).toEqual([]);
      expect(report.value.exitCode).toBe(0);
    } finally {
      await fs.rm(cleanRoot, { recursive: true, force: true });
    }
  });
});
