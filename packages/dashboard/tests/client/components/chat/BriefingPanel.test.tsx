import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BriefingPanel } from '../../../../src/client/components/chat/BriefingPanel';
import type { SkillEntry } from '../../../../src/client/types/skills';

const mockSkill: SkillEntry = {
  id: 'harness:security-scan',
  name: 'Security Scan',
  description: 'Scan codebase for security issues.',
  category: 'security',
  slashCommand: '/harness:security-scan',
};

const mockContext = {
  data: {
    '/api/checks': {
      security: {
        stats: { filesScanned: 5, errorCount: 1, warningCount: 0 },
        findings: [],
      },
    },
  },
  isLoading: false,
  error: null,
};

describe('BriefingPanel', () => {
  it('renders skill name and description', () => {
    render(<BriefingPanel skill={mockSkill} context={mockContext} onExecute={() => {}} />);
    expect(screen.getByText('Security Scan')).toBeDefined();
    expect(screen.getByText('Scan codebase for security issues.')).toBeDefined();
  });

  it('renders context summary', () => {
    render(<BriefingPanel skill={mockSkill} context={mockContext} onExecute={() => {}} />);
    expect(screen.getByText(/Found 1 errors/)).toBeDefined();
  });

  it('calls onExecute when button clicked', () => {
    const onExecute = vi.fn();
    render(<BriefingPanel skill={mockSkill} context={mockContext} onExecute={onExecute} />);

    fireEvent.click(screen.getByText(/Execute Security Scan/i));
    expect(onExecute).toHaveBeenCalled();
  });

  it('shows loader when loading', () => {
    const loadingContext = { ...mockContext, isLoading: true };
    const { container } = render(
      <BriefingPanel skill={mockSkill} context={loadingContext} onExecute={() => {}} />
    );
    // Check for lucide loader icon (has animate-spin class)
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('shows error message when error occurs', () => {
    const errorContext = { ...mockContext, error: 'Failed to fetch' };
    render(<BriefingPanel skill={mockSkill} context={errorContext} onExecute={() => {}} />);
    expect(screen.getByText('Failed to fetch')).toBeDefined();
  });
});
