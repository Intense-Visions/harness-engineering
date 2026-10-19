import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURITY_SCAN_EXTENSIONS } from '@harness-engineering/core';

/**
 * #2071 invariant: a freshly scaffolded project from EVERY shipped template
 * must get a green first `harness ci check` — no abstentions — and be green
 * because its gates ran, not because they were skipped.
 *
 * Why this test has to exist. Since #2071 a gate that cannot run abstains and
 * fails the build instead of reporting a silent pass. That is the fix, but it
 * means a template which configures a gate without configuring what the gate
 * needs now ships a red first build. Three templates did (`performance`
 * thresholds with no entry point to walk from) and four more did (`layers`
 * absent, which is meaningless for a Go or Rust project but abstains all the
 * same). An adopter's very first impression of the harness was a red pipeline
 * on generated config containing none of the documented remedies.
 *
 * This is a STATIC model of the orchestrator's abstention predicates rather
 * than an end-to-end scaffold-and-run — it reads the shipped `.hbs` files, so
 * it is fast, hermetic, and runs on every PR. The end-to-end proof (scaffold
 * each template, run `ci check --json`, assert `abstained: 0`) is recorded in
 * the PR. Keep the two in step: if the orchestrator gains or changes an
 * abstention, the predicate below has to change with it.
 *
 * The distinction that decides each gate:
 *   - NOT APPLICABLE — a Go project has no TypeScript dependency graph. The
 *     template says so with `enabled: false`. Legitimate; stays green.
 *   - COULD NOT RUN — the gate wanted to evaluate and had nothing to evaluate
 *     with. That is the abstention, and a template must never ship one.
 */

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'templates');

interface TemplateUnderTest {
  name: string;
  config: Record<string, unknown>;
  /** Every file this template ships, including those inherited via `extends`. */
  files: string[];
}

function readJsonHbs(file: string): Record<string, unknown> {
  // The only interpolation in these configs is inside JSON string values, so
  // blanking the placeholders leaves parseable JSON.
  const raw = fs.readFileSync(file, 'utf-8').replace(/\{\{[^}]+\}\}/g, 'placeholder');
  return JSON.parse(raw) as Record<string, unknown>;
}

function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'template.json') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    // `.hbs` is a render wrapper, not part of the shipped filename.
    else out.push(entry.name.replace(/\.hbs$/, ''));
  }
  return out;
}

/** Files a template ships, following its `extends` chain. */
function shippedFiles(name: string, seen = new Set<string>()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const dir = path.join(TEMPLATES_DIR, name);
  const files = filesUnder(dir);
  const metaPath = path.join(dir, 'template.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { extends?: string };
    if (meta.extends) files.push(...shippedFiles(meta.extends, seen));
  }
  return files;
}

function templatesUnderTest(): TemplateUnderTest[] {
  const names = fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const out: TemplateUnderTest[] = [];
  for (const name of names) {
    const configFile = path.join(TEMPLATES_DIR, name, 'harness.config.json.hbs');
    if (!fs.existsSync(configFile)) continue; // Overlay: inherits a base's config.
    out.push({ name, config: readJsonHbs(configFile), files: shippedFiles(name) });
  }
  return out;
}

function section(config: Record<string, unknown>, key: string): Record<string, unknown> {
  return (config[key] as Record<string, unknown>) ?? {};
}

/** The entry point the entropy/perf analyzers would walk from, if any. */
function entryPoints(config: Record<string, unknown>): string[] | undefined {
  const fromEntropy = section(config, 'entropy').entryPoints as string[] | undefined;
  const fromPerf = section(config, 'performance').entryPoints as string[] | undefined;
  return fromEntropy ?? fromPerf;
}

const CASES = templatesUnderTest();

describe('every shipped template scaffolds a green first `ci check` (#2071)', () => {
  it('found the template configs to check', () => {
    // Guard against the directory scan silently matching nothing — a vacuous
    // pass here would hide the very class of defect this file exists for.
    expect(CASES.length).toBeGreaterThan(0);
    expect(CASES.map((c) => c.name)).toContain('basic');
  });

  describe.each(CASES)('$name', ({ config, files }) => {
    it('deps: has layers to validate, or declares the gate not applicable', () => {
      const layers = config.layers as unknown[] | undefined;
      const disabled = section(config, 'deps').enabled === false;
      expect(
        disabled || (Array.isArray(layers) && layers.length > 0),
        'deps abstains with no `layers` — configure layers, or set `deps.enabled: false` ' +
          'for a stack with no TypeScript dependency graph'
      ).toBe(true);
    });

    it('entropy: has an entry point to walk, or declares the gate not applicable', () => {
      const disabled = section(config, 'entropy').enabled === false;
      const points = entryPoints(config);
      expect(
        disabled || (points !== undefined && points.length > 0),
        'the entropy analyzer abstains with "Could not resolve entry points" — set ' +
          '`entropy.entryPoints`/`performance.entryPoints`, or `entropy.enabled: false`'
      ).toBe(true);
    });

    it('perf: has an entry point to walk, or declares the gate not applicable', () => {
      const perf = section(config, 'performance');
      const disabled = perf.enabled === false;
      const claimsThresholds =
        perf.complexity !== undefined ||
        perf.coupling !== undefined ||
        perf.sizeBudget !== undefined;
      const points = entryPoints(config);
      expect(
        disabled || (points !== undefined && points.length > 0),
        'the perf analyzer abstains with "Could not resolve entry points" — set ' +
          '`performance.entryPoints`, or `performance.enabled: false`'
      ).toBe(true);
      // A template that claims thresholds but cannot run is the original defect.
      if (claimsThresholds && !disabled) {
        expect(points, 'thresholds configured but no entry point to apply them to').toBeDefined();
      }
    });

    it('security: ships a file the scanner can read, or declares the gate not applicable', () => {
      const disabled = section(config, 'security').enabled === false;
      const scannable = files.some((f) =>
        (SECURITY_SCAN_EXTENSIONS as readonly string[]).some((ext) => f.endsWith(`.${ext}`))
      );
      expect(
        disabled || scannable,
        'a scan that reads zero files abstains — ship at least one file in ' +
          `{${SECURITY_SCAN_EXTENSIONS.join(',')}}, or set \`security.enabled: false\` for a ` +
          'language the scanner does not cover'
      ).toBe(true);
    });

    it('traceability: configures no coverage floor it cannot evaluate', () => {
      const trace = section(config, 'traceability');
      const floor = (trace.minCoverage as number | undefined) ?? 0;
      // A floor abstains until `harness scan` has built a graph with traceable
      // features, which a fresh scaffold has not. No template should ship one.
      expect(
        trace.enabled === false || floor === 0,
        'a `traceability.minCoverage` floor abstains on a freshly scaffolded project, ' +
          'which has no knowledge graph yet'
      ).toBe(true);
    });

    it('phase-gate: is not enabled, since the orchestrator cannot evaluate it', () => {
      expect(
        section(config, 'phaseGates').enabled === true,
        'phase-gate abstains when enabled — the ci check has no CLI context to evaluate it, ' +
          'so it needs its own `harness check-phase-gate` step'
      ).toBe(false);
    });
  });
});
