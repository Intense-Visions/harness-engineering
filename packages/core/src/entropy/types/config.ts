// packages/core/src/entropy/types/config.ts
import type { LanguageParser } from '../../shared/parsers';
import type { ProtectedRegionMap } from '../../annotations';
import type { ComplexityConfig } from './complexity';
import type { CouplingConfig } from './coupling';
import type { SizeBudgetConfig } from './size-budget';
import type { PatternConfig } from './pattern-config';

export interface DriftConfig {
  docPaths: string[];
  checkApiSignatures: boolean;
  checkExamples: boolean;
  checkStructure: boolean;
  ignorePatterns: string[];
  /**
   * Path prefixes (relative or absolute substrings) for docs that describe
   * intended future code rather than the current codebase. API-signature
   * drift is suppressed for refs inside these docs — see github issue #492.
   *
   * Default: ['docs/architecture/', 'docs/decisions/', 'docs/proposals/',
   * 'docs/adr/']. Override via the entropy config to extend or replace.
   */
  forwardLookingPaths: string[];
}

export interface DeadCodeConfig {
  entryPoints?: string[];
  includeTypes: boolean;
  includeInternals: boolean;
  ignorePatterns: string[];
  treatDynamicImportsAs: 'used' | 'unknown';
  /**
   * Opt-out list for the advisory `PUBLIC_API_UNUSED` finding (issue #1479):
   * intentionally-public-for-adopters exports that should not be flagged even
   * with zero workspace callers. Each entry matches a finding when it equals the
   * export name, equals `<file>:<name>`, or is a substring of the export's file
   * path. Prefer a `@public` / `@publicApi` annotation on the export for
   * co-located intent; use this list for coarse path-level exemptions.
   */
  publicApiAllowlist?: string[];
}

export interface EntropyConfig {
  rootDir: string;
  parser?: LanguageParser;
  entryPoints?: string[];
  analyze: {
    drift?: boolean | Partial<DriftConfig>;
    deadCode?: boolean | Partial<DeadCodeConfig>;
    patterns?: boolean | PatternConfig;
    complexity?: boolean | Partial<ComplexityConfig>;
    coupling?: boolean | Partial<CouplingConfig>;
    sizeBudget?: boolean | Partial<SizeBudgetConfig>;
  };
  include?: string[];
  exclude?: string[];
  docPaths?: string[];
  /** When provided, dead code findings in protected regions are excluded from reports. */
  protectedRegions?: ProtectedRegionMap;
}
