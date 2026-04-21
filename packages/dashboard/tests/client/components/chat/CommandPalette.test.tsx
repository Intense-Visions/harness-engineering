import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CommandPalette } from '../../../../src/client/components/chat/CommandPalette';

// Mock GlowCard to avoid complex animation/mouse logic in jsdom
vi.mock('../../../../src/client/components/NeonAI/GlowCard', () => ({
  GlowCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('CommandPalette', () => {
  it('renders all categories when search is empty', () => {
    render(<CommandPalette onSelect={() => {}} />);
    expect(screen.getByText('Workflow')).toBeDefined();
    expect(screen.getByText('Health')).toBeDefined();
    expect(screen.getByText('Security')).toBeDefined();
  });

  it('filters skills based on search input', () => {
    render(<CommandPalette onSelect={() => {}} />);
    const input = screen.getByPlaceholderText(/search skills/i);

    // Search for "Security"
    fireEvent.change(input, { target: { value: 'Security Scan' } });

    expect(screen.getByText('Security Scan')).toBeDefined();
    // Workflow category should be gone if no workflow skill matches "Security Scan"
    expect(screen.queryByText('Workflow')).toBeNull();
  });

  it('shows "no results" state when no skills match', () => {
    render(<CommandPalette onSelect={() => {}} />);
    const input = screen.getByPlaceholderText(/search skills/i);

    fireEvent.change(input, { target: { value: 'nonexistent-skill-name' } });

    expect(screen.getByText('No skills match')).toBeDefined();
  });

  it('calls onSelect when a skill is clicked', () => {
    const onSelect = vi.fn();
    render(<CommandPalette onSelect={onSelect} />);

    // Click "Validate Project" (should be in Health or Workflow depending on registry)
    const skillButton = screen.getByText('Validate Project').closest('button');
    expect(skillButton).not.toBeNull();
    fireEvent.click(skillButton!);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'harness:validate',
      })
    );
  });
});
