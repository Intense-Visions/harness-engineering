---
schemaVersion: 1
module: 'packages/graph/src/nlq'
sourceHash: 'e2a75d194984d60656a8446508502db94784e8886b6bc1b7b25e6c2aea315008'
compiledAt: '2026-08-28T01:22:11.656Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'EntityExtractor.ts',
    'EntityResolver.ts',
    'IntentClassifier.ts',
    'ResponseFormatter.ts',
    'index.ts',
    'types.ts',
  ]
---

## Summary

**`packages/graph/src/nlq`** implements a natural language query engine for the graph, translating free-form user questions into graph traversals. It's a 4-phase pipeline: extract entity mentions from text → resolve them to graph nodes → classify user intent → format results.

The module is composable: each stage (extractor, resolver, classifier, formatter) is independent and can be swapped. **EntityExtractor** uses a priority-ordered strategy stack (quoted strings → PascalCase identifiers → file paths → filtered nouns) to avoid duplicates and prioritize high-confidence mentions. **EntityResolver** cascades three resolution methods (exact name → FusionLayer semantic search → path substring) with confidence scores, silently dropping unmatched entities. **IntentClassifier** buckets queries into 6 intent types (impact, find, relationships, explain, anomaly, shortestPath) by weighted signals: verb patterns (45%) > keywords (35%) > question words (20%). **ResponseFormatter** shapes results into structured `AskGraphResult` tuples linking intent + resolved entities.

The design emphasizes deterministic, replay-able classification (no randomness, only pattern matching) and graceful degradation: EntityResolver works without FusionLayer, IntentClassifier handles ambiguous queries by returning low-confidence results, and the whole pipeline tolerates unresolvable entities by skipping them rather than erroring.

## Invariants

- Entity extraction strategy chain is ordered and consumes tokens: quoted strings → PascalCase → paths → nouns. Each earlier stage removes tokens from later stages to prevent duplicates and enforce priority (buildConsumedSet contract).
- Intent keywords are excluded from noun extraction: INTENT_KEYWORDS set blocks extraction of query structure tokens ('find', 'impact', 'affects') as entities. This set is shared with IntentClassifier and must stay synchronized.
- Stop words and acronyms are filtered in Strategy 4: isSkippableWord rejects all-caps (API, HTTP), stop words (the, is, and), and previously-consumed tokens. Deviations break entity precision.
- Entity resolution terminates on first match per cascade step: exact match returns immediately (confidence 1.0), fusion stops at score >0.5, path match uses 3-char min length to block false positives. No retry-on-low-confidence.
- Path matching requires length ≥ 3 chars or contains '/': guards against matching single-letter parts of file paths as distinct entities. Sub-3-char raw strings return undefined from path resolution.
- IntentClassifier signal weights sum to 1.0: keyword (0.35) + questionWord (0.2) + verbPattern (0.45). Normalized scores allow cross-intent comparison; changing a weight breaks calibration.
- Unresolved entities are silently omitted, not errors: EntityResolver.resolve() drops raw strings that fail all 3 cascade steps. Empty results are valid (not a failure state).
- EntityExtractor and IntentClassifier use immutable collections (ReadonlySet) to prevent runtime mutations that would corrupt extraction logic.
- Intent classification is stateless and deterministic: same query string always produces same classification (no side effects, RNG, or query state). Enables caching and replay.
- FusionLayer dependency is optional: EntityResolver works without it (fallback to exact + path); tests must not assume semantic search availability.

## Interface Contract

```ts
export AskGraphResult
export ClassificationResult
export EntityExtractor
export EntityResolver
export INTENTS
export Intent
export IntentClassifier
export ResolvedEntity
export ResponseFormatter
export StaleNodeSummary
export StalenessQueryResult
export askGraph
```

## Dependency Slice

```
import { CascadeSimulator } from '../blast-radius/index.js'
import { GraphAnomalyAdapter } from '../entropy/GraphAnomalyAdapter.js'
import { ContextQL } from '../query/ContextQL.js'
import { groupNodesByImpact } from '../query/groupImpact.js'
import { FusionLayer } from '../search/FusionLayer.js'
import { GraphStore } from '../store/GraphStore.js'
import { GraphNode, NodeType } from '../types.js'
import { EntityExtractor } from './EntityExtractor.js'
import { EntityResolver } from './EntityResolver.js'
import { IntentClassifier } from './IntentClassifier.js'
import { ResponseFormatter } from './ResponseFormatter.js'
import { AskGraphResult, ClassificationResult, INTENTS, Intent, ResolvedEntity, StaleNodeSummary, StalenessQueryResult } from './types.js'
```
