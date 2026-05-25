/**
 * Re-export design-craft's derived priority computation. Avoids
 * duplication and keeps the craft-family priority semantics consistent
 * across skills. When test-craft or code-craft lands, extract to
 * `packages/cli/src/shared/craft/derived.ts` (v2).
 */

export { derivePriority } from '../../design-craft/findings/derived.js';
