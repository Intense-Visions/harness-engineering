import matter from 'gray-matter';
import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { quoteYamlScalar } from '../roadmap/store/yaml-scalar';
import type { ComprehensionUnit, ComprehensionProvenance } from './types';
import { SCHEMA_VERSION } from './types';

const H_SUMMARY = '## Summary';
const H_INVARIANTS = '## Invariants';
const H_INTERFACE = '## Interface Contract';
const H_DEPS = '## Dependency Slice';

/**
 * The full set of section headings we own. Section-boundary detection matches
 * ONLY these headings (at top level, outside fences), so a `## Heading` line
 * inside LLM-authored prose survives a round-trip instead of being mistaken for
 * a new section (F1c).
 */
const SECTION_HEADINGS = ['Summary', 'Invariants', 'Interface Contract', 'Dependency Slice'];

/**
 * Choose a fence length that cannot be closed early by content: one backtick
 * longer than the longest backtick run appearing anywhere in `content` (min 3).
 * Lets a static section carry embedded ``` fences (including longer/nested runs)
 * without truncation (F1b).
 */
function fenceFor(content: string): string {
  let longest = 0;
  for (const m of content.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * Serialize a `ComprehensionUnit` to markdown + hand-emitted YAML frontmatter.
 * Frontmatter is emitted in fixed key order for byte-determinism (mirrors
 * `serializeShard`; `matter.stringify` key ordering/quoting is not stable).
 * Free-form scalars are double-quoted via `quoteYamlScalar` so colons/booleans
 * round-trip. `semantic: absent` units omit the LLM sections entirely — the
 * static sections are always emitted (fenced), even when empty.
 */
export function serializeUnit(unit: ComprehensionUnit): string {
  const p = unit.provenance;
  const fm = [
    '---',
    `schemaVersion: ${p.schemaVersion}`,
    `module: ${quoteYamlScalar(p.module)}`,
    `sourceHash: ${quoteYamlScalar(p.sourceHash)}`,
    // ADR 0109: `compiledAt` is emitted only for legacy units that still carry it
    // (freshly compiled shards omit it — byte-stability, no wall-clock).
    ...(p.compiledAt ? [`compiledAt: ${quoteYamlScalar(p.compiledAt)}`] : []),
    `compiler: { static: ${quoteYamlScalar(p.compiler.static)}, semantic: ${quoteYamlScalar(
      p.compiler.semantic
    )} }`,
    `model: ${p.model === null ? 'null' : quoteYamlScalar(p.model)}`,
    `semantic: ${p.semantic}`,
    `members: [${p.members.map(quoteYamlScalar).join(', ')}]`,
    '---',
    '',
  ];
  const body: string[] = [];
  if (p.semantic === 'present') {
    body.push(H_SUMMARY, '', unit.summary.trim(), '');
    body.push(H_INVARIANTS, '');
    // F4: empty invariants are intentionally dropped, never emitted as bare `- `.
    for (const inv of unit.invariants) {
      if (inv.trim().length === 0) continue;
      body.push(`- ${inv}`);
    }
    body.push('');
  }
  const ifc = unit.interfaceContract.trim();
  const ifFence = fenceFor(ifc);
  body.push(H_INTERFACE, '', `${ifFence}ts`, ifc, ifFence, '');
  const dep = unit.dependencySlice.trim();
  const depFence = fenceFor(dep);
  body.push(H_DEPS, '', depFence, dep, depFence, '');
  return [...fm, ...body].join('\n').replace(/\n+$/, '\n');
}

/** Coerce a YAML scalar to a string, never stringifying objects/arrays. */
function scalarString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

/**
 * F2: validate the on-disk `schemaVersion` instead of blindly stamping the
 * current one. Absent/non-integer ⇒ malformed; greater than what we understand
 * ⇒ unsupported. Returns the accepted (typed) version.
 */
function parseSchemaVersion(raw: unknown, module: string): Result<typeof SCHEMA_VERSION> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return Err(new Error(`Comprehension "${module}" missing or invalid schemaVersion`));
  }
  if (raw > SCHEMA_VERSION) {
    return Err(
      new Error(
        `Comprehension "${module}" has unsupported schemaVersion ${raw} (max ${SCHEMA_VERSION})`
      )
    );
  }
  return Ok(SCHEMA_VERSION);
}

/** Coerce the `compiler` sub-map, defaulting missing/typed-wrong halves to ''. */
function parseCompiler(raw: unknown): { static: string; semantic: string } {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    static: typeof c.static === 'string' ? c.static : '',
    semantic: typeof c.semantic === 'string' ? c.semantic : '',
  };
}

/** Validate + coerce provenance from parsed frontmatter. */
function parseProvenance(data: Record<string, unknown>): Result<ComprehensionProvenance> {
  const module = data.module;
  if (typeof module !== 'string' || module.length === 0) {
    return Err(new Error('Comprehension frontmatter missing required field: module'));
  }
  const version = parseSchemaVersion(data.schemaVersion, module);
  if (!version.ok) return version;
  const sourceHash = data.sourceHash;
  if (typeof sourceHash !== 'string' || sourceHash.length === 0) {
    return Err(new Error(`Comprehension "${module}" missing required field: sourceHash`));
  }
  const semantic = data.semantic;
  if (semantic !== 'present' && semantic !== 'absent') {
    return Err(
      new Error(`Comprehension "${module}" has invalid semantic: "${scalarString(semantic)}"`)
    );
  }
  const compiler = parseCompiler(data.compiler);
  const model = data.model === null || data.model === undefined ? null : scalarString(data.model);
  const members = Array.isArray(data.members) ? data.members.map((m) => scalarString(m)) : [];
  // ADR 0109: preserve a legacy `compiledAt` if present so an untouched shard
  // round-trips unchanged; omit it entirely otherwise (freshly compiled units).
  const compiledAt =
    typeof data.compiledAt === 'string' && data.compiledAt.length > 0 ? data.compiledAt : undefined;
  return Ok({
    schemaVersion: version.value,
    module,
    sourceHash,
    ...(compiledAt ? { compiledAt } : {}),
    compiler,
    model,
    semantic,
    members,
  });
}

/**
 * Split the body into per-section line arrays, fence-aware (F1a). A `## ` line
 * is a section boundary ONLY when it names one of our own headings AND we are at
 * top level (outside a fenced block) — so `## ` lines and fences embedded in any
 * section (prose or code) can't truncate it or leak into the next section.
 * A fence opens on a line that starts with a run of >=3 backticks and closes on
 * a later backtick-only line whose run is at least as long (standard markdown).
 */
function splitSections(content: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  let fence: string | null = null;
  for (const line of content.split('\n')) {
    if (fence === null) {
      const trimmed = line.trim();
      if (trimmed.startsWith('## ')) {
        const name = trimmed.slice(3).trim();
        if (SECTION_HEADINGS.includes(name)) {
          current = name;
          if (!sections.has(name)) sections.set(name, []);
          continue;
        }
      }
      const open = /^(`{3,})/.exec(line)?.[1];
      if (open) fence = open;
    } else {
      const close = /^(`{3,})\s*$/.exec(line)?.[1];
      if (close && close.length >= fence.length) fence = null;
    }
    if (current !== null) sections.get(current)!.push(line);
  }
  return sections;
}

/** Trimmed body text of a section. */
function sectionText(sections: Map<string, string[]>, heading: string): string {
  return (sections.get(heading) ?? []).join('\n').trim();
}

/** Non-empty `- ` bullet items of a section (empty bullets dropped — F4). */
function sectionList(sections: Map<string, string[]>, heading: string): string[] {
  return (sections.get(heading) ?? [])
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 0);
}

/**
 * Inner text of the (single) fenced block in a section (F1b). A serialized
 * static section is exactly `<fence>\n<content>\n<fence>` after trimming, so the
 * opening fence is the first line and the matching close is the last — a
 * dynamic fence length guarantees no embedded run collides with it. Falls back
 * to the raw section text when no wrapping fence is present.
 */
function sectionFenced(sections: Map<string, string[]>, heading: string): string {
  const text = sectionText(sections, heading);
  const lines = text.split('\n');
  const open = /^(`{3,})/.exec(lines[0] ?? '')?.[1];
  const last = lines.length - 1;
  const close = /^(`{3,})\s*$/.exec(lines[last] ?? '')?.[1];
  const closes = open !== undefined && close !== undefined && close.length >= open.length;
  return closes && last > 0 ? lines.slice(1, last).join('\n') : text;
}

/**
 * Parse a comprehension unit markdown string into a `ComprehensionUnit`.
 * Frontmatter is parsed via gray-matter and validated field-by-field (authority
 * in TS — the unit shape is never trusted raw). `semantic: absent` units yield
 * empty summary/invariants regardless of body content.
 */
export function parseUnit(md: string): Result<ComprehensionUnit> {
  let data: Record<string, unknown>;
  let content: string;
  try {
    const parsed = matter(md);
    data = parsed.data as Record<string, unknown>;
    content = parsed.content;
  } catch (err) {
    return Err(new Error(`Comprehension frontmatter is not valid YAML: ${(err as Error).message}`));
  }
  const prov = parseProvenance(data);
  if (!prov.ok) return prov;
  const sections = splitSections(content);
  const isPresent = prov.value.semantic === 'present';
  return Ok({
    provenance: prov.value,
    summary: isPresent ? sectionText(sections, 'Summary') : '',
    invariants: isPresent ? sectionList(sections, 'Invariants') : [],
    interfaceContract: sectionFenced(sections, 'Interface Contract'),
    dependencySlice: sectionFenced(sections, 'Dependency Slice'),
  });
}
