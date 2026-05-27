/**
 * Package identity constants. Lives in its own module so HTTP / cache /
 * scheduler code can import them without pulling in the public barrel
 * (which re-exports everything else).
 */
export const LOCAL_MODELS_PACKAGE = '@harness-engineering/local-models' as const;
export const LOCAL_MODELS_VERSION = '0.1.0' as const;
