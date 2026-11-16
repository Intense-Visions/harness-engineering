/**
 * Issue #1967 — naming-craft on PHP.
 *
 * naming-craft's extractor is the TypeScript Compiler API. Handed a PHP file
 * (explicit `files: [...]` bypasses the walker's extension filter) it parsed
 * the PHP as TSX and emitted phantom identifiers — the namespace path in
 * `use function RPB\X\y;` became a `function` named `RPB` — and judged the file against a convention sampled
 * from the repository's TypeScript. Both reached the caller as findings with a
 * real runId + rubricId: the provenance craft-fleet accepts as authorisation
 * to rewrite code.
 *
 * Contract under test: a file in a language the extractor cannot parse is
 * reported as skipped, never critiqued; supported files in the same run are
 * still critiqued (positive control).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  collectNamingCraftPrompts,
  runNamingCraft,
  critiqueNamesInFile,
} from '../../src/naming-craft';
import { extractIdentifiers } from '../../src/naming-craft/extract/identifiers';
import { MockLlmProvider } from '../../src/naming-craft/llm/provider';

const PHP_RESOLVER = `<?php
/**
 * Wholesale price resolver.
 */
namespace RPB\\WholesalePricing\\Resolver;

use function RPB\\WholesalePricing\\Tiers\\get_tiers;

function price_for_quantity( $product_id, $quantity ) {
	return $quantity * 2;
}

function resolve( $product_id ) {
	return price_for_quantity( $product_id, 1 );
}
`;

// Majority-PascalCase TS functions, so a repo-wide sample yields
// "Project convention for function: PascalCase" — the misapplied line.
const TS_APP = `export function RenderPage() { return 1; }
export function LoadData() { return 2; }
export function BuildLayout() { return 3; }
export function doStuff(x: number) { return x; }
`;

const PHP_REL = 'wordpress/plugins/rpb-wholesale-pricing/includes/resolver.php';
const TS_REL = 'app/page.ts';

describe('naming-craft on PHP (issue #1967)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-craft-php-'));
    for (const [rel, content] of [
      [PHP_REL, PHP_RESOLVER],
      [TS_REL, TS_APP],
    ] as const) {
      const full = path.join(tmpDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts no identifiers from a PHP file (no namespace segments as functions)', () => {
    // Pre-fix this yielded function:RPB (the `use function` namespace path) beside
    // the two real functions.
    expect(extractIdentifiers(PHP_REL, PHP_RESOLVER).map((i) => i.name)).not.toContain('RPB');
    expect(extractIdentifiers(PHP_REL, PHP_RESOLVER)).toEqual([]);
  });

  it('collect: emits no prompt for the PHP file and reports it as unsupported', async () => {
    const out = await collectNamingCraftPrompts({
      path: tmpDir,
      files: [PHP_REL, TS_REL],
      maxIdentifiersPerFile: 8,
      promptBudget: 200,
    });
    expect(out.status).toBe('collected');
    const prompts = out.pendingPrompts.map((p) => p.userPrompt);
    for (const segment of ['RPB', 'WholesalePricing', 'Resolver']) {
      expect(prompts.some((p) => p.includes(`"${segment}"`))).toBe(false);
    }
    expect(prompts.some((p) => p.includes('resolver.php'))).toBe(false);
    expect(out.unsupportedFiles).toEqual([path.join(tmpDir, PHP_REL)]);

    // Positive control: the badly-named TS function in the same run is still critiqued.
    expect(prompts.some((p) => p.includes('"doStuff"'))).toBe(true);
  });

  it('inline: no finding targets the PHP file; summary counts it skipped, not scanned', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'Identifier:',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"high","message":"rename"}\n```',
      },
    ]);
    const out = await runNamingCraft({
      path: tmpDir,
      files: [PHP_REL, TS_REL],
      __testProvider: provider,
    });
    expect(out.findings.some((f) => f.target.file.endsWith('.php'))).toBe(false);
    expect(out.findings.some((f) => f.target.identifier === 'doStuff')).toBe(true);
    expect(out.summary.filesScanned).toBe(1);
    expect(out.summary.unsupportedFiles).toEqual([path.join(tmpDir, PHP_REL)]);
  });

  it('critiqueNamesInFile on a PHP file returns no findings and makes no LLM call', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'Identifier:',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"high","message":"rename"}\n```',
      },
    ]);
    const findings = await critiqueNamesInFile(path.join(tmpDir, PHP_REL), { provider });
    expect(findings).toEqual([]);
    expect(provider.getCosts()).toHaveLength(0);
  });
});
