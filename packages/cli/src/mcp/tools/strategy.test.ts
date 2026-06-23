import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  validateStrategyDefinition,
  handleValidateStrategy,
  readStrategyDefinition,
  handleReadStrategy,
  writeStrategyDefinition,
  handleWriteStrategy,
} from './strategy';

const VALID_DOC = `---
name: TestProduct
last_updated: 2026-06-02
version: 1
---

# TestProduct — Engineering Strategy

## Target problem

Engineering teams ship without a strategic anchor; brainstorming starts mid-stream.

## Our approach

Make STRATEGY.md a small, durable upstream anchor that every downstream skill reads first.

## Who it's for

Solo founders and small engineering teams (2-8 engineers) running their own roadmap.

## Key metrics

- Strategy adoption: % of harness projects with STRATEGY.md, measured in telemetry.
- Brainstorming grounding rate: % of specs that cite STRATEGY.md, measured in spec frontmatter.

## Tracks

- Strategic-anchor track: ship STRATEGY.md + downstream grounding for ideate, brainstorming, roadmap-pilot.
`;

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mcp-strategy-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('validate_strategy MCP tool', () => {
  it('definition has expected name and required path', () => {
    expect(validateStrategyDefinition.name).toBe('validate_strategy');
    expect((validateStrategyDefinition.inputSchema as { required: string[] }).required).toEqual([
      'path',
    ]);
  });

  it('returns present:false when STRATEGY.md is absent', async () => {
    const result = await handleValidateStrategy({ path: tmpDir });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload).toEqual({ present: false, valid: true });
  });

  it('returns present:true valid:true on a valid STRATEGY.md', async () => {
    fs.writeFileSync(path.join(tmpDir, 'STRATEGY.md'), VALID_DOC);
    const result = await handleValidateStrategy({ path: tmpDir });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload).toEqual({ present: true, valid: true });
  });

  it('returns valid:false with error on a malformed STRATEGY.md', async () => {
    fs.writeFileSync(path.join(tmpDir, 'STRATEGY.md'), '# missing frontmatter\n');
    const result = await handleValidateStrategy({ path: tmpDir });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.valid).toBe(false);
    expect(typeof payload.error).toBe('string');
  });
});

describe('read_strategy MCP tool', () => {
  it('definition has expected name', () => {
    expect(readStrategyDefinition.name).toBe('read_strategy');
  });

  it('returns present:false when absent', async () => {
    const result = await handleReadStrategy({ path: tmpDir });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload).toEqual({ present: false, valid: true });
  });

  it('returns doc on a valid STRATEGY.md', async () => {
    fs.writeFileSync(path.join(tmpDir, 'STRATEGY.md'), VALID_DOC);
    const result = await handleReadStrategy({ path: tmpDir });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.present).toBe(true);
    expect(payload.valid).toBe(true);
    expect(payload.doc.frontmatter.name).toBe('TestProduct');
    expect(payload.doc.sections.map((s: { name: string }) => s.name)).toContain('Target problem');
  });

  it('surfaces the validation error on a malformed STRATEGY.md', async () => {
    fs.writeFileSync(path.join(tmpDir, 'STRATEGY.md'), '# no frontmatter\n');
    const result = await handleReadStrategy({ path: tmpDir });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.valid).toBe(false);
  });
});

describe('write_strategy MCP tool', () => {
  it('definition has expected name and required fields', () => {
    expect(writeStrategyDefinition.name).toBe('write_strategy');
    expect((writeStrategyDefinition.inputSchema as { required: string[] }).required).toEqual([
      'path',
      'doc',
    ]);
  });

  it('writes a valid doc and round-trips through read_strategy', async () => {
    const doc = {
      frontmatter: { name: 'RoundTrip', last_updated: '2026-06-02', version: 1 },
      sections: [
        {
          name: 'Target problem',
          body: 'Engineering teams ship without a strategic anchor; brainstorming starts mid-stream.',
        },
        {
          name: 'Our approach',
          body: 'Anchor every roadmap conversation in a small, durable STRATEGY.md.',
        },
        {
          name: "Who it's for",
          body: 'Solo founders and small engineering teams (2-8 engineers) running their own roadmap.',
        },
        {
          name: 'Key metrics',
          body: '- Adoption rate: % of projects with STRATEGY.md, measured in telemetry.',
        },
        {
          name: 'Tracks',
          body: '- Anchor track: ship STRATEGY.md + downstream grounding.',
        },
      ],
    };
    const writeResult = await handleWriteStrategy({ path: tmpDir, doc });
    const writePayload = JSON.parse(writeResult.content[0]!.text);
    expect(writePayload.written).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'STRATEGY.md'))).toBe(true);

    const readResult = await handleReadStrategy({ path: tmpDir });
    const readPayload = JSON.parse(readResult.content[0]!.text);
    expect(readPayload.present).toBe(true);
    expect(readPayload.valid).toBe(true);
    expect(readPayload.doc.frontmatter.name).toBe('RoundTrip');
  });

  it('refuses to touch disk when doc fails schema validation', async () => {
    const badDoc = { frontmatter: { name: 'NoSections', last_updated: '2026-06-02', version: 1 } };
    const result = await handleWriteStrategy({ path: tmpDir, doc: badDoc });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.written).toBe(false);
    expect(result.isError).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'STRATEGY.md'))).toBe(false);
  });
});
