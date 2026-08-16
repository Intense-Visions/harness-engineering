#!/usr/bin/env node
/**
 * Enforce the `auditExceptions` register in the root package.json so a
 * time-boxed deferral cannot silently become a permanent exemption (issue
 * #1324).
 *
 * Before this gate the register was decorative: no source read it and no
 * workflow ran `pnpm audit`, so a NEW advisory never failed CI and a listed
 * advisory was exempt forever. This script closes both holes.
 *
 * It runs `pnpm audit --json`, matches each active advisory (by its
 * `github_advisory_id`, i.e. GHSA id) against the register, and FAILS when:
 *   (a) an active advisory has no register entry, or
 *   (b) a covering entry has lapsed — past its `expires` date, or missing one.
 *
 * A MISSING `expires` is treated as ALREADY LAPSED (fail closed): silence must
 * not re-enter through an entry that never expires. Register entries that no
 * longer match any active advisory are reported as warnings (stale hygiene),
 * not failures.
 *
 * The reconcile logic (`extractAdvisories`, `lapseReason`, `reconcile`) is
 * exported as pure functions for unit testing; only `main()` touches the
 * network. Importing this module has no side effects.
 *
 * Usage: node scripts/audit-exceptions.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Extract the active advisories from `pnpm audit --json` output.
 *
 * pnpm keys its `advisories` map by an internal numeric id but carries the
 * canonical `github_advisory_id` (GHSA) on each entry — the register is
 * GHSA-keyed, so that is the id we reconcile on. Entries without a GHSA fall
 * back to a `numeric:<key>` sentinel so they still surface as uncovered rather
 * than vanishing.
 *
 * @param {unknown} auditJson Parsed `pnpm audit --json` object.
 * @returns {Array<{ id: string, severity: string, module: string }>}
 */
export function extractAdvisories(auditJson) {
  const advisories =
    auditJson && typeof auditJson === 'object' ? auditJson.advisories : undefined;
  if (!advisories || typeof advisories !== 'object') return [];
  const out = [];
  for (const [numericKey, a] of Object.entries(advisories)) {
    if (!a || typeof a !== 'object') continue;
    const id = a.github_advisory_id || `numeric:${numericKey}`;
    out.push({
      id,
      severity: a.severity || 'unknown',
      module: a.module_name || 'unknown',
    });
  }
  return out;
}

/**
 * Return a human-readable reason when a register entry is lapsed, or `null`
 * when it is still valid.
 *
 * The entry must be an object carrying an ISO-date `expires`. A missing or
 * malformed `expires` is lapsed (fail closed). `expires` is inclusive of its
 * whole UTC day: an entry dated D stays valid through the end of D and lapses
 * at the first instant of D+1 — this avoids a same-day off-by-one where an
 * entry dated today would read as already expired.
 *
 * @param {unknown} entry
 * @param {Date} now
 * @returns {string | null}
 */
export function lapseReason(entry, now) {
  if (!entry || typeof entry !== 'object') {
    return 'entry is not an object with a `reason` and `expires` — treated as already lapsed.';
  }
  const expires = entry.expires;
  if (!expires || typeof expires !== 'string') {
    return 'missing `expires` — treated as already lapsed.';
  }
  const parsed = Date.parse(expires);
  if (Number.isNaN(parsed)) {
    return `invalid \`expires\` date: ${JSON.stringify(expires)} — treated as already lapsed.`;
  }
  // Inclusive of the whole expiry day: valid until the start of the next day.
  const deadline = parsed + MS_PER_DAY;
  if (now.getTime() >= deadline) {
    return `exception expired on ${expires}.`;
  }
  return null;
}

/**
 * Reconcile active advisories against the `auditExceptions` register.
 *
 * For every active advisory there must be a register entry that is not lapsed.
 * Register entries that match no active advisory become warnings (stale, safe
 * to remove) — never failures.
 *
 * @param {object} args
 * @param {string[]} args.activeAdvisoryIds GHSA ids of currently active advisories.
 * @param {Record<string, unknown>} args.register The `auditExceptions` map.
 * @param {Date} [args.now]
 * @returns {{
 *   ok: boolean,
 *   failures: Array<{ type: 'uncovered' | 'expired', id: string, detail: string }>,
 *   warnings: Array<{ type: 'stale', id: string, detail: string }>,
 *   covered: string[],
 * }}
 */
export function reconcile({ activeAdvisoryIds, register, now = new Date() }) {
  const reg = register && typeof register === 'object' ? register : {};
  const active = new Set(activeAdvisoryIds || []);
  const failures = [];
  const warnings = [];
  const covered = [];

  for (const id of active) {
    if (!Object.prototype.hasOwnProperty.call(reg, id)) {
      failures.push({
        type: 'uncovered',
        id,
        detail: `Active advisory ${id} has no auditExceptions entry. Fix the dependency, or add an entry with a justification and an \`expires\` date.`,
      });
      continue;
    }
    const reason = lapseReason(reg[id], now);
    if (reason) {
      failures.push({
        type: 'expired',
        id,
        detail: `auditExceptions entry ${id}: ${reason} Re-evaluate the advisory and either resolve it or renew the deferral with a new \`expires\` date.`,
      });
      continue;
    }
    covered.push(id);
  }

  for (const id of Object.keys(reg)) {
    if (!active.has(id)) {
      warnings.push({
        type: 'stale',
        id,
        detail: `auditExceptions entry ${id} no longer matches any active advisory — safe to remove.`,
      });
    }
  }

  return { ok: failures.length === 0, failures, warnings, covered };
}

/**
 * Run `pnpm audit --json` and return its parsed output.
 *
 * `pnpm audit` exits non-zero when it finds vulnerabilities, so we capture
 * stdout from the thrown error too. Throws only when the output cannot be
 * parsed as JSON (so the caller fails closed rather than passing silently).
 *
 * @returns {unknown}
 */
function runAudit() {
  let stdout;
  try {
    stdout = execSync('pnpm audit --json', { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // Non-zero exit (vulnerabilities present) still delivers JSON on stdout.
    stdout = err && typeof err.stdout === 'string' ? err.stdout : '';
  }
  const trimmed = (stdout || '').trim();
  if (!trimmed) {
    throw new Error('`pnpm audit --json` produced no output — cannot reconcile audit exceptions.');
  }
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `Could not parse \`pnpm audit --json\` output as JSON: ${err.message}\n` +
        `First 300 chars:\n${trimmed.slice(0, 300)}`,
      { cause: err }
    );
  }
}

function loadRegister(repoRoot) {
  const pkgPath = resolve(repoRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.auditExceptions || {};
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..');

  let auditJson;
  try {
    auditJson = runAudit();
  } catch (err) {
    console.error(`\naudit-exceptions: ${err.message}\n`);
    process.exit(1);
  }

  const register = loadRegister(repoRoot);
  const advisories = extractAdvisories(auditJson);
  const activeAdvisoryIds = advisories.map((a) => a.id);
  const { ok, failures, warnings, covered } = reconcile({
    activeAdvisoryIds,
    register,
    now: new Date(),
  });

  console.log(
    `audit-exceptions: ${advisories.length} active ${advisories.length === 1 ? 'advisory' : 'advisories'}, ` +
      `${Object.keys(register).length} register ${Object.keys(register).length === 1 ? 'entry' : 'entries'}.`
  );
  if (advisories.length > 0) {
    console.log('Active advisories:');
    for (const a of advisories) {
      console.log(`  - ${a.id} (${a.severity}, ${a.module})`);
    }
  }

  for (const w of warnings) {
    console.log(`  [warn] ${w.detail}`);
  }

  if (ok) {
    console.log(
      covered.length > 0
        ? `\nOK — all ${covered.length} active ${covered.length === 1 ? 'advisory is' : 'advisories are'} covered by an unexpired exception.`
        : '\nOK — no active advisories.'
    );
    process.exit(0);
  }

  console.error('\naudit-exceptions FAILED:');
  for (const f of failures) {
    console.error(`  [${f.type}] ${f.detail}`);
  }
  console.error(
    '\nThe auditExceptions register in package.json converts time-boxed deferrals into\n' +
      'enforced, expiring exemptions. Every active dependency advisory must be covered by\n' +
      'an entry with a justification and a future `expires` date. See issue #1324.'
  );
  process.exit(1);
}

// Only run the audit-driven gate when invoked as a script; importing the module
// (e.g. from tests) exposes the pure functions without side effects.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
