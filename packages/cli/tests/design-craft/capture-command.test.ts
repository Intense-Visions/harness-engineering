import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCaptureCommand, handleDesignCraft } from '../../src/mcp/tools/design-craft';
import { MockLlmProvider } from '../../src/design-craft/llm/provider';

describe('runCaptureCommand', () => {
  it('parses a { file, image, component? } manifest from stdout', () => {
    const exec = () =>
      JSON.stringify([
        { file: 'src/A.tsx', image: '/tmp/a.png', component: 'A' },
        { file: 'src/B.tsx', image: '/tmp/b.png' },
        { nope: 1 }, // ignored — missing file/image
      ]);
    const r = runCaptureCommand('render', ['src/A.tsx'], exec);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual([
      { file: 'src/A.tsx', image: '/tmp/a.png', component: 'A' },
      { file: 'src/B.tsx', image: '/tmp/b.png' },
    ]);
  });

  it('passes the candidate files to the executor', () => {
    let seen: string[] = [];
    runCaptureCommand('render', ['x.tsx', 'y.tsx'], (_cmd, files) => {
      seen = files;
      return JSON.stringify([{ file: 'x.tsx', image: '/tmp/x.png' }]);
    });
    expect(seen).toEqual(['x.tsx', 'y.tsx']);
  });

  it('errors on non-JSON output', () => {
    const r = runCaptureCommand('render', [], () => 'not json');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/valid JSON/i);
  });

  it('errors when no valid entries are produced', () => {
    const r = runCaptureCommand('render', [], () => JSON.stringify([{ nope: 1 }]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/no valid/i);
  });

  it('propagates a command failure', () => {
    const r = runCaptureCommand('render', [], () => {
      throw new Error('boom');
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/capture command failed.*boom/i);
  });
});

describe('design-craft deep mode auto-capture', () => {
  class VisionMockProvider extends MockLlmProvider {
    async callVision(prompt: string): Promise<string> {
      return this.callText(prompt);
    }
  }

  it('runs the capture command to obtain captures, then vision-critiques them', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-autocap-'));
    const img = path.join(dir, 'Hero.png');
    fs.writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const result = await handleDesignCraft({
      path: dir,
      mode: 'deep',
      phases: ['critique'],
      autoCapture: 'auto',
      captureCommand: 'render-screenshots',
      __runCapture: () => JSON.stringify([{ file: 'src/Hero.tsx', component: 'Hero', image: img }]),
      __testProvider: new VisionMockProvider(),
      __recordMeasurement: false,
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      findings: unknown[];
      summary: { mode: string };
    };
    expect(payload.summary.mode).toBe('deep');
    expect(payload.findings).toHaveLength(10); // 10 rubrics × 1 captured component
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('autoCapture:skip never runs the capture command (still errors without captures)', async () => {
    let called = false;
    const result = await handleDesignCraft({
      path: '/tmp/fake',
      mode: 'deep',
      phases: ['critique'],
      autoCapture: 'skip',
      captureCommand: 'render',
      __runCapture: () => {
        called = true;
        return '[]';
      },
    });
    expect(called).toBe(false);
    expect(result.isError).toBe(true);
  });

  it('surfaces a capture-command failure as a tool error', async () => {
    const result = await handleDesignCraft({
      path: '/tmp/fake',
      mode: 'deep',
      phases: ['critique'],
      autoCapture: 'auto',
      captureCommand: 'render',
      __runCapture: () => {
        throw new Error('render crashed');
      },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/capture command failed/i);
  });
});
