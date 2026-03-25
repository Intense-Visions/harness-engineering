import { describe, it, expect } from 'vitest';
import { PromptRenderer } from '../../src/prompt/renderer';

describe('PromptRenderer', () => {
  const renderer = new PromptRenderer();

  it('renders a simple template with variables', async () => {
    const template = 'Hello, {{ name }}!';
    const context = { name: 'World' };
    const result = await renderer.render(template, context);
    expect(result).toBe('Hello, World!');
  });

  it('throws an error if a variable is missing (strict mode)', async () => {
    const template = 'Hello, {{ name }}!';
    const context = {};
    await expect(renderer.render(template, context)).rejects.toThrow();
  });

  it('handles complex objects in context', async () => {
    const template = 'User: {{ user.name }} ({{ user.role }})';
    const context = { user: { name: 'Alice', role: 'Admin' } };
    const result = await renderer.render(template, context);
    expect(result).toBe('User: Alice (Admin)');
  });
});
