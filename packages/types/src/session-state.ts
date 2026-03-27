/**
 * Session-scoped accumulative state types.
 *
 * Session memory allows skills to append to shared sections (terminology,
 * decisions, constraints, risks, openQuestions, evidence) rather than
 * overwriting. Each entry is timestamped and tagged with the authoring skill.
 *
 * @see docs/changes/ai-foundations-integration/proposal.md
 */

/**
 * Names of accumulative session sections.
 * Runtime array used for iteration and validation.
 */
export const SESSION_SECTION_NAMES = [
  'terminology',
  'decisions',
  'constraints',
  'risks',
  'openQuestions',
  'evidence',
] as const;

/**
 * Union type of valid session section names.
 */
export type SessionSectionName = (typeof SESSION_SECTION_NAMES)[number];

/**
 * Lifecycle status of a session entry.
 * - `active` — current and relevant
 * - `resolved` — addressed or answered (e.g., an open question that was resolved)
 * - `superseded` — replaced by a newer entry
 */
export type SessionEntryStatus = 'active' | 'resolved' | 'superseded';

/**
 * A single entry in a session section.
 * Entries are append-only; skills mark them as `resolved` or `superseded`
 * rather than deleting.
 */
export interface SessionEntry {
  /** Auto-generated unique identifier */
  id: string;
  /** ISO 8601 timestamp of when the entry was created */
  timestamp: string;
  /** Name of the skill that authored this entry */
  authorSkill: string;
  /** The entry content (free-form text) */
  content: string;
  /** Lifecycle status of the entry */
  status: SessionEntryStatus;
}

/**
 * Container mapping each section name to its array of entries.
 * Used as the shape of session-scoped state in `state.json`.
 */
export type SessionSections = {
  [K in SessionSectionName]: SessionEntry[];
};
