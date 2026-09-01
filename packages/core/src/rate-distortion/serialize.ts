/**
 * Markdown serializer for the distortion model — renders the sensitivity matrix
 * (task class × information class) plus a per-cell detail table. Report-only:
 * this is the human-readable face of the fitted model, not a compaction decision.
 */

import type { CellSensitivity, DistortionModel, Sensitivity } from './distortion-model';

/** Compact glyph per sensitivity, for the matrix cells. */
const SENSITIVITY_GLYPH: Record<Sensitivity, string> = {
  sensitive: 'SENS',
  insensitive: 'insens',
  inconclusive: '?',
};

function formatDelta(cell: CellSensitivity): string {
  if (cell.n === 0) return '—';
  const sign = cell.meanDelta >= 0 ? '+' : '';
  return `${sign}${cell.meanDelta.toFixed(2)}`;
}

/** One Markdown table row from a list of cells. */
function tableRow(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`;
}

/** The header metadata block. */
function renderHeader(model: DistortionModel): string[] {
  return [
    '# Distortion model (rate-distortion context compaction)',
    '',
    `- **Version:** ${model.version}`,
    `- **Fitted at:** ${model.fittedAt}`,
    `- **Noise threshold:** ${model.threshold}`,
    `- **Runs observed:** ${model.runsObserved}`,
    `- **Advisory prior applied:** ${model.priorApplied ? 'yes' : 'no'}`,
    '',
    '_Report-only: measured error/rework delta from ablating each information class per task ' +
      'class. Not wired to the live compaction dial (deferred, issue #1633)._',
    '',
  ];
}

/** The sensitivity matrix: rows = task class, cols = information class. */
function renderMatrix(model: DistortionModel): string[] {
  const header = ['task class', ...model.informationClasses];
  const lines = ['## Sensitivity matrix', '', tableRow(header), tableRow(header.map(() => '---'))];
  for (const taskClass of model.taskClasses) {
    const row = [taskClass];
    for (const informationClass of model.informationClasses) {
      const cell = model.cells.find(
        (c) => c.taskClass === taskClass && c.informationClass === informationClass
      );
      row.push(cell ? SENSITIVITY_GLYPH[cell.sensitivity] : '?');
    }
    lines.push(tableRow(row));
  }
  lines.push('');
  return lines;
}

/** The per-cell detail table (n, mean delta, CI, verdict, optional prior). */
function renderDetail(model: DistortionModel): string[] {
  const header = [
    'task class',
    'information class',
    'n',
    'mean Δrework',
    '95% CI ±',
    'verdict',
    'prior',
  ];
  const lines = ['## Cell detail', '', tableRow(header), tableRow(header.map(() => '---'))];
  for (const cell of model.cells) {
    const ci = Number.isFinite(cell.ci95) ? cell.ci95.toFixed(2) : '∞';
    const prior = cell.priorDemand !== undefined ? cell.priorDemand.toFixed(2) : '—';
    lines.push(
      tableRow([
        cell.taskClass,
        cell.informationClass,
        String(cell.n),
        formatDelta(cell),
        ci,
        cell.sensitivity,
        prior,
      ])
    );
  }
  lines.push('');
  return lines;
}

/**
 * Render the distortion model as Markdown: a header block, the sensitivity
 * matrix, and a per-cell detail table (n, mean delta, CI, verdict, optional
 * advisory prior).
 */
export function serializeDistortionModel(model: DistortionModel): string {
  return [...renderHeader(model), ...renderMatrix(model), ...renderDetail(model)].join('\n');
}
