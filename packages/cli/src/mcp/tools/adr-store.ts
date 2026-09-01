import { execSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Filesystem store for Architecture Decision Records (ADRs).
 *
 * ADRs live in `docs/knowledge/decisions/NNNN-<slug>.md` as YAML-frontmatter
 * markdown with three required sections (Context / Decision / Consequences).
 * The canonical convention is documented in that directory's `README.md` and
 * consumed by the knowledge pipeline's `DecisionIngestor`, which folds each
 * record into the graph as a `decision` node keyed on the `number:` field.
 *
 * This module is the read/write seam behind the `manage_adr` MCP tool. It is
 * intentionally self-contained (no `@harness-engineering/core` export) because
 * the ADR CRUD surface is consumed only by the MCP tool, unlike the roadmap
 * store which is shared by the orchestrator.
 */

/** Canonical relative location of the ADR directory. */
const DECISIONS_DIR = path.join('docs', 'knowledge', 'decisions');

/** ADR status vocabulary (see decisions/README.md). */
export type AdrStatus = 'proposed' | 'accepted' | 'superseded' | 'deprecated';

/**
 * ADR tier (see decisions/README.md). The canonical vocabulary is
 * `small | medium | large`, but the field is stored as a free string so
 * projects with a different tier taxonomy are not rejected.
 */
export type AdrTier = string;

/** Parsed frontmatter of an ADR. `number` is the 4-digit zero-padded string. */
export interface AdrFrontmatter {
  number: string;
  title: string;
  date?: string;
  status?: string;
  tier?: string;
  source?: string;
  supersedes?: string;
}

/** A summary record used by `list` (frontmatter + slug + path, no body). */
export interface AdrSummary extends AdrFrontmatter {
  slug: string;
  file: string;
}

/** A full record used by `read` / `create` / `update` (summary + body). */
export interface AdrRecord extends AdrSummary {
  body: string;
}

/** Raised for all recoverable ADR-store failures; the tool maps these to MCP errors. */
export class AdrStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdrStoreError';
  }
}

/** Absolute path to the decisions directory under `projectRoot`. */
function decisionsDirFor(projectRoot: string): string {
  return path.join(projectRoot, DECISIONS_DIR);
}

/**
 * Resolve the ADR root to the active git worktree.
 *
 * `manage_adr` is invoked from whatever checkout the caller is working in, which
 * — under `git worktree` — is NOT necessarily the MCP server's launch root
 * (`fallbackRoot`, threaded in as the `path` argument). Writing ADRs to the
 * server root pollutes the wrong checkout and mints collision-free numbers
 * against a store the worktree branch can't see (#1507).
 *
 * We resolve the enclosing worktree top-level via `git rev-parse
 * --show-toplevel` from the caller's `cwd`. When `cwd` is inside a git worktree
 * we target that worktree; otherwise (not a git repo, or git unavailable) we
 * fall back to the caller-supplied root, so non-git usage is unaffected.
 */
export function resolveWorktreeRoot(cwd: string, fallbackRoot: string): string {
  try {
    const top = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (top.length > 0) return path.resolve(top);
  } catch {
    // Not inside a git worktree (or git unavailable) — keep the supplied root.
  }
  return fallbackRoot;
}

/**
 * Split a raw ADR file into frontmatter + body. Returns `null` when the file
 * lacks a YAML frontmatter block or is missing the identifying `number`/`title`
 * fields — the same discrimination `DecisionIngestor` applies, so non-ADR
 * markdown (e.g. the directory README) is skipped rather than mis-parsed.
 */
function parseAdr(raw: string): { frontmatter: AdrFrontmatter; body: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const yamlBlock = match[1]!;
  const body = match[2]!;

  const fm: Record<string, string> = {};
  for (const line of yamlBlock.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const value = kv[2]!.trim();
    if (value.length === 0) continue;
    fm[kv[1]!] = value;
  }

  if (!fm.number || !fm.title) return null;
  return { frontmatter: fm as unknown as AdrFrontmatter, body };
}

/**
 * Serialize frontmatter + body back to a full ADR document. Field order is
 * fixed and canonical so re-writes produce stable, review-friendly diffs;
 * unset optional fields are omitted.
 */
function serializeAdr(frontmatter: AdrFrontmatter, body: string): string {
  const order: Array<keyof AdrFrontmatter> = [
    'number',
    'title',
    'date',
    'status',
    'tier',
    'source',
    'supersedes',
  ];
  const lines: string[] = ['---'];
  for (const key of order) {
    const value = frontmatter[key];
    if (value === undefined || value === null || `${value}`.length === 0) continue;
    lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  const trimmedBody = body.replace(/^\n+/, '');
  return `${lines.join('\n')}\n\n${trimmedBody.replace(/\s*$/, '')}\n`;
}

/** Lowercase, hyphen-separated slug derived from a title (matches README examples). */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'decision';
}

/** Zero-pad a number to the canonical 4-digit ADR width. */
function padNumber(n: number): string {
  return String(n).padStart(4, '0');
}

/** Parse a `number:`-style reference ("92", "0092") to an integer, or NaN. */
function numericValue(ref: string): number {
  return Number.parseInt(ref.replace(/^0+(?=\d)/, ''), 10);
}

/** List every ADR file (`NNNN-<slug>.md`) under the decisions directory. */
function adrFilesIn(dir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name.toLowerCase() !== 'readme.md')
    .map((e) => e.name)
    .sort();
}

/**
 * Load every well-formed ADR as a summary record, sorted by numeric ADR number.
 * Files that do not parse as ADRs (no frontmatter / missing number+title) are
 * silently skipped, mirroring the ingestor's tolerance.
 */
export function listAdrs(projectRoot: string): AdrSummary[] {
  const dir = decisionsDirFor(projectRoot);
  const summaries: AdrSummary[] = [];
  for (const file of adrFilesIn(dir)) {
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(dir, file), 'utf-8');
    } catch {
      continue;
    }
    const parsed = parseAdr(raw);
    if (!parsed) continue;
    summaries.push({
      ...parsed.frontmatter,
      slug: file.replace(/^\d+-/, '').replace(/\.md$/, ''),
      file,
    });
  }
  return summaries.sort((a, b) => numericValue(a.number) - numericValue(b.number));
}

/**
 * Allocate the next ADR number as `max(existing) + 1`, zero-padded.
 *
 * Using the MAXIMUM (not the count) is the fix for the known number-collision
 * defect (#1323): the on-disk sequence has gaps and duplicates, so a
 * count-based scheme would re-mint an existing number. `max + 1` is monotonic
 * and never reuses a number even across gaps — matching the `adr-fleet`
 * pre-allocation strategy and the directory README's numbering rule.
 */
export function allocateNextNumber(projectRoot: string): string {
  const existing = listAdrs(projectRoot);
  let max = 0;
  for (const adr of existing) {
    const n = numericValue(adr.number);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return padNumber(max + 1);
}

/**
 * Resolve an ADR by reference: an ADR number ("92" / "0092"), a slug
 * ("adr-crud-mcp-tool"), or a full filename ("0092-adr-crud-mcp-tool.md").
 * Returns the full record (frontmatter + body) or throws `AdrStoreError`.
 */
export function readAdr(projectRoot: string, ref: string): AdrRecord {
  const dir = decisionsDirFor(projectRoot);
  const trimmed = ref.trim();
  const files = adrFilesIn(dir);

  const numeric = numericValue(trimmed);
  const byNumberOrSlug = (file: string): boolean => {
    const number = file.match(/^(\d+)-/)?.[1];
    const slug = file.replace(/^\d+-/, '').replace(/\.md$/, '');
    if (file === trimmed || file === `${trimmed}.md`) return true;
    if (slug === trimmed) return true;
    if (number !== undefined && Number.isFinite(numeric) && numericValue(number) === numeric)
      return true;
    return false;
  };

  const file = files.find(byNumberOrSlug);
  if (!file) {
    throw new AdrStoreError(
      `ADR "${ref}" not found in ${DECISIONS_DIR}. Use action "list" to see available records.`
    );
  }

  const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
  const parsed = parseAdr(raw);
  if (!parsed) {
    throw new AdrStoreError(`ADR file "${file}" is malformed (missing frontmatter).`);
  }
  return {
    ...parsed.frontmatter,
    slug: file.replace(/^\d+-/, '').replace(/\.md$/, ''),
    file,
    body: parsed.body,
  };
}

/** Build the canonical three-section body from its parts. */
function buildBody(sections: { context: string; decision: string; consequences: string }): string {
  return [
    '## Context',
    '',
    sections.context.trim(),
    '',
    '## Decision',
    '',
    sections.decision.trim(),
    '',
    '## Consequences',
    '',
    sections.consequences.trim(),
    '',
  ].join('\n');
}

export interface CreateAdrInput {
  title: string;
  context: string;
  decision: string;
  consequences: string;
  status?: AdrStatus;
  tier?: AdrTier;
  source?: string;
  supersedes?: string;
  date?: string;
  slug?: string;
}

/** Validate create input; returns the trimmed title or throws `AdrStoreError`. */
function validateCreateInput(input: CreateAdrInput): string {
  const title = input.title?.trim();
  if (!title) throw new AdrStoreError('title is required to create an ADR.');
  for (const field of ['context', 'decision', 'consequences'] as const) {
    if (!input[field] || input[field].trim().length === 0) {
      throw new AdrStoreError(`${field} is required to create an ADR.`);
    }
  }
  return title;
}

/** Assemble the frontmatter for a new ADR, defaulting date/status and dropping empty optionals. */
function buildCreateFrontmatter(
  number: string,
  title: string,
  input: CreateAdrInput
): AdrFrontmatter {
  const fm: AdrFrontmatter = {
    number,
    title,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    status: input.status ?? 'proposed',
  };
  if (input.tier) fm.tier = input.tier;
  if (input.source) fm.source = input.source;
  if (input.supersedes) fm.supersedes = input.supersedes;
  return fm;
}

/**
 * Create a new ADR file at the next collision-free number and return its
 * record. The number is allocated via {@link allocateNextNumber}. Refuses to
 * overwrite an existing filename.
 */
export function createAdr(projectRoot: string, input: CreateAdrInput): AdrRecord {
  const title = validateCreateInput(input);

  const dir = decisionsDirFor(projectRoot);
  const number = allocateNextNumber(projectRoot);
  const slug = input.slug ? slugify(input.slug) : slugify(title);
  const file = `${number}-${slug}.md`;
  const fullPath = path.join(dir, file);

  if (fs.existsSync(fullPath)) {
    throw new AdrStoreError(`ADR file "${file}" already exists; refusing to overwrite.`);
  }

  const frontmatter = buildCreateFrontmatter(number, title, input);
  const body = buildBody({
    context: input.context,
    decision: input.decision,
    consequences: input.consequences,
  });

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, serializeAdr(frontmatter, body), 'utf-8');

  return { ...frontmatter, slug, file, body };
}

export interface UpdateAdrInput {
  title?: string;
  status?: AdrStatus;
  tier?: AdrTier;
  source?: string;
  supersedes?: string;
  date?: string;
  context?: string;
  decision?: string;
  consequences?: string;
  /** Replace the entire markdown body verbatim (mutually exclusive with section edits). */
  body?: string;
}

/**
 * Replace the content beneath a `## <Heading>` up to the next `## ` heading (or
 * end of document). Returns the mutated body, or throws if the heading is
 * absent so an update never silently drops the caller's edit.
 */
function replaceSection(body: string, heading: string, content: string): string {
  const re = new RegExp(`(^|\\n)(##\\s+${heading}\\s*\\n)([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  if (!re.test(body)) {
    throw new AdrStoreError(`Cannot update "${heading}" section: heading not found in ADR body.`);
  }
  return body.replace(re, (_m, lead: string, head: string) => {
    return `${lead}${head}\n${content.trim()}\n`;
  });
}

/** Apply the frontmatter-level fields of an update patch in place. */
function patchFrontmatter(fm: AdrFrontmatter, input: UpdateAdrInput): void {
  if (input.title !== undefined) fm.title = input.title.trim();
  if (input.status !== undefined) fm.status = input.status;
  if (input.tier !== undefined) fm.tier = input.tier;
  if (input.source !== undefined) fm.source = input.source;
  if (input.supersedes !== undefined) fm.supersedes = input.supersedes;
  if (input.date !== undefined) fm.date = input.date;
}

/**
 * Resolve the new body for an update: a verbatim `body` replacement (rejected
 * if combined with section edits), else the existing body with each provided
 * section replaced in place.
 */
function resolveUpdatedBody(existingBody: string, input: UpdateAdrInput): string {
  if (input.body !== undefined) {
    if (
      input.context !== undefined ||
      input.decision !== undefined ||
      input.consequences !== undefined
    ) {
      throw new AdrStoreError(
        'Provide either a full "body" replacement OR individual section edits, not both.'
      );
    }
    return input.body;
  }
  let body = existingBody;
  if (input.context !== undefined) body = replaceSection(body, 'Context', input.context);
  if (input.decision !== undefined) body = replaceSection(body, 'Decision', input.decision);
  if (input.consequences !== undefined)
    body = replaceSection(body, 'Consequences', input.consequences);
  return body;
}

/**
 * Patch an existing ADR's frontmatter and/or body sections in place, preserving
 * its number and filename slug. `number` is never mutated (numbers are never
 * reused, per the README).
 */
export function updateAdr(projectRoot: string, ref: string, input: UpdateAdrInput): AdrRecord {
  const existing = readAdr(projectRoot, ref);
  const dir = decisionsDirFor(projectRoot);

  const frontmatter: AdrFrontmatter = { ...existing };
  delete (frontmatter as { slug?: string }).slug;
  delete (frontmatter as { file?: string }).file;
  delete (frontmatter as { body?: string }).body;

  patchFrontmatter(frontmatter, input);
  const body = resolveUpdatedBody(existing.body, input);

  fs.writeFileSync(path.join(dir, existing.file), serializeAdr(frontmatter, body), 'utf-8');

  return { ...frontmatter, slug: existing.slug, file: existing.file, body };
}