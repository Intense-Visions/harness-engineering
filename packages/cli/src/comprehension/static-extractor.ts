/**
 * Static-extraction adapter — promoted into `@harness-engineering/core` so the
 * `harness comprehend` CLI and library consumers share ONE AST extractor over
 * core's `TypeScriptParser` (rather than each re-implementing the interface /
 * dependency rendering). This module now re-exports the core implementation for
 * back-compat; every existing importer keeps working unchanged.
 */
export {
  createStaticExtractor,
  renderInterfaceContract,
  renderDependencySlice,
  isStaticSupported,
  STATIC_SUPPORTED_EXTENSIONS,
} from '@harness-engineering/core';
