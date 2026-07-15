// src/rules/no-undefined-optional-assignment.ts
import { ESLintUtils, type TSESTree, type TSESLint } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'undefinedOptionalAssignment';

/**
 * True when a type annotation is a union that spells out `undefined` (e.g. `string | undefined`).
 * Purely syntactic — this plugin's RuleTester runs WITHOUT type information (no `parserServices`),
 * so the rule keys off the DECLARED annotation rather than the inferred type. Sound but narrow:
 * it flags the common `let x: T | undefined; return { field: x }` gotcha and stays silent when the
 * annotation is absent (unknown ⇒ no false positive).
 */
function unionIncludesUndefined(typeNode: TSESTree.TypeNode | undefined): boolean {
  return (
    typeNode?.type === 'TSUnionType' && typeNode.types.some((t) => t.type === 'TSUndefinedKeyword')
  );
}

/**
 * The declared type annotation of the variable `identifier` resolves to (its nearest def), if any.
 * `def.name` is the declared Identifier for both `let`/`const` declarators and function params and
 * carries the `x: T | undefined` annotation.
 */
function declaredType(
  identifier: TSESTree.Identifier,
  scope: TSESLint.Scope.Scope
): TSESTree.TypeNode | undefined {
  const ref = scope.references.find((r) => r.identifier === identifier);
  const name = ref?.resolved?.defs[0]?.name;
  // `name` is a BindingName | StringLiteral; only a plain Identifier carries `x: T` here
  // (destructuring patterns and string-keyed defs never spell out `| undefined` this way).
  if (name?.type !== 'Identifier') return undefined;
  return name.typeAnnotation?.typeAnnotation;
}

/** True for `name !== undefined` / `name != null` (either operand order). */
function checksDefined(expr: TSESTree.Node, name: string): boolean {
  if (expr.type !== 'BinaryExpression' || (expr.operator !== '!==' && expr.operator !== '!=')) {
    return false;
  }
  const refsName = (n: TSESTree.Node): boolean => n.type === 'Identifier' && n.name === name;
  const isNullish = (n: TSESTree.Node): boolean =>
    (n.type === 'Identifier' && n.name === 'undefined') ||
    (n.type === 'Literal' && n.value === null);
  return (
    (refsName(expr.left) && isNullish(expr.right)) || (refsName(expr.right) && isNullish(expr.left))
  );
}

/**
 * True when an enclosing `&&` already guards `name` against undefined/null — i.e. the code is
 * ALREADY using the recommended `...(name !== undefined && { field: name })` form, which must not
 * be flagged.
 */
function isGuarded(node: TSESTree.Node, name: string): boolean {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (
      cur.type === 'LogicalExpression' &&
      cur.operator === '&&' &&
      checksDefined(cur.left, name)
    ) {
      return true;
    }
  }
  return false;
}

export default createRule<[], MessageIds>({
  name: 'no-undefined-optional-assignment',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow assigning a possibly-undefined variable directly to an object property, which ' +
        'breaks `exactOptionalPropertyTypes`; use a conditional spread instead.',
    },
    messages: {
      undefinedOptionalAssignment:
        "Assigning possibly-undefined '{{name}}' directly to '{{field}}' breaks " +
        'exactOptionalPropertyTypes. Use a conditional spread: ' +
        "...({{name}} !== undefined && {{ '{' }} {{field}}: {{name}} {{ '}' }}).",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      Property(node) {
        if (node.computed || node.value.type !== 'Identifier') return;
        if (node.key.type !== 'Identifier' && node.key.type !== 'Literal') return;
        const value = node.value;
        const scope = context.sourceCode.getScope(value);
        if (!unionIncludesUndefined(declaredType(value, scope))) return;
        if (isGuarded(node, value.name)) return; // already the recommended conditional-spread form
        const field = node.key.type === 'Identifier' ? node.key.name : String(node.key.value);
        context.report({
          node: value,
          messageId: 'undefinedOptionalAssignment',
          data: { name: value.name, field },
        });
      },
    };
  },
});
