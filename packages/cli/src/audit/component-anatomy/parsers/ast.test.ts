import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { parseComponentDefinition, parseComponentDefinitionFromSource } from './ast';

/**
 * Unit coverage for the component-anatomy AST parser (TypeScript Compiler
 * API). The parser extracts an exported React component's name and the
 * member names of its prop type, from either a file on disk or a raw
 * source string.
 *
 * All disk-reading tests mock `node:fs` so the suite is hermetic and never
 * touches the real filesystem. The source-string overload needs no mocking
 * because it operates purely on in-memory strings.
 */

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

const readFileSyncMock = vi.mocked(fs.readFileSync);

afterEach(() => {
  vi.clearAllMocks();
});

describe('parseComponentDefinitionFromSource', () => {
  it('extracts the export name and interface prop members for an arrow component', () => {
    const source = `
      interface ButtonProps {
        label: string;
        onClick: () => void;
        disabled?: boolean;
      }
      export const Button = ({ label, onClick }: ButtonProps) => null;
    `;

    const result = parseComponentDefinitionFromSource('Button.tsx', source);

    expect(result).toEqual({
      exportName: 'Button',
      propTypeMembers: ['label', 'onClick', 'disabled'],
    });
  });

  it('resolves props from a `type` alias referenced by a function declaration', () => {
    const source = `
      type CardProps = {
        title: string;
        body: string;
      };
      export function Card(props: CardProps) {
        return null;
      }
    `;

    const result = parseComponentDefinitionFromSource('Card.tsx', source);

    expect(result).toEqual({
      exportName: 'Card',
      propTypeMembers: ['title', 'body'],
    });
  });

  it('reads members directly from an inline type-literal prop annotation', () => {
    const source = `
      export const Badge = (props: { count: number; variant: string }) => null;
    `;

    const result = parseComponentDefinitionFromSource('Badge.tsx', source);

    expect(result).toEqual({
      exportName: 'Badge',
      propTypeMembers: ['count', 'variant'],
    });
  });

  it('returns null when no top-level exported component is present', () => {
    const source = `
      interface ButtonProps { label: string }
      const button = (props: ButtonProps) => null;
    `;

    expect(parseComponentDefinitionFromSource('button.ts', source)).toBeNull();
  });

  it('ignores lowercase-named exports (not React-component convention)', () => {
    const source = `
      export const helper = (props: { a: string }) => null;
    `;

    expect(parseComponentDefinitionFromSource('helper.ts', source)).toBeNull();
  });

  it('returns the export name with empty members when the prop type is unresolvable', () => {
    // Cross-file / unresolved reference: the type is not declared in this file.
    const source = `
      export const Widget = (props: ExternalProps) => null;
    `;

    expect(parseComponentDefinitionFromSource('Widget.tsx', source)).toEqual({
      exportName: 'Widget',
      propTypeMembers: [],
    });
  });

  it('returns empty members when the component takes no parameters', () => {
    const source = `
      export const Spinner = () => null;
    `;

    expect(parseComponentDefinitionFromSource('Spinner.tsx', source)).toEqual({
      exportName: 'Spinner',
      propTypeMembers: [],
    });
  });

  it('returns the first exported component when several are present', () => {
    const source = `
      export const First = (props: { a: string }) => null;
      export const Second = (props: { b: string }) => null;
    `;

    const result = parseComponentDefinitionFromSource('multi.tsx', source);

    expect(result).toEqual({
      exportName: 'First',
      propTypeMembers: ['a'],
    });
  });

  it('preserves string-literal property names in an inline prop type', () => {
    const source = `
      export const Grid = (props: { 'data-col': number; row: number }) => null;
    `;

    const result = parseComponentDefinitionFromSource('Grid.tsx', source);

    expect(result).toEqual({
      exportName: 'Grid',
      propTypeMembers: ['data-col', 'row'],
    });
  });
});

describe('parseComponentDefinition', () => {
  it('reads the file from disk and delegates to the source parser', () => {
    const filePath = '/repo/src/Button.tsx';
    const source = `
      interface ButtonProps { label: string }
      export const Button = ({ label }: ButtonProps) => null;
    `;
    readFileSyncMock.mockReturnValue(source);

    const result = parseComponentDefinition(filePath);

    expect(readFileSyncMock).toHaveBeenCalledWith(filePath, 'utf8');
    expect(result).toEqual({
      exportName: 'Button',
      propTypeMembers: ['label'],
    });
  });

  it('returns null when the file cannot be read', () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    expect(parseComponentDefinition('/repo/src/Missing.tsx')).toBeNull();
  });
});
