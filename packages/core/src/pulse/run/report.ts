import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { OrchestratorResult } from './orchestrator';
import type { SanitizedResult } from '@harness-engineering/types';
import { PII_LINE_RE } from '../sanitize';

const MAX_LINES = 40;

/**
 * Inline fallback template — kept in sync with template.md. Used when the
 * sibling template.md cannot be resolved (CJS build, bundled consumer, etc.).
 */
const INLINE_TEMPLATE = `# {{productName}} Pulse — {{windowLabel}}

## Headlines

{{headlines}}

## Usage

{{usage}}

## System performance

{{systemPerformance}}

## Followups

{{followups}}
`;

function loadTemplate(): string {
  // Try resolving the sibling template.md via import.meta.url. In ESM (vitest,
  // production ESM consumers) this resolves to the source/build directory; in
  // CJS bundles the import.meta.url shim may yield a different path or fail
  // entirely. On any failure we fall back to the inline string so consumers
  // are never broken by a missing template asset.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const url = (import.meta as any)?.url as string | undefined;
    if (!url) return INLINE_TEMPLATE;
    const here = dirname(fileURLToPath(url));
    return readFileSync(join(here, 'template.md'), 'utf-8');
  } catch {
    return INLINE_TEMPLATE;
  }
}

function totalCount(s: SanitizedResult): number {
  const c = s.fields.count;
  return typeof c === 'number' ? c : 0;
}

function buildHeadlines(r: OrchestratorResult): string {
  const total = r.sources.reduce((sum, s) => sum + totalCount(s.result), 0);
  return [
    `- ${r.sourcesQueried.length} source(s) queried in ${r.durationMs}ms`,
    `- ${total} total events recorded`,
    `- ${r.sourcesSkipped.length} source(s) skipped`,
  ].join('\n');
}

function buildUsage(r: OrchestratorResult): string {
  if (r.sources.length === 0) return '_(none)_';
  return r.sources
    .map((s) => {
      const name = s.result.fields.event_name ?? 'unknown';
      const count = totalCount(s.result);
      return `- ${name}: count=${count}`;
    })
    .join('\n');
}

function buildSystemPerformance(r: OrchestratorResult): string {
  const tracing = r.sources.find((s) => s.kind === 'tracing') ?? null;
  if (!tracing) return '_(no tracing source configured)_';
  const dist = tracing.result.distributions;
  const lines = Object.entries(dist).map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`);
  return lines.length > 0 ? lines.join('\n') : '_(no distributions)_';
}

function buildFollowups(r: OrchestratorResult): string {
  if (r.sourcesSkipped.length === 0) return '_(none)_';
  return r.sourcesSkipped.map((s) => `- ${s.name} skipped: ${s.reason}`).join('\n');
}

/**
 * Defense-in-depth final sweep. After templating + truncation, scrub any line
 * containing a denylisted PII token. This is the third PII boundary (after
 * `adapter.sanitize()` and the orchestrator's `assertSanitized()`).
 *
 * Structural lines (H1 title, H2 section headers) are preserved verbatim so
 * that the 4-section invariant survives a user-chosen productName that
 * happens to contain a PII token (e.g. `name`, `address`). The actual report
 * data still passes through the two earlier sanitization layers; only the
 * structural scaffolding is whitelisted here.
 */
function finalPiiSweep(text: string): string {
  return text
    .split('\n')
    .filter((l) => {
      if (l.startsWith('# ') || l.startsWith('## ')) return true;
      return !PII_LINE_RE.test(l);
    })
    .join('\n');
}

const TRUNCATION_MARKER = '_(truncated to fit single-page constraint)_';

/**
 * Truncate a single section in place. Preserves the section header line
 * (lines[startIdx]) and removes lines from the tail of the section until the
 * total line count fits under MAX_LINES (with one slot reserved for the
 * truncation marker). Returns the new lines array. If the section is already
 * empty (only the header), it is left alone.
 */
function truncateSection(lines: string[], startIdx: number, endIdx: number): string[] {
  const head = lines.slice(0, startIdx + 1);
  const section = lines.slice(startIdx + 1, endIdx);
  const tail = lines.slice(endIdx);
  // Reserve one line for the truncation marker (only if we end up truncating).
  let truncated = false;
  while (
    head.length + section.length + tail.length + (truncated ? 0 : 1) > MAX_LINES &&
    section.length > 0
  ) {
    section.pop();
    truncated = true;
  }
  if (truncated) section.push(TRUNCATION_MARKER);
  return [...head, ...section, ...tail];
}

/**
 * Cascading truncation. Followups is truncated first (least essential), then
 * System performance, then Usage. Headlines and the H1 title are sacrosanct
 * and never touched. Each truncated section gets a clear marker so the
 * dropped content is not silently lost.
 */
function truncateToFit(text: string): string {
  let lines = text.split('\n');
  if (lines.length <= MAX_LINES) return text;

  // Cascade: Followups -> System performance -> Usage. Headlines is preserved.
  const sections: Array<{ header: string }> = [
    { header: '## Followups' },
    { header: '## System performance' },
    { header: '## Usage' },
  ];
  for (const { header } of sections) {
    if (lines.length <= MAX_LINES) break;
    const startIdx = lines.findIndex((l) => l === header || l.startsWith(`${header} `));
    if (startIdx < 0) continue;
    // Section ends at the next H2 header or end-of-file.
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line !== undefined && line.startsWith('## ')) {
        endIdx = i;
        break;
      }
    }
    lines = truncateSection(lines, startIdx, endIdx);
  }

  // Last-resort hard cap (should be unreachable when at least one section
  // contains content): clip to MAX_LINES so the contract holds even when all
  // sections are already minimal.
  if (lines.length > MAX_LINES) lines = lines.slice(0, MAX_LINES);
  return lines.join('\n');
}

/**
 * Assemble the single-page pulse report. Output is guaranteed to be:
 *   - <=40 lines (Followups truncated last-line-first if over)
 *   - Free of PII denylisted tokens (final regex sweep)
 *   - Composed of the 4 standard sections (Headlines, Usage, System
 *     performance, Followups)
 */
export function assembleReport(
  result: OrchestratorResult,
  productName: string,
  windowLabel: string
): string {
  const template = loadTemplate();
  const filled = template
    .replace('{{productName}}', productName)
    .replace('{{windowLabel}}', windowLabel)
    .replace('{{headlines}}', buildHeadlines(result))
    .replace('{{usage}}', buildUsage(result))
    .replace('{{systemPerformance}}', buildSystemPerformance(result))
    .replace('{{followups}}', buildFollowups(result));
  const swept = finalPiiSweep(filled);
  return truncateToFit(swept);
}
