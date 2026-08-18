/**
 * Cross-cutting guard test for issue #1368.
 *
 * The older craft-family skills (copy / docs / knowledge / security / spec)
 * wrap every per-(target, rubric) critique in a bare `catch {}` so one bad LLM
 * call can't sink a whole run. But `InSessionLlmProvider.callText` throws
 * `PromptDeferredError` on *every* call — it defers the prompt to the calling
 * agent rather than answering it. With that provider the swallow eats every
 * deferral, so `run*Craft` returns `findings: []` with no error: a confident
 * "nothing to critique" for a run in which no LLM call ever completed.
 *
 * Each inline `run*Craft` entry must instead refuse the in-session provider up
 * front — the way naming-craft and test-craft already do — so the caller gets a
 * loud, actionable error instead of a hollow empty success.
 *
 * At the base commit this test is RED: every entry returns an empty success
 * (no throw, zero findings) for a fixture that would otherwise yield findings.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { InSessionLlmProvider } from '../../../src/shared/craft/llm/provider';
import { runCopyCraft } from '../../../src/copy-craft';
import { runDocsCraft } from '../../../src/docs-craft';
import { runKnowledgeCraft } from '../../../src/knowledge-craft';
import { runSecurityCraft } from '../../../src/security-craft';
import { runSpecCraft } from '../../../src/spec-craft';

interface GuardCase {
  entryPoint: string;
  /** Fixtures that make the critique loop reach at least one (target, rubric). */
  fixtures: Array<[relPath: string, content: string]>;
  run: (dir: string, provider: InSessionLlmProvider) => Promise<{ findings: unknown[] }>;
}

const CASES: GuardCase[] = [
  {
    entryPoint: 'runCopyCraft',
    fixtures: [['src/parse.ts', 'throw new Error("parse error");\n']],
    run: (dir, provider) =>
      runCopyCraft({ path: dir, surfaces: ['error'], __testProvider: provider }),
  },
  {
    entryPoint: 'runDocsCraft',
    fixtures: [['docs/guides/intro.md', '# Intro\n\nThe system supports X, Y, and Z.\n']],
    run: (dir, provider) => runDocsCraft({ path: dir, __testProvider: provider }),
  },
  {
    entryPoint: 'runKnowledgeCraft',
    fixtures: [
      [
        'docs/knowledge/auth/email-validator.md',
        '# Email Validator\n\nThe user service validates emails via the EmailValidator class.\n',
      ],
    ],
    run: (dir, provider) => runKnowledgeCraft({ path: dir, __testProvider: provider }),
  },
  {
    entryPoint: 'runSecurityCraft',
    fixtures: [
      [
        'packages/api/src/run.ts',
        `import * as child_process from 'child_process';
         export function run(req, res) {
           child_process.exec(req.body.cmd, () => res.json({}));
         }`,
      ],
    ],
    run: (dir, provider) => runSecurityCraft({ path: dir, __testProvider: provider }),
  },
  {
    entryPoint: 'runSpecCraft',
    fixtures: [
      ['docs/changes/feature-x/proposal.md', `# Feature X\n\n## Decisions\n\nVague decision.\n`],
    ],
    run: (dir, provider) => runSpecCraft({ path: dir, __testProvider: provider }),
  },
];

function writeFixtures(dir: string, fixtures: Array<[string, string]>): void {
  for (const [rel, content] of fixtures) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

describe('craft inline entry points refuse the in-session provider (#1368)', () => {
  for (const c of CASES) {
    it(`${c.entryPoint} throws rather than returning a hollow empty success`, async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-guard-'));
      try {
        writeFixtures(dir, c.fixtures);

        let threw = false;
        let error: unknown;
        let findings: unknown[] = [];
        try {
          const out = await c.run(dir, new InSessionLlmProvider());
          findings = out.findings;
        } catch (e) {
          threw = true;
          error = e;
        }

        // Core repro assertion: the run must not silently report "nothing to
        // critique" when in fact no LLM call ever completed.
        expect(threw || findings.length > 0).toBe(true);

        // The refusal must be actionable, not an anonymous crash.
        if (threw) {
          const message = error instanceof Error ? error.message : String(error);
          expect(message).toMatch(/in-session provider/i);
          expect(message).toMatch(/HARNESS_CRAFT_LLM/);
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
