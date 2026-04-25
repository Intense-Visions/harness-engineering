---
type: business_process
domain: core
tags: [learnings, deduplication, archival, progressive-disclosure]
---

# Learning Lifecycle

The learnings system captures, deduplicates, retrieves, and archives project insights discovered during skill execution.

## Acquisition

When a skill discovers a learning, it calls `appendLearning()` with optional skillName, outcome, rootCause, and triedAndFailed tags. The learning is formatted with metadata and persisted.

## Content Deduplication

Learnings are normalized (whitespace-stripped, lowercase) and hashed using SHA256. A learning is rejected if its hash already exists in `content-hashes.json`. This prevents duplicate knowledge capture across skills and sessions.

## Semantic Overlap Detection

When appending, the system runs a lexical similarity check against existing entries. If overlap score >= 0.7, the learning is still appended but flagged with an OverlapResult, alerting users to potential redundancy.

## Budgeted Progressive Disclosure

Learnings load in three tiers: (1) index summaries only (fast, low tokens), (2) summary mode with recent entries first, (3) full text with relevance scoring to intent. A token budget (default 1000) gates total retrieval, ensuring context efficiency.

## Pruning and Archival

Learnings auto-prune when count exceeds 30 OR (count > 20 AND entries are older than 14 days). Archives go to `.harness/learnings-archive/{YYYY-MM}.md` by month, enabling long-term retention without bloating the active knowledge base.

## Session Promotion

At session end, session-scoped learnings can be promoted to global learnings, making project-wide insights available to all future sessions and skills.
