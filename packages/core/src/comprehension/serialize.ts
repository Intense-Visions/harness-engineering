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
    `compiledAt: ${quoteYamlScalar(p.compiledAt)}`,
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
    for (const inv of unit.invariants) body.push(`- ${inv}`);
    body.push('');
  }
  body.push(H_INTERFACE, '', '```ts', unit.interfaceContract.trim(), '```', '');
  body.push(H_DEPS, '', '```', unit.dependencySlice.trim(), '```', '');
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

/** Validate + coerce provenance from parsed frontmatter. */
function parseProvenance(data: Record<string, unknown>): Result<ComprehensionProvenance> {
  const module = data.module;
  if (typeof module !== 'string' || module.length === 0) {
    return Err(new Error('Comprehension frontmatter missing required field: module'));
  }
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
  const compilerRaw = (data.compiler ?? {}) as Record<string, unknown>;
  const compiler = {
    static: typeof compilerRaw.static === 'string' ? compilerRaw.static : '',
    semantic: typeof compilerRaw.semantic === 'string' ? compilerRaw.semantic : '',
  };
  const model = data.model === null || data.model === undefined ? null : scalarString(data.model);
  const members = Array.isArray(data.members) ? data.members.map((m) => scalarString(m)) : [];
  const compiledAt = typeof data.compiledAt === 'string' ? data.compiledAt : '';
  return Ok({
    schemaVersion: SCHEMA_VERSION,
    module,
    sourceHash,
    compiledAt,
    compiler,
    model,
    semantic,
    members,
  });
}

/** Extract the trimmed body text under a `## <heading>` up to the next `## `. */
function sectionText(content: string, heading: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

/** Extract `- ` bullet items under a heading. */
function sectionList(content: string, heading: string): string[] {
  return sectionText(content, heading)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

/** Extract the inner text of a single fenced block under a heading. */
function sectionFenced(content: string, heading: string): string {
  const body = sectionText(content, heading);
  const m = body.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return (m ? m[1] : body).trim();
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
  const isPresent = prov.value.semantic === 'present';
  return Ok({
    provenance: prov.value,
    summary: isPresent ? sectionText(content, 'Summary') : '',
    invariants: isPresent ? sectionList(content, 'Invariants') : [],
    interfaceContract: sectionFenced(content, 'Interface Contract'),
    dependencySlice: sectionFenced(content, 'Dependency Slice'),
  });
}
