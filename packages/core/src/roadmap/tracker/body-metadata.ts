import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Priority } from '@harness-engineering/types';

const START_MARKER = '<!-- harness-meta:start -->';
const END_MARKER = '<!-- harness-meta:end -->';

export interface BodyMeta {
  spec?: string | null;
  plan?: string | null; // singular ref; multi-plan deferred
  blocked_by?: string[];
  priority?: Priority | null;
  milestone?: string | null;
}

export interface ParsedBody {
  summary: string;
  meta: BodyMeta;
}

/**
 * Tolerant parser. See spec §"Body metadata block".
 * - Missing block → meta = {}
 * - Malformed YAML → log warning, meta = {}
 * - Multiple blocks → first wins
 */
export function parseBodyBlock(body: string): ParsedBody {
  const startIdx = body.indexOf(START_MARKER);
  if (startIdx === -1) return { summary: body.trim(), meta: {} };

  const endIdx = body.indexOf(END_MARKER, startIdx + START_MARKER.length);
  if (endIdx === -1) return { summary: body.trim(), meta: {} };

  // Warn on multiple blocks
  const secondStart = body.indexOf(START_MARKER, endIdx + END_MARKER.length);
  if (secondStart !== -1) {
    console.warn('harness-meta: multiple blocks found; first wins.');
  }

  const yamlText = body.slice(startIdx + START_MARKER.length, endIdx).trim();
  let meta: BodyMeta = {};
  try {
    const parsed = parseYaml(yamlText);
    if (parsed && typeof parsed === 'object') {
      meta = normalizeBodyMeta(parsed as Record<string, unknown>);
    }
  } catch (e) {
    console.warn(
      `harness-meta: malformed YAML, treating block as missing: ${(e as Error).message}`
    );
    meta = {};
  }

  // Summary is everything before the start marker, trimmed.
  const summary = body.slice(0, startIdx).trim();
  return { summary, meta };
}

function normalizeBodyMeta(raw: Record<string, unknown>): BodyMeta {
  const out: BodyMeta = {};
  if (typeof raw.spec === 'string') out.spec = raw.spec;
  if (typeof raw.plan === 'string') out.plan = raw.plan;
  if (typeof raw.blocked_by === 'string') {
    out.blocked_by = raw.blocked_by
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (Array.isArray(raw.blocked_by)) {
    out.blocked_by = (raw.blocked_by as unknown[]).filter(
      (v): v is string => typeof v === 'string'
    );
  }
  if (typeof raw.priority === 'string' && ['P0', 'P1', 'P2', 'P3'].includes(raw.priority)) {
    out.priority = raw.priority as Priority;
  }
  if (typeof raw.milestone === 'string') out.milestone = raw.milestone;
  return out;
}

/**
 * Field whitelist + serializer for the canonical body-meta block. Maps each
 * BodyMeta key to the YAML key used on disk and a function that returns the
 * serialized value (or undefined to skip). Order is preserved by Map iteration
 * order — this matches the prior cascade's emission order.
 *
 * `blocked_by` is emitted as a YAML array (block sequence) so feature names
 * that contain commas survive round-trip without being mis-split. The parser
 * accepts both the array form (preferred) and the legacy comma-joined string
 * form for backward compatibility.
 */
const SERIALIZER_FIELDS: ReadonlyArray<readonly [keyof BodyMeta, string, (v: unknown) => unknown]> =
  [
    ['spec', 'spec', (v) => v],
    ['plan', 'plan', (v) => v],
    [
      'blocked_by',
      'blocked_by',
      (v) => (Array.isArray(v) && v.length > 0 ? (v as string[]) : undefined),
    ],
    ['priority', 'priority', (v) => v],
    ['milestone', 'milestone', (v) => v],
  ];

/**
 * Always emits a canonical block at the end of the body.
 * Empty meta → no block (returns summary verbatim, trimmed).
 */
export function serializeBodyBlock(summary: string, meta: BodyMeta): string {
  const ordered: Record<string, unknown> = {};
  for (const [key, yamlKey, mapValue] of SERIALIZER_FIELDS) {
    const raw = meta[key];
    if (raw === undefined || raw === null) continue;
    const out = mapValue(raw);
    if (out === undefined) continue;
    ordered[yamlKey] = out;
  }

  const trimmed = summary.trim();
  if (Object.keys(ordered).length === 0) return trimmed;

  const yamlBody = stringifyYaml(ordered).trimEnd();
  const block = `${START_MARKER}\n${yamlBody}\n${END_MARKER}`;
  return trimmed.length > 0 ? `${trimmed}\n\n${block}` : block;
}
