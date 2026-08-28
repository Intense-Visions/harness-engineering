---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/panel'
sourceHash: '7c971ceeeb336cffabd707b494f6f81a23c836afacbfed8dfc6b79c3530541be'
compiledAt: '2026-08-28T01:22:11.284Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'AgentStatsSection.tsx',
    'ArtifactsSection.tsx',
    'ContextSourcesSection.tsx',
    'StatusSection.tsx',
    'TodoSection.tsx',
  ]
---

## Summary

The `panel` module exports five display components for monitoring execution state in the dashboard. AgentStatsSection renders token usage, turns, and duration for a running agent; ArtifactsSection shows created/modified/deleted files with animated entry; ContextSourcesSection displays context loader status; StatusSection shows active phase/skill and elapsed time; TodoSection tracks task completion. All sections conditionally render when populated, use consistent uppercase headers and semantic color mapping, and handle real-time elapsed-time updates via intervals with proper cleanup.

## Invariants

- AgentStatsSection and StatusSection both define identical formatElapsed() — must stay in sync or elapsed times diverge; should be extracted to shared utility
- ArtifactsSection keys motion.div by artifact.path in AnimatePresence; non-unique paths cause layout ID collisions and animation thrashing
- ContextSourcesSection's SourceStatusIcon switch on status must be exhaustive (loaded|loading|error); fourth status returns undefined and crashes
- AgentStatsSection only renders token stats when totalTokens > 0; zero-token stats objects render no metrics
- StatusSection and AgentStatsSection setInterval for elapsed time; must clear on unmount and check startedAt presence before computing
- TodoSection computes completion via array.filter; assumes no duplicate todo IDs (no validation)
- formatTokens() uses 1M/1k thresholds with no guard for negative values; negative token counts render incorrectly

## Interface Contract

```ts
export AgentStatsSection
export ArtifactsSection
export ContextSourcesSection
export StatusSection
export TodoSection
```

## Dependency Slice

```
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, ArrowUpDown, CheckCircle2, Circle, Clock, Cpu, Database, ExternalLink, FileCode2, GitPullRequest, ListTodo, Loader2, RotateCw, XCircle, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
```
