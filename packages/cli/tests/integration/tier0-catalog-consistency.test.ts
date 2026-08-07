// packages/cli/tests/integration/tier0-catalog-consistency.test.ts
//
// Tier-0 (load-bearing gear) drift lock.
//
// The set of load-bearing skills is declared in THREE independently
// hand-maintained places:
//
//   (1) skill.yaml            — `catalog_tier: 0` on each skill. SOURCE OF
//                               TRUTH. The generated skills-catalog.md and
//                               every downstream consumer derive from this.
//   (2) README.md             — the "Load-bearing skills (Tier-0)" table,
//                               written by hand (skill name + slash command).
//   (3) dashboard registry    — `loadBearing: true` flags in
//                               packages/dashboard/src/client/constants/skills.ts,
//                               a separate hand-maintained list that drives the
//                               command palette.
//
// Because (2) and (3) are edited by hand and NOT generated from (1), any of
// them can silently drift from the yaml source of truth — a skill promoted
// to / demoted from Tier-0 in skill.yaml without the README row or the
// dashboard flag being updated (or vice versa). This suite fails the moment
// the three sets disagree.
//
// The README table is the crosswalk between the two naming schemes: its
// first column is the skill.yaml `name` (e.g. `harness-audit-harness-strength`)
// and its second column is the slash command (e.g. `/harness:audit-strength`),
// which is exactly the dashboard entry's `slashCommand`. The two naming forms
// are NOT mechanically derivable from each other (see audit-harness-strength ↔
// audit-strength, and the prefix-less `outcome-eval`), so the equality is
// chained through the README rather than a hand-written mapping that could
// itself drift.
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SKILLS_DIR = path.join(REPO_ROOT, 'agents', 'skills', 'claude-code');
const README = path.join(REPO_ROOT, 'README.md');
const DASHBOARD_REGISTRY = path.join(
  REPO_ROOT,
  'packages',
  'dashboard',
  'src',
  'client',
  'constants',
  'skills.ts'
);

/** skill.yaml names whose `catalog_tier` is 0. Source of truth. */
function tier0SkillNamesFromYaml(): Set<string> {
  const names = new Set<string>();
  for (const dir of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const yamlPath = path.join(SKILLS_DIR, dir.name, 'skill.yaml');
    if (!fs.existsSync(yamlPath)) continue;
    const text = fs.readFileSync(yamlPath, 'utf-8');
    const tierMatch = text.match(/^catalog_tier:\s*(\d+)\s*$/m);
    if (!tierMatch || tierMatch[1] !== '0') continue;
    const nameMatch = text.match(/^name:\s*(.+?)\s*$/m);
    if (!nameMatch) throw new Error(`name field not found in ${yamlPath}`);
    names.add(nameMatch[1].trim().replace(/^["']|["']$/g, ''));
  }
  return names;
}

/**
 * Rows of the README "Load-bearing skills (Tier-0)" table, as
 * { skill, slash } pairs (both stripped of their backticks).
 */
function tier0RowsFromReadme(): Array<{ skill: string; slash: string }> {
  const md = fs.readFileSync(README, 'utf-8');
  const start = md.indexOf('### Load-bearing skills (Tier-0)');
  if (start === -1) throw new Error('Tier-0 section heading not found in README.md');
  // Section ends at the next level-2 heading.
  const rest = md.slice(start);
  const end = rest.indexOf('\n## ');
  const section = end === -1 ? rest : rest.slice(0, end);

  const rows: Array<{ skill: string; slash: string }> = [];
  const rowRe = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(section)) !== null) {
    rows.push({ skill: m[1].trim(), slash: m[2].trim() });
  }
  return rows;
}

/** `slashCommand` values of dashboard registry entries flagged loadBearing. */
function loadBearingSlashCommandsFromDashboard(): Set<string> {
  const src = fs.readFileSync(DASHBOARD_REGISTRY, 'utf-8');
  const slashes = new Set<string>();
  // Registry entries are flat object literals (no nested braces — arrays use
  // brackets), so each `{ ... }` block is one entry.
  const objectRe = /\{[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = objectRe.exec(src)) !== null) {
    const block = m[0];
    if (!/loadBearing:\s*true/.test(block)) continue;
    const slash = block.match(/slashCommand:\s*['"]([^'"]+)['"]/);
    if (!slash) throw new Error(`loadBearing entry missing slashCommand:\n${block}`);
    slashes.add(slash[1].trim());
  }
  return slashes;
}

describe('Tier-0 catalog consistency (load-bearing drift lock)', () => {
  it('README Tier-0 table lists exactly the catalog_tier:0 skills from skill.yaml', () => {
    const yamlSet = tier0SkillNamesFromYaml();
    const readmeSkills = new Set(tier0RowsFromReadme().map((r) => r.skill));

    // Non-trivial: a corrupt parse that returns an empty set must not pass.
    expect(yamlSet.size).toBeGreaterThan(0);
    expect([...readmeSkills].sort()).toEqual([...yamlSet].sort());
  });

  it('dashboard loadBearing entries match the README Tier-0 slash commands', () => {
    const readmeSlashes = new Set(tier0RowsFromReadme().map((r) => r.slash));
    const dashboardSlashes = loadBearingSlashCommandsFromDashboard();

    expect(dashboardSlashes.size).toBeGreaterThan(0);
    expect([...dashboardSlashes].sort()).toEqual([...readmeSlashes].sort());
  });

  it('all three sources agree on the same Tier-0 cardinality', () => {
    const yamlCount = tier0SkillNamesFromYaml().size;
    const readmeRows = tier0RowsFromReadme();
    const dashboardCount = loadBearingSlashCommandsFromDashboard().size;

    // README rows carry both a skill name and a slash command; a duplicated or
    // dropped column would desync the two per-row sets.
    const readmeSkillCount = new Set(readmeRows.map((r) => r.skill)).size;
    const readmeSlashCount = new Set(readmeRows.map((r) => r.slash)).size;

    expect(readmeSkillCount).toBe(yamlCount);
    expect(readmeSlashCount).toBe(yamlCount);
    expect(dashboardCount).toBe(yamlCount);
  });
});
