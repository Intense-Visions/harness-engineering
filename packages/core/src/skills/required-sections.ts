/**
 * Canonical required-Markdown-section lists for shipped skills.
 *
 * Single source of truth for the two gates that check skill structure:
 * the `harness skill validate` CLI validator and the `agents/skills`
 * vitest structure test both import these. Keeping one definition makes
 * gate drift structurally impossible.
 */

/** Sections every behavioral (flexible/rigid) skill must contain. */
export const BEHAVIORAL_REQUIRED_SECTIONS = [
  '## When to Use',
  '## Process',
  '## Harness Integration',
  '## Success Criteria',
  '## Examples',
  '## Rationalizations to Reject',
] as const;

/** Sections every knowledge skill must contain. */
export const KNOWLEDGE_REQUIRED_SECTIONS = ['## Instructions'] as const;

/** Additional sections required of rigid skills. */
export const RIGID_SECTIONS = ['## Gates', '## Escalation'] as const;
