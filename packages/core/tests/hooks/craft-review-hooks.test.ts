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
      'naming-craft',
      'security-craft',
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

  it('gates source domains on all six supported languages and prose domains on none', () => {
    for (const skill of ['code-craft', 'test-craft', 'naming-craft', 'security-craft']) {
      expect([...(DOMAIN(skill).supportedLanguages as string[])].sort()).toEqual([
        'go',
        'java',
        'javascript',
        'python',
        'rust',
        'typescript',
      ]);
    }
    expect(DOMAIN('harness-design-craft').supportedLanguages).toEqual(['typescript', 'javascript']);
    expect(DOMAIN('cli-ergonomics-craft').supportedLanguages).toEqual(['typescript', 'javascript']);
    for (const skill of ['api-craft', 'spec-craft', 'docs-craft', 'knowledge-craft']) {
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
    for (const [host, events] of Object.entries(CRAFT_REVIEW_EVENTS_BY_HOST)) {
      for (const event of events) {
        const plan = planCraftReviewDomains(host, event, TSX_DIFF, DESIGN_ONLY);
        expect(plan.wired).toEqual([
          { type: 'skill', skill: 'harness-design-craft', blocking: false },
        ]);
      }
    }
  });

  it('returns a FULLY empty plan at an event the host does not wire', () => {
    // after:mechanical belongs to code-review; after:REVIEW to autopilot. Crossed
    // over, neither wires — and `expected` is empty too, so a host that never
    // resolves craft reports no denominator rather than a misleading 0/10.
    expect(
      planCraftReviewDomains('harness-autopilot', 'after:mechanical', TSX_DIFF, DESIGN_ONLY)
    ).toEqual({ wired: [], skipped: [], expected: [] });
    expect(
      planCraftReviewDomains('harness-code-review', 'after:REVIEW', TSX_DIFF, DESIGN_ONLY)
    ).toEqual({ wired: [], skipped: [], expected: [] });
    for (const event of ['before:EXECUTE', 'after:VERIFY', 'on:failure']) {
      expect(planCraftReviewDomains('harness-autopilot', event, TSX_DIFF, DESIGN_ONLY)).toEqual({
        wired: [],
        skipped: [],
        expected: [],
      });
    }
  });

  it('returns a fully empty plan for an unknown host skill', () => {
    expect(planCraftReviewDomains('harness-tdd', 'after:REVIEW', TSX_DIFF, DESIGN_ONLY)).toEqual({
      wired: [],
      skipped: [],
      expected: [],
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

  it('skips a ts/js-only domain on a Python file it owns, and does not wire it', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['packages/cli/src/commands/run.py'],
      CLI_ONLY
    );
    expect(reasonsFor(plan.skipped, 'cli-ergonomics-craft')).toEqual(['unsupported-language']);
    expect(plan.wired).toEqual([]);

    // POSITIVE CONTROL at the same scope: the same CLI path in a supported
    // language WIRES. Without this, a green could mean "the resolver never ran".
    const control = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['packages/cli/src/commands/run.ts'],
      CLI_ONLY
    );
    expect(control.wired).toEqual([
      { type: 'skill', skill: 'cli-ergonomics-craft', blocking: false },
    ]);
  });

  it('skips design-craft on a stylesheet-only diff, and wires it when a .tsx joins', () => {
    const cssOnly = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/ui/button.module.css'],
      ALL_CRAFT_INSTALLED
    );
    expect(reasonsFor(cssOnly.skipped, 'harness-design-craft')).toEqual(['unsupported-language']);

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
    // A .ts elsewhere in the diff must NOT satisfy cli-ergonomics-craft's gate for
    // the Python command module it owns.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['packages/cli/src/commands/run.py', 'src/services/user.ts'],
      ALL_CRAFT_INSTALLED
    );
    expect(reasonsFor(plan.skipped, 'cli-ergonomics-craft')).toEqual(['unsupported-language']);
    // Same call, positive control: code-craft owns the .ts and the .py and wires.
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
    // Precedence pin: cli-ergonomics-craft is neither installed nor able to read
    // Python. `unsupported-language` is the more informative reason and wins.
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['packages/cli/src/commands/run.py'],
      new Set()
    );
    expect(reasonsFor(plan.skipped, 'cli-ergonomics-craft')).toEqual(['unsupported-language']);
  });

  it('reports surface BEFORE capability when both would skip', () => {
    const plan = planCraftReviewDomains(
      'harness-autopilot',
      'after:REVIEW',
      ['src/a.py'],
      ALL_CRAFT_INSTALLED
    );
    expect(reasonsFor(plan.skipped, 'harness-design-craft')).toEqual(['not-activated']);
  });

  it('reports exactly one reason per expected domain, and nothing outside expected', () => {
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

// A diff that activates FIVE installed domains: design(1), code(2), test(3),
// naming(4), security(5).
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
      'naming-craft',
      'security-craft',
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
    expect(wiredNames(plan)).toEqual(['code-craft', 'naming-craft', 'security-craft']);
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
      },
    };
    const baseline = (event: string) => resolveSkillHooks(config, 'harness-autopilot', event);

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
    ).toEqual(resolveSkillHooks(config, 'harness-tdd', 'after:REVIEW'));

    // POSITIVE CONTROL: the same config DOES gain a craft default when it can.
    expect(
      resolveReviewHooksWithCraft(config, 'harness-autopilot', 'after:REVIEW', {
        changedFiles: TSX_DIFF,
        availableSkills: ALL_CRAFT_INSTALLED,
      }).length
    ).toBeGreaterThan(baseline('after:REVIEW').length);
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
    const declaring = (entry: SkillHookEntry) =>
      resolveReviewHooksWithCraft(
        { skillHooks: { 'harness-autopilot': { 'after:REVIEW': [entry] } } },
        'harness-autopilot',
        'after:REVIEW',
        { changedFiles: TSX_DIFF, availableSkills: ALL_CRAFT_INSTALLED, maxDomains: 1 }
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
      expect(
        hooks.filter((h) => h.type === 'skill' && h.skill.endsWith('harness-design-craft'))
      ).toHaveLength(1);
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
        { changedFiles: ['src/a.ts'], availableSkills: ALL_CRAFT_INSTALLED, maxDomains: 1 }
      );
      expect(hooks).toEqual([{ type: 'skill', skill: 'code-craft', blocking: true }]);
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
    // Mutation M5 (adding `import { readFileSync } from 'node:fs'`) must turn
    // this red. Comment lines are stripped so the header's own prose about
    // the file system / process does not trip it.
    for (const forbidden of ["from 'node:", 'require(', 'process.', 'child_process', "'fs'"]) {
      expect(code).not.toContain(forbidden);
    }
    // Positive control: the stripper did not eat the file.
    expect(code).toContain('export function planCraftReviewDomains');
  });

  it('imports only skill-lifecycle, the canary twin’s type, and code-nav types', () => {
    const imported = [...source.matchAll(/^import .*?from '([^']+)';$/gm)].map((m) => m[1]);
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
