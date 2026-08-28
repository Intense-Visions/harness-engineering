---
schemaVersion: 1
module: 'packages/linter-gen/src/generator'
sourceHash: 'f5c485645f19e0a233e972431bc2fb6f2e1de6295ee7a8500dc15750fc7c0033'
compiledAt: '2026-08-28T01:22:11.942Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index-generator.ts', 'orchestrator.ts', 'rule-generator.ts']
---

## Summary

The `generator` module orchestrates ESLint rule generation from a YAML config file. It has three operations: `generate()` parses config → resolves output dir → sequentially processes each rule (load template → render with context → write file) → write index.ts; `validate()` parses config and reports rule count without generating; exported helpers `generateRule()` and `generateIndex()` handle individual rule and index file generation. The module combines three pipelines: config parsing → template loading/rendering → file I/O. Error handling is permissive—failures in individual rules are collected and reported but don't stop processing of subsequent rules. The index file aggregates all successfully generated rules and exports them by camelCased name.

## Invariants

- Sequential rule processing with error accumulation — Rules process one at a time; individual failures don't halt the batch. Callers receive the full error list at the end, enabling partial success.
- Index file only written on success — writeIndexFile() runs only if generatedRules.length > 0 && !dryRun, ensuring the index never reflects partial or failed generations.
- Output directory resolved once, reused globally — resolveOutputDir() computes the target directory at the start; all rules and the index write to this single location. Config outputDir override is applied uniformly.
- Kebab-case → camelCase is deterministic — The same toCamelCase() function converts rule names for both import statements and the rules object in the index. Mismatch breaks exports.
- Dryrun touches no filesystem — dryRun gates fs.writeFile() and prepareOutputDir() only; all parsing, template loading, and rendering happen regardless. Dryrun validates the full pipeline without side effects.
- Template context is the contract — buildRuleContext() defines what data templates can access. Template rendering has no other data source; template errors reflect context-building failures or invalid Handlebars syntax.
- Config parsing is first and non-negotiable — Config is parsed before any I/O or directory prep. Invalid configs fail fast with no side effects.
- Each rule loads its template once — The template source is immutable and passed as-is to generateRule(). No caching or re-validation happens downstream.

## Interface Contract

```ts
export generate
export generateIndex
export generateRule
export validate
```

## Dependency Slice

```
import { buildRuleContext } from '../engine/context-builder.js'
import { TemplateLoadError, TemplateSource, loadTemplate } from '../engine/template-loader.js'
import { TemplateError, renderTemplate } from '../engine/template-renderer.js'
import { ParseError, parseConfig } from '../parser/config-parser.js'
import { RuleConfig } from '../schema/linter-config.js'
import { generateIndex } from './index-generator.js'
import { generateRule } from './rule-generator.js'
import * as fs from 'fs/promises'
import * as path from 'path'
```
