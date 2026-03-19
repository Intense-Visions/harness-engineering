// Scanner
export { SecurityScanner } from './scanner';

// Config
export { SecurityConfigSchema, parseSecurityConfig, resolveRuleSeverity } from './config';

// Registry
export { RuleRegistry } from './rules/registry';

// Stack detection
export { detectStack } from './stack-detector';

// Built-in rules
export { secretRules } from './rules/secrets';
export { injectionRules } from './rules/injection';
export { xssRules } from './rules/xss';
export { cryptoRules } from './rules/crypto';
export { pathTraversalRules } from './rules/path-traversal';
export { networkRules } from './rules/network';
export { deserializationRules } from './rules/deserialization';

// Stack-specific rules
export { nodeRules } from './rules/stack/node';
export { expressRules } from './rules/stack/express';
export { reactRules } from './rules/stack/react';
export { goRules } from './rules/stack/go';

// Types
export type {
  SecurityCategory,
  SecuritySeverity,
  SecurityConfidence,
  SecurityRule,
  SecurityFinding,
  ScanResult,
  SecurityConfig,
  RuleOverride,
} from './types';
export { DEFAULT_SECURITY_CONFIG } from './types';
