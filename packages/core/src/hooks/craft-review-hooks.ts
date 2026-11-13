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
