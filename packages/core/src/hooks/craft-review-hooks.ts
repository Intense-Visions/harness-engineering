// packages/core/src/hooks/craft-review-hooks.ts
//
// Craft auto-wiring at the review moment.
// Spec: docs/changes/auto-wire-craft-at-review/proposal.md (Phase 1).
//
// The eleven `-craft` skills are the project's ceiling layer, and nothing in the
// build path invoked them: their `on_pr` / `on_new_feature` declarations are read
// only as a result FILTER by `dispatch_skills`. This module is the resolver half
// of the fix — given a diff and a skill-availability report, it says which craft
// domains should run at a host skill's review event. Dispatch stays in the
// consuming skills, so this module is PURE and IO-free (no file system, no
// network, no spawning), exactly like `skill-lifecycle.ts` and
// `canary-review-hooks.ts`.
//
// INERT UNTIL CALLED. Phase 1 deliberately does NOT export these symbols from
// `hooks/index.ts` and wires no host; Phase 3 owns the barrel + autopilot, Phase 4
// owns code-review, Phase 2 owns multi-language craft extraction. A test in
// `tests/hooks/craft-review-hooks.test.ts` pins that boundary.
//
// THREE DELIBERATE DIVERGENCES FROM THE CANARY TWIN (`canary-review-hooks.ts`).
// Each is the kind of thing a future reader "fixes" toward the canary default:
//
//   1. NON-BLOCKING. Canary calls `defaultBlocking(event)`, which is TRUE at
//      `after:REVIEW` / `after:FINAL_REVIEW`, matching the built-in review gate.
//      Craft findings are advisory — surfaced, never blocking, never counted
//      toward review severity (spec D2, following harness-design-pipeline). So
//      wired craft hooks carry a LITERAL `blocking: false`. Do not "restore"
//      `defaultBlocking` here; a test asserts the literal AND asserts
//      `defaultBlocking('after:REVIEW') === true` so the divergence is provable.
//   2. PER-HOST EVENT SETS. Canary has one host constant. Craft has two hosts with
//      different event vocabularies (spec D4/D5): autopilot wires
//      `after:REVIEW` / `after:FINAL_REVIEW`; code-review's only declared event is
//      `after:mechanical`, which fires BEFORE its AI fan-out — so craft runs POST
//      review under autopilot and PRE review under code-review. The asymmetry is
//      intentional and named here so it is not discovered later.
//   3. CAPABILITY GATE BEFORE DISPATCH. A domain whose `supportedLanguages` does
//      not intersect the languages of the files IT OWNS is SKIPPED with reason
//      `unsupported-language` — never dispatched (spec D8). Dispatching it would
//      return an empty finding set indistinguishable from "this code is fine".
//
// FORWARD-WIRED / GRACEFUL-SKIP CONTRACT (inherited from the canary twin, do not
// regress): craft domains are harness-OPTIMISTIC defaults. A default whose skill
// is not installed is SKIPPED and reported in the denominator, never a hard halt.
// A USER-declared `skillHooks` entry keeps hard-halt semantics (false-green
// protection) because it flows through `resolveSkillHooks` untouched. Availability
// is an INPUT supplied by the caller — this module probes nothing.
//
// PATH-PREDICATE VOCABULARY. The exclusion/production-source notions mirror
// `packages/core/src/review/depth-calibrator.ts` (`isExcludedPath` :70,
// `isProductionTsFile` :75), which are module-PRIVATE there. They are re-stated
// rather than imported on purpose: exporting them would modify a module consumed
// by `review/fan-out.ts` and `review/pipeline-orchestrator.ts`, and spec D6
// explicitly rejects mutating the code that gates every review for an advisory
// feature. Extracting a shared helper is a Phase 3 follow-up.
//
// Activation reads the DIFF, never a discovery walk — so craft's own
// `packages/*/src` discovery assumption never reaches this path, and the budget
// D3 exists to protect is not reintroduced through the back door.

import { EXTENSION_MAP, detectLanguage, type SupportedLanguage } from '../code-nav/types';
import type { NormalizedHook } from './skill-lifecycle';
import type { SkillAvailability } from './canary-review-hooks';

/**
 * Sentinel `supportedLanguages` for a domain whose surface is prose or spec
 * documents (markdown, OpenAPI YAML/JSON) rather than parsed source. An empty
 * array is NOT used for this: it reads as "supports nothing", which is the
 * opposite meaning, and would make every prose domain an `unsupported-language`
 * skip.
 */
export const CRAFT_ANY_LANGUAGE = 'any' as const;

/**
 * One craft domain's auto-wiring rule.
 *
 * `owns` returns the OWNED SUBSET of the changed files, not a boolean: the
 * capability gate must run over the files the domain actually owns. With a
 * boolean, an unrelated `.ts` elsewhere in the diff would satisfy the language
 * gate for a `.py` file the domain owns — the exact mis-dispatch spec D8 exists
 * to prevent. The subset is also what a host forwards as `files` (spec criterion 4).
 */
export interface CraftDomainRule {
  /** Canonical skill name. `harness-design-craft` is the only prefixed one. */
  readonly skill: string;
  /** Languages the domain can extract units from, or {@link CRAFT_ANY_LANGUAGE}. */
  readonly supportedLanguages: readonly SupportedLanguage[] | typeof CRAFT_ANY_LANGUAGE;
  /** The subset of `changedFiles` on this domain's surface (possibly empty). */
  owns(changedFiles: readonly string[]): readonly string[];
  /** Deterministic cap ordering; the table is declared in this order. */
  readonly priority: number;
}

/**
 * The events each host skill actually wires. Per-host because the two hosts have
 * different event vocabularies (spec D4) — every other boundary is a silent
 * no-op, so wiring one would be a dead declaration.
 */
export const CRAFT_REVIEW_EVENTS_BY_HOST = {
  'harness-autopilot': ['after:REVIEW', 'after:FINAL_REVIEW'],
  'harness-code-review': ['after:mechanical'],
} as const satisfies Record<string, readonly string[]>;

/** A host skill craft domains attach to. */
export type CraftReviewHostSkill = keyof typeof CRAFT_REVIEW_EVENTS_BY_HOST;

/** Default cap on activated domains per review (spec Budget). */
export const DEFAULT_MAX_CRAFT_DOMAINS = 3;

/**
 * Craft domains deliberately NOT auto-activated in v1.
 *
 * `copy-craft`'s surface is a changed string literal in an error or log message,
 * which cannot be computed from a changed-FILE list without content analysis. It
 * stays manual until a predicate exists that actually works. Named here (rather
 * than added to the table with a never-true predicate) so it is not denominator
 * noise on every review and so re-adding it is a visible decision. A test pins
 * that it never appears in a plan.
 */
export const CRAFT_DOMAINS_NOT_ACTIVATED_V1: readonly string[] = Object.freeze(['copy-craft']);

/** Repo-relative POSIX form: folds Windows separators and strips a leading `./`. */
function normalizePath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Build output, vendored code, generated files, declarations and lockfiles. */
const EXCLUDED_PATH_PATTERNS: readonly RegExp[] = [
  /(^|\/)(dist|build|out|coverage|node_modules|vendor|target|\.next)\//,
  /\.generated\.[A-Za-z0-9]+$/,
  /\.d\.ts$/,
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/,
  /\.min\.(js|css)$/,
  /\.snap$/,
];

/** Test conventions across the six supported languages (path-only — module is IO-free). */
const TEST_PATH_PATTERNS: readonly RegExp[] = [
  /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /(^|\/)__tests__\//,
  /(^|\/)tests?\//,
  /(^|\/)test_[^/]+\.py$/,
  /_test\.(py|go)$/,
  /(^|\/)src\/test\/(java|kotlin)\//,
  /Test\.java$/,
];

const STYLESHEET_PATTERN = /\.(css|scss|sass|less|styl)$/;
/** `design-token(s)` files/dirs, or a `tokens.{json,yaml,css,scss}` manifest. */
const DESIGN_TOKEN_PATTERN =
  /(^|\/)design-tokens?(\/|\.[A-Za-z0-9]+$)|(^|\/)tokens\.(json|ya?ml|css|scss)$/;
// Adopter-portable CLI layout markers — no `packages/*/src` assumption.
const CLI_COMMAND_PATTERN = /(^|\/)(cli|commands|cmd|bin)\//;
const OPENAPI_PATTERN = /(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$/i;
const SPEC_PROPOSAL_PATTERN = /^docs\/changes\/.+\/proposal\.md$/;
const MARKDOWN_PATTERN = /\.md$/;

function isExcludedPath(file: string): boolean {
  return EXCLUDED_PATH_PATTERNS.some((re) => re.test(file));
}

function isTestFile(file: string): boolean {
  return !isExcludedPath(file) && TEST_PATH_PATTERNS.some((re) => re.test(file));
}

/** A non-test, non-generated file in a language `code-nav` can parse. */
function isProductionSource(file: string): boolean {
  if (isExcludedPath(file) || isTestFile(file)) return false;
  return detectLanguage(file) !== null;
}

function ownsDesignSurface(file: string): boolean {
  if (isExcludedPath(file) || isTestFile(file)) return false;
  return /\.tsx$/.test(file) || STYLESHEET_PATTERN.test(file) || DESIGN_TOKEN_PATTERN.test(file);
}

function ownsDocsSurface(file: string): boolean {
  if (isExcludedPath(file)) return false;
  // `docs/changes/**` is spec-craft's surface. `docs/knowledge/**` overlaps
  // knowledge-craft deliberately, exactly as the spec's domain table states.
  // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator -- repo-relative POSIX path, already folded by normalizePath
  if (file.startsWith('docs/changes/')) return false;
  return file.startsWith('docs/') || MARKDOWN_PATTERN.test(file);
}

/**
 * Every language `code-nav` supports, derived from `EXTENSION_MAP` so a seventh
 * language lights up the source domains automatically instead of silently
 * missing them.
 */
const ALL_SOURCE_LANGUAGES: readonly SupportedLanguage[] = Object.freeze([
  ...new Set(Object.values(EXTENSION_MAP)),
]);

/**
 * The craft domains that auto-wire at a review moment, in `priority` order (the
 * order the budget cap consumes). Priority leads with `harness-design-craft`
 * because UI work is the motivating case (spec D5). `copy-craft` is deliberately
 * absent — see {@link CRAFT_DOMAINS_NOT_ACTIVATED_V1}.
 */
export const CRAFT_REVIEW_DOMAINS: readonly CraftDomainRule[] = Object.freeze([
  {
    skill: 'harness-design-craft',
    priority: 1,
    supportedLanguages: ['typescript', 'javascript'],
    owns: (files) => files.filter(ownsDesignSurface),
  },
  {
    skill: 'code-craft',
    priority: 2,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isProductionSource),
  },
  {
    skill: 'test-craft',
    priority: 3,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isTestFile),
  },
  {
    skill: 'naming-craft',
    priority: 4,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isProductionSource),
  },
  {
    skill: 'security-craft',
    priority: 5,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isProductionSource),
  },
  {
    skill: 'cli-ergonomics-craft',
    priority: 6,
    supportedLanguages: ['typescript', 'javascript'],
    owns: (files) => files.filter((f) => isProductionSource(f) && CLI_COMMAND_PATTERN.test(f)),
  },
  {
    skill: 'api-craft',
    priority: 7,
    supportedLanguages: CRAFT_ANY_LANGUAGE,
    owns: (files) => files.filter((f) => !isExcludedPath(f) && OPENAPI_PATTERN.test(f)),
  },
  {
    skill: 'spec-craft',
    priority: 8,
    supportedLanguages: CRAFT_ANY_LANGUAGE,
    owns: (files) => files.filter((f) => SPEC_PROPOSAL_PATTERN.test(f)),
  },
  {
    skill: 'docs-craft',
    priority: 9,
    supportedLanguages: CRAFT_ANY_LANGUAGE,
    owns: (files) => files.filter(ownsDocsSurface),
  },
  {
    skill: 'knowledge-craft',
    priority: 10,
    supportedLanguages: CRAFT_ANY_LANGUAGE,
    // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator -- repo-relative POSIX path, already folded by normalizePath
    owns: (files) => files.filter((f) => f.startsWith('docs/knowledge/')),
  },
]);

/** Why a craft domain did not run at this review moment. */
export type CraftSkipReason =
  | 'not-installed'
  | 'not-activated'
  | 'unsupported-language'
  | 'no-diff-context'
  | 'over-budget'
  | 'already-run';

/** One reported omission. The absence of a domain is never silent (spec goal 4). */
export interface CraftReviewSkip {
  skill: string;
  reason: CraftSkipReason;
}

/**
 * The outcome of resolving craft's default domains at a review event: which are
 * WIRED (non-blocking `skill` hooks ready to dispatch), which are SKIPPED and why,
 * and the full EXPECTED set — the denominator a host reports ("craft domains:
 * 2/3 activated, 1 skipped: unsupported-language").
 */
export interface CraftReviewPlan {
  /** NON-BLOCKING by contract — see divergence 1 in the module header. */
  wired: NormalizedHook[];
  skipped: CraftReviewSkip[];
  expected: readonly string[];
}

/** True only for an event the given host actually wires (spec D4). */
function isCraftReviewEvent(hostSkill: string, event: string): boolean {
  const events = (CRAFT_REVIEW_EVENTS_BY_HOST as Record<string, readonly string[]>)[hostSkill];
  return events !== undefined && events.includes(event);
}

/** The Claude Code plugin that ships the craft skills (`.claude-plugin/plugin.json`). */
const HARNESS_PLUGIN_PREFIX = 'harness-claude:';

/**
 * Reduce a catalog entry to the bare skill name it designates. Craft skill names
 * contain no colon, so taking the final segment collapses every plugin
 * qualification depth onto the bare name losslessly. `harness-design-craft` keeps
 * its `harness-` prefix — that is part of its canonical name, not a qualification.
 */
function bareSkillName(entry: string): string {
  const lastColon = entry.lastIndexOf(':');
  return lastColon === -1 ? entry : entry.slice(lastColon + 1);
}

/**
 * Every form a catalog is known to report a craft skill under. Enumerable
 * availability (Set/array) is normalized by {@link bareSkillName}, so depth is
 * irrelevant there; a PREDICATE can only be probed, which makes this list the
 * actual coverage. The canary twin learned this the hard way: a missing form
 * answers false and the domain is silently skipped.
 */
const CRAFT_SKILL_PROBE_FORMS: readonly ((skill: string) => string)[] = [
  (skill) => skill,
  (skill) => `${HARNESS_PLUGIN_PREFIX}${skill}`,
  (skill) => `${HARNESS_PLUGIN_PREFIX}skills:claude-code:${skill}:${skill}`,
];

/** Normalize the three availability shapes into one predicate. `undefined` means nothing installed. */
function toAvailabilityPredicate(avail: SkillAvailability | undefined): (skill: string) => boolean {
  if (avail === undefined) return () => false;
  if (typeof avail === 'function') {
    return (skill) => CRAFT_SKILL_PROBE_FORMS.some((form) => avail(form(skill)));
  }
  const set = avail instanceof Set ? avail : new Set(avail);
  const bare = new Set<string>();
  for (const entry of set) bare.add(bareSkillName(entry));
  return (skill) => set.has(skill) || bare.has(skill);
}

/**
 * Plan craft's default domains for `hostSkill` at `event`, given the diff and
 * which skills are installed.
 *
 * Skip-reason precedence (pinned by a test, so a reorder is deliberate):
 * `not-activated` (surface) -> `unsupported-language` (capability) -> `not-installed`
 * (availability) -> `already-run` -> `over-budget`. Budget is last so a
 * not-installed domain never consumes a slot.
 *
 * - `hostSkill`/`event` pair the host does not wire => fully empty plan (no
 *   denominator at a boundary craft never attaches to).
 * - `changedFiles === undefined` => nothing activated, every domain reported
 *   `no-diff-context`. Falling back to a repository walk would silently
 *   reintroduce the unscoped cost spec D3 exists to prevent.
 */
export function planCraftReviewDomains(
  hostSkill: string,
  event: string,
  changedFiles: readonly string[] | undefined,
  availableSkills?: SkillAvailability,
  _opts?: { maxDomains?: number; alreadyRanFor?: readonly string[] }
): CraftReviewPlan {
  if (!isCraftReviewEvent(hostSkill, event)) {
    return { wired: [], skipped: [], expected: [] };
  }

  const expected = CRAFT_REVIEW_DOMAINS.map((domain) => domain.skill);

  if (changedFiles === undefined) {
    return {
      wired: [],
      skipped: expected.map((skill) => ({ skill, reason: 'no-diff-context' as const })),
      expected,
    };
  }

  const files = changedFiles.map(normalizePath);
  const isInstalled = toAvailabilityPredicate(availableSkills);
  const wired: NormalizedHook[] = [];
  const skipped: CraftReviewSkip[] = [];

  for (const rule of CRAFT_REVIEW_DOMAINS) {
    const owned = rule.owns(files);
    if (owned.length === 0) {
      skipped.push({ skill: rule.skill, reason: 'not-activated' });
      continue;
    }
    if (!isInstalled(rule.skill)) {
      skipped.push({ skill: rule.skill, reason: 'not-installed' });
      continue;
    }
    // NON-BLOCKING, deliberately. NOT `defaultBlocking(event)` — see divergence 1.
    wired.push({ type: 'skill', skill: rule.skill, blocking: false });
  }

  return { wired, skipped, expected };
}
