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
//   2. PER-HOST EVENT SETS. Canary has one host constant. Craft has two hosts
//      with different event vocabularies (spec D4/D5). See
//      {@link CRAFT_REVIEW_EVENTS_BY_HOST} for the vocabularies and for the
//      pre/post-review asymmetry between them.
//   3. CAPABILITY GATE BEFORE DISPATCH. A domain whose `supportedLanguages` does
//      not intersect the languages of the files IT OWNS is SKIPPED with reason
//      `unsupported-language` — never dispatched (spec D8). Dispatching it would
//      return an empty finding set indistinguishable from "this code is fine".
//      The gate applies ONLY to the four unit-extraction domains; every
//      surface-bound domain is CRAFT_ANY_LANGUAGE. See {@link CRAFT_ANY_LANGUAGE}.
//   4. A BUDGET CAP, WHICH CANARY HAS NO COUNTERPART FOR. Canary wires a fixed
//      four detectors and never drops one, so there dedup-after-planning is free:
//      removing a hook afterwards cannot change which other hooks were chosen.
//      HERE IT IS NOT FREE. Slots are scarce (default 3), so a domain filtered
//      out AFTER the loop has already consumed a slot that a later domain could
//      have used — and the plan's `skipped` then reports `over-budget` for a
//      domain while a slot was in fact free. That is why every reason that can
//      suppress a domain, INCLUDING a project's own `skillHooks` declaration,
//      is a skip stage INSIDE the loop and ordered ahead of the budget. A reader
//      pattern-matching from canary will assume otherwise; do not "simplify" the
//      project-declared stage back out into a post-pass.
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
import { resolveSkillHooks } from './skill-lifecycle';
import type { NormalizedHook, SkillHookEntry, SkillHooksConfigHolder } from './skill-lifecycle';
import type { SkillAvailability } from './canary-review-hooks';

/**
 * Sentinel `supportedLanguages` for a SURFACE-BOUND domain.
 *
 * THE RULE, so the table is self-explaining: a domain needs `supportedLanguages`
 * ONLY when it parses source into units. That is exactly four domains —
 * `code-craft`, `naming-craft`, `security-craft`, `test-craft`. Every other
 * domain is surface-bound: its `owns` predicate already names the exact files it
 * critiques, so a language check is redundant at best, and WRONG whenever the
 * surface is not in `EXTENSION_MAP` — which maps no `.css`, `.scss`, `.md` or
 * `.yaml`, so `detectLanguage` returns null for all of them.
 *
 * Do not "fix" a surface-bound domain back toward `['typescript', 'javascript']`.
 * Doing so makes a stylesheet-only diff, a prose-only diff and a Python CLI diff
 * report `unsupported-language` forever — a silent total failure dressed as a
 * correct report. `harness-design-craft` declining to read CSS is not an
 * incapacity; CSS is squarely its surface.
 *
 * An empty array is NOT used as the sentinel: it reads as "supports nothing",
 * the opposite meaning.
 */
export const CRAFT_ANY_LANGUAGE = 'any' as const;

/**
 * One craft domain's auto-wiring rule.
 *
 * `owns` returns the OWNED SUBSET of the changed files, not a boolean: the
 * capability gate must run over the files the domain actually owns. With a
 * boolean, an unrelated `.ts` elsewhere in the diff would satisfy the language
 * gate for a `.py` file the domain owns — the exact mis-dispatch spec D8 exists
 * to prevent.
 *
 * HOSTS SHOULD NOT CALL THIS. To forward `files` (spec criterion 4), read
 * {@link CraftReviewPlan.files}, which is already normalized. `owns` is correct
 * only on repo-relative POSIX paths; on raw VCS output it yields false negatives
 * AND false positives, because the exclusion patterns are `/`-anchored. It is
 * exported for the table's own tests and for introspection, not as a host API.
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
 *
 * NOTE THE ASYMMETRY, which is intentional and easy to miss: autopilot's
 * `after:REVIEW` / `after:FINAL_REVIEW` fire AFTER its review, whereas
 * code-review's only declared event, `after:mechanical`, fires BEFORE its AI
 * fan-out. So craft runs POST-review under autopilot and PRE-review under
 * code-review. A reviewer seeing craft's findings first is an improvement, not
 * a problem — but it means the two hosts are not interchangeable.
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
  // `.harness/` is machine-generated harness state in EVERY adopter (comprehension
  // shards, session state, baselines). Without this, each shard regeneration
  // activates docs-craft on its own bookkeeping.
  /(^|\/)\.harness\//,
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
/** Prose a writing critic can actually read. */
const PROSE_PATTERN = /\.(md|mdx|markdown|txt|rst|adoc)$/i;

function isExcludedPath(file: string): boolean {
  return EXCLUDED_PATH_PATTERNS.some((re) => re.test(file));
}

function isTestFile(file: string): boolean {
  return !isExcludedPath(file) && TEST_PATH_PATTERNS.some((re) => re.test(file));
}

/**
 * A non-test, non-generated file in a language `code-nav` can EXTRACT UNITS from.
 * The `Extractable` is load-bearing: this is not merely "production source", it
 * also requires `detectLanguage(file) !== null`. Surface-bound domains must not
 * use it — that would re-impose the language gate on their back door.
 */
function isExtractableSource(file: string): boolean {
  if (isExcludedPath(file) || isTestFile(file)) return false;
  return detectLanguage(file) !== null;
}

function ownsDesignSurface(file: string): boolean {
  if (isExcludedPath(file) || isTestFile(file)) return false;
  return /\.tsx$/.test(file) || STYLESHEET_PATTERN.test(file) || DESIGN_TOKEN_PATTERN.test(file);
}

function ownsDocsSurface(file: string): boolean {
  // The test guard every other surface predicate already had. Without it,
  // `tests/fixtures/README.md` is a docs-craft surface.
  if (isExcludedPath(file) || isTestFile(file)) return false;
  // `docs/changes/**` is spec-craft's surface. `docs/knowledge/**` overlaps
  // knowledge-craft deliberately, exactly as the spec's domain table states.
  // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator -- repo-relative POSIX path, already folded by normalizePath
  if (file.startsWith('docs/changes/')) return false;
  // PROSE only. `docs/**` holds images, fixtures and data too, and docs-craft
  // critiques writing — handing it `diagram.png` or `data.json` is a dispatch
  // with nothing to read, the same failure the capability gate exists to prevent.
  if (!PROSE_PATTERN.test(file)) return false;
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
    // Surface-bound: `.tsx`, stylesheets and token manifests. Stylesheets are
    // not in EXTENSION_MAP, so a language gate would skip every CSS-only diff.
    supportedLanguages: CRAFT_ANY_LANGUAGE,
    owns: (files) => files.filter(ownsDesignSurface),
  },
  {
    skill: 'code-craft',
    priority: 2,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isExtractableSource),
  },
  {
    skill: 'test-craft',
    priority: 3,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isTestFile),
  },
  {
    // Ahead of naming-craft deliberately (spec D-5): on a source+tests diff the
    // default budget of 3 is spent by code + test + one more, so whichever of
    // these two is fourth is unreachable on a normal diff. A missed
    // security-posture finding costs more than a missed naming nit.
    skill: 'security-craft',
    priority: 4,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isExtractableSource),
  },
  {
    skill: 'naming-craft',
    priority: 5,
    supportedLanguages: ALL_SOURCE_LANGUAGES,
    owns: (files) => files.filter(isExtractableSource),
  },
  {
    skill: 'cli-ergonomics-craft',
    priority: 6,
    // Surface-bound: it critiques a command's ergonomics (flags, naming, help
    // text), which is not language-specific. A Go, Python, shell or Ruby CLI
    // module is squarely its surface.
    supportedLanguages: CRAFT_ANY_LANGUAGE,
    // Deliberately NOT `isExtractableSource`: `.sh` and `.rb` are not in
    // EXTENSION_MAP, and a shell or Ruby CLI is squarely this domain's surface.
    owns: (files) =>
      files.filter((f) => !isExcludedPath(f) && !isTestFile(f) && CLI_COMMAND_PATTERN.test(f)),
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
  | 'already-run'
  /** The project declared this domain itself at this host/event (see I1). */
  | 'project-declared';

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
  /**
   * The owned, NORMALIZED file subset per wired domain, keyed by skill name —
   * what a host forwards as `files` (spec criterion 4).
   *
   * This is carried rather than left to the host to re-derive, because
   * re-deriving is unsafe: `rule.owns()` is only correct on repo-relative POSIX
   * paths, and the normalizer is module-private. A host calling `owns()` on raw
   * VCS output gets both false negatives (`docs\\changes\\x\\proposal.md` matches
   * no anchored pattern) and — worse — false POSITIVES, since the exclusion
   * patterns are `/`-anchored, so `dist\\ui\\Button.tsx` is NOT recognised as
   * build output and a build artifact leaks into a craft run.
   */
  files: Readonly<Record<string, readonly string[]>>;
}

/** Inputs that tune a single resolution. */
export interface CraftReviewOptions {
  /**
   * Cap on domains wired BY THIS CALL (default {@link DEFAULT_MAX_CRAFT_DOMAINS}).
   *
   * PER-CALL, NOT PER-DIFF — decided deliberately (spec I3). Autopilot resolves
   * at two review moments, so a phase can dispatch up to 2x this number unless
   * the caller threads {@link CraftReviewOptions.alreadyRanFor}. The alternative,
   * a per-diff budget, would make the second review moment blind to a domain
   * that genuinely should re-run after the first one's fixes landed — and this
   * module is pure, so it cannot carry state between calls to enforce it anyway.
   * The spec's Budget section states the per-call semantics and the 2x ceiling.
   */
  maxDomains?: number;
  /**
   * Domains the CALLER knows already ran for this same changed-file set; each is
   * skipped with reason `already-run`. Matched by bare name, so a
   * plugin-qualified entry works. This is the once-per-phase-per-diff control
   * (spec D10 / criterion 11): autopilot passes the domains wired at
   * `after:REVIEW` when it resolves again at `after:FINAL_REVIEW`. Omit it and
   * each review moment gets its own full budget.
   */
  alreadyRanFor?: readonly string[];
  /**
   * Domains the project declared ITSELF in `skillHooks` at this host/event,
   * including entries parked with `enabled: false`. Each is skipped with reason
   * `project-declared` so the project's own entry wins and the craft default
   * does not double-wire.
   *
   * This is an INPUT to the plan rather than a filter applied afterwards,
   * because the budget is applied inside the same loop: a domain removed after
   * the fact has already consumed a slot, and `skipped` would then report
   * `over-budget` for a domain while a slot was in fact free. See divergence 4.
   */
  declaredSkills?: readonly string[];
}

/** True only for an event the given host actually wires (spec D4). */
function isCraftReviewEvent(hostSkill: string, event: string): boolean {
  // Object.hasOwn, not a bare index: a host named `constructor`, `toString`,
  // `valueOf` or `__proto__` would otherwise resolve an INHERITED member and
  // then throw `events.includes is not a function`. The documented contract is
  // that an unknown host yields an empty plan, and Phase 3 may iterate
  // user-authored `config.skillHooks` keys.
  if (!Object.hasOwn(CRAFT_REVIEW_EVENTS_BY_HOST, hostSkill)) return false;
  const events = (CRAFT_REVIEW_EVENTS_BY_HOST as Record<string, readonly string[]>)[hostSkill];
  return Array.isArray(events) && events.includes(event);
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
  // Copy UNCONDITIONALLY. Aliasing the caller's Set is safe only while this
  // function stays read-only; the moment it grows a `set.add(...)` it would
  // mutate the caller's collection — in practice a module-level test fixture
  // shared by every case in the suite. No static rule can catch that: the
  // declaration lives in the test file and the mutation would live here.
  const set = new Set<string>(avail);
  const bare = new Set<string>();
  for (const entry of set) bare.add(bareSkillName(entry));
  return (skill) => set.has(skill) || bare.has(skill);
}

/**
 * True when at least one file the domain OWNS is in a language the domain can
 * extract. Prose domains ({@link CRAFT_ANY_LANGUAGE}) are never language-gated.
 * This runs over the owned subset on purpose — see {@link CraftDomainRule.owns}.
 */
function hasSupportedLanguage(rule: CraftDomainRule, ownedFiles: readonly string[]): boolean {
  if (rule.supportedLanguages === CRAFT_ANY_LANGUAGE) return true;
  const supported = new Set<SupportedLanguage>(rule.supportedLanguages);
  return ownedFiles.some((file) => {
    const language = detectLanguage(file);
    return language !== null && supported.has(language);
  });
}

/**
 * Plan craft's default domains for `hostSkill` at `event`, given the diff and
 * which skills are installed.
 *
 * Skip-reason precedence (every link pinned by a test, so a reorder is
 * deliberate): `not-activated` (surface) -> `unsupported-language` (capability)
 * -> `not-installed` (availability) -> `already-run` -> `project-declared` ->
 * `over-budget`.
 *
 * BUDGET IS LAST, AND THAT IS THE POINT: every reason that can suppress a domain
 * is evaluated first, so a suppressed domain never consumes a slot and `skipped`
 * never reports `over-budget` while a slot was in fact free. Each earlier stage
 * means "it was never going to run"; the budget alone means "it would have run,
 * but there was no room".
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
  opts?: CraftReviewOptions
): CraftReviewPlan {
  if (!isCraftReviewEvent(hostSkill, event)) {
    return { wired: [], skipped: [], expected: [], files: {} };
  }

  const expected = CRAFT_REVIEW_DOMAINS.map((domain) => domain.skill);

  if (changedFiles === undefined) {
    return {
      wired: [],
      skipped: expected.map((skill) => ({ skill, reason: 'no-diff-context' as const })),
      expected,
      files: {},
    };
  }

  const files = changedFiles.map(normalizePath);
  const isInstalled = toAvailabilityPredicate(availableSkills);
  const alreadyRan = new Set((opts?.alreadyRanFor ?? []).map(bareSkillName));
  const declared = new Set((opts?.declaredSkills ?? []).map(bareSkillName));
  // Clamp: a negative or fractional cap must mean "no slots", never "unbounded".
  // NaN/Infinity fall back to the default rather than to 0 or to unbounded:
  // `wired.length >= NaN` is ALWAYS false, so an unguarded NaN wires every
  // activated domain — the exact outcome this clamp exists to forbid, and a
  // realistic one once a cap is configurable via `Number(process.env.X)`.
  const requested = opts?.maxDomains;
  const maxDomains = Number.isFinite(requested)
    ? Math.max(0, Math.trunc(requested as number))
    : DEFAULT_MAX_CRAFT_DOMAINS;
  const wired: NormalizedHook[] = [];
  const skipped: CraftReviewSkip[] = [];
  const ownedBySkill: Record<string, readonly string[]> = {};

  for (const rule of CRAFT_REVIEW_DOMAINS) {
    const owned = rule.owns(files);
    if (owned.length === 0) {
      skipped.push({ skill: rule.skill, reason: 'not-activated' });
      continue;
    }
    if (!hasSupportedLanguage(rule, owned)) {
      skipped.push({ skill: rule.skill, reason: 'unsupported-language' });
      continue;
    }
    if (!isInstalled(rule.skill)) {
      skipped.push({ skill: rule.skill, reason: 'not-installed' });
      continue;
    }
    if (alreadyRan.has(bareSkillName(rule.skill))) {
      skipped.push({ skill: rule.skill, reason: 'already-run' });
      continue;
    }
    // AHEAD OF THE BUDGET, deliberately. A project that declared this domain
    // itself gets its own entry; the craft default must not also wire, and must
    // not burn a slot on its way to being dropped. See divergence 4.
    if (declared.has(bareSkillName(rule.skill))) {
      skipped.push({ skill: rule.skill, reason: 'project-declared' });
      continue;
    }
    if (wired.length >= maxDomains) {
      skipped.push({ skill: rule.skill, reason: 'over-budget' });
      continue;
    }
    // NON-BLOCKING, deliberately. NOT `defaultBlocking(event)` — see divergence 1.
    wired.push({ type: 'skill', skill: rule.skill, blocking: false });
    ownedBySkill[rule.skill] = owned;
  }

  return { wired, skipped, expected, files: ownedBySkill };
}

/**
 * Skill names a project DECLARES at `skillName`/`event`, including entries parked
 * with `enabled: false`. Deliberately the RAW declared set (not the
 * post-`enabled`-filter set `resolveSkillHooks` returns): a project that parks a
 * domain with `{ type: "skill", skill: "code-craft", enabled: false }` has
 * expressed an explicit opt-out, so the craft default for that name must be
 * dropped rather than silently re-injected.
 */
function declaredSkillNames(
  config: SkillHooksConfigHolder | null | undefined,
  skillName: string,
  event: string
): Set<string> {
  const entries = config?.skillHooks?.[skillName]?.[event];
  const names = new Set<string>();
  if (!Array.isArray(entries)) return names;
  for (const entry of entries as SkillHookEntry[]) {
    if (typeof entry === 'string') {
      names.add(entry);
    } else if (entry.type === 'skill' && typeof entry.skill === 'string') {
      names.add(entry.skill);
    }
  }
  return names;
}

/**
 * The EFFECTIVE review hooks for `skillName` at `event`: the project's configured
 * `skillHooks` (via `resolveSkillHooks`) FOLLOWED BY the activated, installed
 * craft defaults ({@link planCraftReviewDomains}).
 *
 * Ordering: configured hooks first (a project's explicit intent leads), craft
 * defaults appended NON-BLOCKING. A craft default whose domain is already
 * DECLARED at this event is never planned — the project's entry wins, whether
 * written bare, canonical or plugin-qualified, and `enabled: false` parks it for
 * good. The declaration is fed to {@link planCraftReviewDomains} as
 * `declaredSkills` rather than filtered out afterwards, so a declared domain
 * never consumes a budget slot on its way to being dropped (divergence 4).
 *
 * A craft default that is not activated, not installed, over budget or
 * unreadable is never emitted here — it is reported in
 * {@link planCraftReviewDomains}'s `skipped`, so a host never hard-halts on a
 * harness-optimistic default while it keeps hard-halting on an unresolvable
 * USER-declared hook (which flows through `resolveSkillHooks` untouched).
 *
 * When nothing activates this returns exactly `resolveSkillHooks(...)` — the
 * no-regression guarantee, mirroring the canary contract.
 */
export function resolveReviewHooksWithCraft(
  config: SkillHooksConfigHolder | null | undefined,
  skillName: string,
  event: string,
  opts: CraftReviewOptions & {
    changedFiles?: readonly string[];
    availableSkills?: SkillAvailability;
  }
): NormalizedHook[] {
  const configured = resolveSkillHooks(config, skillName, event);

  // Craft defaults only attach where a host actually wires them; any other
  // host/event pair is returned untouched.
  if (!isCraftReviewEvent(skillName, event)) return configured;

  // The project's declarations go IN as a planning input, not on as a filter
  // afterwards. Dedup is by BARE name, so a declaration written bare or
  // plugin-qualified both suppress the default; `harness-design-craft` has no
  // colon, so its canonical prefix survives normalization and naming it
  // `design-craft` does NOT suppress it.
  //
  // `opts` is spread rather than rebuilt field by field: under
  // `exactOptionalPropertyTypes`, `{ maxDomains: opts.maxDomains }` widens an
  // ABSENT key to an explicit `undefined`, which is a different type.
  const plan = planCraftReviewDomains(skillName, event, opts.changedFiles, opts.availableSkills, {
    ...opts,
    declaredSkills: [...declaredSkillNames(config, skillName, event)],
  });

  // A straight append: the plan already excluded every declared domain, so no
  // post-filter is needed and the plan's denominator is true by construction.
  return plan.wired.length === 0 ? configured : [...configured, ...plan.wired];
}
