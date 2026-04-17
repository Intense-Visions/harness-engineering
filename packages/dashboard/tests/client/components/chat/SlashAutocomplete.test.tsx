import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SlashAutocomplete } from '../../../../src/client/components/chat/SlashAutocomplete';

describe('SlashAutocomplete', () => {
  it('renders matching skills based on filter', () => {
    render(<SlashAutocomplete filter="/" onSelect={() => {}} onClose={() => {}} />);
    // Should show skills from registry
    expect(screen.getByText('Validate Project')).toBeDefined();
    expect(screen.getByText('Security Scan')).toBeDefined();
  });

  it('filters results as user types', () => {
    render(<SlashAutocomplete filter="/sec" onSelect={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Security Scan')).toBeDefined();
    expect(screen.queryByText('Validate Project')).toBeNull();
  });

  it('calls onSelect when a skill is clicked', () => {
    const onSelect = vi.fn();
    render(<SlashAutocomplete filter="/" onSelect={onSelect} onClose={() => {}} />);

    fireEvent.click(screen.getByText('Validate Project').closest('button')!);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'harness:validate',
      })
    );
  });

  it('navigates with arrow keys and selects with enter', () => {
    const onSelect = vi.fn();
    render(<SlashAutocomplete filter="/" onSelect={onSelect} onClose={() => {}} />);

    // Initial selection is index 0 (Validate Project)
    // Press ArrowDown to move to next skill (Verify Implementation or similar)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    // Verify Implementation is usually the 2nd health skill in registry
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'harness:verify',
      })
    );
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<SlashAutocomplete filter="/" onSelect={() => {}} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
