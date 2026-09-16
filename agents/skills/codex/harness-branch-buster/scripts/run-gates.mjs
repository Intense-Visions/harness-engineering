/* eslint-disable -- vendored skill tooling: Node CLI; not app source */
// run-gates.mjs
//
// Runs a project's blocking CI gate set locally, in CI order, and turns the
// output into structured Findings.
//
// ## Why the gate list is configuration and not a constant
//
// This script was promoted out of a single monorepo, where GATES was a literal
// array naming that repo's commands (its build task, a CMS codegen drift
// check, and so on). A hardcoded list makes the skill work in exactly one
// repository, which is the thing promotion is meant to undo. The gate list now
// comes from `harness.config.json` → `skills.branchBuster.gates[]`, so the
// parsers here — which are genuinely generic — are shared while the commands
// stay the project's own.
//
// ## Trust model (read before adding a gate)
//
// `run()` executes each gate's `cmd` **through a shell**. Commands therefore
// come only from `harness.config.json`, which is an in-repo, version-controlled
// file at the same trust level as `package.json` scripts — anyone who can edit
// it can already run code in the project. Never pass externally-derived input
// (a PR title, a branch name, a CLI argument) into `cmd`.
//
// ## Zero gates is an abstention, not a pass
//
// If the project configures no gates, this returns `configured: false` and an
// empty result set. Callers MUST NOT render that as "all gates passed" — a gate
// set that ran nothing verified nothing. `summarize()` makes the distinction
// explicit so the report cannot claim coverage it does not have.

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const rel = (root, p) => (p.startsWith('/') ? relative(root, p) : p);

/**
 * Read the project's gate set from harness.config.json.
 *
 * Shape (all fields but `id` and `cmd` optional):
 *   skills.branchBuster.gates[] = {
 *     id: string,            // stable identifier, used as the finding's `gate`
 *     cmd: string,           // shell command, run from the project root
 *     parse: 'passfail' | 'prettier' | 'markdownlint' | 'eslint' | 'tsc' | 'vitest' | 'drift',
 *     blocking: boolean,     // false => findings are suggestions, not criticals
 *     optional: boolean,     // skip (as "verified in CI only") if `bin` is absent
 *     bin: string,           // binary to probe for `optional` gates
 *     drift: {               // only for parse: 'drift'
 *       regenerate: string[],// commands that rewrite generated artifacts
 *       paths: string[],     // paths to diff afterwards
 *       remedy: string       // what to tell the user to re-run
 *     }
 *   }
 *
 * Returns `{ gates, baselineEnv, configured }`. `configured: false` means the
 * project has declared nothing — an abstention, never a pass.
 */
export function loadGates(root = process.cwd()) {
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(resolve(root, 'harness.config.json'), 'utf8'));
  } catch {
    // No config, or unreadable — treated as "nothing declared" below.
  }
  const section = cfg?.skills?.branchBuster ?? {};
  const gates = Array.isArray(section.gates) ? section.gates : [];
  return {
    gates,
    // The env var that pins an incremental build tool to the PR base, so a local
    // run scopes work exactly as CI does. Turbo calls it TURBO_SCM_BASE; Nx and
    // others differ, so it is named rather than assumed. Absent = do not set one.
    baselineEnv: section.baselineEnv ?? null,
    configured: gates.length > 0,
  };
}

export function parseEslintJson(json, root = process.cwd()) {
  const out = [];
  for (const file of JSON.parse(json)) {
    for (const m of file.messages || []) {
      out.push({
        file: rel(root, file.filePath),
        lineRange: [m.line || 0, m.line || 0],
        type: 'lint',
        severity: m.severity === 2 ? 'critical' : 'suggestion',
        title: `${m.ruleId || 'eslint'}: ${m.message}`,
        gate: 'eslint',
        evidence: [`${rel(root, file.filePath)}:${m.line || 0}`],
        validatedBy: 'mechanical',
      });
    }
  }
  return out;
}

export function parseTscOutput(text, root = process.cwd()) {
  const re = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/gm;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({
      file: rel(root, m[1]),
      lineRange: [Number(m[2]), Number(m[2])],
      type: 'type',
      severity: 'critical',
      title: `${m[4]}: ${m[5]}`,
      gate: 'typescript',
      evidence: [`${rel(root, m[1])}:${m[2]}`],
      validatedBy: 'mechanical',
    });
  }
  return out;
}

export function parseVitestJson(json, root = process.cwd()) {
  const data = JSON.parse(json);
  const out = [];
  for (const tr of data.testResults || []) {
    if (tr.status !== 'failed') continue;
    const failed = (tr.assertionResults || []).filter((a) => a.status === 'failed');
    out.push({
      file: rel(root, tr.name),
      lineRange: [0, 0],
      type: 'test',
      severity: 'critical',
      title: failed.length
        ? `Failing test(s): ${failed.map((a) => a.title).join('; ')}`
        : 'Test file failed',
      gate: 'test',
      evidence: failed.flatMap((a) => a.failureMessages || []).slice(0, 3),
      validatedBy: 'mechanical',
    });
  }
  return out;
}

export function parsePrettierCheck(text, gateId = 'format') {
  return text
    .split('\n')
    .filter((l) => l.startsWith('[warn]') && !l.includes('Code style issues'))
    .map((l) => l.replace('[warn]', '').trim())
    .filter(Boolean)
    .map((file) => ({
      file,
      lineRange: [0, 0],
      type: 'lint',
      severity: 'critical',
      title: 'File is not formatted',
      gate: gateId,
      evidence: [file],
      validatedBy: 'mechanical',
    }));
}

export function parseMarkdownlint(text, gateId = 'markdown') {
  const re = /^(.+?\.mdx?):(\d+)(?::\d+)?\s+(\S+)\s+(.*)$/gm;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({
      file: m[1],
      lineRange: [Number(m[2]), Number(m[2])],
      type: 'lint',
      severity: 'critical',
      title: `${m[3]} ${m[4]}`.trim(),
      gate: gateId,
      evidence: [`${m[1]}:${m[2]}`],
      validatedBy: 'mechanical',
    });
  }
  return out;
}

export function parseDriftFiles(
  text,
  gateId = 'codegen-drift',
  remedy = 'regenerate the artifact'
) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((file) => ({
      file: file.trim(),
      lineRange: [0, 0],
      type: 'drift',
      severity: 'critical',
      title: `Generated artifact drift: ${remedy}`,
      gate: gateId,
      evidence: [file.trim()],
      validatedBy: 'mechanical',
    }));
}

/**
 * Describe what a run actually covered.
 *
 * The `configured: false` case is the one that matters: it must never be
 * summarized as success. A caller that prints "gates: 0 failed" without this
 * distinction reproduces the "0 checked ✓" false green this skill exists to
 * catch elsewhere.
 */
export function summarize({ results, configured }) {
  if (!configured) {
    return {
      verdict: 'abstained',
      ran: 0,
      failed: 0,
      message:
        'No gates are configured (skills.branchBuster.gates in harness.config.json). ' +
        'Nothing was verified — this is an abstention, not a pass.',
    };
  }
  const ran = results.filter((r) => !r.skipped).length;
  const failed = results.filter((r) => !r.passed).length;
  return {
    verdict: failed > 0 ? 'fail' : ran === 0 ? 'abstained' : 'pass',
    ran,
    failed,
    skipped: results.filter((r) => r.skipped).map((r) => r.id),
    message:
      ran === 0
        ? 'Every configured gate was skipped — nothing was verified.'
        : `${ran} gate(s) ran, ${failed} failed.`,
  };
}

// Thin I/O driver. Returns { results, findings, configured, summary }.
export function runGates({ root = process.cwd(), base = 'origin/main', only = null } = {}) {
  const { gates, baselineEnv, configured } = loadGates(root);

  const env = { ...process.env };
  if (baselineEnv) {
    const mb = spawnSync('git', ['merge-base', base, 'HEAD'], { cwd: root, encoding: 'utf8' });
    if (mb.status === 0) env[baselineEnv] = mb.stdout.trim();
  }

  const results = [];
  const findings = [];

  // Executes through a shell. See the trust-model note at the top of this file:
  // `cmd` comes from the in-repo harness.config.json and never from user input.
  const run = (cmd) => {
    try {
      return {
        code: 0,
        out: execSync(cmd, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
      };
    } catch (e) {
      return { code: e.status || 1, out: `${e.stdout || ''}\n${e.stderr || ''}` };
    }
  };

  for (const g of gates) {
    if (only && g.id !== only) continue;

    if (g.optional) {
      // Prefer an explicit `bin` over parsing the cmd string: `cmd.split(' ')[0]`
      // extracts the wrong token for a `VAR=x bin …` or `npx bin …` command.
      const bin = g.bin ?? g.cmd.split(' ')[0];
      const probe = spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' });
      if (probe.status !== 0) {
        results.push({
          id: g.id,
          passed: true,
          skipped: true,
          raw: `${bin} not installed locally — verified in CI only`,
        });
        continue;
      }
    }

    if (g.parse === 'drift') {
      const d = g.drift ?? {};
      for (const cmd of d.regenerate ?? []) run(cmd);
      const paths = (d.paths ?? []).join(' ');
      if (!paths) {
        // A drift gate with no paths would diff the whole tree and report every
        // unrelated edit as codegen drift. Refuse rather than mislead.
        results.push({
          id: g.id,
          passed: true,
          skipped: true,
          raw: 'drift gate declares no paths — skipped rather than diffing the whole tree',
        });
        continue;
      }
      const r = run(`git diff --name-only -- ${paths}`);
      const drifted = r.out.trim();
      results.push({ id: g.id, passed: drifted === '', raw: drifted });
      if (drifted) {
        findings.push(...parseDriftFiles(drifted, g.id, d.remedy ?? 'regenerate the artifact'));
      }
      continue;
    }

    const r = run(g.cmd);
    const passed = r.code === 0;
    results.push({ id: g.id, passed, raw: r.out, blocking: g.blocking !== false });
    if (g.parse === 'prettier') findings.push(...parsePrettierCheck(r.out, g.id));
    if (g.parse === 'markdownlint') findings.push(...parseMarkdownlint(r.out, g.id));
    // passfail gates are re-run by SKILL.md with JSON reporters to populate
    // eslint/tsc/vitest findings; the pass/fail bit here is the CI verdict.
  }

  // A non-blocking gate's findings are advisory, not merge-blockers.
  const blockingIds = new Set(gates.filter((g) => g.blocking !== false).map((g) => g.id));
  for (const f of findings) {
    if (!blockingIds.has(f.gate)) f.severity = 'suggestion';
  }

  return { results, findings, configured, summary: summarize({ results, configured }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] || 'origin/main';
  process.stdout.write(JSON.stringify(runGates({ base }), null, 2));
}
