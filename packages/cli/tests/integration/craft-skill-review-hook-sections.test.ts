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

// Phase 5. Every review host is now documented to forward ABSOLUTE paths —
// Phase 3 and Phase 4 wrote that into both hosts' SKILL.md and into all 40
// craft "Invoked as a review hook" sections. A tool schema that still
// instructs "relative to project root" contradicts the instruction its own
// callers are given, inside the schema the caller reads.
describe('no auto-wired craft tool instructs a repo-relative `files` path form', () => {
  it('[denominator] every auto-wired domain exposes a `files` property with a description', () => {
    // Without this, a domain whose schema lost `files` would make its case
    // below throw on undefined rather than report a missing contract — and a
    // zero-length DOMAINS would make the whole block vacuously green.
    expect(DOMAINS.length).toBeGreaterThan(0);
    for (const skill of DOMAINS) {
      const name = toolNameFor(skill);
      const props = (TOOLS.get(name)!.inputSchema as { properties?: Record<string, unknown> })
        .properties;
      expect(Object.keys(props ?? {}), `${name} must expose a files property`).toContain('files');
    }
  });

  for (const skill of DOMAINS) {
    it(`${skill}: its \`files\` description does not instruct a repo-relative path`, () => {
      const props = (
        TOOLS.get(toolNameFor(skill))!.inputSchema as {
          properties?: Record<string, { description?: string }>;
        }
      ).properties!;
      const description = props.files.description ?? '';
      // VACUITY CONTROL: an empty description trivially satisfies a
      // `not.toMatch`, so the absence assertion needs a presence one beside it.
      expect(description.length, `${toolNameFor(skill)}: files has no description`).toBeGreaterThan(
        0
      );
      expect(description).not.toMatch(/relative to (?:the )?project root/i);
    });
  }
});

// FINAL_REVIEW I-2. "Forwarding unresolved paths yields `status: "collected"`
// with zero prompts" was asserted in six shipped prose sites. It is TRUE for
// the nine collector-based domains and FALSE for design_craft, which has no
// collector at all: `grep -rn "'collected'" packages/cli/src/design-craft`
// returns nothing, and a relative entry throws ENOENT out of runCritique
// (pinned, with two mutants, in tests/design-craft/phases/files-path-form.ts).
// The split is DERIVED here from CRAFT_REVIEW_DOMAINS and the source tree, so a
// domain that gained or lost a collector reddens the prose law below with it.
describe('the `status: "collected"` claim is made only where a collector exists', () => {
  /** `harness-design-craft` -> src/design-craft; `code-craft` -> src/code-craft. */
  function srcDirFor(skill: string): string {
    return path.join(REPO_ROOT, 'packages', 'cli', 'src', skill.replace(/^harness-/, ''));
  }

  function filesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...filesUnder(full));
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  const collectorDomains = DOMAINS.filter((skill) => {
    const dir = srcDirFor(skill);
    if (!fs.existsSync(dir)) throw new Error(`${skill}: no source directory at ${dir}`);
    return filesUnder(dir).some((f) => fs.readFileSync(f, 'utf-8').includes("'collected'"));
  });

  it('[denominator] exactly one auto-wired domain has no collector, and it is design-craft', () => {
    // Both halves asserted. "design-craft has none" alone would also hold if the
    // probe could not see ANY source — the nine is the positive control.
    expect(DOMAINS).toHaveLength(10);
    expect(collectorDomains).toHaveLength(9);
    expect(DOMAINS.filter((d) => !collectorDomains.includes(d))).toEqual(['harness-design-craft']);
  });

  for (const platform of PLATFORMS) {
    it(`${platform}: harness-design-craft's hook section does not claim it collects`, () => {
      const body = section(skillMd(platform, 'harness-design-craft'), 'harness-design-craft');
      // VACUITY CONTROL: `section` throws rather than returning '' when the
      // heading is missing, and this pins that the body is the real one.
      expect(body).toContain('`files`');
      expect(body, `${platform}: design-craft claims the collector failure mode`).not.toMatch(
        /the\s+collectors read nothing and the run reports/
      );
      // The positive half, at the same scope: it has to state what DOES happen.
      // Matched across the line wrap (`**throws\n  \`ENOENT\`**`), because this
      // file wraps prose at ~100 cols and a same-line probe would pin the
      // FORMATTING rather than the claim.
      expect(body.replace(/\s+/g, ' ')).toMatch(/no collector[\s\S]*ENOENT/);
    });
  }

  for (const host of ['harness-autopilot', 'harness-code-review'] as const) {
    it(`${host}: qualifies the collected claim instead of stating it uniformly`, () => {
      const md = skillMd('claude-code', host);
      const lines = md.split('\n');
      const sites = lines
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => line.includes('status: "collected"'));
      // CARDINALITY: one site per host today. A second, unqualified mention
      // added later must redden rather than slip past a per-site loop.
      expect(sites).toHaveLength(1);
      // WINDOW, not same-line: both hosts wrap prose at ~100 cols, so the
      // qualifier lands on an adjacent line. VACUITY CHECKED — "nine
      // collector-based domains" appears nowhere else in either file, so no
      // unrelated prose can satisfy a window of this width.
      const { n } = sites[0]!;
      const window = lines.slice(Math.max(0, n - 3), n + 3).join(' ');
      expect(window, `${host} states the collected claim without the exception`).toMatch(
        /nine collector-based domains/
      );
      expect(window, `${host} does not name the design_craft throw`).toMatch(/ENOENT/);
    });
  }
});

// MUTATION RESULTS (2026-11-13, Phase 5 `files` path-form law)
//
//  M-DCDESC-REVERT (the PRE-EDIT control; run once, before the schema fix,
//    and not re-run afterwards because the pre-edit document IS the mutant) —
//    with design_craft's description still reading "Each entry is a path
//    relative to project root.", exactly ONE of the ten per-domain cases was
//    RED: "harness-design-craft: its `files` description does not instruct a
//    repo-relative path ... expected 'Optional file scoping. Each entry is …'
//    not to match /relative to (?:the )?project root/i". The denominator and
//    the other nine domains were GREEN, and so were all 31 pre-existing cases:
//    1 failed | 41 passed (42). One RED out of ten is the measurement that
//    made this a denominator law — ten RED would have meant a wrong regex,
//    zero RED a law that cannot fail. Post-fix: 42 passed (42).
//  M-DCDESC-EMPTY — set design_craft's `files.description` to ''. RED on the
//    VACUITY CONTROL, not on the absence assertion: "design_craft: files has
//    no description: expected 0 to be greater than 0". An empty string
//    satisfies `not.toMatch` trivially, so without the presence assertion
//    beside it this mutant would have survived. 1 failed | 41 passed (42).
//  M-DCDESC-DENOM — deleted the whole `files` property from code_craft's
//    inputSchema.properties. RED on the denominator case first ("code_craft
//    must expose a files property: expected [ Array(6) ] to include 'files'")
//    and on code-craft's own case second. 2 failed | 40 passed (42). The
//    denominator is what turns "a domain whose schema lost files" from a
//    TypeError on undefined into a named missing-contract report.
//
// 3 registered mutants, 0 survivors.
