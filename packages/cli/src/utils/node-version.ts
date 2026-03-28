import semver from 'semver';

export const REQUIRED_NODE_VERSION = '>=22.0.0';

export interface NodeVersionCheck {
  satisfies: boolean;
  current: string;
  required: string;
}

/**
 * Checks if the current Node.js version meets the minimum requirement.
 */
export function checkNodeVersion(): NodeVersionCheck {
  return {
    satisfies: semver.satisfies(process.version, REQUIRED_NODE_VERSION),
    current: process.version,
    required: '>=22',
  };
}
