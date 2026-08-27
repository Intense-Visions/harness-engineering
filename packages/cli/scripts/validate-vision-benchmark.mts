// Manual end-to-end validation of the vision BENCHMARK path against the REAL
// local `claude` CLI (no mocks, no API key). Runs runVisionBenchmark on two
// real screenshots — a strong Awwwards page vs a flat demo — and prints the
// radar + machine award verdict for each. Proves the mechanism actually SEES
// the page and discriminates quality.
//
// Run from packages/cli:
//   pnpm exec tsx scripts/validate-vision-benchmark.mts <strong.png> <flat.png>

import { runVisionBenchmark } from '../src/design-craft/phases/benchmark.js';
import { adaptClaudeCli } from '../src/shared/craft/llm/adapters.js';
import { ClaudeCliAnalysisProvider } from '@harness-engineering/intelligence';
import { sonDavenMarketingPageExemplar } from '../src/design-craft/catalog/exemplars/son-daven-marketing-page.js';

const [strong, flat] = process.argv.slice(2);
if (!strong || !flat)
  throw new Error('usage: validate-vision-benchmark.mts <strong.png> <flat.png>');

const provider = adaptClaudeCli(new ClaudeCliAnalysisProvider({ timeoutMs: 300_000 }));

async function score(label: string, image: string) {
  const scores = await runVisionBenchmark({
    targets: [{ file: image, component: label, componentType: 'MarketingPage', image }],
    exemplars: [sonDavenMarketingPageExemplar],
    provider,
  });
  const s = scores[0];
  if (!s) {
    console.log(`\n### ${label}: NO SCORE (parse failure or no matching exemplar)`);
    return;
  }
  const r = s.radar;
  console.log(`\n### ${label}`);
  console.log(
    `verdict: ${s.awardBar.verdict}` + (s.awardBar.reason ? ` (${s.awardBar.reason})` : '')
  );
  console.log(`overall: ${s.overall.score} (confidence ${s.overall.confidence})`);
  for (const dim of [
    'philosophicalCoherence',
    'hierarchy',
    'craftExecution',
    'function',
    'innovation',
  ] as const) {
    const d = r[dim];
    const bar = s.awardBar.dimensions[dim];
    console.log(
      `  ${dim.padEnd(22)} score ${String(d.score).padStart(3)}  floor ${String(bar.floor).padStart(3)}  ${bar.cleared ? 'PASS' : 'MISS'}  conf ${d.confidence}`
    );
  }
  console.log(`  gaps: ${s.gaps.slice(0, 3).join(' | ')}`);
}

await score('STRONG (sondaven.com — Awwwards SOTD)', strong);
await score('FLAT (CrossYoga demo)', flat);
console.log('\ndone.');
