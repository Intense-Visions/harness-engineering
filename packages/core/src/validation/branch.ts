import { minimatch } from 'minimatch';

export interface BranchingConfig {
  /** Allowed branch name prefixes */
  prefixes: string[];
  /** Whether to enforce kebab-case for the branch slug */
  enforceKebabCase: boolean;
  /** Optional regex for custom branch naming rules */
  customRegex?: string;
  /** List of ignored branch names (exact match or glob) */
  ignore: string[];
}

export interface BranchValidationResult {
  valid: boolean;
  branchName: string;
  message?: string;
  suggestion?: string;
}

/**
 * Validates a branch name against the provided configuration.
 *
 * @param branchName - The name of the branch to validate.
 * @param config - The branching configuration.
 * @returns A BranchValidationResult.
 */
export function validateBranchName(
  branchName: string,
  config: BranchingConfig
): BranchValidationResult {
  // 1. Check ignored branches
  for (const pattern of config.ignore) {
    if (minimatch(branchName, pattern)) {
      return { valid: true, branchName };
    }
  }

  // 2. Check custom regex if provided
  if (config.customRegex) {
    const regex = new RegExp(config.customRegex);
    if (!regex.test(branchName)) {
      return {
        valid: false,
        branchName,
        message: `Branch name "${branchName}" does not match the custom regex: ${config.customRegex}`,
      };
    }
    return { valid: true, branchName };
  }

  // 3. Check prefixes
  const parts = branchName.split('/');
  if (parts.length < 2) {
    return {
      valid: false,
      branchName,
      message: `Branch name "${branchName}" must have a prefix followed by a slash (e.g., "feat/my-feature").`,
      suggestion: `Try renaming to "feat/${branchName}" or "fix/${branchName}".`,
    };
  }

  const prefix = parts[0]!;
  const slug = parts.slice(1).join('/');

  if (!config.prefixes.includes(prefix)) {
    return {
      valid: false,
      branchName,
      message: `Prefix "${prefix}" is not allowed.`,
      suggestion: `Allowed prefixes: ${config.prefixes.join(', ')}.`,
    };
  }

  // 4. Check kebab-case
  if (config.enforceKebabCase) {
    const kebabRegex = /^[a-z0-9-]+$/;

    const slugParts = slug.split('/');
    for (const part of slugParts) {
      // Support optional pattern: prefix/PROJ-123-short-desc
      const ticketMatch = part.match(/^([A-Z0-9]+-[0-9]+)-(.*)$/);
      if (ticketMatch) {
        const rest = ticketMatch[2];
        if (rest && !kebabRegex.test(rest)) {
          return {
            valid: false,
            branchName,
            message: `Branch slug part "${part}" does not follow kebab-case after the ticket ID.`,
            suggestion: `Ensure the description after "${ticketMatch[1]}" uses kebab-case (lowercase and hyphens only).`,
          };
        }
      } else if (!kebabRegex.test(part)) {
        return {
          valid: false,
          branchName,
          message: `Branch slug part "${part}" must be in kebab-case (lowercase and hyphens only).`,
          suggestion: `Change "${part}" to match the convention.`,
        };
      }
    }
  }

  return { valid: true, branchName };
}
