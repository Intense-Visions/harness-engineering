---
'@harness-engineering/cli': patch
---

Implement `design-craft` deep mode, which previously hard-errored ("deep mode (render + vision LLM) is not implemented in the Phase 1 MVP"). Deep mode now runs the CRITIQUE phase through the provider's **vision** channel (`callVision`, which was already part of the provider contract but unwired) over caller-supplied rendered screenshots:

- a new `captures` input (`[{ file, image, component? }]`) carries the screenshots, and a new `runVisionCritique` phase critiques each capture × seed-rubric exactly like `runCritique` does for source code;
- `mode: 'deep'` routes the critique phase to vision; POLISH and BENCHMARK are unaffected (they were already implemented — the stale module header claiming they "return []" is corrected);
- when `mode: 'deep'` is requested for the critique phase without `captures`, the tool returns a clear, actionable error rather than the old blanket "not implemented".

Auto-rendering components to screenshots remains out of scope (the CLI has no browser); captures are supplied by the caller (e.g. a Storybook/Playwright step). `fast` mode behavior is unchanged.
