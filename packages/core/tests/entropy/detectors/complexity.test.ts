import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { detectComplexityViolations } from '../../../src/entropy/detectors/complexity';
import type { CodebaseSnapshot, ComplexityConfig } from '../../../src/entropy/types';
import type { GraphComplexityData } from '../../../src/entropy/detectors/complexity';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { isOk } from '../../../src/shared/result';

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'complexity-test-'));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function makeSnapshot(files: Array<{ name: string; content: string }>): CodebaseSnapshot {
  return {
    files: files.map((f) => ({
      path: join(tempDir, f.name),
      ast: { type: 'Program', body: null, language: 'typescript' },
      imports: [],
      exports: [],
      internalSymbols: [],
      jsDocComments: [],
    })),
    dependencyGraph: { nodes: [], edges: [] } as unknown as CodebaseSnapshot['dependencyGraph'],
    exportMap: { byFile: new Map(), byName: new Map() },
    docs: [],
    codeReferences: [],
    entryPoints: [],
    rootDir: tempDir,
    config: { rootDir: tempDir, analyze: {} },
    buildTime: 0,
  };
}

async function writeFixture(name: string, content: string): Promise<void> {
  await writeFile(join(tempDir, name), content, 'utf-8');
}

describe('detectComplexityViolations', () => {
  it('should produce no violations for a simple function', async () => {
    const content = `
export function add(a: number, b: number): number {
  return a + b;
}
`;
    await writeFixture('simple.ts', content);
    const snapshot = makeSnapshot([{ name: 'simple.ts', content }]);

    const result = await detectComplexityViolations(snapshot);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.violations).toHaveLength(0);
    expect(result.value.stats.functionsAnalyzed).toBe(1);
  });

  it('should detect high cyclomatic complexity (>15) as tier 1 error', async () => {
    // Build a function with many decision points to exceed 15
    const content = `
export function complexRouter(action: string, data: any) {
  if (action === 'a') {
    return 1;
  } else if (action === 'b') {
    return 2;
  } else if (action === 'c') {
    return 3;
  } else if (action === 'd') {
    return 4;
  } else if (action === 'e') {
    return 5;
  } else if (action === 'f') {
    return 6;
  } else if (action === 'g') {
    return 7;
  } else if (action === 'h') {
    return 8;
  } else if (action === 'i') {
    return 9;
  } else if (action === 'j') {
    return 10;
  } else if (action === 'k') {
    return 11;
  } else if (action === 'l') {
    return 12;
  } else if (action === 'm') {
    return 13;
  } else if (action === 'n') {
    return 14;
  } else if (action === 'o') {
    return 15;
  }
  return 0;
}
`;
    await writeFixture('high-complexity.ts', content);
    const snapshot = makeSnapshot([{ name: 'high-complexity.ts', content }]);

    const result = await detectComplexityViolations(snapshot);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const ccViolations = result.value.violations.filter((v) => v.metric === 'cyclomaticComplexity');
    expect(ccViolations.length).toBeGreaterThanOrEqual(1);
    expect(ccViolations[0].severity).toBe('error');
    expect(ccViolations[0].value).toBeGreaterThan(15);
  });

  it('should detect moderate cyclomatic complexity (>10) as tier 2 warning', async () => {
    // Build a function with complexity between 10 and 15
    const content = `
export function moderateRouter(action: string) {
  if (action === 'a') {
    return 1;
  } else if (action === 'b') {
    return 2;
  } else if (action === 'c') {
    return 3;
  } else if (action === 'd') {
    return 4;
  } else if (action === 'e') {
    return 5;
  } else if (action === 'f') {
    return 6;
  } else if (action === 'g') {
    return 7;
  } else if (action === 'h') {
    return 8;
  } else if (action === 'i') {
    return 9;
  } else if (action === 'j') {
    return 10;
  }
  return 0;
}
`;
    await writeFixture('moderate-complexity.ts', content);
    const snapshot = makeSnapshot([{ name: 'moderate-complexity.ts', content }]);

    const result = await detectComplexityViolations(snapshot);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const ccViolations = result.value.violations.filter((v) => v.metric === 'cyclomaticComplexity');
    expect(ccViolations.length).toBe(1);
    expect(ccViolations[0].severity).toBe('warning');
    expect(ccViolations[0].value).toBeGreaterThan(10);
    expect(ccViolations[0].value).toBeLessThanOrEqual(15);
  });

  it('should detect deep nesting (>4 levels)', async () => {
    const content = `
export function deeplyNested(data: any) {
  if (data) {
    if (data.a) {
      if (data.a.b) {
        if (data.a.b.c) {
          if (data.a.b.c.d) {
            return data.a.b.c.d;
          }
        }
      }
    }
  }
  return null;
}
`;
    await writeFixture('deep-nesting.ts', content);
    const snapshot = makeSnapshot([{ name: 'deep-nesting.ts', content }]);

    const result = await detectComplexityViolations(snapshot);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const nestingViolations = result.value.violations.filter((v) => v.metric === 'nestingDepth');
    expect(nestingViolations.length).toBe(1);
    expect(nestingViolations[0].severity).toBe('warning');
    expect(nestingViolations[0].value).toBeGreaterThan(4);
  });

  it('should detect long functions (>50 lines)', async () => {
    const bodyLines = Array.from({ length: 55 }, (_, i) => `  const x${i} = ${i};`).join('\n');
    const content = `
export function longFunction() {
${bodyLines}
  return true;
}
`;
    await writeFixture('long-function.ts', content);
    const snapshot = makeSnapshot([{ name: 'long-function.ts', content }]);

    const result = await detectComplexityViolations(snapshot);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const lengthViolations = result.value.violations.filter((v) => v.metric === 'functionLength');
    expect(lengthViolations.length).toBe(1);
    expect(lengthViolations[0].severity).toBe('warning');
    expect(lengthViolations[0].value).toBeGreaterThan(50);
  });

  it('should detect too many parameters (>5)', async () => {
    const content = `
export function tooManyParams(a: number, b: number, c: number, d: number, e: number, f: number) {
  return a + b + c + d + e + f;
}
`;
    await writeFixture('many-params.ts', content);
    const snapshot = makeSnapshot([{ name: 'many-params.ts', content }]);

    const result = await detectComplexityViolations(snapshot);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const paramViolations = result.value.violations.filter((v) => v.metric === 'parameterCount');
    expect(paramViolations.length).toBe(1);
    expect(paramViolations[0].severity).toBe('warning');
    expect(paramViolations[0].value).toBe(6);
    expect(paramViolations[0].threshold).toBe(5);
  });

  it('should use default thresholds when config is empty', async () => {
    const content = `
export function simple() {
  return 1;
}
`;
    await writeFixture('defaults.ts', content);
    const snapshot = makeSnapshot([{ name: 'defaults.ts', content }]);

    // Pass empty config
    const result = await detectComplexityViolations(snapshot, {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.violations).toHaveLength(0);
    expect(result.value.stats.filesAnalyzed).toBe(1);
  });

  it('should use custom thresholds from config', async () => {
    const content = `
export function mediumComplexity(x: number) {
  if (x > 0) {
    if (x > 10) {
      return 'big';
    }
    return 'small';
  }
  return 'zero';
}
`;
    await writeFixture('custom-thresholds.ts', content);
    const snapshot = makeSnapshot([{ name: 'custom-thresholds.ts', content }]);

    const strictConfig: ComplexityConfig = {
      thresholds: {
        cyclomaticComplexity: { error: 5, warn: 2 },
      },
    };

    const result = await detectComplexityViolations(snapshot, strictConfig);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const ccViolations = result.value.violations.filter((v) => v.metric === 'cyclomaticComplexity');
    expect(ccViolations.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect graph complexity hotspots', async () => {
    const content = `
export function hotFunction(x: number) {
  return x * 2;
}

export function coldFunction(y: number) {
  return y + 1;
}
`;
    await writeFixture('hotspots.ts', content);
    const filePath = join(tempDir, 'hotspots.ts');
    const snapshot = makeSnapshot([{ name: 'hotspots.ts', content }]);

    const graphData: GraphComplexityData = {
      hotspots: [
        { file: filePath, function: 'hotFunction', hotspotScore: 98 },
        { file: filePath, function: 'coldFunction', hotspotScore: 20 },
      ],
      percentile95Score: 90,
    };

    const result = await detectComplexityViolations(snapshot, {}, graphData);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const hotspotViolations = result.value.violations.filter((v) => v.metric === 'hotspotScore');
    expect(hotspotViolations.length).toBe(1);
    expect(hotspotViolations[0].severity).toBe('error');
    expect(hotspotViolations[0].function).toBe('hotFunction');
    expect(hotspotViolations[0].value).toBe(98);
    expect(hotspotViolations[0].threshold).toBe(90);
  });

  it('should report file length as info when exceeding threshold', async () => {
    const lines = Array.from({ length: 310 }, (_, i) => `// line ${i + 1}`).join('\n');
    await writeFixture('long-file.ts', lines);
    const snapshot = makeSnapshot([{ name: 'long-file.ts', content: lines }]);

    const result = await detectComplexityViolations(snapshot);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const fileLengthViolations = result.value.violations.filter((v) => v.metric === 'fileLength');
    expect(fileLengthViolations.length).toBe(1);
    expect(fileLengthViolations[0].severity).toBe('info');
    expect(fileLengthViolations[0].value).toBe(310);
  });

  it('should report correct stats', async () => {
    const content = `
export function fn1() { return 1; }
export function fn2(a: number) { return a; }
`;
    await writeFixture('stats.ts', content);
    const snapshot = makeSnapshot([{ name: 'stats.ts', content }]);

    const result = await detectComplexityViolations(snapshot);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value.stats.filesAnalyzed).toBe(1);
    expect(result.value.stats.functionsAnalyzed).toBe(2);
  });
});
