import { describe, it, expect } from 'vitest';
import { formatToolArgs } from '../../../../../src/client/components/chat/blocks/format-tool-args';

/**
 * Characterization tests for `formatToolArgs` — the one-line args preview shown
 * next to a tool name in the chat transcript.
 *
 * These pin CURRENT behavior as-is (including quirks); they are not a
 * specification of desired behavior. Quirks are called out explicitly so a
 * future intentional change fails loudly rather than silently.
 */
describe('formatToolArgs', () => {
  describe('when there is nothing to preview', () => {
    // Both inputs hit the single `if (!args) return ''` guard, so they are one
    // contract with two callers rather than two behaviors (test-craft TEST-R006).
    it.each([
      ['absent', undefined],
      ['an empty string', ''],
    ])('returns an empty preview when args are %s', (_label, args) => {
      expect(formatToolArgs('Read', args)).toBe('');
    });
  });

  describe('non-JSON args', () => {
    it('passes unparseable args through verbatim', () => {
      expect(formatToolArgs('Read', 'not json at all')).toBe('not json at all');
    });

    it('truncates unparseable args to 100 characters', () => {
      const long = 'x'.repeat(250);
      expect(formatToolArgs('Read', long)).toBe('x'.repeat(100));
    });
  });

  describe('todo tools', () => {
    it('summarizes a todo list by task count', () => {
      const args = JSON.stringify({
        todos: [{ content: 'a' }, { content: 'b' }, { content: 'c' }],
      });
      expect(formatToolArgs('TodoWrite', args)).toBe('Updating 3 tasks');
    });

    it('matches the todo branch on any tool whose name contains "todo"', () => {
      const args = JSON.stringify({ todos: [{ content: 'a' }] });
      expect(formatToolArgs('mcp__x__update_todos', args)).toBe('Updating 1 tasks');
    });

    it('QUIRK: pluralizes unconditionally, so a single task reads "1 tasks"', () => {
      const args = JSON.stringify({ todos: [{ content: 'only one' }] });
      expect(formatToolArgs('TodoWrite', args)).toBe('Updating 1 tasks');
    });

    it('falls through to the JSON fallback when todos is not an array', () => {
      const args = JSON.stringify({ todos: 'nope' });
      expect(formatToolArgs('TodoWrite', args)).toBe('{"todos":"nope"}');
    });
  });

  describe('bash tools', () => {
    it('previews the command', () => {
      expect(formatToolArgs('Bash', JSON.stringify({ command: 'pnpm test' }))).toBe('pnpm test');
    });

    it('falls back to the args field when command is absent', () => {
      expect(formatToolArgs('bash', JSON.stringify({ args: 'ls -la' }))).toBe('ls -la');
    });

    it('strips a leading unquoted "cd ... &&" prefix', () => {
      const args = JSON.stringify({ command: 'cd /repo/packages && pnpm build' });
      expect(formatToolArgs('Bash', args)).toBe('pnpm build');
    });

    it('strips a leading double-quoted "cd ... &&" prefix', () => {
      const args = JSON.stringify({ command: 'cd "/repo/my dir" && pnpm build' });
      expect(formatToolArgs('Bash', args)).toBe('pnpm build');
    });

    it('strips a leading single-quoted "cd ... &&" prefix', () => {
      const args = JSON.stringify({ command: "cd '/repo/my dir' && pnpm build" });
      expect(formatToolArgs('Bash', args)).toBe('pnpm build');
    });

    it('QUIRK: strips EVERY "cd ... &&" occurrence, not just the leading one', () => {
      const args = JSON.stringify({ command: 'cd /a && ls && cd /b && pwd' });
      expect(formatToolArgs('Bash', args)).toBe('ls && pwd');
    });

    it('truncates a long command to 100 characters', () => {
      const args = JSON.stringify({ command: `echo ${'y'.repeat(250)}` });
      expect(formatToolArgs('Bash', args)).toHaveLength(100);
    });

    it('QUIRK: only the exact tool name "bash" takes the bash branch', () => {
      const args = JSON.stringify({ command: 'pnpm test' });
      expect(formatToolArgs('BashOutput', args)).toBe('{"command":"pnpm test"}');
    });
  });

  describe('agent / subagent tools', () => {
    it('joins subagent type and description', () => {
      const args = JSON.stringify({ subagent_type: 'Explore', description: 'find the router' });
      expect(formatToolArgs('Agent', args)).toBe('Explore: find the router');
    });

    it('uses the description alone when no type is present', () => {
      const args = JSON.stringify({ description: 'find the router' });
      expect(formatToolArgs('agent', args)).toBe('find the router');
    });

    it('reads the type from the "type" field when subagent_type is absent', () => {
      const args = JSON.stringify({ type: 'general', description: 'sweep' });
      expect(formatToolArgs('subagent', args)).toBe('general: sweep');
    });

    it('QUIRK: a subagent_type field routes ANY tool into the agent branch', () => {
      const args = JSON.stringify({ subagent_type: 'Explore', description: 'find the router' });
      expect(formatToolArgs('SomeUnrelatedTool', args)).toBe('Explore: find the router');
    });

    it('falls through to the path branch when an agent call has no description', () => {
      const args = JSON.stringify({ subagent_type: 'Explore', file_path: '/repo/src/app.ts' });
      expect(formatToolArgs('Agent', args)).toBe('src/app.ts');
    });
  });

  describe('path-bearing tools', () => {
    it('shows the last two segments of "path"', () => {
      expect(formatToolArgs('Read', JSON.stringify({ path: '/a/b/c/d.ts' }))).toBe('c/d.ts');
    });

    it('shows the last two segments of "file_path"', () => {
      expect(formatToolArgs('Read', JSON.stringify({ file_path: '/a/b/c/d.ts' }))).toBe('c/d.ts');
    });

    it('shows the last two segments of "filePath"', () => {
      expect(formatToolArgs('Read', JSON.stringify({ filePath: '/a/b/c/d.ts' }))).toBe('c/d.ts');
    });

    it('prefers "path" over "file_path" when both are present', () => {
      const args = JSON.stringify({ path: '/from/path.ts', file_path: '/from/file_path.ts' });
      expect(formatToolArgs('Read', args)).toBe('from/path.ts');
    });

    it('returns a bare filename unchanged when there is no directory', () => {
      expect(formatToolArgs('Read', JSON.stringify({ path: 'README.md' }))).toBe('README.md');
    });

    it('QUIRK: a Windows-style backslash path is not split, so it is shown whole', () => {
      const args = JSON.stringify({ path: 'C:\\repo\\src\\app.ts' });
      expect(formatToolArgs('Read', args)).toBe('C:\\repo\\src\\app.ts');
    });
  });

  describe('JSON fallback', () => {
    it('re-serializes args that match no specialized branch', () => {
      expect(formatToolArgs('Grep', JSON.stringify({ pattern: 'TODO' }))).toBe(
        '{"pattern":"TODO"}'
      );
    });

    it('truncates the re-serialized fallback to 100 characters', () => {
      const args = JSON.stringify({ pattern: 'z'.repeat(250) });
      expect(formatToolArgs('Grep', args)).toHaveLength(100);
    });

    it('QUIRK: re-serialization normalizes whitespace and key order is preserved as parsed', () => {
      expect(formatToolArgs('Grep', '{ "pattern" :  "TODO" }')).toBe('{"pattern":"TODO"}');
    });
  });

  describe('branch precedence', () => {
    it('todo wins over bash when a tool name contains both', () => {
      const args = JSON.stringify({ todos: [{ content: 'a' }], command: 'ls' });
      expect(formatToolArgs('bash_todo', args)).toBe('Updating 1 tasks');
    });

    it('bash wins over path when a bash call also carries a file_path', () => {
      const args = JSON.stringify({ command: 'cat x', file_path: '/a/b/c.ts' });
      expect(formatToolArgs('bash', args)).toBe('cat x');
    });
  });
});
