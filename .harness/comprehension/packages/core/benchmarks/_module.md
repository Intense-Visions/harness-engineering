---
schemaVersion: 1
module: 'packages/core/benchmarks'
sourceHash: 'c2c3ba4633e061f8059ff3eb8bb9df589628781d3f044cd2d1b6b68305bb4b04'
compiledAt: '2026-08-28T01:22:10.199Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['validation.bench.ts']
---

## Summary

`packages/core/benchmarks` is a Vitest benchmark suite that measures performance of two core validation functions under varying load conditions. It includes fixtures for valid and invalid inputs across configuration validation (Zod schema-based app config) and commit message validation (conventional commit format), with separate benchmarks for success and error paths. This allows tracking performance regressions in validation hot paths and comparing real-world throughput when validators accept vs reject input.

## Invariants

- Schema and fixture alignment: validConfig must fully satisfy appConfigSchema; invalidConfig must fail it. The benchmark only measures what the fixtures actually exercise.
- Realistic schema complexity: The nested config schema (app metadata + database credentials + feature array) approximates production complexity—changes to schema structure may invalidate performance baselines.
- Both paths benchmarked: Valid and invalid branches test different code paths in validators; removing either hides performance cliffs in error handling.
- Conventional commit format is recognized: validateCommitMessage(msg, 'conventional') assumes the validator knows this style; commit message format changes require updating both fixture and validator.
- No side effects in validation: Benchmarks assume validators are pure; if they log, write, or mutate state, benchmark results become meaningless.

## Interface Contract

```ts

```

## Dependency Slice

```
import { validateCommitMessage } from '../src/validation/commit-message'
import { validateConfig } from '../src/validation/config'
import { bench, describe } from 'vitest'
import { z } from 'zod'
```
