import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { ChatInput } from '../../../../src/client/components/chat/ChatInput';
import { SKILL_REGISTRY } from '../../../../src/client/constants/skills';

const DEFAULT_PLACEHOLDER = 'Execute command or query neural link...';
// Marker text rendered by the SlashAutocomplete footer; used to detect visibility.
const AUTOCOMPLETE_MARKER = 'Command Registry';

// A skill whose id substring is unique across the registry, so filtering by its
// slash command yields exactly one match. Derived from the real registry rather
// than hardcoded so the test tracks the source of truth.
const VALIDATE_SKILL = SKILL_REGISTRY.find((s) => s.id === 'harness:validate')!;

/**
 * ChatInput is a controlled component: its autocomplete visibility depends on
 * the `value` prop reflecting the typed text (SlashAutocomplete reads
 * `filter={value}`). This harness holds the value in state to mirror real usage.
 */
function Harness({
  onSend = vi.fn(),
  onChangeSpy,
  disabled = false,
  placeholder,
  initialValue = '',
}: {
  onSend?: () => void;
  onChangeSpy?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <ChatInput
      value={value}
      onChange={(v) => {
        onChangeSpy?.(v);
        setValue(v);
      }}
      onSend={onSend}
      disabled={disabled}
      placeholder={placeholder}
    />
  );
}

describe('ChatInput', () => {
  it('renders the default placeholder when none is provided', () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText(DEFAULT_PLACEHOLDER)).toBeDefined();
  });

  it('renders a custom placeholder when provided', () => {
    render(<Harness placeholder="Ask anything" />);
    expect(screen.getByPlaceholderText('Ask anything')).toBeDefined();
    expect(screen.queryByPlaceholderText(DEFAULT_PLACEHOLDER)).toBeNull();
  });

  it('propagates typed text through onChange', () => {
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello world' } });

    expect(onChangeSpy).toHaveBeenCalledWith('hello world');
  });

  it('sends on Enter without Shift', () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} initialValue="hello" />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('inserts a newline (does not send) on Shift+Enter', () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} initialValue="hello" />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables the send button when the value is empty or whitespace-only', () => {
    render(<Harness initialValue="   " />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the send button and calls onSend when clicked with content', () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} initialValue="hi" />);

    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('disables the textarea and send button while disabled (in-flight)', () => {
    render(<Harness disabled initialValue="hi" />);

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the slash-command autocomplete when the typed text matches a skill', () => {
    render(<Harness />);

    expect(screen.queryByText(AUTOCOMPLETE_MARKER)).toBeNull();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: VALIDATE_SKILL.slashCommand },
    });

    expect(screen.getByText(AUTOCOMPLETE_MARKER)).toBeDefined();
    expect(screen.getByText(VALIDATE_SKILL.name)).toBeDefined();
  });

  it('does not show the autocomplete for a slash command with no matches', () => {
    render(<Harness />);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '/zzz-no-such-skill' },
    });

    expect(screen.queryByText(AUTOCOMPLETE_MARKER)).toBeNull();
  });

  it('hides the autocomplete once the leading slash is removed', () => {
    render(<Harness />);
    const textbox = screen.getByRole('textbox');

    fireEvent.change(textbox, { target: { value: VALIDATE_SKILL.slashCommand } });
    expect(screen.getByText(AUTOCOMPLETE_MARKER)).toBeDefined();

    fireEvent.change(textbox, { target: { value: 'plain text' } });
    expect(screen.queryByText(AUTOCOMPLETE_MARKER)).toBeNull();
  });

  it('delegates Enter to the autocomplete (does not send) while it is open on a slash command', () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    const textbox = screen.getByRole('textbox');

    fireEvent.change(textbox, { target: { value: VALIDATE_SKILL.slashCommand } });
    expect(screen.getByText(AUTOCOMPLETE_MARKER)).toBeDefined();

    fireEvent.keyDown(textbox, { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('fills the input with the slash command and closes the autocomplete on skill select', () => {
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    const textbox = screen.getByRole('textbox');

    fireEvent.change(textbox, { target: { value: VALIDATE_SKILL.slashCommand } });
    onChangeSpy.mockClear();

    fireEvent.click(screen.getByText(VALIDATE_SKILL.name).closest('button')!);

    expect(onChangeSpy).toHaveBeenCalledWith(`${VALIDATE_SKILL.slashCommand} `);
    expect(screen.queryByText(AUTOCOMPLETE_MARKER)).toBeNull();
  });
});
