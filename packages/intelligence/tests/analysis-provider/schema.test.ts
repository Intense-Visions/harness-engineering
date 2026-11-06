import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from '../../src/analysis-provider/schema.js';

// The converter walks zod internals. When zod 3 -> 4 renamed `_def.typeName` to
// `_zod.def.type`, an unported walker would return `{}` for everything and the
// providers would send an empty response schema without any error — so pin the shape.
describe('zodToJsonSchema', () => {
  it('converts the supported subset with constraints and required keys', () => {
    const schema = z.object({
      title: z.string(),
      score: z.number().int().min(1).max(10),
      ratio: z.number().gt(0).lt(1),
      kind: z.enum(['bug', 'feature']),
      tag: z.literal('x'),
      flags: z.array(z.boolean()),
      note: z.string().optional(),
      parent: z.string().nullable(),
      weights: z.record(z.string(), z.number()),
      either: z.union([z.string(), z.number()]),
      level: z.number().default(3),
    });

    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string' },
        score: { type: 'integer', minimum: 1, maximum: 10 },
        ratio: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 },
        kind: { type: 'string', enum: ['bug', 'feature'] },
        tag: { type: 'string', const: 'x' },
        flags: { type: 'array', items: { type: 'boolean' } },
        note: { type: 'string' },
        parent: { type: ['string', 'null'] },
        weights: { type: 'object', additionalProperties: { type: 'number' } },
        either: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        level: { type: 'number' },
      },
      required: [
        'title',
        'score',
        'ratio',
        'kind',
        'tag',
        'flags',
        'parent',
        'weights',
        'either',
        'level',
      ],
    });
  });

  it('wraps a nullable without a single `type` (a union) in oneOf', () => {
    expect(zodToJsonSchema(z.union([z.string(), z.number()]).nullable())).toEqual({
      oneOf: [{ oneOf: [{ type: 'string' }, { type: 'number' }] }, { type: 'null' }],
    });
  });

  it('returns {} for unsupported types', () => {
    expect(zodToJsonSchema(z.date())).toEqual({});
  });
});
