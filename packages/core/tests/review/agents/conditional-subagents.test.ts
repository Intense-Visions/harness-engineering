import { describe, expect, it } from 'vitest';
import { runAdversarialAgent } from '../../../src/review/agents/adversarial-agent';
import { runTypescriptStrictAgent } from '../../../src/review/agents/typescript-strict-agent';
import { runFrontendRacesAgent } from '../../../src/review/agents/frontend-races-agent';
import type { ContextBundle } from '../../../src/review/types';

function bundleFor(filePath: string, content: string): ContextBundle {
  const lines = content.split('\n').length;
  return {
    domain: 'bug',
    changeType: 'feature',
    changedFiles: [{ path: filePath, content, reason: 'changed', lines }],
    contextFiles: [],
    commitHistory: [],
    diffLines: lines,
    contextLines: 0,
  };
}

describe('adversarial agent', () => {
  it('flags JSON.parse on untrusted input', () => {
    const bundle = bundleFor(
      'src/api.ts',
      ['export async function handle(req: Request) {', '  return JSON.parse(req.body);', '}'].join(
        '\n'
      )
    );
    const findings = runAdversarialAgent(bundle);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const first = findings[0]!;
    expect(first.subagent).toBe('adversarial');
    expect(first.confidence).toBe(75);
    expect(first.title).toContain('JSON.parse');
  });

  it('flags floating Promise chains', () => {
    const bundle = bundleFor(
      'src/email.ts',
      ['sendEmail(user).then((r) => console.log(r));'].join('\n')
    );
    const findings = runAdversarialAgent(bundle);
    expect(findings.some((f) => f.title.includes('Floating Promise'))).toBe(true);
  });

  it('flags fetch without abort signal', () => {
    const bundle = bundleFor('src/client.ts', 'await fetch("https://api.example.com/data");');
    const findings = runAdversarialAgent(bundle);
    const abuse = findings.find((f) => f.title.includes('fetch'));
    expect(abuse).toBeDefined();
    expect(abuse?.confidence).toBe(100);
  });

  it('detects Promise constructor without reject at Deep', () => {
    const bundle = bundleFor(
      'src/deferred.ts',
      'const p = new Promise((resolve) => { resolve(42); });'
    );
    const deep = runAdversarialAgent(bundle, { runCascades: true });
    const standard = runAdversarialAgent(bundle, { runCascades: false });
    const cascadeAtDeep = deep.find((f) => f.title.includes('without a reject parameter'));
    const cascadeAtStandard = standard.find((f) => f.title.includes('without a reject parameter'));
    expect(cascadeAtDeep).toBeDefined();
    expect(cascadeAtStandard).toBeUndefined();
  });

  it('emits no findings on a no-op formatting diff', () => {
    const bundle = bundleFor(
      'src/clean.ts',
      'export const greeting = "hello";\nexport const count = 1;'
    );
    const findings = runAdversarialAgent(bundle);
    expect(findings).toEqual([]);
  });

  it('all findings carry confidence >= 50', () => {
    const bundle = bundleFor(
      'src/mixed.ts',
      ['await fetch(url);', 'JSON.parse(req.body);', 'foo?.foo();'].join('\n')
    );
    const findings = runAdversarialAgent(bundle);
    for (const f of findings) {
      const c = f.confidence;
      const numeric = typeof c === 'number' ? c : 0;
      expect(numeric).toBeGreaterThanOrEqual(50);
    }
  });
});

describe('typescript-strict agent', () => {
  it('flags explicit `any` parameter', () => {
    const bundle = bundleFor('src/loader.ts', 'export function load(x: any) { return x; }');
    const findings = runTypescriptStrictAgent(bundle);
    const anyFinding = findings.find((f) => f.title.includes('any'));
    expect(anyFinding).toBeDefined();
    expect(anyFinding?.subagent).toBe('typescript-strict');
    expect(anyFinding?.confidence).toBe(100);
  });

  it('flags ts-ignore', () => {
    const bundle = bundleFor('src/foo.ts', ['// @ts-ignore', 'const x: number = "1";'].join('\n'));
    const findings = runTypescriptStrictAgent(bundle);
    expect(findings.some((f) => f.title.includes('ts-ignore'))).toBe(true);
  });

  it('flags `as unknown as` double cast', () => {
    const bundle = bundleFor('src/cast.ts', 'const u = JSON.parse(s) as unknown as User;');
    const findings = runTypescriptStrictAgent(bundle);
    expect(findings.some((f) => f.title.includes('double-cast'))).toBe(true);
  });

  it('does not flag test files', () => {
    const bundle = bundleFor('src/foo.test.ts', 'export function test(x: any) { return x; }');
    const findings = runTypescriptStrictAgent(bundle);
    expect(findings).toEqual([]);
  });

  it('does not flag .d.ts files', () => {
    const bundle = bundleFor('src/foo.d.ts', 'declare const x: any;');
    const findings = runTypescriptStrictAgent(bundle);
    expect(findings).toEqual([]);
  });

  it('flags vague function names', () => {
    const bundle = bundleFor(
      'src/util.ts',
      'export function handleStuff(input: string) { return input.trim(); }'
    );
    const findings = runTypescriptStrictAgent(bundle);
    expect(findings.some((f) => f.title.includes('Vague function name'))).toBe(true);
  });
});

describe('frontend-races agent', () => {
  it('flags setInterval without clearInterval', () => {
    const bundle = bundleFor(
      'src/Timer.tsx',
      [
        'export function Timer() {',
        '  useEffect(() => {',
        '    setInterval(tick, 1000);',
        '  }, []);',
        '  return null;',
        '}',
      ].join('\n')
    );
    const findings = runFrontendRacesAgent(bundle);
    const timerFinding = findings.find((f) => f.title.includes('setInterval'));
    expect(timerFinding).toBeDefined();
    expect(timerFinding?.confidence).toBe(100);
    expect(timerFinding?.subagent).toBe('frontend-races');
  });

  it('does not flag setInterval when clearInterval is present', () => {
    const bundle = bundleFor(
      'src/Timer.tsx',
      [
        'useEffect(() => {',
        '  const handle = setInterval(tick, 1000);',
        '  return () => clearInterval(handle);',
        '}, []);',
      ].join('\n')
    );
    const findings = runFrontendRacesAgent(bundle);
    expect(findings.some((f) => f.title.includes('setInterval'))).toBe(false);
  });

  it('flags addEventListener without removeEventListener', () => {
    const bundle = bundleFor('src/Listener.tsx', 'window.addEventListener("scroll", onScroll);');
    const findings = runFrontendRacesAgent(bundle);
    expect(findings.some((f) => f.title.includes('addEventListener'))).toBe(true);
  });

  it('flags await fetch followed by setState without abort signal', () => {
    const bundle = bundleFor(
      'src/Page.tsx',
      [
        'const res = await fetch(url);',
        'const data = await res.json();',
        'setData(data);',
        'setLoading(false);',
        'setError(null);',
      ].join('\n')
    );
    const findings = runFrontendRacesAgent(bundle);
    expect(findings.some((f) => f.title.includes('without an abort signal'))).toBe(true);
  });

  it('skips test files entirely', () => {
    const bundle = bundleFor('src/Timer.test.tsx', 'window.addEventListener("click", x);');
    const findings = runFrontendRacesAgent(bundle);
    expect(findings).toEqual([]);
  });
});
