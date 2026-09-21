/* eslint-disable -- vendored skill tooling: Node CLI + Playwright browser-context globals (document, getComputedStyle); not app source, mirrors the former .harness/skills lint exclusion */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseChurn(log) {
  const churn = new Map();
  for (const line of log.split('\n')) {
    const f = line.trim();
    if (!f) continue;
    churn.set(f, (churn.get(f) || 0) + 1);
  }
  return churn;
}

export function rankByChurnComplexity(churn, loc, n) {
  const rows = [];
  for (const [file, c] of churn) {
    const l = loc.get(file) || 0;
    rows.push({ file, churn: c, loc: l, score: c * l });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, n);
}

function loc(file) {
  try {
    if (statSync(file).size > 2 * 1024 * 1024) return 0;
    return readFileSync(file, 'utf8').split('\n').length;
  } catch {
    return 0;
  }
}

export function pickHotspots({ since = '60.days', n = 25 } = {}) {
  // `execFileSync` with an argv array, NOT `execSync` with an interpolated
  // template. `since` reaches this from project config, so building a shell
  // string out of it is command injection (SEC-INJ-003) — `--since=$(...)` in a
  // config file would execute. No shell means nothing to escape.
  //
  // The pathspecs are unquoted here on purpose: the quotes in the old string
  // existed to stop the SHELL globbing them. With no shell, git receives the
  // literal patterns and expands them itself.
  const log = execFileSync(
    'git',
    ['log', `--since=${since}`, '--name-only', '--pretty=format:', '--', '*.ts', '*.tsx'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  const churn = parseChurn(log);
  const locMap = new Map([...churn.keys()].map((f) => [f, loc(f)]));
  return rankByChurnComplexity(churn, locMap, n);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = Number(process.argv[2]) || 25;
  process.stdout.write(JSON.stringify(pickHotspots({ n }), null, 2));
}
