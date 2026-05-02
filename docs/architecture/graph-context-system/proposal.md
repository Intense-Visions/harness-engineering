# Proposal: Graph-Aware Context System

## Options Presented

### Option A: Unified Knowledge Graph (SELECTED)

Full graph-first rewrite. Replace all existing context, entropy, state, and constraint systems with a single graph database. Every piece of information becomes a node, every relationship an edge.

### Option B: Graph Overlay

Add graph layer alongside existing systems via adapters. Zero breaking changes but dual maintenance burden.

### Option C: Context Query Engine

On-demand graph construction at query time. No persistent graph. Simpler but limited at scale.

## Decision

Option A selected. Rationale: no hard constraints, big-bang acceptable, heavier dependencies OK, goal is best possible context system, OmniContext deprecation cleanest with full replacement.
