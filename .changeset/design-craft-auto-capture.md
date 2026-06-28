---
'@harness-engineering/cli': patch
---

Wire `design-craft` deep-mode auto-capture through a caller-configured capture command — finishing the `autoCapture` arg, which previously did nothing (`'prompt'`/`'auto'` behaved like `'skip'`). When `mode: 'deep'` needs captures and none are supplied, a new `captureCommand` is invoked (unless `autoCapture: 'skip'`) to render the components and produce screenshots; deep mode then vision-critiques them. This deliberately avoids a built-in headless browser: the project supplies its own render+screenshot step (Storybook, Playwright, etc.).

Contract: the command receives the candidate files via the `HARNESS_DESIGN_CRAFT_FILES` env var (a JSON array) and prints a JSON array of `{ file, image, component? }` to stdout. A failed command, non-JSON output, or an empty manifest surfaces as a clear tool error. Explicit `captures` still take precedence, and `fast` mode is unaffected. `runCaptureCommand` is exported (with an executor seam) for testing.
