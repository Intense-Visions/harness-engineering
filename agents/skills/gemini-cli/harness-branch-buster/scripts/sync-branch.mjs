/* eslint-disable -- vendored skill tooling: Node CLI + Playwright browser-context globals (document, getComputedStyle); not app source, mirrors the former .harness/skills lint exclusion */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function parseIncoming(log) {
  return log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const sp = line.indexOf(' ');
      return { sha: line.slice(0, sp), subject: line.slice(sp + 1) };
    });
}

export function parseConflictedFiles(status) {
  return status
    .split('\n')
    .filter(Boolean)
    .filter((l) => /^(UU|AA|DD|AU|UA|DU|UD)\s/.test(l))
    .map((l) => l.slice(3).trim());
}

export function extractConflictHunks(text) {
  const lines = text.split('\n');
  const hunks = [];
  let ours = null;
  let theirs = null;
  let mode = null;
  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      ours = [];
      theirs = null;
      mode = 'ours';
    } else if (line.startsWith('|||||||') && mode === 'ours') {
      mode = 'base';
    } else if (line.startsWith('=======') && (mode === 'ours' || mode === 'base')) {
      theirs = [];
      mode = 'theirs';
    } else if (line.startsWith('>>>>>>>') && mode === 'theirs') {
      hunks.push({ ours: ours.join('\n'), theirs: theirs.join('\n') });
      ours = null;
      theirs = null;
      mode = null;
    } else if (mode === 'ours') ours.push(line);
    else if (mode === 'theirs') theirs.push(line);
    // mode === 'base': discard base-section lines
  }
  if (mode !== null) throw new Error('extractConflictHunks: unclosed conflict hunk');
  return hunks;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Driver: fetch + preview only. The merge itself is performed by SKILL.md so it
// can prompt the human per conflict; this script never resolves a conflict.
export function previewSync(base = 'origin/main') {
  git(['fetch', 'origin']);
  const incoming = parseIncoming(git(['log', '--oneline', `HEAD..${base}`]));
  const incomingFiles = git(['diff', '--name-only', `HEAD...${base}`])
    .split('\n')
    .filter(Boolean);
  const ourFiles = git(['diff', '--name-only', `${base}...HEAD`])
    .split('\n')
    .filter(Boolean);
  const overlap = incomingFiles.filter((f) => ourFiles.includes(f));
  return { base, incoming, incomingFiles, likelyConflictFiles: overlap };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] || 'origin/main';
  process.stdout.write(JSON.stringify(previewSync(base), null, 2));
}
