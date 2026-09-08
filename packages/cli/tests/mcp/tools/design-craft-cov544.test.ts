import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  handleDesignCraft,
  runDesignCraft,
  runCaptureCommand,
  designCraftToolDefinition,
} from '../../../src/mcp/tools/design-craft';
import { MockLlmProvider } from '../../../src/design-craft/llm/provider.js';

const COMPONENT = `export function Btn(){return <button className="px-4 py-2 bg-blue-500 text-white">Go</button>;}\n`;

describe('design_craft branch coverage (cov544)', () => {
  let dir: string;
  let fileA: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-cov-'));
    fileA = path.join(dir, 'Btn.tsx');
    fs.writeFileSync(fileA, COMPONENT);
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('has the expected tool definition', () => {
    expect(designCraftToolDefinition.name).toBe('design_craft');
    expect(designCraftToolDefinition.inputSchema.required).toContain('path');
  });

  describe('handleDesignCraft guards', () => {
    it('missing path → Err', async () => {
      const r = await handleDesignCraft({} as never);
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('`path` is required');
    });
    it('empty path → Err', async () => {
      const r = await handleDesignCraft({ path: '' });
      expect(r.isError).toBe(true);
    });
  });

  describe('runCaptureCommand', () => {
    it('parses valid captures via exec seam (with + without component)', () => {
      const res = runCaptureCommand('cmd', ['a.tsx'], () =>
        JSON.stringify([
          { file: 'a.tsx', image: '/img/a.png', component: 'A' },
          { file: 'b.tsx', image: '/img/b.png' },
          { file: 'skip', image: 42 },
          null,
        ])
      );
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toHaveLength(2);
        expect(res.value[0].component).toBe('A');
        expect(res.value[1].component).toBeUndefined();
      }
    });
    it('exec throwing → Err', () => {
      const res = runCaptureCommand('cmd', [], () => {
        throw new Error('render failed');
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('capture command failed');
    });
    it('non-JSON stdout → Err', () => {
      const res = runCaptureCommand('cmd', [], () => 'not json');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('did not emit valid JSON');
    });
    it('non-array JSON → Err', () => {
      const res = runCaptureCommand('cmd', [], () => JSON.stringify({ file: 'x' }));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('must be a JSON array');
    });
    it('array with no valid entries → Err', () => {
      const res = runCaptureCommand('cmd', [], () => JSON.stringify([{ nope: true }]));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('no valid { file, image } entries');
    });
  });

  describe('runDesignCraft fast mode', () => {
    it('runs critique + polish + benchmark over files', async () => {
      const res = await runDesignCraft({
        path: dir,
        mode: 'fast',
        files: [fileA],
        benchmarkTargets: [{ file: fileA, component: 'Btn', componentType: 'Button' }],
        awardBar: {},
        __testProvider: new MockLlmProvider(),
        __recordMeasurement: false,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.summary.phaseRun).toEqual(['critique', 'polish', 'benchmark']);
        expect(res.value.summary.mode).toBe('fast');
        expect(res.value.summary.catalog.rubricsApplied.length).toBeGreaterThan(0);
        expect(res.value.summary.catalog.patternsApplied.length).toBeGreaterThan(0);
      }
    });

    it('phases subset (dedupe + filter invalid) runs only critique', async () => {
      const res = await runDesignCraft({
        path: dir,
        files: [fileA],
        phases: ['critique', 'critique', 'bogus'] as never,
        __testProvider: new MockLlmProvider(),
        __recordMeasurement: false,
      });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.summary.phaseRun).toEqual(['critique']);
    });

    it('empty phases array → defaults to all three', async () => {
      const res = await runDesignCraft({
        path: dir,
        files: [fileA],
        phases: [],
        benchmarkTargets: [{ file: fileA, component: 'Btn' }],
        responsiveMetrics: [
          {
            file: fileA,
            viewport: 375,
            documentScrollWidth: 375,
            viewportWidth: 375,
            primaryNavVisible: true,
            menuToggleVisible: false,
          },
        ],
        __testProvider: new MockLlmProvider(),
        __recordMeasurement: false,
      });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.summary.phaseRun).toEqual(['critique', 'polish', 'benchmark']);
    });

    it('no files → critique/polish yield no findings but pipeline succeeds', async () => {
      const res = await runDesignCraft({
        path: dir,
        phases: ['critique', 'polish'],
        __testProvider: new MockLlmProvider(),
        __recordMeasurement: false,
      });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.findings).toEqual([]);
    });
  });

  describe('deep mode', () => {
    it('critique with no captures → actionable Err', async () => {
      const res = await runDesignCraft({
        path: dir,
        mode: 'deep',
        phases: ['critique'],
        files: [fileA],
        autoCapture: 'skip',
        __testProvider: new MockLlmProvider(),
        __recordMeasurement: false,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('deep mode critiques rendered screenshots');
    });

    it('captureCommand failure short-circuits with the capture Err', async () => {
      const res = await runDesignCraft({
        path: dir,
        mode: 'deep',
        phases: ['critique'],
        files: [fileA],
        captureCommand: 'render.sh',
        autoCapture: 'auto',
        __runCapture: () => 'not json at all',
        __testProvider: new MockLlmProvider(),
        __recordMeasurement: false,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.message).toContain('did not emit valid JSON');
    });
  });

  describe('benchmark responsive + config paths', () => {
    function writeConfig(awardBar: unknown) {
      fs.writeFileSync(
        path.join(dir, 'harness.config.json'),
        JSON.stringify({ version: 1, design: { craft: { benchmark: { awardBar } } } })
      );
    }

    it('reads awardBar + responsive config from harness.config.json', async () => {
      writeConfig({
        minComposite: 0.9,
        responsive: { require: true, viewport: 390, overflowTolerancePx: 2 },
      });
      const res = await runDesignCraft({
        path: dir,
        files: [fileA],
        phases: ['benchmark'],
        benchmarkTargets: [{ file: fileA, component: 'Btn' }],
        // no awardBar / responsiveMetrics → forces config reads + probe branch
        responsiveMetrics: [
          {
            file: fileA,
            viewport: 390,
            documentScrollWidth: 390,
            viewportWidth: 390,
            primaryNavVisible: true,
            menuToggleVisible: false,
          },
        ],
        __testProvider: new MockLlmProvider(),
        __recordMeasurement: false,
      });
      expect(res.ok).toBe(true);
    });

    it('responsiveProbeCommand via __runResponsiveProbe supplies metrics', async () => {
      const res = await runDesignCraft({
        path: dir,
        files: [fileA],
        phases: ['benchmark'],
        benchmarkTargets: [{ file: fileA, component: 'Btn' }],
        responsiveProbeCommand: 'probe.sh',
        __runResponsiveProbe: () =>
          JSON.stringify([
            {
              file: fileA,
              viewport: 375,
              documentScrollWidth: 375,
              viewportWidth: 375,
              primaryNavVisible: true,
              menuToggleVisible: false,
            },
            { file: 'bad', viewport: 'x' },
          ]),
        __testProvider: new MockLlmProvider(),
        __recordMeasurement: false,
      });
      expect(res.ok).toBe(true);
    });

    it('responsiveProbeCommand returning non-array → metrics undefined (gate not-evaluated)', async () => {
      const res = await runDesignCraft({
        path: dir,
        files: [fileA],
        phases: ['benchmark'],
        benchmarkTargets: [{ file: fileA, component: 'Btn' }],
        responsiveProbeCommand: 'probe.sh',
        __runResponsiveProbe: () => JSON.stringify({ not: 'an array' }),
        __testProvider: new MockLlmProvider(),
        __recordMeasurement: false,
      });
      expect(res.ok).toBe(true);
    });

    it('responsiveProbeCommand that throws → metrics undefined', async () => {
      const res = await runDesignCraft({
        path: dir,
        files: [fileA],
        phases: ['benchmark'],
        benchmarkTargets: [{ file: fileA, component: 'Btn' }],
        responsiveProbeCommand: 'probe.sh',
        __runResponsiveProbe: () => {
          throw new Error('probe boom');
        },
        __testProvider: new MockLlmProvider(),
        __recordMeasurement: false,
      });
      expect(res.ok).toBe(true);
    });
  });

  it('handleDesignCraft success wraps the pipeline Ok', async () => {
    const r = await handleDesignCraft({
      path: dir,
      files: [fileA],
      phases: ['critique'],
      __testProvider: new MockLlmProvider(),
      __recordMeasurement: false,
    } as never);
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.summary.mode).toBe('fast');
  });
});
