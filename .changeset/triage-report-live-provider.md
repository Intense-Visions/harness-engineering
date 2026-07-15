---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

fix(triage): wire the local SEL model into the plain report, add single-item targeting, and distinguish over-large scope

Three dogfooding fixes to `harness roadmap triage` (still entirely default-off behind
`roadmap.autoTriage.enabled`):

- **Live provider in the plain report (efficiently).** The read-only report now resolves
  the SEL provider the same way `--brainstorm` does (local-first, free) and runs the
  semantic-read + open-decisions levers on the local model for a REAL verdict — so items
  are no longer perpetually held as "no provider (offline)". It stays cheap: the graph
  scope + static complexity levers run first for every item, and the LLM levers fire ONLY
  for still-plausible candidates (scope resolved+bounded AND static band trivial|simple).
  Obviously-complex / over-large / unresolved items are held via the cheap path with no
  model call. A new `--offline` flag forces the pure static path. When no provider
  resolves, behavior degrades gracefully to the previous offline path (never an error).

- **Single-item / limited targeting.** New `--only <substring>` (case-insensitive title
  match) and `--limit <n>` flags, honored by BOTH the plain report and `--brainstorm`, so
  a single item can be triaged in isolation. `--brainstorm` additionally gates the actual
  brainstorm to plausible candidates so it no longer brainstorms items that would only halt.

- **`scope-too-large` hold reason.** Items whose entities RESOLVE but whose blast radius
  exceeds `boundedScopeMax` were mislabeled `unresolved-scope` (which reads as "no entity
  resolved"). They now carry a distinct `scope-too-large` `HoldReason` / `EscalationCategory`;
  `unresolved-scope` is reserved for the truly-no-entity-resolved case.
