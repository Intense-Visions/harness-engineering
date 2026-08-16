import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type {
  SignoffBasis,
  SignoffBasisSection,
  SignoffDecision,
  SignoffItem,
  SignoffRecord,
} from '../../shared/types';

/**
 * Read-side helpers for the UAT sign-off dashboard front door (#710).
 *
 * These functions resolve the acceptance BASIS a change was shipped against — the
 * same `docs/changes/<slug>/proposal.md` Success Criteria the `harness-uat-signoff`
 * skill reads — and read/write the co-located `signoff.md` artifact. They are a
 * presentation surface over the existing record primitive: no LLM, no verdict, no
 * gate. The graph write itself goes through the shared `UatSignoffRecorder`
 * (see `routes/signoff.ts`); nothing here derives authority.
 */

/** The relative path to a change's proposal, from the project root. */
export function proposalRelPath(slug: string): string {
  return join('docs', 'changes', slug, 'proposal.md');
}

/** The relative path to a change's sign-off artifact, from the project root. */
export function signoffRelPath(slug: string): string {
  return join('docs', 'changes', slug, 'signoff.md');
}

/**
 * Fallback chain, highest priority first — mirrors the outcome-eval /
 * `harness-uat-signoff` soft-degrade order. Each entry pairs the human-readable
 * section label with a predicate over the NORMALIZED heading (lowercased,
 * hyphens→spaces, collapsed whitespace) so matching is case/hyphen-insensitive.
 */
const SECTION_CHAIN: ReadonlyArray<{
  label: SignoffBasisSection;
  matches: (normalized: string) => boolean;
}> = [
  { label: 'Success Criteria', matches: (h) => h === 'success criteria' },
  { label: 'User-Visible Behavior', matches: (h) => h === 'user visible behavior' },
  { label: 'Overview', matches: (h) => h === 'overview' },
];

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;
// A top-level list item: an ordered (`1.`) or bulleted (`-`/`*`) marker with no
// leading indentation (continuation/nested lines are indented and stay in-item).
const TOP_ITEM_RE = /^(?:\d+[.)]|[-*])\s+(.*\S)\s*$/;

const normalizeHeading = (text: string): string =>
  text.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

interface HeadingEntry {
  index: number;
  level: number;
  label: SignoffBasisSection | null;
}

/**
 * Resolve the basis section body from proposal markdown via the fallback chain
 * Success Criteria → User-Visible Behavior → Overview. Returns the matched label
 * plus the section's line range, or null when no basis section exists. Headings
 * inside fenced code blocks are ignored (example content, not structure).
 */
function resolveBasisSection(
  markdown: string
): { label: SignoffBasisSection; body: string } | null {
  const lines = markdown.split(/\r?\n/);
  const headings: HeadingEntry[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const m = HEADING_RE.exec(line);
    if (!m || m[1] === undefined || m[2] === undefined) return;
    const normalized = normalizeHeading(m[2]);
    const entry = SECTION_CHAIN.find((c) => c.matches(normalized));
    headings.push({ index, level: m[1].length, label: entry ? entry.label : null });
  });

  for (const { label } of SECTION_CHAIN) {
    const start = headings.find((h) => h.label === label);
    if (!start) continue;
    const next = headings.find((h) => h.index > start.index && h.level <= start.level);
    const endExclusive = next ? next.index : lines.length;
    const body = lines
      .slice(start.index + 1, endExclusive)
      .join('\n')
      .trim();
    return { label, body };
  }
  return null;
}

/**
 * Parse the top-level list items out of a section body into acceptance items.
 * Ids are `SC1..SCn` by ordinal — the convention the recorder/skill reuse — and
 * the text is the item's first line (its human-facing statement), with a trailing
 * `_Covering check:_ …` annotation trimmed so the checklist stays scannable.
 */
function parseBasisItems(body: string): { id: string; text: string }[] {
  const items: { id: string; text: string }[] = [];
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = TOP_ITEM_RE.exec(line);
    if (!m || m[1] === undefined) continue;
    const text = m[1]
      .replace(/_Covering check:_.*$/i, '')
      .replace(/\*\*/g, '')
      .trim();
    items.push({ id: `SC${items.length + 1}`, text });
  }
  return items;
}

/**
 * Read markdown at `path`, returning null when the file is absent. Any other read
 * error also degrades to null — the surface reports "no acceptance basis" rather
 * than 5xx-ing, exactly as the skill degrades on a thin basis.
 */
async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Resolve the acceptance basis for a change: its Success-Criteria items (with the
 * soft-degrade fallback) plus any existing recorded sign-off. Never throws.
 */
export async function gatherSignoffBasis(projectPath: string, slug: string): Promise<SignoffBasis> {
  const proposal = await readOptional(join(projectPath, proposalRelPath(slug)));
  const existing = await readExistingSignoff(projectPath, slug);

  if (proposal === null) {
    return existing
      ? { slug, items: [], basisSection: null, existing }
      : { slug, items: [], basisSection: null };
  }

  const section = resolveBasisSection(proposal);
  if (section === null) {
    return existing
      ? { slug, items: [], basisSection: null, existing }
      : { slug, items: [], basisSection: null };
  }

  const items = parseBasisItems(section.body);
  return existing
    ? { slug, items, basisSection: section.label, existing }
    : { slug, items, basisSection: section.label };
}

const DECISION_RE = /^-\s*\*\*Overall decision:\*\*\s*(ACCEPTED|REJECTED|CHANGES_REQUESTED)\s*$/im;
const SIGNER_RE = /^-\s*\*\*Signed off by:\*\*\s*(.+?)\s*$/im;
const DATE_RE = /^-\s*\*\*Date:\*\*\s*(.+?)\s*$/im;

/**
 * Read a previously written `signoff.md` back into a `SignoffRecord`, or null when
 * none exists or it cannot be parsed as a sign-off. Reconstructs items from the
 * "Accepted" and "Rejected / changes-requested" sections.
 */
export async function readExistingSignoff(
  projectPath: string,
  slug: string
): Promise<SignoffRecord | null> {
  const raw = await readOptional(join(projectPath, signoffRelPath(slug)));
  if (raw === null) return null;

  const decision = DECISION_RE.exec(raw)?.[1] as SignoffDecision | undefined;
  const signedOffBy = SIGNER_RE.exec(raw)?.[1];
  const signedAt = DATE_RE.exec(raw)?.[1];
  if (!decision || !signedOffBy || !signedAt) return null;

  return {
    slug,
    decision,
    signedOffBy,
    signedAt,
    items: parseSignoffItems(raw),
    signoffPath: signoffRelPath(slug),
  };
}

const SIGNOFF_ITEM_RE =
  /^-\s*\*\*(.+?)\*\*\s*(?:\(([^)]*)\)\s*)?—\s*(ACCEPT|REJECT|CHANGES_REQUESTED)\.?\s*(.*)$/;

/** Parse the item bullets out of a rendered `signoff.md`. */
function parseSignoffItems(raw: string): SignoffItem[] {
  const items: SignoffItem[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = SIGNOFF_ITEM_RE.exec(line.trim());
    if (!m || m[1] === undefined || m[3] === undefined) continue;
    const note = (m[4] ?? '').trim();
    items.push({
      id: m[1],
      disposition: m[3] as SignoffItem['disposition'],
      ...(note ? { note } : {}),
    });
  }
  return items;
}

/**
 * Render the `signoff.md` artifact from the human decision using the
 * `harness-uat-signoff` skill's template — an Accepted section and a Rejected /
 * changes-requested section, plus signer identity and an ISO timestamp.
 */
export function renderSignoffMarkdown(record: {
  slug: string;
  decision: SignoffDecision;
  signedOffBy: string;
  signedAt: string;
  items: SignoffItem[];
}): string {
  const accepted = record.items.filter((i) => i.disposition === 'ACCEPT');
  const rejected = record.items.filter((i) => i.disposition !== 'ACCEPT');
  const renderItem = (i: SignoffItem): string => {
    const note = i.note ? ` ${i.note}` : '';
    return `- **${i.id}** (proposal.md Success Criteria) — ${i.disposition}.${note}`;
  };
  const acceptedBlock = accepted.length > 0 ? accepted.map(renderItem).join('\n') : '- (none)';
  const rejectedBlock = rejected.length > 0 ? rejected.map(renderItem).join('\n') : '- (none)';
  return [
    `# UAT Sign-off — ${record.slug}`,
    '',
    `- **Overall decision:** ${record.decision}`,
    `- **Signed off by:** ${record.signedOffBy}`,
    `- **Date:** ${record.signedAt}`,
    '',
    '## Accepted',
    '',
    acceptedBlock,
    '',
    '## Rejected / changes-requested',
    '',
    rejectedBlock,
    '',
  ].join('\n');
}

/** Write the rendered `signoff.md`, creating the change directory if needed. */
export async function writeSignoffMarkdown(
  projectPath: string,
  slug: string,
  content: string
): Promise<string> {
  const rel = signoffRelPath(slug);
  const abs = join(projectPath, rel);
  await mkdir(join(projectPath, 'docs', 'changes', slug), { recursive: true });
  await writeFile(abs, content, 'utf-8');
  return rel;
}
