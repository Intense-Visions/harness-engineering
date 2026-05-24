/**
 * TypeScript Compiler API wrapper — definition-side parser for the
 * audit-component-anatomy skill.
 *
 * Scope (Phase 1 vertical slice):
 *   Extract the top-level exported component's name and the member
 *   names of its prop type. The convention runner uses the member names
 *   to decide whether each required slot/state is satisfied.
 *
 * Intentionally minimal: this is not a full prop-type analyzer. Type
 * widening, generic resolution, intersection collapsing, and
 * cross-file type resolution are deferred. The MVP covers the common
 * React patterns:
 *   - `export const Button = ({...}: ButtonProps) => ...` paired with
 *     `interface ButtonProps { ... }` or `type ButtonProps = { ... }`
 *     in the same file.
 *   - `export function Button(props: ButtonProps) { ... }` with the
 *     same shape.
 *   - Inline prop types: `export const Button = (props: { foo: ... }) => ...`
 *
 * Source: proposal.md "Technical Design" → "Parser stack architecture"
 *   (AST — TypeScript Compiler API — definition findings).
 */

import * as fs from 'node:fs';
import ts from 'typescript';

/**
 * Result of parsing a component definition.
 *
 * `exportName`        — name of the top-level exported component.
 * `propTypeMembers`   — names of the prop-type's members. Members
 *                       sourced from the function parameter's type
 *                       annotation, whether inline or referenced.
 */
export interface ParsedComponent {
  exportName: string;
  propTypeMembers: string[];
}

/**
 * Parse a component file from disk and return its top-level exported
 * component's name and prop-type member names. Returns `null` when no
 * top-level exported component is detected.
 *
 * The runner relies on this returning a stable shape — both fields
 * are required. When the prop type cannot be resolved the function
 * still returns the export name with an empty `propTypeMembers`
 * array, so callers can distinguish "no component" (null) from
 * "component with no resolvable props" (`{exportName, propTypeMembers: []}`).
 */
export function parseComponentDefinition(filePath: string): ParsedComponent | null {
  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  return parseComponentDefinitionFromSource(filePath, source);
}

/**
 * Source-string overload — used by tests that supply contents directly
 * without touching the filesystem. Same shape as the disk-reading
 * variant.
 */
export function parseComponentDefinitionFromSource(
  filePath: string,
  source: string
): ParsedComponent | null {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    scriptKind
  );

  const exportEntry = findExportedComponent(sourceFile);
  if (!exportEntry) return null;

  const propTypeMembers = collectPropTypeMembers(sourceFile, exportEntry.propTypeNode);
  return {
    exportName: exportEntry.name,
    propTypeMembers,
  };
}

/**
 * Walk the top-level statements of the source file looking for the
 * first exported component declaration whose name starts with an
 * uppercase letter (React-component convention). Returns the name and
 * — when available — the AST node that represents the prop type.
 */
function findExportedComponent(
  sourceFile: ts.SourceFile
): { name: string; propTypeNode: ts.Node | null } | null {
  for (const statement of sourceFile.statements) {
    // `export const Button = (...) => ...` or `export const Button = function (...) {}`
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const name = declaration.name.text;
        if (!isComponentName(name)) continue;
        const propTypeNode = extractPropTypeFromInitializer(declaration.initializer);
        return { name, propTypeNode };
      }
    }

    // `export function Button(props: ButtonProps) { ... }`
    if (
      ts.isFunctionDeclaration(statement) &&
      hasExportModifier(statement) &&
      statement.name &&
      isComponentName(statement.name.text)
    ) {
      const propTypeNode = extractPropTypeFromParameters(statement.parameters);
      return { name: statement.name.text, propTypeNode };
    }
  }
  return null;
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function extractPropTypeFromInitializer(initializer: ts.Expression | undefined): ts.Node | null {
  if (!initializer) return null;
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return extractPropTypeFromParameters(initializer.parameters);
  }
  return null;
}

function extractPropTypeFromParameters(
  parameters: ts.NodeArray<ts.ParameterDeclaration>
): ts.Node | null {
  const first = parameters[0];
  if (!first || !first.type) return null;
  return first.type;
}

/**
 * Resolve a prop-type AST node into a flat list of member names.
 *
 * Two shapes handled:
 *   - Inline type literal:        `{ foo: string; bar?: number }` — read
 *                                  the property names directly.
 *   - Type reference identifier:  `ButtonProps` — search the file for a
 *                                  matching `interface` or `type` alias
 *                                  declaration and read its members.
 *
 * Other shapes (intersections, generics, cross-file references) return
 * an empty array. Acceptable for the vertical slice — the runner
 * treats "no resolvable props" as "no slot present" which is exactly
 * the failure mode the audit is supposed to catch.
 */
function collectPropTypeMembers(sourceFile: ts.SourceFile, propTypeNode: ts.Node | null): string[] {
  if (!propTypeNode) return [];

  if (ts.isTypeLiteralNode(propTypeNode)) {
    return readMembersFromTypeLiteral(propTypeNode);
  }

  if (ts.isTypeReferenceNode(propTypeNode) && ts.isIdentifier(propTypeNode.typeName)) {
    const referencedTypeName = propTypeNode.typeName.text;
    const declared = findTypeDeclaration(sourceFile, referencedTypeName);
    if (declared) return declared;
  }

  return [];
}

function readMembersFromTypeLiteral(node: ts.TypeLiteralNode): string[] {
  const names: string[] = [];
  for (const member of node.members) {
    const name = extractPropertyName(member);
    if (name !== null) names.push(name);
  }
  return names;
}

function readMembersFromInterface(node: ts.InterfaceDeclaration): string[] {
  const names: string[] = [];
  for (const member of node.members) {
    const name = extractPropertyName(member);
    if (name !== null) names.push(name);
  }
  return names;
}

function extractPropertyName(member: ts.TypeElement): string | null {
  if (!ts.isPropertySignature(member)) return null;
  const propertyName = member.name;
  if (ts.isIdentifier(propertyName)) return propertyName.text;
  if (ts.isStringLiteral(propertyName)) return propertyName.text;
  return null;
}

function findTypeDeclaration(sourceFile: ts.SourceFile, typeName: string): string[] | null {
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === typeName) {
      return readMembersFromInterface(statement);
    }
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === typeName) {
      if (ts.isTypeLiteralNode(statement.type)) {
        return readMembersFromTypeLiteral(statement.type);
      }
    }
  }
  return null;
}
