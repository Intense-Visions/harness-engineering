// Returns a vitest `test` config fragment. Active only under the pre-push gate
// (HARNESS_PREPUSH=1), which .husky/pre-push sets for its test:coverage run.
// Everywhere else (plain `vitest run`, CI) it returns {} — zero behavior change.
export function prepushTestOptions() {
  if (process.env.HARNESS_PREPUSH !== '1') return {};
  return {
    // Keep the normal console output ('default') AND write a machine-readable
    // per-package report the pre-push summarizer parses on failure. Resolved
    // relative to each package's vitest root, so every package writes its own.
    reporters: ['default', ['json', { outputFile: '.vitest-report.json' }]],
  };
}
