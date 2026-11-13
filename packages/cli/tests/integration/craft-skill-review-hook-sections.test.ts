// packages/cli/tests/integration/craft-skill-review-hook-sections.test.ts
//
// Phase 4. Every craft domain the resolver can auto-wire must document the
// contract it is invoked under. Three things make this law able to fail,
// rather than a fixture that reads as coverage:
//
//  (a) The denominator is CRAFT_REVIEW_DOMAINS, read from the PUBLISHED
//      surface — not a hand list that silently stops covering a domain.
//  (b) The `promptBudget` expectation is derived from the MCP tool's own
//      inputSchema. `design_craft` declares NO `promptBudget` (measured),
//      so the uniform "files + promptBudget" contract is false and the doc
//      must say so; adding `promptBudget` to that schema reddens this file.
//  (c) The craft platform mirrors are REAL COPIES, not symlinks (measured:
//      `agents/skills/cursor/code-craft` is a directory, while
//      `agents/skills/cursor/harness-code-review` is a symlink). Nothing
//      else in this repository notices when the four copies drift.
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { CRAFT_REVIEW_DOMAINS } from '@harness-engineering/core';
import { getToolDefinitions } from '../../src/mcp/server';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SKILLS_ROOT = path.join(REPO_ROOT, 'agents', 'skills');
/** The four platform trees that ship a skill. A fifth would redden below. */
const PLATFORMS = ['claude-code', 'codex', 'cursor', 'gemini-cli'] as const;
const HEADING = '## Invoked as a review hook';

/** `harness-design-craft` -> `design_craft`; `cli-ergonomics-craft` -> `cli_ergonomics_craft`. */
function toolNameFor(skill: string): string {
  return skill.replace(/^harness-/, '').replace(/-/g, '_');
}

function skillMd(platform: string, skill: string): string {
  return fs.readFileSync(path.join(SKILLS_ROOT, platform, skill, 'SKILL.md'), 'utf-8');
}

/** The section body, or a loud throw — never '' (which would fail silently-ish). */
function section(md: string, skill: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === HEADING);
  if (start === -1) throw new Error(`${skill}: "${HEADING}" section is missing`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

const DOMAINS = CRAFT_REVIEW_DOMAINS.map((d) => d.skill);
const TOOLS = new Map(getToolDefinitions().map((t) => [t.name, t]));

describe('every auto-wired craft skill documents its review-hook forwarding contract', () => {
  it('[denominator] the table comes from CRAFT_REVIEW_DOMAINS and is non-empty', () => {
    // Without this, a table that resolved to [] would make every loop below
    // vacuously true and the file would report a clean 1 passed.
    expect(DOMAINS.length).toBeGreaterThan(0);
    expect(DOMAINS).toContain('harness-design-craft');
    expect(DOMAINS).not.toContain('copy-craft'); // not activated in v1
  });

  for (const skill of DOMAINS) {
    const toolName = toolNameFor(skill);

    it(`${skill}: declares the section, the ABSOLUTE files contract and its own MCP tool`, () => {
      expect(TOOLS.get(toolName), `MCP tool ${toolName} must exist`).toBeDefined();
      const s = section(skillMd('claude-code', skill), skill);
      expect(s).toMatch(/\*\*`files`\*\*/);
      expect(s).toMatch(/ABSOLUTE/);
      expect(s).toContain(`mcp__harness__${toolName}`);
      expect(s).toMatch(/advisory/i);
      expect(s).toContain('after:mechanical');
      expect(s).toContain('after:REVIEW');
    });

    it(`${skill}: its promptBudget line matches what its MCP tool actually accepts`, () => {
      const schema = TOOLS.get(toolName)!.inputSchema as {
        properties?: Record<string, unknown>;
      };
      const accepts = Object.prototype.hasOwnProperty.call(schema.properties ?? {}, 'promptBudget');
      const s = section(skillMd('claude-code', skill), skill);
      // DERIVED, never a hand table: flipping the schema flips the required line.
      expect(s).toMatch(
        accepts ? /\*\*`promptBudget`\*\* — accepted\b/ : /\*\*`promptBudget`\*\* — not accepted\b/
      );
    });

    it(`${skill}: all four platform mirrors carry the identical SKILL.md`, () => {
      const files = PLATFORMS.map((p) => path.join(SKILLS_ROOT, p, skill, 'SKILL.md'));
      // Positive control: the four copies EXIST. Without it, "every copy
      // present agrees" is satisfied by a one-element set after a mirror
      // is lost — an absence passing as agreement.
      expect(files.filter((f) => fs.existsSync(f))).toHaveLength(PLATFORMS.length);
      expect(PLATFORMS.length).toBe(4);
      const bodies = new Set(files.map((f) => fs.readFileSync(f, 'utf-8')));
      expect(bodies.size, `${skill}: platform mirrors have drifted`).toBe(1);
    });
  }
});

// MUTATION RESULTS (2026-11-13, this tree, each mutation and its test run in
// ONE command with the diff printed alongside the result):
//
//  M-CRAFT-SECTION — deleted the whole 19-line `## Invoked as a review hook`
//    section from claude-code/docs-craft/SKILL.md (anchor verified to match
//    exactly once). docs-craft's 3 cases RED, the other nine skills' 27 cases
//    and the denominator GREEN: 3 failed | 28 passed.
//  M-CRAFT-MIRROR — appended one `<!-- drift -->` line to the CURSOR copy of
//    api-craft only. ONLY api-craft's mirror case RED ("platform mirrors have
//    drifted: expected 2 to be 1"); api-craft's other two cases GREEN, since
//    they read the claude-code copy; every other skill GREEN. 1 failed | 30
//    passed. This law is the only thing in the repository that can see craft
//    mirror drift.
//  M-CRAFT-SCHEMA — added `promptBudget: { type: 'number' }` to design_craft's
//    inputSchema.properties. ONLY harness-design-craft's promptBudget case RED
//    (it now demands `— accepted` while the doc says `— not accepted`); the
//    other nine promptBudget cases GREEN. Run together with
//    tests/mcp/tool-tiers.test.ts as the record: 1 failed | 47 passed, so no
//    other MCP schema test moved under it. The expectation is derived from the
//    schema, not from a hand table.
//
//  M-CRAFT-MIRROR-MISSING (unregistered sub-probe, run because an absence
//    assertion needs a control at the same scope) — deleted
//    gemini-cli/spec-craft/SKILL.md outright. The three surviving copies still
//    AGREE, so without the existence check "every present copy is identical"
//    would have passed over a lost mirror. It failed on the control first:
//    "expected [ …(3) ] to have a length of 4 but got 3".
//
// 3 registered mutants, 0 survivors; 1 sub-probe, also killed.
