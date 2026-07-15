// tests/rules/no-undefined-optional-assignment.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/no-undefined-optional-assignment';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-undefined-optional-assignment', rule, {
  valid: [
    // A non-optional typed variable is safe to assign directly.
    { code: `let v: string = 'x'; const o = { field: v };` },
    // The conditional-spread form the rule recommends — not a direct property, so not flagged.
    { code: `let v: string | undefined; const o = { ...(v !== undefined && { field: v }) };` },
    // No type annotation ⇒ unknown ⇒ no false positive (the rule is deliberately narrow).
    { code: `let v = maybe(); const o = { field: v };` },
    // A literal/non-identifier value is out of scope.
    { code: `const o = { field: 'literal' };` },
    // A union WITHOUT undefined is fine.
    { code: `let v: string | number; const o = { field: v };` },
    // Guard via `!= null` (loose) is also accepted.
    { code: `let v: string | undefined; const o = { ...(v != null && { field: v }) };` },
    // Guard with the operands reversed (`undefined !== v`).
    { code: `let v: string | undefined; const o = { ...(undefined !== v && { field: v }) };` },
    // A computed key is out of scope (we can't name the field).
    { code: `const k = 'x'; let v: string | undefined; const o = { [k]: v };` },
  ],
  invalid: [
    // `let x: T | undefined` assigned directly to a property.
    {
      code: `let v: string | undefined; const o = { field: v };`,
      errors: [{ messageId: 'undefinedOptionalAssignment' }],
    },
    // A function parameter typed `T | undefined`.
    {
      code: `function f(v: number | undefined) { return { count: v }; }`,
      errors: [{ messageId: 'undefinedOptionalAssignment' }],
    },
    // Shorthand-style resolves to the same Identifier value.
    {
      code: `let field: string | undefined; const o = { field: field };`,
      errors: [{ messageId: 'undefinedOptionalAssignment' }],
    },
    // A string-literal key (exercises the Literal-key branch).
    {
      code: `let v: string | undefined; const o = { 'field': v };`,
      errors: [{ messageId: 'undefinedOptionalAssignment' }],
    },
  ],
});
