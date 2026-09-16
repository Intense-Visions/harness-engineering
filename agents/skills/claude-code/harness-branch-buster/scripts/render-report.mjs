/* eslint-disable -- vendored skill tooling: Node CLI + Playwright browser-context globals (document, getComputedStyle); not app source, mirrors the former .harness/skills lint exclusion */
// render-report.mjs
import { pathToFileURL } from 'node:url';

const SEV_RANK = { critical: 3, important: 2, suggestion: 1 };

export function classifyOrigin(finding, diffFiles) {
  return diffFiles.includes(finding.file) ? 'pr-scoped' : 'underlying';
}

function overlaps(a, b) {
  if (a.file !== b.file) return false;
  const [a0, a1] = a.lineRange || [0, 0];
  const [b0, b1] = b.lineRange || [0, 0];
  return a0 <= b1 + 3 && b0 <= a1 + 3;
}

export function dedupeFindings(findings) {
  const groups = [];
  for (const f of findings) {
    const g = groups.find((grp) => grp.some((x) => overlaps(x, f)));
    if (g) g.push(f);
    else groups.push([f]);
  }
  return groups.map((grp) => {
    grp.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
    const top = grp[0];
    return {
      ...top,
      evidence: [...new Set(grp.flatMap((x) => x.evidence || []))],
      type: [...new Set(grp.map((x) => x.type))].join('/'),
    };
  });
}

const esc = (s) => String(s).replace(/\|/g, '\\|');

function renderFinding(f) {
  const loc = `\`${f.file}\` line ${f.lineRange?.[0] ?? '?'}`;
  const lines = [
    `#### ${esc(f.title)}`,
    '',
    `- **Where:** ${loc}`,
    `- **Type:** ${f.type} · **Severity:** ${f.severity}` +
      (f.gate ? ` · **Fails gate:** \`${f.gate}\`` : '') +
      (f.adr ? ` · **ADR:** ${f.adr}` : ''),
    `- **Why:** ${f.rationale || ''}`,
  ];
  for (const s of f.proposedSolutions || []) {
    lines.push(
      `- **Proposed fix:** ${s.summary} — ${s.approach}` +
        (s.tradeoffs ? ` _(trade-off: ${s.tradeoffs})_` : '')
    );
  }
  lines.push('');
  return lines.join('\n');
}

function renderConflicts(decisions) {
  if (!decisions || !decisions.length) return '## Merge-conflict resolutions\n\nNone.\n';
  const rows = decisions.map((d) => `| \`${d.file}\` | ${esc(d.resolution)} |`).join('\n');
  return `## Merge-conflict resolutions\n\n| File | Resolution |\n| --- | --- |\n${rows}\n`;
}

function renderOpenQuestions(findings) {
  const items = findings.filter((f) => f.entangled || f.disposition === 'ask');
  if (!items.length) return '## Open questions / entangled\n\nNone.\n';
  return (
    '## Open questions / entangled\n\n' +
    items.map((f) => `- \`${f.file}\` — ${esc(f.title)}`).join('\n') +
    '\n'
  );
}

function renderFixes(findings) {
  const by = (d) => findings.filter((f) => f.disposition === d);
  const fixed = by('fixed');
  const deferred = by('defer');
  const pushed = by('pushed-back');
  if (!fixed.length && !deferred.length && !pushed.length) {
    return '## Fixes applied / deferred / pushed-back\n\nNone yet (review-only or pre-fix run).\n';
  }
  const sub = (title, list) =>
    list.length
      ? `### ${title}\n\n` + list.map((f) => `- \`${f.file}\` — ${esc(f.title)}`).join('\n') + '\n'
      : '';
  return (
    '## Fixes applied / deferred / pushed-back\n\n' +
    sub('Applied', fixed) +
    sub('Deferred', deferred) +
    sub('Pushed back', pushed)
  );
}

function renderGroup(title, findings) {
  if (!findings.length) return `### ${title}\n\nNone.\n`;
  const order = ['critical', 'important', 'suggestion'];
  const out = [`### ${title}`, ''];
  for (const sev of order) {
    const items = findings.filter((f) => f.severity === sev);
    if (!items.length) continue;
    out.push(`#### Severity: ${sev}`, '');
    for (const f of items) out.push(renderFinding(f));
  }
  return out.join('\n');
}

export function renderReport({ findings, meta }) {
  const pr = findings.filter((f) => f.origin === 'pr-scoped');
  const under = findings.filter((f) => f.origin === 'underlying');
  const blockers = (meta.gates || []).filter((g) => !g.passed).map((g) => `\`${g.id}\``);
  const gateRows = (meta.gates || [])
    .map((g) => `| \`${g.id}\` | ${g.passed ? 'pass' : 'FAIL'} |`)
    .join('\n');
  const incomingRows = (meta.incoming || [])
    .map((c) => `| \`${c.sha}\` | ${esc(c.subject)} |`)
    .join('\n');

  return [
    '# Branch-buster report',
    '',
    `Branch \`${meta.branch}\` reviewed against \`${meta.base}\` (\`${meta.baseSha}\`) on ${meta.runDate}.`,
    '',
    '## Merge-blockers',
    '',
    blockers.length
      ? `This branch will fail CI on: ${blockers.join(', ')}.`
      : 'No blocking gate failures detected.',
    '',
    '### Incoming from main',
    '',
    incomingRows ? `| SHA | Subject |\n| --- | --- |\n${incomingRows}` : 'Nothing incoming.',
    '',
    '## Run header',
    '',
    `- **Depth tier:** ${meta.depth}`,
    `- **Merge result:** ${meta.mergeResult}`,
    '',
    '| Gate | Result |',
    '| --- | --- |',
    gateRows,
    '',
    '## PR-scoped issues',
    '',
    renderGroup('In scope', pr),
    '',
    '## Underlying / out-of-scope issues',
    '',
    'Ask before fixing these in this PR.',
    '',
    renderGroup('Out of scope', under),
    '',
    renderConflicts(meta.conflictDecisions),
    '',
    renderOpenQuestions(findings),
    '',
    renderFixes(findings),
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(process.argv[2] || '{}');
  process.stdout.write(renderReport(input));
}
