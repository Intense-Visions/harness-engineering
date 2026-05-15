import { minimatch } from 'minimatch';

export interface BranchingConfig {
  /** Allowed branch name prefixes */
  prefixes: string[];
  /** Whether to enforce kebab-case for the branch slug */
  enforceKebabCase: boolean;
  /**
   * Optional regex that fully replaces the default prefix and kebab-case checks.
   * When set, only the ignore list and this regex are evaluated -- the `prefixes`,
   * `enforceKebabCase`, and `maxLength` settings are bypassed. Use for projects
   * whose convention does not fit the prefix/slug model.
   */
  customRegex?: string | undefined;
  /** List of ignored branch names (exact match or glob) */
  ignore: string[];
  /** Maximum slug length (everything after the first `/`). Omit or set 0 to disable. */
  maxLength?: number | undefined;
}

export interface BranchValidationResult {
  valid: boolean;
  branchName: string;
  message?: string;
  suggestion?: string;
}

// Strict kebab-case: lowercase alphanumeric segments separated by single hyphens,
// no leading/trailing hyphens, no double hyphens.
const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TICKET_ID = /^([A-Z0-9]+-[0-9]+)-(.*)$/;

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
  for (const pattern of config.ignore) {
    if (minimatch(branchName, pattern)) {
      return { valid: true, branchName };
    }
  }

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

  if (config.enforceKebabCase) {
    for (const part of slug.split('/')) {
      const ticketMatch = part.match(TICKET_ID);
      if (ticketMatch) {
        const rest = ticketMatch[2];
        if (rest && !KEBAB_CASE.test(rest)) {
          return {
            valid: false,
            branchName,
            message: `Branch slug part "${part}" does not follow kebab-case after the ticket ID.`,
            suggestion: `Ensure the description after "${ticketMatch[1]}" uses kebab-case (lowercase, single hyphens, no leading/trailing hyphen).`,
          };
        }
      } else if (!KEBAB_CASE.test(part)) {
        return {
          valid: false,
          branchName,
          message: `Branch slug part "${part}" must be in kebab-case (lowercase, single hyphens, no leading/trailing hyphen).`,
          suggestion: `Change "${part}" to match the convention.`,
        };
      }
    }
  }

  if (
    typeof config.maxLength === 'number' &&
    config.maxLength > 0 &&
    slug.length > config.maxLength
  ) {
    return {
      valid: false,
      branchName,
      message: `Branch slug is ${slug.length} characters; max allowed is ${config.maxLength}.`,
      suggestion: `Shorten the description after "${prefix}/" to ${config.maxLength} characters or fewer.`,
    };
  }

  return { valid: true, branchName };
}
