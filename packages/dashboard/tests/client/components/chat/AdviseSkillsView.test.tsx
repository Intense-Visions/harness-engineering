import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  AdviseSkillsView,
  parseAdviseSkillsResult,
} from '../../../../src/client/components/chat/AdviseSkillsView';

const samplePayload = {
  featureName: 'Badge & Achievement System',
  skillsPath: 'docs/changes/badge-achievement-system/SKILLS.md',
  totalScanned: 733,
  scanDuration: 691,
  apply: [
    {
      skill: 'ts-zod-integration',
      score: 0.62,
      when: 'Architecture decisions',
      reasons: ['Stack: typescript', 'Domain: api, auth'],
    },
  ],
  reference: [
    {
      skill: 'ts-testing-types',
      score: 0.58,
      when: 'Testing',
      reasons: ['Stack: typescript'],
    },
  ],
  consider: [],
};

describe('parseAdviseSkillsResult', () => {
  it('parses raw JSON output', () => {
    const result = parseAdviseSkillsResult(JSON.stringify(samplePayload));
    expect(result?.featureName).toBe('Badge & Achievement System');
    expect(result?.apply).toHaveLength(1);
  });

  it('strips a leading <!-- packed: ... --> envelope comment', () => {
    const raw = `<!-- packed: structural+truncate | 759→561 tokens (-26%) -->\n${JSON.stringify(samplePayload)}`;
    const result = parseAdviseSkillsResult(raw);
    expect(result?.featureName).toBe('Badge & Achievement System');
  });

  it('returns null for non-advise JSON', () => {
    const result = parseAdviseSkillsResult(JSON.stringify({ id: 'abc', name: 'foo' }));
    expect(result).toBeNull();
  });

  it('returns null for non-JSON content', () => {
    expect(parseAdviseSkillsResult('Just some markdown text.')).toBeNull();
  });
});

describe('AdviseSkillsView', () => {
  it('renders feature name and tier sections', () => {
    render(<AdviseSkillsView payload={samplePayload} />);

    expect(screen.getByText('Badge & Achievement System')).toBeDefined();
    expect(screen.getByText('Apply')).toBeDefined();
    expect(screen.getByText('Reference')).toBeDefined();
    expect(screen.getByText('ts-zod-integration')).toBeDefined();
    expect(screen.getByText('ts-testing-types')).toBeDefined();
  });

  it('omits empty tier sections', () => {
    render(<AdviseSkillsView payload={samplePayload} />);
    expect(screen.queryByText('Consider')).toBeNull();
  });

  it('shows score percentages', () => {
    render(<AdviseSkillsView payload={samplePayload} />);
    expect(screen.getByText('62%')).toBeDefined();
    expect(screen.getByText('58%')).toBeDefined();
  });
});
