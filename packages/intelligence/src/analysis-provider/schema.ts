import type { z } from 'zod';

/**
 * The zod 4 internal definition node we walk (`schema._zod.def`). Typed loosely on
 * purpose: zod does not publish a stable shape for it, and every field is read
 * defensively. Under zod 3 this walked `_def.typeName`; zod 4 renamed the
 * discriminant to lowercase `def.type`, so a stale walker would silently emit `{}`
 * for every schema — hence the explicit port rather than a compat import.
 */
type ZodDef = Record<string, unknown> & { type?: string };
type Converter = (def: ZodDef) => Record<string, unknown>;

function defOf(schema: z.ZodType): ZodDef {
  return (schema as unknown as { _zod: { def: ZodDef } })._zod.def;
}

function convertObject(def: ZodDef): Record<string, unknown> {
  const shape = def['shape'] as Record<string, z.ZodType>;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    properties[key] = zodToJsonSchema(value);
    if (defOf(value).type !== 'optional') required.push(key);
  }
  const result: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) result['required'] = required;
  return result;
}

function convertNullable(def: ZodDef): Record<string, unknown> {
  const inner = zodToJsonSchema(def['innerType'] as z.ZodType);
  if (typeof inner['type'] === 'string') return { ...inner, type: [inner['type'], 'null'] };
  return { oneOf: [inner, { type: 'null' }] };
}

type NumberCheckDef = { check?: string; value?: number; inclusive?: boolean; format?: string };

/** JSON Schema keyword a zod 4 number bound maps to, by [check kind][inclusive]. */
const BOUND_KEYWORD: Record<string, [exclusive: string, inclusive: string]> = {
  greater_than: ['exclusiveMinimum', 'minimum'],
  less_than: ['exclusiveMaximum', 'maximum'],
};

function applyNumberCheck(result: Record<string, unknown>, check: NumberCheckDef): void {
  const bound = check.check ? BOUND_KEYWORD[check.check] : undefined;
  if (bound) result[check.inclusive === false ? bound[0] : bound[1]] = check.value;
  else if (check.check === 'number_format' && check.format?.includes('int')) {
    result['type'] = 'integer';
  }
}

function convertNumber(def: ZodDef): Record<string, unknown> {
  const result: Record<string, unknown> = { type: 'number' };
  const checks = (def['checks'] as Array<{ _zod: { def: NumberCheckDef } }> | undefined) ?? [];
  for (const { _zod } of checks) applyNumberCheck(result, _zod.def);
  return result;
}

function convertLiteral(def: ZodDef): Record<string, unknown> {
  const values = def['values'] as unknown[];
  if (values.length === 1) return { type: typeof values[0], const: values[0] };
  return { enum: values };
}

const ZOD_CONVERTERS: Record<string, Converter> = {
  string: () => ({ type: 'string' }),
  number: convertNumber,
  boolean: () => ({ type: 'boolean' }),
  literal: convertLiteral,
  // zod 4 folds nativeEnum into `enum`; `entries` maps key -> value for both.
  enum: (def) => {
    const values = Object.values(def['entries'] as Record<string, unknown>);
    return values.every((v) => typeof v === 'string')
      ? { type: 'string', enum: values }
      : { enum: values };
  },
  array: (def) => ({ type: 'array', items: zodToJsonSchema(def['element'] as z.ZodType) }),
  object: convertObject,
  optional: (def) => zodToJsonSchema(def['innerType'] as z.ZodType),
  nullable: convertNullable,
  default: (def) => zodToJsonSchema(def['innerType'] as z.ZodType),
  record: (def) => ({
    type: 'object',
    additionalProperties: zodToJsonSchema(def['valueType'] as z.ZodType),
  }),
  union: (def) => ({ oneOf: (def['options'] as z.ZodType[]).map(zodToJsonSchema) }),
};

/**
 * Convert a Zod schema to a JSON Schema object.
 *
 * Handles the subset of types used by the intelligence pipeline:
 * objects, strings, numbers, booleans, arrays, enums, optionals, and nullables.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const type = defOf(schema).type;
  const converter = type ? ZOD_CONVERTERS[type] : undefined;
  return converter ? converter(defOf(schema)) : {};
}
