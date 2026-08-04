import type { z } from 'zod';

/**
 * A key present in the raw config JSON that the schema silently dropped
 * (unknown or mis-nested), together with an optional closest-known-sibling
 * suggestion.
 */
export interface StrippedKey {
  /** Dotted path of the dropped key, e.g. `entropy.analyze`. */
  path: string;
  /** Closest known sibling key at the same level, when a near-typo is likely. */
  suggestion?: string;
}

/** A zod schema node with the internal `_def` we walk. Typed loosely on purpose. */
type ZodDef = {
  typeName?: string;
  innerType?: z.ZodTypeAny;
  schema?: z.ZodTypeAny;
  getter?: () => z.ZodTypeAny;
  type?: z.ZodTypeAny;
  valueType?: z.ZodTypeAny;
  options?: z.ZodTypeAny[];
  unknownKeys?: 'strip' | 'strict' | 'passthrough';
  shape?: () => Record<string, z.ZodTypeAny>;
};

function defOf(schema: z.ZodTypeAny): ZodDef {
  return (schema as unknown as { _def: ZodDef })._def;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Top-level namespaces that `harness.config.json` reserves for co-tenant tools
 * (#982). The file is in practice a SHARED file: sibling tools read their own
 * namespace directly out of it (e.g. Canary reads `canary`). Warning on these
 * load-bearing keys is actively harmful — the obvious way to silence the warning
 * is to delete the key, which silently resets the co-tenant's config. harness
 * does not own these keys and must not police them.
 *
 * Reserved: an explicit allow-list of known co-tenants, plus the `x-*` extension
 * convention for anything harness has not been told about.
 */
const RESERVED_COTENANT_NAMESPACES = new Set(['canary']);

function isReservedCotenantKey(key: string): boolean {
  return RESERVED_COTENANT_NAMESPACES.has(key) || key.startsWith('x-');
}

/**
 * Case-insensitive Levenshtein distance, capped for short identifiers.
 */
function editDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const m = s.length;
  const n = t.length;
  // prev/curr are fully initialized number[] of length n+1, so every indexed
  // read below is in-bounds; `!` silences noUncheckedIndexedAccess. Empty
  // strings are handled naturally (the guarded loops simply don't run).
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let curr: number[] = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

/**
 * Suggest the closest known sibling for a dropped key, but only when the match
 * is close enough to plausibly be a typo (not a wholesale mis-nesting). Returns
 * undefined when nothing is close.
 */
function closestKnownKey(dropped: string, knownKeys: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const known of knownKeys) {
    const d = editDistance(dropped, known);
    if (d < bestDistance) {
      bestDistance = d;
      best = known;
    }
  }
  if (best === undefined) return undefined;
  // Conservative: at most 2 edits, and no more than ~40% of the longer name,
  // so `securty`→`security` fires but `analyze`→`drift` does not.
  const threshold = Math.min(2, Math.floor(Math.max(dropped.length, best.length) * 0.4));
  return bestDistance <= threshold ? best : undefined;
}

/**
 * Walk a zod schema alongside the raw parsed-JSON input and collect every key
 * the schema would silently drop, respecting `.passthrough()` sections (whose
 * extra keys are intentionally kept and must NOT be reported).
 *
 * This is a schema-aware alternative to a blanket `.strict()` (which would turn
 * strip into a hard parse error and break existing configs). Descends through
 * the wrapper types the config schema actually uses — optional / default /
 * nullable / effects (refine/superRefine) / lazy — and recurses into objects,
 * records, arrays, and unions so mis-nested keys at any depth are caught.
 *
 * @param schema - The zod schema the value was validated against.
 * @param value - The raw (pre-parse) JSON value.
 * @param pathPrefix - Dotted path accumulated so far (empty at the root).
 * @returns The dropped keys, each with an optional near-typo suggestion.
 */
export function collectStrippedKeys(
  schema: z.ZodTypeAny,
  value: unknown,
  pathPrefix = ''
): StrippedKey[] {
  const out: StrippedKey[] = [];
  walk(schema, value, pathPrefix, out);
  return out;
}

function join(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key;
}

/** Wrapper types that carry no keys of their own — unwrap and continue. */
const WRAPPERS: Record<string, (def: ZodDef) => z.ZodTypeAny | undefined> = {
  ZodOptional: (d) => d.innerType,
  ZodNullable: (d) => d.innerType,
  ZodDefault: (d) => d.innerType,
  ZodEffects: (d) => d.schema,
  ZodLazy: (d) => d.getter?.(),
};

function walk(schema: z.ZodTypeAny, value: unknown, prefix: string, out: StrippedKey[]): void {
  const def = defOf(schema);
  const typeName = def.typeName ?? '';

  const unwrapper = WRAPPERS[typeName];
  if (unwrapper) {
    const inner = unwrapper(def);
    if (inner) walk(inner, value, prefix, out);
    return;
  }

  switch (typeName) {
    case 'ZodObject':
      return walkObject(def, value, prefix, out);
    case 'ZodRecord':
      return walkRecord(def, value, prefix, out);
    case 'ZodArray':
      return walkArray(def, value, prefix, out);
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion':
      return walkUnion(def, value, prefix, out);
    default:
      // Primitives and anything else carry no droppable keys.
      return;
  }
}

function walkObject(def: ZodDef, value: unknown, prefix: string, out: StrippedKey[]): void {
  if (!isPlainObject(value)) return;
  const shape = def.shape ? def.shape() : {};
  const knownKeys = Object.keys(shape);
  const passthrough = def.unknownKeys === 'passthrough';
  for (const key of Object.keys(value)) {
    const child = shape[key];
    const childPath = join(prefix, key);
    if (child) {
      walk(child, value[key], childPath, out);
    } else if (!passthrough) {
      // A reserved co-tenant namespace at the ROOT is another tool's config, not
      // a dropped harness key — never report it (#982). Only the root is
      // co-tenant space; a `canary` nested elsewhere is still a real strip.
      if (prefix === '' && isReservedCotenantKey(key)) continue;
      // `strict` would already have failed the top-level parse, so any key we
      // reach here under a non-passthrough object was strip-dropped. Passthrough
      // extras are intentionally kept and are never reported.
      const suggestion = closestKnownKey(key, knownKeys);
      out.push(suggestion ? { path: childPath, suggestion } : { path: childPath });
    }
  }
}

function walkRecord(def: ZodDef, value: unknown, prefix: string, out: StrippedKey[]): void {
  // Arbitrary keys are allowed; recurse into each value with the value schema.
  if (!isPlainObject(value) || !def.valueType) return;
  for (const key of Object.keys(value)) {
    walk(def.valueType, value[key], join(prefix, key), out);
  }
}

function walkArray(def: ZodDef, value: unknown, prefix: string, out: StrippedKey[]): void {
  if (!Array.isArray(value) || !def.type) return;
  const elem = def.type;
  value.forEach((item, i) => walk(elem, item, `${prefix}[${i}]`, out));
}

function walkUnion(def: ZodDef, value: unknown, prefix: string, out: StrippedKey[]): void {
  // Recurse into the first option that accepts the value (that is the branch the
  // parse used), so passthrough branches suppress and strip branches report —
  // matching what actually happened at parse time.
  for (const option of def.options ?? []) {
    if (option.safeParse(value).success) {
      walk(option, value, prefix, out);
      return;
    }
  }
}

/**
 * Format collected stripped keys into human-readable, non-fatal warning lines
 * for `harness.config.json`.
 */
export function formatStrippedKeyWarnings(dropped: StrippedKey[]): string[] {
  return dropped.map(({ path, suggestion }) => {
    const hint = suggestion ? ` (did you mean '${siblingPath(path, suggestion)}'?)` : '';
    return `⚠ harness.config.json: ignored unknown key '${path}'${hint}`;
  });
}

/** Replace the last path segment with the suggested sibling. */
function siblingPath(path: string, suggestion: string): string {
  const idx = path.lastIndexOf('.');
  return idx === -1 ? suggestion : `${path.slice(0, idx + 1)}${suggestion}`;
}
