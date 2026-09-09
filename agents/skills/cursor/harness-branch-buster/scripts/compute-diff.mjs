/* eslint-disable -- vendored skill tooling: Node CLI + Playwright browser-context globals (document, getComputedStyle); not app source, mirrors the former .harness/skills lint exclusion */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function parseNameStatus(raw) {
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split('\t');
      return { status: status.trim()[0], file: rest.join('\t').trim() };
    });
}

export function parseNumstat(raw) {
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, ...rest] = line.split('\t');
      const file = rest.join('\t').trim();
      const n = (v) => (v === '-' ? 0 : Number.parseInt(v, 10) || 0);
      return { file, added: n(added), deleted: n(deleted) };
    });
}

export function classifyChangeType(commitSubject, files) {
  const s = (commitSubject || '').toLowerCase();
  if (/^fix(\(|:|!)/.test(s)) return 'bugfix';
  if (/^feat(\(|:|!)/.test(s)) return 'feature';
  if (/^refactor(\(|:|!)/.test(s)) return 'refactor';
  if (/^docs(\(|:|!)/.test(s)) return 'docs';
  const nonDocs = files.filter((f) => !/\.(md|mdx)$/.test(f));
  if (nonDocs.length === 0) return 'docs';
  return 'feature';
}

export function summarizeDiff(nameStatus, numstat) {
  return {
    files: nameStatus.map((x) => x.file),
    changeCount: nameStatus.length,
    totalAdded: numstat.reduce((a, x) => a + x.added, 0),
    totalDeleted: numstat.reduce((a, x) => a + x.deleted, 0),
  };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function computeDiff(base = 'origin/main') {
  const range = `${base}...HEAD`;
  const nameStatus = parseNameStatus(git(['diff', '--name-status', range]));
  const numstat = parseNumstat(git(['diff', '--numstat', range]));
  const subject = git(['log', '-1', '--pretty=%s']).trim();
  return {
    base,
    range,
    changeType: classifyChangeType(
      subject,
      nameStatus.map((x) => x.file)
    ),
    ...summarizeDiff(nameStatus, numstat),
    perFile: numstat,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] || 'origin/main';
  process.stdout.write(JSON.stringify(computeDiff(base), null, 2));
}
