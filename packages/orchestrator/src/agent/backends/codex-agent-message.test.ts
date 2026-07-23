import { describe, it, expect } from 'vitest';
import { extractCodexAgentMessage } from './codex';

describe('extractCodexAgentMessage', () => {
  it('extracts text from the nested `msg` form', () => {
    const ev = JSON.parse('{"msg":{"type":"agent_message","message":"# Spec\\n\\nThe design."}}');
    expect(extractCodexAgentMessage(ev)).toBe('# Spec\n\nThe design.');
  });

  it('extracts text from the `item.completed` form (item.text)', () => {
    const ev = JSON.parse(
      '{"type":"item.completed","item":{"type":"agent_message","text":"final plan"}}'
    );
    expect(extractCodexAgentMessage(ev)).toBe('final plan');
  });

  it('extracts text from the flat form', () => {
    expect(extractCodexAgentMessage({ type: 'agent_message', message: 'flat text' })).toBe(
      'flat text'
    );
  });

  it('falls back to `text` when `message` is absent (flat form)', () => {
    expect(extractCodexAgentMessage({ type: 'agent_message', text: 'via text' })).toBe('via text');
  });

  it('returns undefined for non-agent_message events', () => {
    expect(extractCodexAgentMessage({ msg: { type: 'exec_command_begin' } })).toBeUndefined();
    expect(extractCodexAgentMessage({ type: 'item.completed', item: { type: 'reasoning' } })).toBe(
      undefined
    );
  });

  it('returns undefined for empty/whitespace text (no false capture)', () => {
    expect(extractCodexAgentMessage({ type: 'agent_message', message: '   ' })).toBeUndefined();
    expect(extractCodexAgentMessage({ msg: { type: 'agent_message', message: '' } })).toBe(
      undefined
    );
  });

  it('is defensive against malformed shapes (never throws)', () => {
    expect(extractCodexAgentMessage(null)).toBeUndefined();
    expect(extractCodexAgentMessage('not an object')).toBeUndefined();
    expect(extractCodexAgentMessage(42)).toBeUndefined();
    expect(extractCodexAgentMessage({ msg: null })).toBeUndefined();
    expect(extractCodexAgentMessage({ item: { type: 'agent_message' } })).toBeUndefined();
  });
});
