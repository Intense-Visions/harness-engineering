# Skill advisor — graph-token-savings-benchmark

Relevant skills for building and verifying this change.

## Apply

- **harness-tdd** — the benchmark core is authored test-first (`bench.test.ts` proves both
  strategies run and the structural families read strictly more naively).
- **harness-verify** — WIRED verification: `harness graph bench` runs end-to-end and writes
  `latest.json`.

## Reference

- **harness-perf** — sibling benchmark surface (`harness perf bench`); shares the "measure and
  publish a number" discipline.
- **harness-impact-analysis** — exercises the same `get_impact` / `compute_blast_radius` graph
  tools this benchmark measures.

## Consider

- **harness-dependency-health** — graph-metric consumer that could cite the published number.
