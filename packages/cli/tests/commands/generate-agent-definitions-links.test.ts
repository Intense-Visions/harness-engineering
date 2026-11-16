import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateAgentDefinitions } from '../../src/commands/generate-agent-definitions';

/**
 * Regression for #2132: generated agent definitions inline each skill's
 * SKILL.md, whose relative links (e.g. `references/confidence-rubric.md`)
 * resolve against the skill directory — not the flat agents output dir, where
 * nothing is written. Every relative Markdown link in generated output must
 * resolve to a file that actually exists next to the generated file.
 */

const MARKDOWN_PLATFORMS = ['claude-code', 'gemini-cli', 'cursor'] as const;

function relativeLinkTargets(markdown: string): string[] {
  const targets: string[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // Drop inline code spans so a literal `[x](y)` in backticks is not a link.
    const prose = line.replace(/`[^`]*`/g, '');
    for (const m of prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1]!;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      targets.push(target.split('#')[0]!);
    }
  }
  return targets;
}

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-def-links-test-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateAgentDefinitions — no dead relative links (#2132)', () => {
  it('every relative Markdown link in generated output resolves to an emitted file', () => {
    const results = generateAgentDefinitions({
      platforms: [...MARKDOWN_PLATFORMS],
      global: false,
      output: tmpDir,
      dryRun: false,
    });

    let filesScanned = 0;
    const dead: string[] = [];
    for (const result of results) {
      for (const file of fs.readdirSync(result.outputDir)) {
        if (!file.endsWith('.md')) continue;
        filesScanned++;
        const content = fs.readFileSync(path.join(result.outputDir, file), 'utf-8');
        for (const target of relativeLinkTargets(content)) {
          if (!fs.existsSync(path.resolve(result.outputDir, target))) {
            dead.push(`${result.platform}/${file} -> ${target}`);
          }
        }
      }
    }

    // Denominator guard: an empty scan must not read as a pass.
    expect(filesScanned).toBeGreaterThan(MARKDOWN_PLATFORMS.length);
    expect(dead).toEqual([]);
  });
});
