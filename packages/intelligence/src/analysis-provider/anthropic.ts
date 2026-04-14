import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';

import type { AnalysisProvider, AnalysisRequest, AnalysisResponse } from './interface.js';

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
  ZodNumber: () => ({ type: 'number' }),
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
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const def = (schema as unknown as { _def: ZodDef })._def;
  const typeName = def['typeName'] as string | undefined;
  const converter = typeName ? ZOD_CONVERTERS[typeName] : undefined;
  return converter ? converter(def) : {};
}

export interface AnthropicProviderOptions {
  apiKey: string;
  defaultModel?: string;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

/**
 * AnalysisProvider implementation backed by the Anthropic Messages API.
 *
 * Uses the tool_use pattern to extract structured JSON that conforms to
 * a caller-supplied Zod schema.
 */
export class AnthropicAnalysisProvider implements AnalysisProvider {
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL;
  }

  async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
    const model = request.model ?? this.defaultModel;
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const jsonSchema = zodToJsonSchema(request.responseSchema);

    const tool: Anthropic.Messages.Tool = {
      name: 'structured_output',
      description: 'Return the analysis result as structured JSON matching the required schema.',
      input_schema: {
        type: 'object' as const,
        ...jsonSchema,
      },
    };

    const systemParts: string[] = [];
    if (request.systemPrompt) {
      systemParts.push(request.systemPrompt);
    }
    systemParts.push(
      'You MUST respond by calling the "structured_output" tool with your result. Do not return plain text.'
    );

    const startMs = performance.now();

    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemParts.join('\n\n'),
      tools: [tool],
      tool_choice: { type: 'tool', name: 'structured_output' },
      messages: [{ role: 'user', content: request.prompt }],
    });

    const latencyMs = Math.round(performance.now() - startMs);

    // Extract the tool_use block from the response.
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolUseBlock) {
      throw new Error(
        'Anthropic response did not contain a tool_use block. ' +
          `Stop reason: ${response.stop_reason}`
      );
    }

    // Validate against the caller's Zod schema (throws ZodError on mismatch).
    const result = request.responseSchema.parse(toolUseBlock.input) as T;

    const tokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    return { result, tokenUsage, model, latencyMs };
  }
}
