# Natural Language Graph Queries (`ask_graph`)

**Keywords:** graph, natural-language, intent-classification, entity-resolution, ContextQL, FusionLayer, ask_graph, MCP

## Overview

Enable conversational codebase exploration by translating English questions into graph operations. Users ask questions like "what breaks if I change auth?" and get graph-backed answers with both a human-readable summary and raw data.

### Goals

- Provide a single `ask_graph` MCP tool that accepts `{ path, question }` and returns meaningful answers
- Support 5 intent categories: impact, find, relationships, explain, anomaly
- Work identically on Claude Code and Gemini CLI with no external LLM dependency
- Resolve entity references fuzzily (exact name → FusionLayer → path match) with confidence indicators
- Return pre-formatted natural language summaries alongside structured JSON data

### Non-Goals

- Multi-turn conversational state (each query is independent)
- Embedding/vector-based semantic search (FusionLayer already supports this; `ask_graph` uses keyword scoring)
- LLM-powered query translation or answer generation

## Decisions

| Decision             | Choice                                                             | Rationale                                                                                                  |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Translation approach | Lightweight NL parsing, no external LLM                            | Avoids cost/latency of LLM-in-the-loop; works identically on Claude and Gemini; deterministic              |
| Output format        | Summary + raw JSON                                                 | Ensures consistent answer quality across platforms; preserves raw data for follow-up                       |
| Intent categories    | All 5 from day one (impact, find, relationships, explain, anomaly) | Each delegates to existing tested handlers; marginal cost of supporting all is low                         |
| Entity resolution    | Fuzzy cascade with confidence                                      | Users won't know exact node names; cascade maximizes resolution success; confidence keeps it honest        |
| Package location     | `packages/graph/src/nlq/`                                          | Graph concern, not MCP concern; independently testable; reusable by CLI commands or future consumers       |
| Classifier design    | Scored multi-signal                                                | More robust than pure regex; graceful degradation via confidence scores; extensible without rearchitecting |

## Technical Design

### File Layout

```
packages/graph/src/nlq/
├── index.ts                 # Public API: askGraph(store, question) → AskGraphResult
├── IntentClassifier.ts      # Scored multi-signal classifier
├── EntityExtractor.ts       # Extract entity mentions from query text
├── EntityResolver.ts        # Fuzzy cascade: exact name → FusionLayer → path match
├── ResponseFormatter.ts     # Template-based summary generation per intent
├── types.ts                 # Intent, AskGraphResult, ResolvedEntity, etc.
```

### Core Types

```typescript
type Intent = 'impact' | 'find' | 'relationships' | 'explain' | 'anomaly';

interface ClassificationResult {
  readonly intent: Intent;
  readonly confidence: number; // 0–1
  readonly signals: Record<string, number>; // signal name → score
}

interface ResolvedEntity {
  readonly raw: string; // original mention from query
  readonly nodeId: string; // resolved graph node ID
  readonly node: GraphNode;
  readonly confidence: number; // 0–1
  readonly method: 'exact' | 'fusion' | 'path'; // which cascade step matched
}

interface AskGraphResult {
  readonly intent: Intent;
  readonly intentConfidence: number;
  readonly entities: readonly ResolvedEntity[];
  readonly summary: string; // human-readable answer
  readonly data: unknown; // raw graph result (same shape as underlying tool)
  readonly suggestions?: string[]; // if confidence is low, suggest rephrased queries
}
```

### Intent Classifier — Signals

Each intent has a scoring function combining 3–4 signals:

| Signal               | Description                         | Example                                                     |
| -------------------- | ----------------------------------- | ----------------------------------------------------------- |
| **keyword**          | Presence of intent-associated words | "breaks", "affects" → impact                                |
| **question-word**    | Leading interrogative               | "where" → find, "what" → impact/explain                     |
| **verb-pattern**     | Action verbs and prepositions       | "depends on" → relationships, "connects to" → relationships |
| **negation/concern** | Problem-oriented language           | "wrong", "problem", "smell" → anomaly                       |

Scoring per intent:

```typescript
const INTENT_SIGNALS: Record<Intent, SignalSet> = {
  impact: {
    keywords: ['break', 'affect', 'impact', 'change', 'depend', 'blast', 'radius', 'risk'],
    questionWords: ['what'],
    verbPatterns: [/what\s+(breaks|happens|is affected)/, /if\s+i\s+(change|modify|remove|delete)/],
  },
  find: {
    keywords: ['find', 'where', 'locate', 'search', 'show', 'list', 'all'],
    questionWords: ['where'],
    verbPatterns: [/where\s+is/, /find\s+(the|all|every)/],
  },
  relationships: {
    keywords: [
      'connect',
      'call',
      'import',
      'use',
      'depend',
      'link',
      'neighbor',
      'caller',
      'callee',
    ],
    questionWords: ['what', 'who'],
    verbPatterns: [/connects?\s+to/, /depends?\s+on/, /calls?/, /imports?/],
  },
  explain: {
    keywords: ['what', 'describe', 'explain', 'tell', 'about', 'overview', 'summary'],
    questionWords: ['what', 'how'],
    verbPatterns: [/what\s+is/, /describe\s+/, /tell\s+me\s+about/, /how\s+does/],
  },
  anomaly: {
    keywords: [
      'wrong',
      'problem',
      'anomaly',
      'smell',
      'issue',
      'outlier',
      'hotspot',
      'risk',
      'suspicious',
    ],
    questionWords: ['what'],
    verbPatterns: [/what.*(wrong|problem|smell)/, /find.*(issue|anomal|problem)/],
  },
};
```

When the top score is below 0.3, return a "couldn't understand" response with suggestions based on the top 2 intents.

### Entity Extractor

Extracts candidate entity mentions from the query:

1. **Quoted strings** — `"AuthMiddleware"` → `AuthMiddleware`
2. **PascalCase/camelCase tokens** — `UserService`, `loginHandler`
3. **File paths** — `src/auth/middleware.ts`
4. **Remaining significant nouns** — after stop-word removal, tokens not consumed by intent keywords

### Entity Resolver — Fuzzy Cascade

```
Step 1: Exact name match — store.findNodes({ name: raw })
Step 2: FusionLayer search — fusion.search(raw, 5), take top if score > 0.5
Step 3: Path match — store.findNodes({ type: 'file' }), filter by path.includes(raw)
```

Each step returns with its method tag and confidence (exact=1.0, fusion=score, path=0.6). If no step matches, the entity is marked unresolved and the response notes it.

### Response Formatter — Templates

Per-intent summary templates:

- **impact:** `Changing **{entity}** affects {code} code files, {tests} tests, and {docs} docs.`
- **find:** `Found {count} matches for "{query}"{typeFilter}.`
- **relationships:** `**{entity}** has {outbound} outbound and {inbound} inbound relationships.`
- **explain:** `**{entity}** is a {nodeType} at {path}. Connected to {neighborCount} nodes.`
- **anomaly:** `Found {count} anomalies: {topAnomalies}.`

### MCP Tool Definition

```typescript
export const askGraphDefinition = {
  name: 'ask_graph',
  description:
    'Ask a natural language question about the codebase knowledge graph. ' +
    'Supports questions about impact ("what breaks if I change X?"), ' +
    'finding entities ("where is the auth middleware?"), ' +
    'relationships ("what calls UserService?"), ' +
    'explanations ("what is GraphStore?"), ' +
    'and anomalies ("what looks wrong?"). ' +
    'Returns a human-readable summary and raw graph data.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      question: { type: 'string', description: 'Natural language question about the codebase' },
    },
    required: ['path', 'question'],
  },
};
```

### Data Flow

```
question string
    → IntentClassifier.classify(question)    → { intent, confidence }
    → EntityExtractor.extract(question)      → string[]
    → EntityResolver.resolve(entities, store) → ResolvedEntity[]
    → Execute graph operation (delegating to existing ContextQL/FusionLayer/Anomaly logic)
    → ResponseFormatter.format(intent, data) → summary string
    → Return AskGraphResult { intent, confidence, entities, summary, data }
```

## Success Criteria

1. `ask_graph` MCP tool is registered and callable from both Claude Code and Gemini CLI
2. All 5 intents classify correctly on a test suite of at least 5 example questions per intent (25+ total)
3. Entity resolution succeeds for exact names, camelCase/PascalCase tokens, file paths, and partial matches via FusionLayer
4. Every response includes both a non-empty summary string and raw data object
5. Confidence thresholds work: queries with low intent confidence (< 0.3) return suggestions instead of wrong answers
6. Unresolved entities are reported clearly — no silent failures or empty results without explanation
7. No external API calls — the tool works offline with only the local graph
8. Existing graph tools are unmodified — `ask_graph` composes them, doesn't fork them
9. Unit tests pass for IntentClassifier, EntityExtractor, EntityResolver, and ResponseFormatter independently
10. Integration test: end-to-end `askGraph(store, "what breaks if I change X?")` returns a valid `AskGraphResult` against a test graph fixture

## Implementation Order

1. **Types + scaffolding** — `packages/graph/src/nlq/types.ts` and `index.ts` with the public API signature
2. **IntentClassifier** — scored multi-signal classifier with tests
3. **EntityExtractor** — pattern-based extraction with tests
4. **EntityResolver** — fuzzy cascade over GraphStore + FusionLayer with tests
5. **ResponseFormatter** — template-based summaries per intent with tests
6. **Orchestrator** — `askGraph()` function wiring the pipeline together, integration tests
7. **MCP tool** — `ask_graph` definition and handler in `packages/cli/src/mcp/tools/graph.ts`, register in server
8. **Graph package exports** — export new public API from `packages/graph/src/index.ts`
