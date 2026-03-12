/**
 * Validation Module
 *
 * Exports validation functions and types for:
 * - File structure validation
 * - Configuration validation
 * - Commit message validation
 */

// Functions
export { validateFileStructure } from './file-structure';
export { validateConfig } from './config';
export { validateCommitMessage } from './commit-message';

// Types
export type { Convention, StructureValidation, ConfigError, CommitFormat, CommitValidation } from './types';
