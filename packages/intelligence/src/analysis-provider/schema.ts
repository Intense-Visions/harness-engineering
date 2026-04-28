import type { z } from 'zod';

type ZodDef = Record<string, unknown>;
type Converter = (def: ZodDef) => Record<string, unknown>;

function convertObject(def: ZodDef): Record<string, unknown> {
  const shape = (def['shape'] as () => Record<string, z.ZodType>)();
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    properties[key] = zodToJsonSchema(value);
    const innerDef = (value as unknown as { _def: ZodDef })._def;
    if (innerDef['typeName'] !== 'ZodOptional') required.push(key);
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

const ZOD_CONVERTERS: Record<string, Converter> = {
  ZodString: () => ({ type: 'string' }),
  ZodNumber: (def) => {
    const result: Record<string, unknown> = { type: 'number' };
    const checks = def['checks'] as
      | Array<{ kind: string; value: number; inclusive?: boolean }>
      | undefined;
    if (checks) {
      for (const check of checks) {
        if (check.kind === 'min') {
          result[check.inclusive === false ? 'exclusiveMinimum' : 'minimum'] = check.value;
        }
        if (check.kind === 'max') {
          result[check.inclusive === false ? 'exclusiveMaximum' : 'maximum'] = check.value;
        }
        if (check.kind === 'int') result['type'] = 'integer';
      }
    }
    return result;
  },
  ZodBoolean: () => ({ type: 'boolean' }),
  ZodLiteral: (def) => ({ type: typeof def['value'], const: def['value'] }),
  ZodEnum: (def) => ({ type: 'string', enum: def['values'] as string[] }),
  ZodNativeEnum: (def) => ({ enum: Object.values(def['values'] as Record<string, unknown>) }),
  ZodArray: (def) => ({ type: 'array', items: zodToJsonSchema(def['type'] as z.ZodType) }),
  ZodObject: convertObject,
  ZodOptional: (def) => zodToJsonSchema(def['innerType'] as z.ZodType),
  ZodNullable: convertNullable,
  ZodDefault: (def) => zodToJsonSchema(def['innerType'] as z.ZodType),
  ZodRecord: (def) => ({
    type: 'object',
    additionalProperties: zodToJsonSchema(def['valueType'] as z.ZodType),
  }),
  ZodUnion: (def) => ({ oneOf: (def['options'] as z.ZodType[]).map(zodToJsonSchema) }),
};

/**
 * Convert a Zod schema to a JSON Schema object.
 *
 * Handles the subset of types used by the intelligence pipeline:
 * objects, strings, numbers, booleans, arrays, enums, optionals, and nullables.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const def = (schema as unknown as { _def: ZodDef })._def;
  const typeName = def['typeName'] as string | undefined;
  const converter = typeName ? ZOD_CONVERTERS[typeName] : undefined;
  return converter ? converter(def) : {};
}
