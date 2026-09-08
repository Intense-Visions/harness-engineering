import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runBenchmark,
  runVisionBenchmark,
  parseBenchmarkResponse,
} from '../../../src/design-craft/phases/benchmark.js';
import type {
  BenchmarkTarget,
  VisionBenchmarkTarget,
} from '../../../src/design-craft/phases/benchmark.js';
import { linearEmptyListExemplar } from '../../../src/design-craft/catalog/exemplars/linear-empty-list.js';
import type { LlmProvider, VisionInput } from '../../../src/shared/craft/llm/provider.js';

/**
 * Branch-coverage tests for the design-craft BENCHMARK phase: JSON extraction
 * fallbacks, dimension validation boundaries, exemplar selection, source/image
 * reading, and the text + vision run loops.
 */

function radar(opts?: { lowConfidence?: boolean; score?: number }): string {
  const dim = (extra?: object) => ({
    score: opts?.score ?? 80,
    confidence: 'high',
    notes: 'note',
    ...extra,
  });
  return [
    '```json',
    JSON.stringify({
      philosophicalCoherence: dim(opts?.lowConfidence ? { confidence: 'low' } : undefined),
      hierarchy: dim(),
      craftExecution: dim(),
      function: dim(),
      innovation: dim(),
      gaps: ['gap one'],
    }),
    '```',
  ].join('\n');
}

class TextProvider implements LlmProvider {
  readonly providerId = 'text-test';
  readonly model = 'm';
  constructor(private readonly response: string) {}
  async callText(): Promise<string> {
    return this.response;
  }
  async callVision(): Promise<string> {
    throw new Error('no vision');
  }
  recordCost(): void {}
}

class VisionProvider implements LlmProvider {
  readonly providerId = 'vision-test';
  readonly model = 'm';
  lastImage?: VisionInput;
  constructor(private readonly response: string) {}
  async callText(): Promise<string> {
    throw new Error('no text');
  }
  async callVision(_prompt: string, image: VisionInput): Promise<string> {
    this.lastImage = image;
    return this.response;
  }
  recordCost(): void {}
}

describe('parseBenchmarkResponse extraction', () => {
  it('parses a ```json fenced block', () => {
    expect(parseBenchmarkResponse(radar())).not.toBeNull();
  });

  it('parses a generically fenced (non-json) block', () => {
    const body = radar().replace('```json', '```');
    expect(parseBenchmarkResponse(body)).not.toBeNull();
  });

  it('parses a bare-brace object with surrounding prose', () => {
    const inner = radar()
      .replace(/```json|```/g, '')
      .trim();
    expect(parseBenchmarkResponse(`here you go: ${inner} thanks`)).not.toBeNull();
  });

  it('returns null for text with no JSON at all', () => {
    expect(parseBenchmarkResponse('no json here')).toBeNull();
  });

  it('returns null when a dimension score is out of range', () => {
    expect(parseBenchmarkResponse(radar({ score: 150 }))).toBeNull();
  });

  it('returns null when a dimension has empty notes', () => {
    const bad = JSON.stringify({
      philosophicalCoherence: { score: 80, confidence: 'high', notes: '   ' },
      hierarchy: { score: 80, confidence: 'high', notes: 'n' },
      craftExecution: { score: 80, confidence: 'high', notes: 'n' },
      function: { score: 80, confidence: 'high', notes: 'n' },
      innovation: { score: 80, confidence: 'high', notes: 'n' },
      gaps: [],
    });
    expect(parseBenchmarkResponse('```json\n' + bad + '\n```')).toBeNull();
  });

  it('returns null when gaps is not an array of strings', () => {
    const bad = JSON.stringify({
      philosophicalCoherence: { score: 80, confidence: 'high', notes: 'n' },
      hierarchy: { score: 80, confidence: 'high', notes: 'n' },
      craftExecution: { score: 80, confidence: 'high', notes: 'n' },
      function: { score: 80, confidence: 'high', notes: 'n' },
      innovation: { score: 80, confidence: 'high', notes: 'n' },
      gaps: [1, 2],
    });
    expect(parseBenchmarkResponse('```json\n' + bad + '\n```')).toBeNull();
  });

  it('returns null when a required dimension is missing', () => {
    const bad = JSON.stringify({
      philosophicalCoherence: { score: 80, confidence: 'high', notes: 'n' },
      gaps: [],
    });
    expect(parseBenchmarkResponse('```json\n' + bad + '\n```')).toBeNull();
  });
});

describe('runBenchmark', () => {
  it('scores a target from inline source and computes overall', async () => {
    const target: BenchmarkTarget = {
      file: 'X.tsx',
      component: 'X',
      source: 'export const X = () => null;',
      componentType: 'EmptyState',
    };
    const scores = await runBenchmark({
      targets: [target],
      exemplars: [linearEmptyListExemplar],
      provider: new TextProvider(radar({ score: 70 })),
    });
    expect(scores).toHaveLength(1);
    expect(scores[0]!.overall.score).toBe(70);
    expect(scores[0]!.exemplars).toContain(linearEmptyListExemplar.id);
  });

  it('drags overall confidence to low when one dimension is low (ADR 0019)', async () => {
    const scores = await runBenchmark({
      targets: [{ file: 'X.tsx', component: 'X', source: 'x', componentType: 'EmptyState' }],
      exemplars: [linearEmptyListExemplar],
      provider: new TextProvider(radar({ lowConfidence: true })),
    });
    expect(scores[0]!.overall.confidence).toBe('low');
  });

  it('skips a target whose componentType matches no exemplar', async () => {
    const scores = await runBenchmark({
      targets: [{ file: 'X.tsx', component: 'X', source: 'x', componentType: 'Nonexistent' }],
      exemplars: [linearEmptyListExemplar],
      provider: new TextProvider(radar()),
    });
    expect(scores).toEqual([]);
  });

  it('skips a target whose LLM response fails to parse', async () => {
    const scores = await runBenchmark({
      targets: [{ file: 'X.tsx', component: 'X', source: 'x', componentType: 'EmptyState' }],
      exemplars: [linearEmptyListExemplar],
      provider: new TextProvider('garbage no json'),
    });
    expect(scores).toEqual([]);
  });

  it('reads target source from disk when no inline source is provided', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-cov544-'));
    try {
      const file = path.join(dir, 'Comp.tsx');
      fs.writeFileSync(file, 'export const Comp = () => null;');
      const scores = await runBenchmark({
        targets: [{ file, component: 'Comp', componentType: 'EmptyState' }],
        exemplars: [linearEmptyListExemplar],
        provider: new TextProvider(radar()),
      });
      expect(scores).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applies the responsive require gate when metrics are absent', async () => {
    const scores = await runBenchmark({
      targets: [{ file: 'X.tsx', component: 'X', source: 'x', componentType: 'EmptyState' }],
      exemplars: [linearEmptyListExemplar],
      provider: new TextProvider(radar()),
      responsive: { require: true },
    });
    expect(scores[0]!.awardBar).toBeDefined();
  });
});

describe('runVisionBenchmark', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-vis-cov544-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeImage(name: string): string {
    const p = path.join(dir, name);
    fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return p;
  }

  it('scores from a rendered PNG and passes the image buffer', async () => {
    const image = writeImage('shot.png');
    const provider = new VisionProvider(radar());
    const target: VisionBenchmarkTarget = {
      file: 'X.tsx',
      component: 'X',
      componentType: 'EmptyState',
      image,
    };
    const scores = await runVisionBenchmark({
      targets: [target],
      exemplars: [linearEmptyListExemplar],
      provider,
    });
    expect(scores).toHaveLength(1);
    expect(provider.lastImage?.mediaType).toBe('image/png');
  });

  it('infers image/jpeg from a .jpg extension', async () => {
    const image = writeImage('shot.jpg');
    const provider = new VisionProvider(radar());
    await runVisionBenchmark({
      targets: [{ file: 'X.tsx', component: 'X', componentType: 'EmptyState', image }],
      exemplars: [linearEmptyListExemplar],
      provider,
    });
    expect(provider.lastImage?.mediaType).toBe('image/jpeg');
  });

  it('infers image/webp from a .webp extension', async () => {
    const image = writeImage('shot.webp');
    const provider = new VisionProvider(radar());
    await runVisionBenchmark({
      targets: [{ file: 'X.tsx', component: 'X', componentType: 'EmptyState', image }],
      exemplars: [linearEmptyListExemplar],
      provider,
    });
    expect(provider.lastImage?.mediaType).toBe('image/webp');
  });

  it('skips a vision target with no matching exemplar', async () => {
    const image = writeImage('shot.png');
    const scores = await runVisionBenchmark({
      targets: [{ file: 'X.tsx', component: 'X', componentType: 'None', image }],
      exemplars: [linearEmptyListExemplar],
      provider: new VisionProvider(radar()),
    });
    expect(scores).toEqual([]);
  });

  it('skips a vision target whose response fails to parse', async () => {
    const image = writeImage('shot.png');
    const scores = await runVisionBenchmark({
      targets: [{ file: 'X.tsx', component: 'X', componentType: 'EmptyState', image }],
      exemplars: [linearEmptyListExemplar],
      provider: new VisionProvider('nope'),
    });
    expect(scores).toEqual([]);
  });
});
