import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  CRAFT_ANY_LANGUAGE,
  CRAFT_DOMAINS_NOT_ACTIVATED_V1,
  CRAFT_REVIEW_DOMAINS,
  CRAFT_REVIEW_EVENTS_BY_HOST,
  DEFAULT_MAX_CRAFT_DOMAINS,
  planCraftReviewDomains,
  resolveReviewHooksWithCraft,
  type CraftReviewPlan,
} from '../../src/hooks/craft-review-hooks';
import {
  defaultBlocking,
  resolveSkillHooks,
  type SkillHookEntry,
  type SkillHooksConfigHolder,
} from '../../src/hooks/skill-lifecycle';

/**
 * Craft auto-wiring at the review moment (spec:
 * docs/changes/auto-wire-craft-at-review/proposal.md, Phase 1).
 *
 * The structural twin is canary-review-hooks.test.ts. THREE divergences are
 * pinned here deliberately, because an implementer copying canary gets all
 * three wrong:
 *   1. craft hooks are NON-BLOCKING (canary uses defaultBlocking);
 *   2. events are PER-HOST, not one global list;
 *   3. activation is capability-gated BEFORE dispatch — a domain that cannot
 *      read the diff's languages is an explicit skip, never an empty finding set.
 *
 * Every assertion of an absence is paired with a positive control at the same
 * scope: "zero craft hooks" next to a case that produces non-zero, so a green
 * cannot mean "the resolver never ran".
 */

const DOMAIN = (skill: string) => {
  const rule = CRAFT_REVIEW_DOMAINS.find((d) => d.skill === skill);
  if (!rule) throw new Error(`no craft domain rule for ${skill}`);
  return rule;
};

describe('CRAFT_REVIEW_DOMAINS table', () => {
  it('declares exactly the ten v1 domains, in priority order, under canonical names', () => {
    expect(CRAFT_REVIEW_DOMAINS.map((d) => d.skill)).toEqual([
      'harness-design-craft',
      'code-craft',
      'test-craft',
      'security-craft',
      'naming-craft',
      'cli-ergonomics-craft',
      'api-craft',
      'spec-craft',
      'docs-craft',
      'knowledge-craft',
    ]);
    expect(CRAFT_REVIEW_DOMAINS.map((d) => d.priority)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('declaration order IS priority order (a future reorder must be deliberate)', () => {
    const sorted = [...CRAFT_REVIEW_DOMAINS].sort((a, b) => a.priority - b.priority);
    expect(sorted.map((d) => d.skill)).toEqual(CRAFT_REVIEW_DOMAINS.map((d) => d.skill));
  });

  it('carries the harness- prefix on design-craft ONLY (the dedup asymmetry)', () => {
    const prefixed = CRAFT_REVIEW_DOMAINS.filter((d) => d.skill.startsWith('harness-'));
    expect(prefixed.map((d) => d.skill)).toEqual(['harness-design-craft']);
  });

  it('omits copy-craft from activation and names the omission explicitly', () => {
    expect(CRAFT_REVIEW_DOMAINS.map((d) => d.skill)).not.toContain('copy-craft');
    expect(CRAFT_DOMAINS_NOT_ACTIVATED_V1).toEqual(['copy-craft']);
  });

  it('language-gates ONLY the four unit-extraction domains; every other domain is any', () => {
    // THE RULE (spec: the language gate applies only to domains that parse
    // source into units). Asserted as a PARTITION of the whole table rather than
    // a per-domain list, so widening or narrowing any domain shows up here.
    const gated = CRAFT_REVIEW_DOMAINS.filter(
      (d) => d.supportedLanguages !== CRAFT_ANY_LANGUAGE
    ).map((d) => d.skill);
    expect([...gated].sort()).toEqual([
      'code-craft',
      'naming-craft',
      'security-craft',
      'test-craft',
    ]);

    // Each gated domain reads all six languages code-nav supports.
    for (const skill of gated) {
      expect([...(DOMAIN(skill).supportedLanguages as string[])].sort()).toEqual([
        'go',
        'java',
        'javascript',
        'python',
        'rust',
        'typescript',
      ]);
    }

    // Every surface-bound domain is `any` — its `owns` predicate IS the gate.
    // design-craft and cli-ergonomics-craft are named explicitly because they
    // are the two a reader is most tempted to "fix" back toward ts/js.
    for (const skill of [
      'harness-design-craft',
      'cli-ergonomics-craft',
      'api-craft',
      'spec-craft',
      'docs-craft',
      'knowledge-craft',
    ]) {
      expect(DOMAIN(skill).supportedLanguages).toBe(CRAFT_ANY_LANGUAGE);
    }
  });

  it('wires each host to exactly the events that host declares', () => {
    expect(CRAFT_REVIEW_EVENTS_BY_HOST).toEqual({
      'harness-autopilot': ['after:REVIEW', 'after:FINAL_REVIEW'],
      'harness-code-review': ['after:mechanical'],
    });
  });

  it('defaults the domain budget to 3', () => {
    expect(DEFAULT_MAX_CRAFT_DOMAINS).toBe(3);
  });
});

describe('domain surface predicates (owns returns the OWNED SUBSET)', () => {
  it('design-craft owns non-excluded .tsx, stylesheets and design tokens', () => {
    expect(
      DOMAIN('harness-design-craft').owns([
        'src/ui/Button.tsx',
        'src/ui/button.module.css',
        'design-tokens.json',
        'src/ui/Button.test.tsx',
        'dist/ui/Button.tsx',
        'src/server/handler.ts',
      ])
    ).toEqual(['src/ui/Button.tsx', 'src/ui/button.module.css', 'design-tokens.json']);
  });

  it('design-craft owns nothing in a server-only diff (positive control above)', () => {
    expect(DOMAIN('harness-design-craft').owns(['src/server/handler.ts'])).toEqual([]);
  });

  it('code-craft owns production source in every supported language', () => {
    expect(
      DOMAIN('code-craft').owns([
        'src/a.ts',
        'src/b.js',
        'src/c.py',
        'src/d.go',
        'src/e.rs',
        'src/F.java',
      ])
    ).toHaveLength(6);
  });

  it('code-craft owns no test, declaration, generated or build file', () => {
    expect(
      DOMAIN('code-craft').owns([
        'src/a.test.ts',
        'src/__tests__/b.ts',
        'packages/core/tests/hooks/c.ts',
        'src/types.d.ts',
        'src/schema.generated.ts',
        'dist/a.js',
        'pnpm-lock.yaml',
        'README.md',
      ])
    ).toEqual([]);
    // Positive control at the same scope: one production file in the same list.
    expect(DOMAIN('code-craft').owns(['src/a.test.ts', 'src/a.ts'])).toEqual(['src/a.ts']);
  });

  it('test-craft owns each language’s test convention', () => {
    expect(
      DOMAIN('test-craft').owns([
        'src/a.test.ts',
        'src/b.spec.tsx',
        'src/__tests__/c.js',
        'packages/core/tests/hooks/d.ts',
        'app/test_views.py',
        'app/views_test.py',
        'pkg/server_test.go',
        'src/test/java/com/x/AThingTest.java',
        'src/a.ts',
      ])
    ).toEqual([
      'src/a.test.ts',
      'src/b.spec.tsx',
      'src/__tests__/c.js',
      'packages/core/tests/hooks/d.ts',
      'app/test_views.py',
      'app/views_test.py',
      'pkg/server_test.go',
      'src/test/java/com/x/AThingTest.java',
    ]);
  });

  it('cli-ergonomics-craft owns CLI command modules only', () => {
    expect(
      DOMAIN('cli-ergonomics-craft').owns([
        'packages/cli/src/commands/validate.ts',
        'src/bin/tool.js',
        'cmd/root.go',
        'src/services/user.ts',
      ])
    ).toEqual(['packages/cli/src/commands/validate.ts', 'src/bin/tool.js', 'cmd/root.go']);
  });

  it('api-craft owns OpenAPI documents only', () => {
    expect(
      DOMAIN('api-craft').owns([
        'openapi.yaml',
        'docs/api/swagger.json',
        'spec/openapi-v2.yml',
        'src/api.ts',
      ])
    ).toEqual(['openapi.yaml', 'docs/api/swagger.json', 'spec/openapi-v2.yml']);
  });

  it('spec-craft owns change proposals only', () => {
    expect(
      DOMAIN('spec-craft').owns([
        'docs/changes/a-feature/proposal.md',
        'docs/changes/a-feature/plans/p.md',
        'docs/guide.md',
      ])
    ).toEqual(['docs/changes/a-feature/proposal.md']);
  });

  it('docs-craft owns docs/** and markdown outside docs/changes/**', () => {
    expect(
      DOMAIN('docs-craft').owns([
        'docs/guide.md',
        'README.md',
        'docs/knowledge/a.md',
        'docs/changes/a-feature/proposal.md',
        'src/a.ts',
      ])
    ).toEqual(['docs/guide.md', 'README.md', 'docs/knowledge/a.md']);
  });

  it('knowledge-craft owns docs/knowledge/** (overlapping docs-craft, per the spec table)', () => {
    expect(DOMAIN('knowledge-craft').owns(['docs/knowledge/a.md', 'docs/guide.md'])).toEqual([
      'docs/knowledge/a.md',
    ]);
  });
});

const TSX_DIFF = ['src/ui/Button.tsx'];
const DESIGN_ONLY = new Set<string>(['harness-design-craft']);
const ALL_CRAFT_INSTALLED = new Set<string>(CRAFT_REVIEW_DOMAINS.map((d) => d.skill));
const ALL_DOMAIN_NAMES = CRAFT_REVIEW_DOMAINS.map((d) => d.skill);
const reasonsFor = (skipped: readonly { skill: string; reason: string }[], skill: string) =>
  skipped.filter((s) => s.skill === skill).map((s) => s.reason);

describe('planCraftReviewDomains — host/event gate', () => {
  it('activates an installed owning domain at each host’s own events', () => {
    // [F-3] Pin the denominator BEFORE iterating. Every assertion below lives
    // inside the loop, so without this a dropped host or event silently stops
    // being covered while the test stays green.
    const hostEvents = Object.entries(CRAFT_REVIEW_EVENTS_BY_HOST);
    expect(hostEvents).toEqual([
      ['harness-autopilot', ['after:REVIEW', 'after:FINAL_REVIEW']],
      ['harness-code-review', ['after:mechanical']],
    ]);

    let asserted = 0;
    for (const [host, events] of hostEvents) {
      for (const event of events) {
        const plan = planCraftReviewDomains(host, event, TSX_DIFF, DESIGN_ONLY);
        expect(plan.wired, `${host} @ ${event}`).toEqual([
          { type: 'skill', skill: 'harness-design-craft', blocking: false },
        ]);
        asserted += 1;
      }
    }
    // The loop actually ran, for all three host/event pairs.
    expect(asserted).toBe(3);
  });

  it('returns a FULLY empty plan at an event the host does not wire', () => {
    // after:mechanical belongs to code-review; after:REVIEW to autopilot. Crossed
    // over, neither wires — and `expected` is empty too, so a host that never
    // resolves craft reports no denominator rather than a misleading 0/10.
    expect(
      planCraftReviewDomains('harness-autopilot', 'after:mechanical', TSX_DIFF, DESIGN_ONLY)
    ).toEqual({ wired: [], skipped: [], expected: [], files: {} });
    expect(
      planCraftReviewDomains('harness-code-review', 'after:REVIEW', TSX_DIFF, DESIGN_ONLY)
    ).toEqual({ wired: [], skipped: [], expected: [], files: {} });
    for (const event of ['before:EXECUTE', 'after:VERIFY', 'on:failure']) {
      expect(planCraftReviewDomains('harness-autopilot', event, TSX_DIFF, DESIGN_ONLY)).toEqual({
        wired: [],
        skipped: [],
        expected: [],
        files: {},
      });
    }
  });

  it('returns a fully empty plan for an unknown host skill', () => {
    expect(planCraftReviewDomains('harness-tdd', 'after:REVIEW', TSX_DIFF, DESIGN_ONLY)).toEqual({
      wired: [],
      skipped: [],
      expected: [],
      files: {},
    });
    // Positive control at the same scope: the known host DOES wire.
    expect(
      planCraftReviewDomains('harness-autopilot', 'after:REVIEW', TSX_DIFF, DESIGN_ONLY).wired
    ).toHaveLength(1);
  });
});

describe('planCraftReviewDomains — no diff context (spec criterion 12)', () => {
  it('activates nothing and reports every domain as no-diff-context', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      undefined,
      ALL_CRAFT_INSTALLED
    );
    expect(plan.wired).toEqual([]);
    expect(plan.expected).toEqual(ALL_DOMAIN_NAMES);
    // The non-empty skipped list is the load-bearing assertion: an empty one
    // would mean the gate never ran. Mutation M3 (returning a fully empty plan)
    // must turn this red.
    expect(plan.skipped).toEqual(
      ALL_DOMAIN_NAMES.map((skill) => ({ skill, reason: 'no-diff-context' }))
    );

    // POSITIVE CONTROL, same scope, same availability: a DEFINED diff wires.
    const control = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      TSX_DIFF,
      ALL_CRAFT_INSTALLED
    );
    expect(control.wired.length).toBeGreaterThan(0);
  });

  it('distinguishes an EMPTY diff (not-activated) from an ABSENT diff (no-diff-context)', () => {
    const empty = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      [],
      ALL_CRAFT_INSTALLED
    );
    expect(empty.wired).toEqual([]);
    expect(new Set(empty.skipped.map((s) => s.reason))).toEqual(new Set(['not-activated']));
  });
});

describe('planCraftReviewDomains — availability (spec D7)', () => {
  it('skips an owning domain whose skill is not installed', () => {
    const plan = planCraftReviewDomains('harness-autopilot', 'after:REVIEW', TSX_DIFF, new Set());
    expect(plan.wired).toEqual([]);
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['not-installed']);
  });

  it('treats unknown availability (undefined) as not installed — never optimistic', () => {
    const plan = planCraftReviewDomains('harness-autopilot', 'after:REVIEW', TSX_DIFF);
    expect(plan.wired).toEqual([]);
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['not-installed']);
  });

  it('accepts an array and a predicate, and matches a plugin-qualified catalog', () => {
    expect(
      planCraftReviewDomains('harness-autopilot', 'after:REVIEW', TSX_DIFF, [
        'harness-design-craft',
      ]).wired
    ).toHaveLength(1);
    expect(
      planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        TSX_DIFF,
        (s) => s === 'harness-claude:harness-design-craft'
      ).wired
    ).toHaveLength(1);
    expect(
      planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        TSX_DIFF,
        new Set(['harness-claude:skills:claude-code:harness-design-craft:harness-design-craft'])
      ).wired
    ).toHaveLength(1);
  });

  it('normalizes Windows separators and ./ prefixes before matching surfaces', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['.\\src\\ui\\Button.tsx'],
      DESIGN_ONLY
    );
    expect(plan.wired).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: false }]);
  });

  it('[F1] folds separators for a PATH-ANCHORED surface, not just an extension one', () => {
    // The .tsx fixture above cannot detect a broken normalizePath: `/\.tsx$/` is
    // separator-insensitive, so `return file;` keeps it green. spec-craft is
    // anchored on the whole path (`^docs\/changes\/.+\/proposal\.md$`), so it
    // wires ONLY if the backslashes were folded. Phase 3 forwards these exact
    // strings as `files`, which is why this matters beyond activation.
    const SPEC_ONLY = new Set<string>(['spec-craft']);
    const win = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['docs\\changes\\x\\proposal.md'],
      SPEC_ONLY
    );
    expect(win.wired).toEqual([{ type: 'skill', skill: 'spec-craft', blocking: false }]);

    // `./` prefix, same anchored surface.
    const dotSlash = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['./docs/changes/x/proposal.md'],
      SPEC_ONLY
    );
    expect(dotSlash.wired).toEqual([{ type: 'skill', skill: 'spec-craft', blocking: false }]);

    // NEGATIVE CONTROL: normalization must not make every path match.
    const unrelated = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['docs\\guide.md'],
      SPEC_ONLY
    );
    expect(unrelated.wired).toEqual([]);
  });

  it('[F4] probes every documented plugin-qualified form of a PREDICATE catalog', () => {
    // A Set/array is normalized by bareSkillName, so it never touches
    // CRAFT_SKILL_PROBE_FORMS. Only a PREDICATE exercises them — which makes
    // these three the actual coverage. Deleting any form must turn this red.
    const forms = [
      'harness-design-craft',
      'harness-claude:harness-design-craft',
      'harness-claude:skills:claude-code:harness-design-craft:harness-design-craft',
    ];
    for (const form of forms) {
      const plan = planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        TSX_DIFF,
        (s) => s === form
      );
      expect(plan.wired, `catalog reporting only "${form}" must still resolve`).toEqual([
        { type: 'skill', skill: 'harness-design-craft', blocking: false },
      ]);
    }

    // NEGATIVE CONTROL: a predicate that matches no known form skips, so the
    // probe list is not simply answering true.
    const none = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      TSX_DIFF,
      (s) => s === 'some-other-plugin:harness-design-craft'
    );
    expect(none.wired).toEqual([]);
    expect(reasonsFor(none.skipped, 'harness-design-craft')).toEqual(['not-installed']);
  });
});

describe('craft hooks are NON-BLOCKING (spec criterion 3)', () => {
  // DIVERGENCE 1 from the canary twin. Canary wires detectors with
  // defaultBlocking(event), which is TRUE at both autopilot review events.
  // Craft is advisory (spec D2). Mutation M1 — replacing the literal
  // `blocking: false` with `defaultBlocking(event)` — MUST turn this red.
  it('emits blocking:false at BOTH autopilot review events, where the default is true', () => {
    expect(defaultBlocking('after:REVIEW')).toBe(true); // positive control
    expect(defaultBlocking('after:FINAL_REVIEW')).toBe(true); // positive control
    for (const event of ['after:REVIEW', 'after:FINAL_REVIEW']) {
      const plan = planCraftReviewDomains(
        'harness-autopilot',
        event,
        ['src/ui/Button.tsx', 'src/a.ts'],
        ALL_CRAFT_INSTALLED
      );
      expect(plan.wired.length).toBeGreaterThan(0);
      for (const hook of plan.wired) {
        expect(hook).toMatchObject({ type: 'skill', blocking: false });
      }
    }
  });
});

describe('capability gate (spec criterion 9) — unsupported-language is EXPLICIT', () => {
  // DIVERGENCE 3. A domain that cannot extract the languages of the files IT OWNS
  // is skipped BEFORE dispatch. An empty finding set is never an acceptable
  // substitute: it is indistinguishable from "this code is fine".
  // Scoped to cli-ergonomics-craft ALONE so the budget cap cannot be mistaken
  // for the capability gate: with the full catalog installed, code/naming/security
  // fill all three slots before cli-ergonomics-craft is reached.
  const CLI_ONLY = new Set<string>(['cli-ergonomics-craft']);

  it('wires cli-ergonomics-craft on a PYTHON CLI module it owns (surface-bound)', () => {
    // cli-ergonomics-craft critiques a command's ergonomics — flags, naming,
    // help text — which is not language-specific. A Python or Go command module
    // is squarely its surface, so it must WIRE, not report unsupported-language.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['packages/cli/src/commands/run.py'],
      CLI_ONLY
    );
    expect(plan.wired).toEqual([{ type: 'skill', skill: 'cli-ergonomics-craft', blocking: false }]);
    expect(reasonsFor(plan.skipped, 'cli-ergonomics-craft')).toEqual([]);

    // Same scope, a language code-nav DOES parse: wires identically. The pair
    // shows the result does not depend on whether detectLanguage knows the file.
    const ts = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['packages/cli/src/commands/run.ts'],
      CLI_ONLY
    );
    expect(ts.wired).toEqual([{ type: 'skill', skill: 'cli-ergonomics-craft', blocking: false }]);

    // NEGATIVE CONTROL at the same scope: a non-command Python module is NOT
    // cli-ergonomics-craft's surface, so it still reports a skip. Without this,
    // a green here could mean "every domain wires unconditionally".
    const notACommand = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/services/user.py'],
      CLI_ONLY
    );
    expect(notACommand.wired).toEqual([]);
    expect(reasonsFor(notACommand.skipped, 'cli-ergonomics-craft')).toEqual(['not-activated']);
  });

  it('wires cli-ergonomics-craft on shell and Ruby CLI modules (no back-door language gate)', () => {
    // REGRESSION GUARD. `owns` used to be
    // `isProductionSource(f) && CLI_COMMAND_PATTERN.test(f)`, and
    // isProductionSource requires `detectLanguage(f) !== null`. That put the
    // language gate back on the BACK DOOR: `.sh` and `.rb` are not in
    // EXTENSION_MAP, so a shell or Ruby CLI reported `not-activated` while the
    // domain advertised CRAFT_ANY_LANGUAGE. Restoring isProductionSource here
    // must turn this red.
    for (const file of ['cmd/root.sh', 'bin/tool.rb', 'packages/cli/src/commands/deploy.sh']) {
      const plan = planCraftReviewDomains('harness-autopilot', 'after:REVIEW', [file], CLI_ONLY);
      expect(plan.wired, `expected ${file} to wire cli-ergonomics-craft`).toEqual([
        { type: 'skill', skill: 'cli-ergonomics-craft', blocking: false },
      ]);
    }

    // NEGATIVE CONTROL at the same scope: a shell script OUTSIDE a command
    // directory is not its surface, so the predicate has not simply gone true.
    const notACommand = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['scripts/deploy.sh'],
      CLI_ONLY
    );
    expect(notACommand.wired).toEqual([]);
    expect(reasonsFor(notACommand.skipped, 'cli-ergonomics-craft')).toEqual(['not-activated']);

    // And a TEST file inside a command directory is still excluded.
    const testInCmd = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['packages/cli/src/commands/__tests__/deploy.sh'],
      CLI_ONLY
    );
    expect(reasonsFor(testInCmd.skipped, 'cli-ergonomics-craft')).toEqual(['not-activated']);
  });

  it('[COST OF THE D-2 WIDENING] owns EVERY file type under a command directory', () => {
    // Pinned so the trade-off is visible rather than discovered later.
    // CLI_COMMAND_PATTERN is a DIRECTORY pattern, not a filename pattern like
    // api-craft's. Dropping the isProductionSource filter is what lets `.sh` and
    // `.rb` through (the point of D-2), but it necessarily also admits prose and
    // data files that merely LIVE under cli/, commands/, cmd/ or bin/.
    //
    // `docs/cli/guide.md` is arguably fair game — CLI help text is squarely
    // cli-ergonomics-craft's concern — but `messages.json` and `data.yaml` are
    // data, not commands. If this proves noisy in practice, the fix is to
    // intersect with a command-ish extension set, NOT to restore
    // isExtractableSource (that would re-break shell and Ruby).
    //
    // TRACKING: narrowing this is Phase 3's call, recorded in the spec's
    // Activation section under the cli-ergonomics-craft predicate note. If you
    // are here because Phase 3 narrowed the predicate and this went red, that is
    // the intended signal — update the expectation, do not widen it back.
    const cli = DOMAIN('cli-ergonomics-craft');
    expect(
      cli.owns([
        'cmd/root.sh',
        'bin/tool.rb',
        'docs/cli/guide.md',
        'src/cli/messages.json',
        'src/bin/data.yaml',
        'src/services/user.ts',
      ])
    ).toEqual([
      'cmd/root.sh',
      'bin/tool.rb',
      'docs/cli/guide.md',
      'src/cli/messages.json',
      'src/bin/data.yaml',
    ]);
  });

  it('WIRES design-craft on a stylesheet-only diff (CSS is its surface, not an incapacity)', () => {
    // THE MOTIVATING CASE for this feature: someone changes UI, design-craft
    // runs. EXTENSION_MAP maps no `.css`, so a language gate here would make the
    // one case that prompted the work never fire. design-craft is surface-bound.
    const cssOnly = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/ui/button.module.css', 'tests/fixtures/data.json'],
      ALL_CRAFT_INSTALLED
    );
    expect(cssOnly.wired.map((h) => h.type === 'skill' && h.skill)).toContain(
      'harness-design-craft'
    );
    expect(reasonsFor(cssOnly.skipped, 'harness-design-craft')).toEqual([]);

    // POSITIVE CONTROL AT THE SAME SCOPE, in the SAME call: test-craft owns
    // `tests/fixtures/data.json` by path but cannot extract units from it, so it
    // still reports an explicit `unsupported-language`. A gate that reported
    // nothing at all — i.e. a dead gate — fails this line.
    expect(reasonsFor(cssOnly.skipped, 'test-craft')).toEqual(['unsupported-language']);

    const withTsx = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/ui/button.module.css', 'src/ui/Button.tsx'],
      ALL_CRAFT_INSTALLED
    );
    expect(withTsx.wired.map((h) => h.type === 'skill' && h.skill)).toContain(
      'harness-design-craft'
    );
  });

  it('gates on the OWNED subset, not on any file in the diff', () => {
    // A .ts elsewhere in the diff must NOT satisfy test-craft's gate for the
    // JSON fixture it owns. test-craft carries this because its `owns` is
    // path-based (isTestFile), so it CAN own a file detectLanguage cannot read —
    // unlike code/naming/security, whose `owns` already implies a known language.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['tests/fixtures/data.json', 'src/a.ts'],
      ALL_CRAFT_INSTALLED
    );
    expect(reasonsFor(plan.skipped, 'test-craft')).toEqual(['unsupported-language']);
    // Same call, positive control: code-craft owns the .ts and wires.
    expect(plan.wired.map((h) => h.type === 'skill' && h.skill)).toContain('code-craft');
  });

  it('never language-gates a prose domain', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['docs/guide.md'],
      ALL_CRAFT_INSTALLED
    );
    expect(plan.wired.map((h) => h.type === 'skill' && h.skill)).toContain('docs-craft');
    expect(reasonsFor(plan.skipped, 'docs-craft')).toEqual([]);
  });

  it('reports capability BEFORE availability when both would skip', () => {
    // Precedence pin: test-craft is neither installed nor able to extract units
    // from a JSON fixture. `unsupported-language` is the more informative reason
    // and wins.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['tests/fixtures/data.json'],
      new Set()
    );
    expect(reasonsFor(plan.skipped, 'test-craft')).toEqual(['unsupported-language']);
  });

  it('reports surface BEFORE capability when both would skip', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/a.py'],
      ALL_CRAFT_INSTALLED
    );
    // [F-2] This first assertion does NOT pin precedence and must not be read as
    // if it did: design-craft is CRAFT_ANY_LANGUAGE, so hasSupportedLanguage
    // returns true unconditionally and `unsupported-language` is unreachable for
    // it under ANY gate ordering. What it pins is narrower and still worth
    // having — a surface-bound domain that owns nothing reports `not-activated`.
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['not-activated']);
    // THIS is the half that pins the precedence. test-craft is language-gated, so
    // both branches are reachable for it: owning nothing must report
    // `not-activated`, never `unsupported-language`.
    expect(reasonsFor(plan.skipped, 'test-craft')).toEqual(['not-activated']);
  });

  it('accounts for every domain in the table exactly once, and nothing outside it', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/ui/Button.tsx', 'src/a.py', 'docs/guide.md'],
      ALL_CRAFT_INSTALLED
    );
    const accounted = [
      ...plan.wired.map((h) => (h.type === 'skill' ? h.skill : '')),
      ...plan.skipped.map((s) => s.skill),
    ];
    expect([...accounted].sort()).toEqual([...ALL_DOMAIN_NAMES].sort());
  });
});

describe('[I2] the plan carries the owned file subset (criterion 4)', () => {
  it('keys the NORMALIZED owned subset by skill for every wired domain', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/ui/Button.tsx', 'src/a.ts', 'docs/guide.md'],
      ALL_CRAFT_INSTALLED
    );
    // Exactly the wired domains, no more: `files` is the host's forwarding
    // contract, so an entry for a domain that did not run would be a dispatch
    // instruction for something that never happened.
    expect(Object.keys(plan.files).sort()).toEqual([...wiredNames(plan)].sort());
    expect(plan.files['harness-design-craft']).toEqual(['src/ui/Button.tsx']);
    expect(plan.files['code-craft']).toEqual(['src/ui/Button.tsx', 'src/a.ts']);
  });

  it('carries POSIX paths even when the diff arrives with backslashes', () => {
    // THE POINT OF CARRYING THEM. Phase 3 forwards plan.files; it must not call
    // rule.owns() on raw VCS output.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['docs\\changes\\x\\proposal.md'],
      new Set(['spec-craft'])
    );
    expect(plan.files['spec-craft']).toEqual(['docs/changes/x/proposal.md']);
  });

  it('is empty for a plan that wires nothing, and for an unwired host/event', () => {
    const nothing = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      [],
      ALL_CRAFT_INSTALLED
    );
    expect(nothing.files).toEqual({});
    const unwired = planCraftReviewDomains(
      'harness-tdd',
      'after:REVIEW',
      TSX_DIFF,
      ALL_CRAFT_INSTALLED
    );
    expect(unwired.files).toEqual({});
    // Positive control: the same shape DOES carry files when a domain wires.
    const wired = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      TSX_DIFF,
      DESIGN_ONLY
    );
    expect(wired.files).toEqual({ 'harness-design-craft': ['src/ui/Button.tsx'] });
  });

  it('documents WHY owns() is not the host API: it is unsafe on raw paths', () => {
    // Both directions, measured. These are the behaviours that make
    // plan.files necessary — not a convenience.
    // (a) false NEGATIVE: anchored patterns miss a backslash path.
    expect(DOMAIN('spec-craft').owns(['docs\\changes\\x\\proposal.md'])).toEqual([]);
    // (b) false POSITIVE, the dangerous one: EXCLUDED_PATH_PATTERNS is
    // `/`-anchored, so a build artifact is NOT recognised as build output.
    expect(DOMAIN('harness-design-craft').owns(['dist\\ui\\Button.tsx'])).toEqual([
      'dist\\ui\\Button.tsx',
    ]);
    // ...and the plan, which normalizes first, excludes it. This pair is the
    // whole argument for criterion 4 reading plan.files.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['dist\\ui\\Button.tsx'],
      ALL_CRAFT_INSTALLED
    );
    expect(plan.wired).toEqual([]);
    expect(plan.files).toEqual({});
  });
});

describe('[S1/S2] hostile inputs', () => {
  it('[S1] an inherited Object.prototype key is an unknown host, not a crash', () => {
    for (const host of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      expect(() =>
        planCraftReviewDomains(host, 'after:REVIEW', TSX_DIFF, ALL_CRAFT_INSTALLED)
      ).not.toThrow();
      expect(
        planCraftReviewDomains(host, 'after:REVIEW', TSX_DIFF, ALL_CRAFT_INSTALLED),
        `host "${host}" must yield a fully empty plan`
      ).toEqual({ wired: [], skipped: [], expected: [], files: {} });
    }
    // Positive control: a real host still resolves.
    expect(
      planCraftReviewDomains('harness-autopilot', 'after:REVIEW', TSX_DIFF, DESIGN_ONLY).wired
    ).toHaveLength(1);
  });

  it('[S2] a non-finite maxDomains falls back to the default, never to unbounded', () => {
    // `wired.length >= NaN` is ALWAYS false, so an unguarded NaN wires EVERY
    // activated domain — the precise outcome the clamp's own comment forbids.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const plan = planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        FIVE_ACTIVATING,
        ALL_CRAFT_INSTALLED,
        { maxDomains: bad }
      );
      expect(plan.wired, `maxDomains ${String(bad)}`).toHaveLength(DEFAULT_MAX_CRAFT_DOMAINS);
    }
    // Positive control at the same scope: a finite cap is still honoured.
    expect(
      planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        FIVE_ACTIVATING,
        ALL_CRAFT_INSTALLED,
        { maxDomains: 1 }
      ).wired
    ).toHaveLength(1);
  });
});

describe('[S4] docs-craft owns PROSE, not everything under docs/', () => {
  it('excludes images, data, test fixtures and generated harness state', () => {
    expect(
      DOMAIN('docs-craft').owns([
        'docs/guide.md',
        'README.md',
        'docs/assets/diagram.png',
        'docs/data.json',
        'tests/fixtures/README.md',
        '.harness/comprehension/packages/core/src/hooks/_module.md',
      ])
    ).toEqual(['docs/guide.md', 'README.md']);
  });

  it('does not activate docs-craft on a comprehension-shard regeneration', () => {
    // In THIS repo every commit regenerates `_module.md` shards. Without the
    // `.harness/` exclusion, docs-craft activated on harness's own bookkeeping
    // on literally every review.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['.harness/comprehension/packages/core/src/hooks/_module.md'],
      ALL_CRAFT_INSTALLED
    );
    expect(plan.wired).toEqual([]);
    // Positive control at the same scope: a real prose change DOES activate it.
    const real = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['docs/guide.md'],
      ALL_CRAFT_INSTALLED
    );
    expect(real.wired.map((h) => h.type === 'skill' && h.skill)).toContain('docs-craft');
  });
});

describe('[F6] owns path-guards', () => {
  it('api-craft excludes a build-output OpenAPI document', () => {
    const API_ONLY = new Set<string>(['api-craft']);
    const excluded = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['dist/openapi.yaml'],
      API_ONLY
    );
    expect(excluded.wired).toEqual([]);
    expect(reasonsFor(excluded.skipped, 'api-craft')).toEqual(['not-activated']);

    // POSITIVE CONTROL at the same scope: the same filename outside dist/ wires.
    const kept = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['openapi.yaml'],
      API_ONLY
    );
    expect(kept.wired).toEqual([{ type: 'skill', skill: 'api-craft', blocking: false }]);
  });

  it('spec-craft anchors docs/changes at the REPO ROOT, not anywhere in the path', () => {
    const SPEC_ONLY = new Set<string>(['spec-craft']);
    const nested = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['a/docs/changes/x/proposal.md'],
      SPEC_ONLY
    );
    expect(nested.wired).toEqual([]);
    expect(reasonsFor(nested.skipped, 'spec-craft')).toEqual(['not-activated']);

    // POSITIVE CONTROL at the same scope: the root-anchored path wires.
    const rooted = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['docs/changes/x/proposal.md'],
      SPEC_ONLY
    );
    expect(rooted.wired).toEqual([{ type: 'skill', skill: 'spec-craft', blocking: false }]);
  });
});

describe('copy-craft is deliberately not activated in v1', () => {
  it('never appears in wired or skipped for any diff shape', () => {
    const diffs: string[][] = [
      ['src/errors.ts'],
      ['src/ui/Button.tsx'],
      ['docs/guide.md'],
      ['docs/changes/x/proposal.md'],
      ['src/cli/messages.ts'],
      [],
    ];
    for (const diff of diffs) {
      const plan = planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        diff,
        new Set([...ALL_CRAFT_INSTALLED, 'copy-craft'])
      );
      const named = [
        ...plan.wired.map((h) => (h.type === 'skill' ? h.skill : '')),
        ...plan.skipped.map((s) => s.skill),
        ...plan.expected,
      ];
      expect(named).not.toContain('copy-craft');
    }
    // Positive control: the same installed catalog DOES wire other domains.
    expect(
      planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        ['src/errors.ts'],
        new Set([...ALL_CRAFT_INSTALLED, 'copy-craft'])
      ).wired.length
    ).toBeGreaterThan(0);
  });
});

// A diff that activates FIVE installed domains, in TABLE order:
// design(1), code(2), test(3), SECURITY(4), NAMING(5).
// security is fourth and naming fifth — see the D-5 swap. Getting this backwards
// in a comment invites a maintainer to "correct" the table and silently make
// security-craft unreachable on the commonest diff shape.
const FIVE_ACTIVATING = ['src/ui/Button.tsx', 'src/a.ts', 'src/a.test.ts'];
const wiredNames = (plan: CraftReviewPlan): string[] =>
  plan.wired.flatMap((hook) => (hook.type === 'skill' ? [hook.skill] : []));

describe('budget cap (spec criterion 7)', () => {
  it('wires at most 3 domains by default, in declared priority order', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      ALL_CRAFT_INSTALLED
    );
    expect(wiredNames(plan)).toEqual(['harness-design-craft', 'code-craft', 'test-craft']);
    expect(reasonsFor(plan.skipped, 'naming-craft')).toEqual(['over-budget']);
    expect(reasonsFor(plan.skipped, 'security-craft')).toEqual(['over-budget']);
  });

  it('honors an explicit maxDomains, and 0 wires nothing', () => {
    const none = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      ALL_CRAFT_INSTALLED,
      { maxDomains: 0 }
    );
    expect(none.wired).toEqual([]);
    expect(reasonsFor(none.skipped, 'harness-design-craft')).toEqual(['over-budget']);

    // POSITIVE CONTROL at the same scope: maxDomains 1 wires exactly the top priority.
    const one = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      ALL_CRAFT_INSTALLED,
      { maxDomains: 1 }
    );
    expect(wiredNames(one)).toEqual(['harness-design-craft']);
  });

  it('does not cap below the activated set when maxDomains is generous', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      ALL_CRAFT_INSTALLED,
      { maxDomains: 99 }
    );
    expect(wiredNames(plan)).toEqual([
      'harness-design-craft',
      'code-craft',
      'test-craft',
      'security-craft',
      'naming-craft',
    ]);
    expect(plan.skipped.some((s) => s.reason === 'over-budget')).toBe(false);
  });

  it('never spends a budget slot on a domain that would be skipped anyway', () => {
    // design + test not installed; code, naming, security are. With a cap of 3,
    // all three INSTALLED domains must wire — a slot consumed by a skip would
    // silently drop security-craft.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      new Set(['code-craft', 'naming-craft', 'security-craft'])
    );
    expect(wiredNames(plan)).toEqual(['code-craft', 'security-craft', 'naming-craft']);
  });

  it('[D-5] reaches security-craft on a plain source+tests diff', () => {
    // THE MEASURED CONSEQUENCE of the priority order. The default budget of 3 is
    // spent by code + test + ONE more, so whichever of security/naming is fourth
    // is unreachable on the most common diff shape there is. security-craft is
    // ahead deliberately; swapping the two back must turn this red.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/a.ts', 'src/a.test.ts'],
      ALL_CRAFT_INSTALLED
    );
    expect(wiredNames(plan)).toEqual(['code-craft', 'test-craft', 'security-craft']);
    expect(reasonsFor(plan.skipped, 'naming-craft')).toEqual(['over-budget']);
  });

  it('[F5] clamps a fractional or negative maxDomains — never unbounded', () => {
    const frac = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      ALL_CRAFT_INSTALLED,
      { maxDomains: 2.5 }
    );
    // Math.trunc(2.5) === 2. WITHOUT the trunc, `wired.length >= 2.5` is false at
    // 2, so a third domain slips through — the cap silently becomes 3.
    expect(wiredNames(frac)).toEqual(['harness-design-craft', 'code-craft']);

    // A negative cap means NO slots, never "unbounded".
    const neg = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      ALL_CRAFT_INSTALLED,
      { maxDomains: -1 }
    );
    expect(neg.wired).toEqual([]);
    expect(reasonsFor(neg.skipped, 'harness-design-craft')).toEqual(['over-budget']);
  });
});

describe('already-run (spec D10 input)', () => {
  it('skips a domain listed in alreadyRanFor, and wires it without the list', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:FINAL_REVIEW',
      TSX_DIFF,
      ALL_CRAFT_INSTALLED,
      { alreadyRanFor: ['harness-design-craft'] }
    );
    expect(wiredNames(plan)).not.toContain('harness-design-craft');
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['already-run']);

    // POSITIVE CONTROL at the same scope.
    const control = planCraftReviewDomains(
      'harness-autopilot',
      'after:FINAL_REVIEW',
      TSX_DIFF,
      ALL_CRAFT_INSTALLED
    );
    expect(wiredNames(control)).toContain('harness-design-craft');
  });

  it('matches alreadyRanFor entries by bare name (plugin-qualified included)', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:FINAL_REVIEW',
      TSX_DIFF,
      ALL_CRAFT_INSTALLED,
      { alreadyRanFor: ['harness-claude:harness-design-craft'] }
    );
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['already-run']);
  });

  it('[F3] reports already-run ahead of over-budget', () => {
    // Completes the precedence chain the resolver's JSDoc claims is "pinned by a
    // test": not-activated -> unsupported-language -> not-installed ->
    // already-run -> over-budget. With maxDomains 1, design-craft takes the only
    // slot, so code-craft is BOTH already-run and out of budget. Swapping the two
    // blocks in the loop must turn this red; before this fixture the swap was
    // invisible and the JSDoc claim was false.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      FIVE_ACTIVATING,
      ALL_CRAFT_INSTALLED,
      { maxDomains: 1, alreadyRanFor: ['code-craft'] }
    );
    expect(wiredNames(plan)).toEqual(['harness-design-craft']);
    expect(reasonsFor(plan.skipped, 'code-craft')).toEqual(['already-run']);
    // Positive control at the same scope: a domain that is ONLY out of budget
    // still reports over-budget, so the two reasons remain distinguishable.
    expect(reasonsFor(plan.skipped, 'test-craft')).toEqual(['over-budget']);
  });

  it('reports not-installed ahead of already-run', () => {
    const plan = planCraftReviewDomains('harness-autopilot', 'after:REVIEW', TSX_DIFF, new Set(), {
      alreadyRanFor: ['harness-design-craft'],
    });
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['not-installed']);
  });
});

describe('resolveReviewHooksWithCraft', () => {
  it('appends non-blocking craft defaults after the project’s configured hooks', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'after:REVIEW': [
            { type: 'prompt', text: 'Prefer existing helpers.' },
            { type: 'skill', skill: 'my-domain-reviewer', blocking: true },
          ],
        },
      },
    };
    // DESIGN_ONLY, not ALL_CRAFT_INSTALLED: `src/ui/Button.tsx` is production
    // source, so code-craft and naming-craft own it too and the budget would
    // wire three defaults. This test is about MERGE ORDER (configured hooks
    // lead, craft appended non-blocking); the priority/budget behaviour is
    // pinned separately in "budget cap (spec criterion 7)".
    const hooks = resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
      changedFiles: TSX_DIFF,
      availableSkills: DESIGN_ONLY,
    });
    expect(hooks).toEqual([
      { type: 'prompt', text: 'Prefer existing helpers.' },
      { type: 'skill', skill: 'my-domain-reviewer', blocking: true },
      { type: 'skill', skill: 'harness-design-craft', blocking: false },
    ]);
  });

  it('wires an activated installed domain with no skillHooks config at all (criterion 13)', () => {
    for (const config of [undefined, null, {}, { skillHooks: {} }]) {
      const hooks = resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        changedFiles: TSX_DIFF,
        availableSkills: DESIGN_ONLY,
      });
      expect(hooks).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: false }]);
    }
  });

  it('wires at the code-review host’s after:mechanical event', () => {
    const hooks = resolveReviewHooksWithCraft(
      undefined,
      'harness-code-review',
      'after:mechanical',
      {
        changedFiles: TSX_DIFF,
        availableSkills: DESIGN_ONLY,
      }
    );
    expect(hooks).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: false }]);
  });

  it('returns exactly resolveSkillHooks when nothing activates (criterion 8)', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'after:REVIEW': ['my-domain-reviewer'],
          'before:EXECUTE': ['preflight'],
        },
        // [F-1] harness-tdd MUST declare hooks of its own. Without this, case (d)
        // below compares [] against [] — the unknown-host pass-through it claims
        // to check is unobservable, and a resolver that DISCARDS every configured
        // hook for an unknown host still passes.
        'harness-tdd': { 'after:REVIEW': ['my-domain-reviewer'] },
      },
    };

    // Every comparison below must have a NON-EMPTY right-hand side. An empty one
    // degenerates to expect([]).toEqual([]), which asserts nothing about
    // pass-through. This guard is what makes criterion 8 falsifiable.
    const nonEmpty = (hooks: readonly unknown[]) => {
      expect(hooks.length, 'criterion-8 fixture must not be empty').toBeGreaterThan(0);
      return hooks;
    };
    const baseline = (event: string) =>
      nonEmpty(resolveSkillHooks(config, 'harness-autopilot', event));

    // (a) no diff context
    expect(
      resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        availableSkills: ALL_CRAFT_INSTALLED,
      })
    ).toEqual(baseline('after:REVIEW'));
    // (b) nothing installed
    expect(
      resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        changedFiles: TSX_DIFF,
        availableSkills: new Set(),
      })
    ).toEqual(baseline('after:REVIEW'));
    // (c) an event the host does not wire craft at
    expect(
      resolveReviewHooksWithCraft(config, 'harness-autopilot', 'before:EXECUTE', {
        changedFiles: TSX_DIFF,
        availableSkills: ALL_CRAFT_INSTALLED,
      })
    ).toEqual(baseline('before:EXECUTE'));
    // (d) an unknown host skill
    expect(
      resolveReviewHooksWithCraft(config, 'harness-tdd', 'after:REVIEW', {
        changedFiles: TSX_DIFF,
        availableSkills: ALL_CRAFT_INSTALLED,
      })
    ).toEqual(nonEmpty(resolveSkillHooks(config, 'harness-tdd', 'after:REVIEW')));

    // POSITIVE CONTROL: the same config DOES gain a craft default when it can.
    expect(
      resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        changedFiles: TSX_DIFF,
        availableSkills: ALL_CRAFT_INSTALLED,
      }).length
    ).toBeGreaterThan(baseline('after:REVIEW').length);
  });

  it('[F-1] passes a configured hook through for a host craft never attaches to', () => {
    // Stated as its own law rather than only as case (d) above. The documented
    // contract is that an unknown host is returned UNTOUCHED — not emptied. A
    // resolver that returns [] for an unrecognised host silently discards every
    // skillHooks entry the project declared.
    const config: SkillHooksConfigHolder = {
      skillHooks: { 'harness-tdd': { 'after:REVIEW': ['my-domain-reviewer', 'another-reviewer'] } },
    };
    const hooks = resolveReviewHooksWithCraft(config, 'harness-tdd', 'after:REVIEW', {
      changedFiles: TSX_DIFF,
      availableSkills: ALL_CRAFT_INSTALLED,
    });
    expect(hooks).toEqual([
      { type: 'skill', skill: 'my-domain-reviewer', blocking: true },
      { type: 'skill', skill: 'another-reviewer', blocking: true },
    ]);
    // ...and no craft default is injected at a host craft does not wire.
    expect(hooks).toHaveLength(2);
  });

  it('a USER-declared hook flows through regardless of availability (host hard-halts, not us)', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: { 'harness-autopilot': { 'after:REVIEW': ['my-typo-reviewer'] } },
    };
    expect(
      resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        changedFiles: TSX_DIFF,
        availableSkills: new Set(),
      })
    ).toEqual([{ type: 'skill', skill: 'my-typo-reviewer', blocking: true }]);
  });

  describe('dedup by canonical name (criterion 6)', () => {
    // `maxDomains: 1` keeps harness-design-craft (priority 1) the ONLY default in
    // play, so a dedup assertion cannot be confused with a budget skip.
    // Isolated by AVAILABILITY (only design-craft installed) rather than by
    // `maxDomains: 1`. Both isolate dedup from the budget, but the cap also hid
    // I1 — the interaction between them — so the interaction is now covered by
    // its own sibling test below while these stay single-variable.
    const declaring = (entry: SkillHookEntry) =>
      resolveReviewHooksWithCraft(
        { skillHooks: { 'harness-autopilot': { 'after:REVIEW': [entry] } } },
        'harness-autopilot',
        'after:REVIEW',
        { changedFiles: TSX_DIFF, availableSkills: DESIGN_ONLY }
      );

    it('drops the default when the project declares the CANONICAL name', () => {
      const hooks = declaring({ type: 'skill', skill: 'harness-design-craft', blocking: true });
      expect(hooks).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: true }]);
    });

    it('drops the default for a bare-string declaration', () => {
      const hooks = declaring('harness-design-craft');
      expect(hooks).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: true }]);
    });

    it('drops the default for a plugin-qualified declaration', () => {
      const hooks = declaring({ type: 'skill', skill: 'harness-claude:harness-design-craft' });
      // Pinned by identity, not by a count: a `.filter(...).toHaveLength(1)`
      // passes even if the surviving entry is the WRONG one, or has lost the
      // blocking value the project declared.
      expect(hooks).toEqual([
        { type: 'skill', skill: 'harness-claude:harness-design-craft', blocking: true },
      ]);
    });

    it('honors enabled:false as an opt-out — the default is not re-injected', () => {
      const hooks = declaring({ type: 'skill', skill: 'harness-design-craft', enabled: false });
      expect(hooks).toEqual([]);
    });

    it('does NOT suppress the default when the project names the domain WRONG', () => {
      // THE PREFIX ASYMMETRY. harness-design-craft is the only craft skill whose
      // canonical name carries the `harness-` prefix; the other ten are bare. A
      // project writing `design-craft` has not named this domain, so the default
      // must still wire — a silent suppression here is the failure the spec's
      // [IMPORTANT] note calls out.
      const hooks = declaring('design-craft');
      expect(hooks).toEqual([
        { type: 'skill', skill: 'design-craft', blocking: true },
        { type: 'skill', skill: 'harness-design-craft', blocking: false },
      ]);
    });

    it('dedups a bare craft name (the other ten carry no prefix)', () => {
      const hooks = resolveReviewHooksWithCraft(
        { skillHooks: { 'harness-autopilot': { 'after:REVIEW': ['code-craft'] } } },
        'harness-autopilot',
        'after:REVIEW',
        { changedFiles: ['src/a.ts'], availableSkills: new Set(['code-craft']) }
      );
      expect(hooks).toEqual([{ type: 'skill', skill: 'code-craft', blocking: true }]);
    });

    it('[I1] a project-declared domain does NOT consume a budget slot', () => {
      // THE INTERACTION the isolated tests above deliberately exclude, and the
      // reason dedup had to move INSIDE the budget loop.
      //
      // Declaring code-craft parks it. With dedup applied AFTER the loop,
      // code-craft took slot 2 and was then filtered out, so only 2 hooks
      // survived, security-craft was reported `over-budget` while a slot was in
      // fact free, and plan.wired claimed code-craft ran when it never attached.
      // proposal.md: "Budget is last so a domain that would have been skipped
      // anyway never consumes a slot."
      const config: SkillHooksConfigHolder = {
        skillHooks: {
          'harness-autopilot': {
            'after:REVIEW': [{ type: 'skill', skill: 'code-craft', enabled: false }],
          },
        },
      };
      const hooks = resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        changedFiles: FIVE_ACTIVATING,
        availableSkills: ALL_CRAFT_INSTALLED,
      });
      // The freed slot goes to the next domain in priority order, so the review
      // still gets its full budget of three.
      expect(hooks).toEqual([
        { type: 'skill', skill: 'harness-design-craft', blocking: false },
        { type: 'skill', skill: 'test-craft', blocking: false },
        { type: 'skill', skill: 'security-craft', blocking: false },
      ]);
    });

    it('[I1] the plan denominator matches what actually attached', () => {
      // The other half of I1: the PLAN must not claim a declared domain was
      // wired, and must not blame the budget for a slot that was free.
      const plan = planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        FIVE_ACTIVATING,
        ALL_CRAFT_INSTALLED,
        { declaredSkills: ['code-craft'] }
      );
      expect(wiredNames(plan)).toEqual(['harness-design-craft', 'test-craft', 'security-craft']);
      expect(reasonsFor(plan.skipped, 'code-craft')).toEqual(['project-declared']);
      // naming-craft is the ONLY genuinely over-budget domain here.
      expect(plan.skipped.filter((x) => x.reason === 'over-budget').map((x) => x.skill)).toEqual([
        'naming-craft',
      ]);
      // Positive control: without the declaration, code-craft wires and
      // security-craft is the one displaced.
      const control = planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        FIVE_ACTIVATING,
        ALL_CRAFT_INSTALLED
      );
      expect(wiredNames(control)).toEqual(['harness-design-craft', 'code-craft', 'test-craft']);
    });

    it('[I1] project-declared is reported AHEAD of over-budget', () => {
      // Precedence pin for the new stage: with one slot, a declared domain that
      // is ALSO out of budget must report the more informative reason.
      const plan = planCraftReviewDomains(
        'harness-autopilot',
        'after:REVIEW',
        FIVE_ACTIVATING,
        ALL_CRAFT_INSTALLED,
        { maxDomains: 1, declaredSkills: ['test-craft'] }
      );
      expect(reasonsFor(plan.skipped, 'test-craft')).toEqual(['project-declared']);
      expect(reasonsFor(plan.skipped, 'security-craft')).toEqual(['over-budget']);
    });

    it('does not dedup against a declaration at a DIFFERENT event', () => {
      const hooks = resolveReviewHooksWithCraft(
        { skillHooks: { 'harness-autopilot': { 'after:FINAL_REVIEW': ['harness-design-craft'] } } },
        'harness-autopilot',
        'after:REVIEW',
        { changedFiles: TSX_DIFF, availableSkills: DESIGN_ONLY }
      );
      expect(hooks).toEqual([{ type: 'skill', skill: 'harness-design-craft', blocking: false }]);
    });
  });
});

describe('module laws', () => {
  const sourcePath = fileURLToPath(
    new URL('../../src/hooks/craft-review-hooks.ts', import.meta.url)
  );
  const source = readFileSync(sourcePath, 'utf8');
  const code = source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

  it('is pure and IO-free: no node builtins, no process, no require', () => {
    // Mutation M5 (adding a `node:fs` import) must turn this red. Comment lines
    // are stripped so the header's own prose about the file system does not
    // trip it.
    //
    // REGEX, not substring: the previous single-quote-only `toContain` checks
    // left `from "node:fs"` and `await import(\`node:fs\`)` GREEN. Prettier would
    // rewrite the first on commit but never the second, so the real enforcement
    // was prettier, not this law. Both quote styles and dynamic import now count.
    const forbidden: readonly { label: string; re: RegExp }[] = [
      {
        label: 'node: builtin (static or dynamic, any quote style)',
        re: /(?:from|import\s*\()\s*['"\`]node:/,
      },
      {
        label: 'bare builtin module (fs, child_process)',
        re: /(?:from|import\s*\()\s*['"\`](?:fs|child_process)['"\`]/,
      },
      { label: 'require(', re: /\brequire\s*\(/ },
      { label: 'process.', re: /\bprocess\s*\./ },
    ];
    for (const { label, re } of forbidden) {
      expect(code, `module must stay pure and IO-free: found ${label}`).not.toMatch(re);
    }
    // Positive control: the stripper did not eat the file.
    expect(code).toContain('export function planCraftReviewDomains');
    // Positive control on the PATTERNS themselves: each must match the thing it
    // is supposed to catch, or a green above means only that the regex is broken.
    expect(`import { readFileSync } from "node:fs";`).toMatch(forbidden[0].re);
    expect('await import(`node:fs`)').toMatch(forbidden[0].re);
    expect(`import { readFileSync } from 'fs';`).toMatch(forbidden[1].re);
    expect('const x = require("fs");').toMatch(forbidden[2].re);
    expect('process.cwd()').toMatch(forbidden[3].re);
  });

  it('imports only skill-lifecycle, the canary twin’s type, and code-nav types', () => {
    // Either quote style, for the same reason the purity law above accepts both.
    const imported = [...source.matchAll(/^import .*?from ['"]([^'"]+)['"];$/gm)].map((m) => m[1]);
    // Positive control: all four import statements were matched. A prettier wrap
    // onto a second line would otherwise silently shrink this list to a passing
    // subset — the regex is single-line by design.
    expect(imported).toHaveLength(4);
    expect([...new Set(imported)].sort()).toEqual([
      '../code-nav/types',
      './canary-review-hooks',
      './skill-lifecycle',
    ]);
  });

  it('[PHASE BOUNDARY] is not exported from hooks/index.ts yet — Phase 3 owns the barrel', () => {
    // Phase 1 is inert by design: no barrel export, no host wiring, no craft
    // SKILL.md edit. Phase 3 INVERTS this assertion when it adds the export and
    // regenerates the root barrel via scripts/generate-core-barrel.mjs. Delete it
    // there deliberately; do not delete it to make a red go away.
    const barrel = readFileSync(
      fileURLToPath(new URL('../../src/hooks/index.ts', import.meta.url)),
      'utf8'
    );
    expect(barrel).not.toContain('craft-review-hooks');
    // Positive control: the barrel DOES export the canary twin, so a wrong path
    // or an empty read cannot pass this test.
    expect(barrel).toContain('canary-review-hooks');
  });
});
