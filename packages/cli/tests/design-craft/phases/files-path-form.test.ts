// packages/cli/tests/design-craft/phases/files-path-form.test.ts
//
// Phase 5. The MEASUREMENT behind the design_craft `files` description
// change, encoded as a law rather than relayed as a claim.
//
// The brief asserted that following the old description ("a path relative to
// project root") makes a run collect ZERO prompts and report a clean pass.
// That is the measured behaviour of OTHER craft collectors; it is not what
// design_craft does. `files` becomes one CritiqueTarget per entry
// (src/mcp/tools/design-craft.ts:287-290); readSource
// (src/design-craft/phases/critique.ts:155-162) takes the path.isAbsolute
// branch, else resolves against process.cwd(); and runCritique (:238-252)
// has NO try/catch around it. So a relative entry either works (cwd ==
// project root) or THROWS. The description was wrong by omission, not by
// silent zero, and this file is why that sentence can be trusted.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCritique } from '../../../src/design-craft/phases/critique.js';
import { hierarchyClarityRubric } from '../../../src/design-craft/catalog/rubrics/hierarchy-clarity.js';
import { MockLlmProvider } from '../../../src/shared/craft/llm/provider.js';

describe('design_craft `files` path forms', () => {
  let dir: string;
  let absolute: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-craft-path-form-'));
    absolute = path.join(dir, 'Button.tsx');
    fs.writeFileSync(absolute, 'export const Button = () => <button>Go</button>;\n', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads an ABSOLUTE entry — the form every review host is documented to forward', async () => {
    const findings = await runCritique({
      targets: [{ file: absolute }],
      rubrics: [hierarchyClarityRubric],
      provider: new MockLlmProvider(),
    });
    // POSITIVE CONTROL for the throw below. Without it, "it threw" is
    // satisfied by an implementation that throws for BOTH path forms.
    expect(findings).toHaveLength(1);
  });

  it('THROWS on an entry relative to a root that is not the process cwd — it does not return an empty finding set', async () => {
    const relativeToAnotherRoot = path.relative(os.tmpdir(), absolute);
    // The probe is genuinely relative...
    expect(path.isAbsolute(relativeToAnotherRoot)).toBe(false);
    // ...and genuinely unresolvable from here, so the throw below is about
    // the path form and not about a file that happens to be missing.
    expect(fs.existsSync(path.resolve(process.cwd(), relativeToAnotherRoot))).toBe(false);

    await expect(
      runCritique({
        targets: [{ file: relativeToAnotherRoot }],
        rubrics: [hierarchyClarityRubric],
        provider: new MockLlmProvider(),
      })
    ).rejects.toThrow(/ENOENT/);
  });
});
