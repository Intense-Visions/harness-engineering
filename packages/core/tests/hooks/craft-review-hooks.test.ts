import { describe, it, expect } from 'vitest';
import {
  CRAFT_ANY_LANGUAGE,
  CRAFT_DOMAINS_NOT_ACTIVATED_V1,
  CRAFT_REVIEW_DOMAINS,
  CRAFT_REVIEW_EVENTS_BY_HOST,
  DEFAULT_MAX_CRAFT_DOMAINS,
  planCraftReviewDomains,
} from '../../src/hooks/craft-review-hooks';
import { defaultBlocking } from '../../src/hooks/skill-lifecycle';

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
