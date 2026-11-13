import { describe, it, expect } from 'vitest';
import {
  CRAFT_ANY_LANGUAGE,
  CRAFT_DOMAINS_NOT_ACTIVATED_V1,
  CRAFT_REVIEW_DOMAINS,
  CRAFT_REVIEW_EVENTS_BY_HOST,
  DEFAULT_MAX_CRAFT_DOMAINS,
} from '../../src/hooks/craft-review-hooks';

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
