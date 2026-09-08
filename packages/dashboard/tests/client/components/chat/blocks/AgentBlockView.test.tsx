import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { expectRenderedOnce, expectNotRendered } from './render-assertions';
import React from 'react';
import { AgentBlockView } from '../../../../../src/client/components/chat/blocks/AgentBlockView';
import type { ToolUseBlock } from '../../../../../src/client/types/chat';

/**
 * Characterization tests for AgentBlockView — the framed card for a subagent
 * dispatch or a skill invocation, including how it routes a structured result
 * to a specialized viewer instead of the markdown fallback.
 */

function agentBlock(overrides: Partial<ToolUseBlock> = {}): ToolUseBlock {
  return { kind: 'tool_use', tool: 'Agent', ...overrides };
}

const findingsResult = JSON.stringify({
  findings: [
    { ruleId: 'SEC-INJ-001', ruleName: 'SQL injection via string concat', severity: 'error' },
  ],
  summary: { errors: 1, warnings: 0, info: 0 },
});

const adviseResult = JSON.stringify({
  featureName: 'checkout flow',
  apply: [{ skill: 'harness-tdd', score: 0.9, when: 'on new feature', reasons: ['adds behavior'] }],
});

const impactResult = JSON.stringify({
  targetNodeId: 'src/app.ts',
  impact: { direct: [], transitive: [] },
});

describe('AgentBlockView', () => {
  describe('subagent titling', () => {
    it('names the subagent from subagent_type', () => {
      const args = JSON.stringify({ subagent_type: 'Explore' });
      render(<AgentBlockView block={agentBlock({ args })} />);
      expectRenderedOnce('Subagent: Explore');
    });

    it('falls back to the "type" field when subagent_type is absent', () => {
      const args = JSON.stringify({ type: 'general-purpose' });
      render(<AgentBlockView block={agentBlock({ args })} />);
      expectRenderedOnce('Subagent: general-purpose');
    });

    it('falls back to "Execution" when no type is given at all', () => {
      render(<AgentBlockView block={agentBlock()} />);
      expectRenderedOnce('Subagent: Execution');
    });

    it('falls back to "Execution" when the args are unparseable', () => {
      render(<AgentBlockView block={agentBlock({ args: 'not json' })} />);
      expectRenderedOnce('Subagent: Execution');
    });
  });

  describe('skill titling', () => {
    it('names the skill from the skill argument', () => {
      const args = JSON.stringify({ skill: 'harness:tdd' });
      render(<AgentBlockView block={agentBlock({ tool: 'skill', args })} />);
      expectRenderedOnce('Skill: harness:tdd');
    });

    it('treats a harness-prefixed tool name as a skill and uses its suffix', () => {
      render(<AgentBlockView block={agentBlock({ tool: 'harness:test-craft' })} />);
      expectRenderedOnce('Skill: test-craft');
    });

    it('prefers an explicit skill argument over the harness-prefixed tool suffix', () => {
      const args = JSON.stringify({ skill: 'explicit-name' });
      render(<AgentBlockView block={agentBlock({ tool: 'harness:test-craft', args })} />);
      expectRenderedOnce('Skill: explicit-name');
    });

    it('falls back to "Execution" for a bare skill tool with no skill argument', () => {
      render(<AgentBlockView block={agentBlock({ tool: 'skill' })} />);
      expectRenderedOnce('Skill: Execution');
    });

    it('QUIRK: the harness prefix is matched case-insensitively but the suffix keeps its original case', () => {
      render(<AgentBlockView block={agentBlock({ tool: 'HARNESS:Test-Craft' })} />);
      expectRenderedOnce('Skill: Test-Craft');
    });
  });

  describe('running / error state', () => {
    it('shows a running indicator while there is no result', () => {
      render(<AgentBlockView block={agentBlock()} />);
      expectRenderedOnce('Running...');
    });

    it('drops the running indicator once a result arrives', () => {
      render(<AgentBlockView block={agentBlock({ result: 'all done' })} />);
      expectNotRendered('Running...');
    });

    it('shows an error flag when the call errored', () => {
      render(<AgentBlockView block={agentBlock({ isError: true })} />);
      expectRenderedOnce('Error');
    });

    it('QUIRK: an errored call with no result shows Error but not Running', () => {
      render(<AgentBlockView block={agentBlock({ isError: true })} />);
      expectNotRendered('Running...');
    });
  });

  describe('description and prompt', () => {
    it('shows the description for a subagent dispatch', () => {
      const args = JSON.stringify({ subagent_type: 'Explore', description: 'Find the router' });
      render(<AgentBlockView block={agentBlock({ args })} />);
      expectRenderedOnce('Find the router');
    });

    it('QUIRK: a skill invocation never shows its description', () => {
      const args = JSON.stringify({ skill: 'harness:tdd', description: 'Find the router' });
      render(<AgentBlockView block={agentBlock({ tool: 'skill', args })} />);
      expectNotRendered('Find the router');
    });

    it('shows a subagent prompt from the prompt argument', () => {
      const args = JSON.stringify({ subagent_type: 'Explore', prompt: 'Search every package' });
      render(<AgentBlockView block={agentBlock({ args })} />);
      expectRenderedOnce('Search every package');
    });

    it('shows a skill prompt from the args argument instead', () => {
      const args = JSON.stringify({ skill: 'harness:tdd', args: 'author the failing test' });
      render(<AgentBlockView block={agentBlock({ tool: 'skill', args })} />);
      expectRenderedOnce('author the failing test');
    });

    it('QUIRK: a skill ignores the prompt field a subagent would use', () => {
      const args = JSON.stringify({ skill: 'harness:tdd', prompt: 'Search every package' });
      render(<AgentBlockView block={agentBlock({ tool: 'skill', args })} />);
      expectNotRendered('Search every package');
    });

    it('QUIRK: a subagent ignores the args field a skill would use', () => {
      const args = JSON.stringify({ subagent_type: 'Explore', args: 'author the failing test' });
      render(<AgentBlockView block={agentBlock({ args })} />);
      expectNotRendered('author the failing test');
    });
  });

  describe('result rendering', () => {
    it('renders an unstructured result as markdown', () => {
      const { container } = render(
        <AgentBlockView block={agentBlock({ result: '# Report\n\nEverything passed.' })} />
      );
      expect(container.querySelector('h1')?.textContent).toBe('Report');
      expectRenderedOnce('Everything passed.');
    });

    it('renders no result region while the call is still running', () => {
      const { container } = render(<AgentBlockView block={agentBlock()} />);
      expect(container.querySelector('.prose')).toBeNull();
    });

    it('routes a findings payload to the findings viewer instead of dumping JSON', () => {
      render(<AgentBlockView block={agentBlock({ result: findingsResult })} />);
      expectRenderedOnce('SQL injection via string concat');
      expectNotRendered(/SEC-INJ-001"/);
    });

    it('routes an advise-skills payload to the advise viewer', () => {
      render(<AgentBlockView block={agentBlock({ result: adviseResult })} />);
      expectRenderedOnce('checkout flow');
    });

    it('routes a graph-impact payload to the impact viewer', () => {
      render(<AgentBlockView block={agentBlock({ result: impactResult })} />);
      expectRenderedOnce('src/app.ts');
    });

    it('QUIRK: advise-skills wins when a payload satisfies both advise and findings shapes', () => {
      const both = JSON.stringify({
        featureName: 'checkout flow',
        apply: [
          { skill: 'harness-tdd', score: 0.9, when: 'on new feature', reasons: ['adds behavior'] },
        ],
        findings: [{ ruleName: 'SQL injection via string concat', severity: 'error' }],
      });
      render(<AgentBlockView block={agentBlock({ result: both })} />);
      expectRenderedOnce('checkout flow');
      expectNotRendered('SQL injection via string concat');
    });
  });

  describe('KNOWN DEFECT (characterized, not fixed)', () => {
    /**
     * `parseAdviseSkillsResult` accepts a match validated only as
     * `{ skill: string, score: number }` (see `looksLikeMatches`), but
     * `SkillCard` then dereferences `match.reasons` unguarded. An
     * advise_skills result whose matches omit `reasons` therefore throws
     * during render and takes the whole chat message down with it.
     *
     * This test pins the CURRENT (broken) behavior so the crash cannot change
     * silently. It is NOT an endorsement — see the PR's parked-defects note.
     */
    it('throws while rendering an advise-skills payload whose matches omit "reasons"', () => {
      // React logs the boundary-less render failure; silence it so the expected
      // throw does not look like a broken test run.
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
      const missingReasons = JSON.stringify({
        featureName: 'checkout flow',
        apply: [{ skill: 'harness-tdd', score: 0.9 }],
      });
      expect(() =>
        render(<AgentBlockView block={agentBlock({ result: missingReasons })} />)
      ).toThrow(/reading 'map'/);
    });
  });

  describe('activity trace', () => {
    it('renders nested children under an activity-trace heading', () => {
      render(
        <AgentBlockView block={agentBlock()}>
          <div>nested tool row</div>
        </AgentBlockView>
      );
      expectRenderedOnce('Activity Trace');
      expectRenderedOnce('nested tool row');
    });

    it('renders no activity trace when there are no children', () => {
      render(<AgentBlockView block={agentBlock()} />);
      expectNotRendered('Activity Trace');
    });

    it('renders no activity trace for an empty children array', () => {
      render(<AgentBlockView block={agentBlock()}>{[]}</AgentBlockView>);
      expectNotRendered('Activity Trace');
    });

    it('renders the activity trace for a non-empty children array', () => {
      render(
        <AgentBlockView block={agentBlock()}>{[<div key="a">nested tool row</div>]}</AgentBlockView>
      );
      expectRenderedOnce('Activity Trace');
    });
  });

  describe('skill vs subagent styling', () => {
    it('tints a skill card emerald', () => {
      const { container } = render(<AgentBlockView block={agentBlock({ tool: 'skill' })} />);
      expect(container.querySelector('.border-emerald-400\\/20')).not.toBeNull();
    });

    it('tints a subagent card with the secondary accent', () => {
      const { container } = render(<AgentBlockView block={agentBlock()} />);
      expect(container.querySelector('.border-secondary-400\\/20')).not.toBeNull();
    });
  });
});
