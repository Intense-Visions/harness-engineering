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

/** Shipped paths, relative to the template root, with the `.hbs` wrapper dropped. */
function filesUnder(dir: string, prefix = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'template.json') continue;
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...filesUnder(full, rel));
    // `.hbs` is a render wrapper, not part of the shipped filename.
    else out.push(rel.replace(/\.hbs$/, ''));
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

/** Extensions the TypeScript reachability analyzers can walk. */
const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

/**
 * Can the analyzer resolve a root that actually exists?
 *
 * Either every configured entry point names a file the template ships, or
 * nothing is configured and auto-detection has a TypeScript file to find.
 */
function hasWalkableRoot(config: Record<string, unknown>, files: string[]): boolean {
  const points = entryPoints(config);
  const shipsTs = files.some((f) => TS_EXTENSIONS.some((ext) => f.endsWith(ext)));
  if (points === undefined || points.length === 0) return shipsTs;
  return points.every((p) => !/[*?]/.test(p) && files.includes(p.replace(/^\.\//, '')));
}

function rootDiagnostic(config: Record<string, unknown>, files: string[]): string {
  const points = entryPoints(config);
  if (points && points.length > 0) {
    return (
      `entryPoints ${JSON.stringify(points)} do not all resolve to a shipped file. ` +
      'They are resolved literally — no glob expansion, no existence check — so an ' +
      'unresolvable root makes the dead-code walk reach nothing while perf still ' +
      'reports pass. Name concrete shipped files, or drop the key and let ' +
      'auto-detection work.'
    );
  }
  return (
    'no entryPoints configured and no TypeScript file shipped, so auto-detection has ' +
    `nothing to find and the analyzer abstains. Ship a starter file (one of ` +
    `${TS_EXTENSIONS.join(', ')}), or set \`entropy.enabled\`/\`performance.enabled\` to ` +
    'false for a non-TypeScript stack.'
  );
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

    /**
     * The reachability gates need a root the analyzer can actually walk from.
     *
     * This predicate checks RESOLUTION, not mere presence. An earlier revision
     * asserted only that some `entryPoints` string existed, which encoded the
     * belief that a configured value means the gate can run — and that belief
     * is false. `resolveEntryPoints` returns any non-empty array as-is, with no
     * glob expansion and no existence check, so a recursive `src` wildcard
     * ending in `*.ts` is a root matching nothing: the dead-code BFS reaches
     * zero files, every export looks dead, and `perf` still reports `pass`
     * over an analysis of nothing.
     * That shipped in four templates and the old predicate waved it through.
     */
    it('entropy: can resolve a real root, or declares the gate not applicable', () => {
      const disabled = section(config, 'entropy').enabled === false;
      expect(disabled || hasWalkableRoot(config, files), rootDiagnostic(config, files)).toBe(true);
    });

    it('perf: can resolve a real root, or declares the gate not applicable', () => {
      const disabled = section(config, 'performance').enabled === false;
      expect(disabled || hasWalkableRoot(config, files), rootDiagnostic(config, files)).toBe(true);
    });

    it('declares no entry point that is a glob or a file it does not ship', () => {
      // Independent of enablement: a wrong `entryPoints` SUPPRESSES
      // auto-detection, so it is worse than having none at all.
      for (const point of entryPoints(config) ?? []) {
        expect(
          point,
          `\`${point}\` is a glob, and entry points are resolved literally`
        ).not.toMatch(/[*?]/);
        expect(files, `\`${point}\` is not a file this template ships`).toContain(
          point.replace(/^\.\//, '')
        );
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
