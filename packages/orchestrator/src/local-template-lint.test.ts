import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lint guard for the two copies of the local-backend prompt template.
 *
 * Phase 5 (local-backend-full-workflow, SC8) turned this template from an
 * inlined paraphrase of the workflow methodology into a thin **indirection
 * shim**: the local agent obtains the REAL skills via
 * `harness skill run <name> --autonomous`, and the template teaches the
 * `/harness:X` -> `harness skill run harness-X` redirect rather than
 * restating the methodology. These guards enforce that contract and fail
 * loudly if someone re-inlines methodology.
 *
 * Both copies must:
 *   - be byte-identical (SC6) — the repo-root copy is what `harness init`
 *     drops in; the `templates/orchestrator/` copy is the scaffold source;
 *   - invoke the real skills via `harness skill run … --autonomous` (SC8);
 *   - carry the `/harness:X` redirect rule — a `/harness:` reference may only
 *     exist to be redirected to `harness skill run` (SC8);
 *   - stay a shim, not a paraphrase — enforced by a body line budget (SC8);
 *   - keep the enforced-gate note (`harness validate` / verify) so the agent
 *     knows the orchestrator gates its output;
 *   - preserve the `{{ issue.* }}` / `{{ attempt }}` render variables so the
 *     dispatch renderer's interpolation contract is not broken.
 */

// Test file lives at packages/orchestrator/src/ ; repo root is four levels up.
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const ROOT_TEMPLATE = path.join(REPO_ROOT, 'harness.orchestrator.local.md');
const SCAFFOLD_TEMPLATE = path.join(
  REPO_ROOT,
  'templates',
  'orchestrator',
  'harness.orchestrator.local.md'
);

const rootContent = fs.readFileSync(ROOT_TEMPLATE, 'utf8');
const scaffoldContent = fs.readFileSync(SCAFFOLD_TEMPLATE, 'utf8');

// The rendered body is everything after the closing frontmatter `---`.
function bodyOf(content: string): string {
  const lines = content.split('\n');
  let dashes = 0;
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '---') {
      dashes++;
      if (dashes === 2) {
        start = i + 1;
        break;
      }
    }
  }
  return lines.slice(start).join('\n');
}

describe('local template lint — byte identity (SC6)', () => {
  it('the repo-root copy and the templates/orchestrator copy are byte-identical', () => {
    expect(rootContent).toBe(scaffoldContent);
  });
});

describe('local template lint — real skills via skill run --autonomous (SC8)', () => {
  for (const [label, content] of [
    ['repo-root', rootContent],
    ['scaffold', scaffoldContent],
  ] as const) {
    it(`${label}: invokes the real skills via "harness skill run"`, () => {
      expect(content).toMatch(/harness skill run/);
    });

    it(`${label}: runs skills headless with --autonomous`, () => {
      expect(content).toContain('--autonomous');
    });

    it(`${label}: carries the /harness:X redirect rule (slash refs only exist to be redirected)`, () => {
      // A shim may MENTION `/harness:` only to teach the redirect. If any
      // `/harness:` token appears, the redirect target (`harness skill run`)
      // must also appear — the slash form is never a live instruction here.
      if (/\/harness:/.test(content)) {
        expect(content).toMatch(/harness skill run/);
      }
    });
  }
});

describe('local template lint — shim, not paraphrase (SC8 line budget)', () => {
  // Mechanical proxy for "no inlined methodology": the pre-Phase-5 template's
  // body was ~200 lines of paraphrased methodology. A shim is a small fraction
  // of that. Re-inlining the methodology blows this budget and fails loudly.
  const MAX_BODY_LINES = 80;
  for (const [label, content] of [
    ['repo-root', rootContent],
    ['scaffold', scaffoldContent],
  ] as const) {
    it(`${label}: rendered body is <= ${MAX_BODY_LINES} lines`, () => {
      const bodyLines = bodyOf(content).split('\n').length;
      expect(bodyLines).toBeLessThanOrEqual(MAX_BODY_LINES);
    });
  }
});

describe('local template lint — enforced-gate note survives', () => {
  for (const [label, content] of [
    ['repo-root', rootContent],
    ['scaffold', scaffoldContent],
  ] as const) {
    it(`${label}: names the enforced gate (harness validate / verify)`, () => {
      expect(content).toMatch(/harness validate|verify/);
    });
  }
});

describe('local template lint — render variables survive (SC7)', () => {
  // The dispatch renderer supplies `issue` + `attempt` (orchestrator render
  // call). If any of these mustache tokens are accidentally stripped or
  // reformatted, the rendered prompt loses the issue context / attempt number.
  const REQUIRED_VARS = [
    '{{ issue.title }}',
    '{{ issue.identifier }}',
    '{{ issue.description }}',
    '{{ attempt }}',
  ];

  for (const [label, content] of [
    ['repo-root', rootContent],
    ['scaffold', scaffoldContent],
  ] as const) {
    for (const token of REQUIRED_VARS) {
      it(`${label}: preserves the ${token} render variable`, () => {
        expect(content).toContain(token);
      });
    }
  }
});
