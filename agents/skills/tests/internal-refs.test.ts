// agents/skills/tests/internal-refs.test.ts
//
// Guard: shipped skills, slash commands, and subagent definitions are copied
// verbatim into projects that ADOPT harness engineering. They must not leak
// harness-engineering-INTERNAL references — roadmap/PR/issue numbers and
// sub-project indices — which are meaningless (and confusing) to an adopter.
//
// Internal linkage belongs in specs, commit messages, PR bodies, and code
// comments — NOT in the rendered text an adopter reads. This test greps every
// distributed surface for the internal-ref pattern and fails on any match that
// is not on the allowlist of genuine non-leaks (pedagogical `#N` teaching and
// fabricated illustrative examples).

import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..'); // agents/skills
const REPO_ROOT = resolve(SKILLS_DIR, '..', '..'); // repo root

// Every shipped/distributed surface. Skill bodies ship for every platform;
// the plugin command/agent artifacts are generated from skills + personas and
// ship inside the marketplace plugins.
const SURFACES: { cwd: string; patterns: string[] }[] = [
  { cwd: SKILLS_DIR, patterns: ['**/SKILL.md', '**/skill.yaml'] },
  {
    cwd: REPO_ROOT,
    patterns: [
      '.claude-plugin/commands/**/*.md',
      '.claude-plugin/agents/**/*.md',
      '.cursor-plugin/commands/**/*.md',
      '.cursor-plugin/agents/**/*.md',
      '.gemini-extension/commands/**/*.toml',
    ],
  },
];

const IGNORE = ['**/node_modules/**', '**/tests/**'];

// Internal-ref leak shapes. Deliberately framed (a keyword or a sub-project
// index) so that hex colors (`#767676`), in-document ordinals ("criterion #9"),
// and fabricated example numbers that are NOT framed as a tracker reference do
// not trip the guard — keeping false positives low.
const LEAK_PATTERNS: RegExp[] = [
  // "deferred to roadmap #540", "shipped in PR #390", "see issue #487"
  /\b(?:roadmap|PR|pull request|issue) #\d{1,4}\b/g,
  // "sub-project #4", "craft-pipeline sub-project #6", "design-pipeline #1"
  /\b(?:sub-project|craft-pipeline|design-pipeline) #\d{1,4}\b/g,
  // "docs-craft #2", "code-craft #4", "design-pipeline #5"
  /\b[a-z][a-z-]*-(?:craft|pipeline) #\d{1,4}\b/g,
  // sub-project index attached to a skill name: "`naming-craft` (#1)"
  /`[^`\n]+` \(#\d{1,4}\)/g,
];

// Genuine non-leaks. A flagged line is permitted only when it contains one of
// these substrings. Each is either pedagogical content teaching GitHub's `#N`
// semantics (which REQUIRES a concrete-looking number to teach) or a fabricated
// illustrative example — never a real harness-engineering tracker reference.
const ALLOWLIST: { substr: string; reason: string }[] = [
  {
    substr: 'Closes roadmap #123',
    reason: 'harness-autopilot: teaches GitHub closing-keyword parsing (placeholder number)',
  },
  {
    substr: 'cross-reference issue #9',
    reason: 'harness-git-workflow: teaches the `#N` auto-link hazard itself',
  },
  {
    substr: 'auto-link to issue/PR #9',
    reason: 'harness-git-workflow: teaches the `#N` auto-link hazard itself',
  },
  {
    substr: 'tracked in issue #123',
    reason: 'harness-verification: teaches the tracked-TODO convention (placeholder number)',
  },
  {
    substr: 'PR #247',
    reason: 'ux-notification-copy: fabricated notification-copy example, not a real PR',
  },
  {
    substr: 'PR #212',
    reason: 'harness-audit: fabricated audit-run scenario, not a real PR',
  },
  {
    substr: 'theme issue #240',
    reason: 'harness-audit: fabricated audit-run scenario, not a real issue',
  },
];

function isAllowlisted(line: string): boolean {
  return ALLOWLIST.some((entry) => line.includes(entry.substr));
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const surface of SURFACES) {
    for (const pattern of surface.patterns) {
      const matched = glob.sync(pattern, { cwd: surface.cwd, ignore: IGNORE, absolute: true });
      files.push(...matched);
    }
  }
  return Array.from(new Set(files)).sort();
}

describe('shipped surfaces carry no internal roadmap/PR/issue references', () => {
  const files = collectFiles();

  if (files.length === 0) {
    it.skip('no shipped surfaces found', () => {});
    return;
  }

  it.each(files.map((f) => ({ file: f })))('$file has no internal ref leaks', ({ file }) => {
    const rel = relative(REPO_ROOT, file);
    const lines = readFileSync(file, 'utf-8').split('\n');
    const leaks: string[] = [];

    lines.forEach((line, idx) => {
      if (isAllowlisted(line)) return;
      for (const pattern of LEAK_PATTERNS) {
        pattern.lastIndex = 0;
        const found = line.match(pattern);
        if (found) {
          leaks.push(`${rel}:${idx + 1}  →  ${found.join(', ')}`);
        }
      }
    });

    expect(
      leaks,
      leaks.length === 0
        ? ''
        : `Internal roadmap/PR/issue reference(s) leaked into a shipped surface. ` +
            `Genericize the text (keep it meaningful without the number) — internal linkage ` +
            `belongs in specs/commits/PR bodies, not in rendered skill text. If this is ` +
            `genuinely pedagogical or a fabricated example, add it to ALLOWLIST with a reason.\n` +
            leaks.join('\n')
    ).toEqual([]);
  });
});
