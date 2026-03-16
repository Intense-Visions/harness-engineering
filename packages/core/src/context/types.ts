// packages/core/src/context/types.ts
import type { ContextError } from '../shared/errors';

// AGENTS.md Validation Types
export interface AgentMapLink {
  text: string; // Link text
  path: string; // File path (relative or absolute)
  exists: boolean; // Does the file exist?
  line: number; // Line number in AGENTS.md
  error?: ContextError; // Optional error if link validation failed
}

export interface AgentMapSection {
  title: string; // Section heading
  level: number; // Heading level (1-6)
  links: AgentMapLink[]; // Links in this section
  description?: string; // Optional description text
  line: number; // Line number where section starts
}

export interface AgentMapValidation {
  valid: boolean;
  sections: AgentMapSection[];
  totalLinks: number;
  brokenLinks: AgentMapLink[];
  missingSections: string[]; // Required sections that are missing
  errors?: ContextError[]; // Validation errors if any
}

// Documentation Coverage Types
export interface DocumentationGap {
  file: string; // Undocumented file path
  suggestedSection: string; // Where it should be documented
  importance: 'high' | 'medium' | 'low'; // Based on file type/location
}

export interface CoverageReport {
  domain: string; // e.g., 'services', 'core', 'ui'
  documented: string[]; // Files mentioned in docs
  undocumented: string[]; // Files not mentioned
  coveragePercentage: number;
  gaps: DocumentationGap[];
}

export interface CoverageOptions {
  docsDir?: string; // Default: './docs'
  sourceDir?: string; // Default: './src'
  excludePatterns?: string[]; // Files to ignore
}

// Knowledge Map Integrity Types
export interface BrokenLink {
  text: string;
  path: string;
  line: number;
  section: string;
  reason: 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INVALID_PATH';
  suggestion: string; // Suggested fix
}

export interface IntegrityReport {
  totalLinks: number;
  brokenLinks: BrokenLink[];
  validLinks: number;
  integrity: number; // 0-100%
}

// AGENTS.md Generation Types
export interface GenerationSection {
  name: string;
  pattern: string; // Glob pattern for files to include
  description: string;
}

export interface AgentsMapConfig {
  rootDir: string;
  includePaths: string[]; // Glob patterns to include
  excludePaths: string[]; // Glob patterns to exclude
  template?: string; // Custom template path
  sections?: GenerationSection[];
}

// Required sections for harness-engineering projects
export const REQUIRED_SECTIONS = [
  'Project Overview',
  'Repository Structure',
  'Development Workflow',
] as const;

export type RequiredSection = (typeof REQUIRED_SECTIONS)[number];
