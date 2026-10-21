import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { Result } from '../result';
import { Ok, Err } from '../result';
import { readFileContent } from '../fs-utils';
import type { AST, Import, Export, ParseError, LanguageParser, HealthCheckResult } from './base';
import { createParseError } from './base';

/**
 * The slice of `@typescript-eslint/typescript-estree` this parser actually
 * consumes. Naming it is what lets `health()` answer a real question instead of
 * a rhetorical one: the surface we call is either present and behaving, or it
 * is not, and the two cases are distinguishable.
 */
interface EstreeModule {
  parse: (code: string, options: Record<string, unknown>) => TSESTree.Program;
  /** Package version, re-exported by typescript-estree itself. */
  version?: string;
}

/**
 * Resolves the parser's one runtime dependency.
 *
 * It is a seam rather than a bare top-level `import` for two reasons. First, a
 * static import makes a resolution failure a module-load crash *upstream* of
 * `health()`, so the parser-unavailable abstention could never be reached for
 * the most likely real cause (a broken install, or a `typescript` peer the
 * estree parser rejects). Second, it means the unavailable branch is reachable
 * in a test against the real `TypeScriptParser` rather than against a
 * hand-rolled mock parser object — which is what made the abstention untestable
 * before (#2267).
 */
export type EstreeModuleLoader = () => Promise<EstreeModule>;

const loadEstreeModule: EstreeModuleLoader = () =>
  import('@typescript-eslint/typescript-estree') as unknown as Promise<EstreeModule>;

/** Parse options shared by `parseFile` and the `health()` trial parse. */
function parseOptions(jsx: boolean): Record<string, unknown> {
  return {
    loc: true,
    range: true,
    // Capture leading/standalone comments so downstream analysis (JSDoc
    // extraction, the `@public` opt-out for issue #1479) can read them; the
    // snapshot's extractJSDocComments consumes `program.comments`.
    comment: true,
    jsx,
    errorOnUnknownASTType: false,
  };
}

/**
 * Source for the `health()` trial parse. It is not an arbitrary snippet: it
 * contains exactly the node kinds `extractImports`/`extractExports` walk (a
 * combined default + named import, and a named export), so a `parse` that
 * returns *something* but not an AST those extractors can read still reports
 * unavailable.
 */
const HEALTH_PROBE_SOURCE = [
  "import probeDefault, { probeNamed } from './probe-module';",
  'export const probeExport = probeNamed ?? probeDefault;',
  '',
].join('\n');

function parserUnavailable(detail: string): ParseError {
  return createParseError('PARSER_UNAVAILABLE', detail, { parser: 'typescript' }, [
    'Reinstall dependencies (e.g. `pnpm install`)',
    'Check that @typescript-eslint/typescript-estree and its `typescript` peer resolve',
  ]);
}

function walk(node: unknown, visitor: (node: TSESTree.Node) => void): void {
  if (!node || typeof node !== 'object') return;
  if ('type' in node) {
    visitor(node as TSESTree.Node);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, visitor));
    } else {
      walk(value, visitor);
    }
  }
}

function makeLocation(node: { loc?: { start: { line: number; column: number } } }): {
  file: string;
  line: number;
  column: number;
} {
  return {
    file: '',
    line: node.loc?.start.line ?? 0,
    column: node.loc?.start.column ?? 0,
  };
}

function processImportSpecifiers(importDecl: TSESTree.ImportDeclaration, imp: Import): void {
  for (const spec of importDecl.specifiers) {
    if (spec.type === 'ImportDefaultSpecifier') {
      imp.default = spec.local.name;
    } else if (spec.type === 'ImportNamespaceSpecifier') {
      imp.namespace = spec.local.name;
    } else if (spec.type === 'ImportSpecifier') {
      imp.specifiers.push(spec.local.name);
      if (spec.importKind === 'type') {
        imp.kind = 'type';
      }
    }
  }
}

function getExportedName(exported: TSESTree.Identifier | TSESTree.Literal): string {
  return exported.type === 'Identifier'
    ? exported.name
    : String((exported as unknown as TSESTree.Literal).value);
}

function processReExportSpecifiers(
  exportDecl: TSESTree.ExportNamedDeclaration,
  exports: Export[]
): void {
  for (const spec of exportDecl.specifiers) {
    if (spec.type !== 'ExportSpecifier') continue;
    exports.push({
      name: getExportedName(spec.exported),
      type: 'named',
      location: makeLocation(exportDecl),
      isReExport: true,
      source: exportDecl.source!.value as string,
    });
  }
}

function processExportDeclaration(
  exportDecl: TSESTree.ExportNamedDeclaration,
  exports: Export[]
): void {
  const decl = exportDecl.declaration;
  if (!decl) return;

  if (decl.type === 'VariableDeclaration') {
    for (const declarator of decl.declarations) {
      if (declarator.id.type === 'Identifier') {
        exports.push({
          name: declarator.id.name,
          type: 'named',
          location: makeLocation(decl),
          isReExport: false,
        });
      }
    }
  } else if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id) {
    exports.push({
      name: decl.id.name,
      type: 'named',
      location: makeLocation(decl),
      isReExport: false,
    });
  }
}

function processExportListSpecifiers(
  exportDecl: TSESTree.ExportNamedDeclaration,
  exports: Export[]
): void {
  for (const spec of exportDecl.specifiers) {
    if (spec.type !== 'ExportSpecifier') continue;
    exports.push({
      name: getExportedName(spec.exported),
      type: 'named',
      location: makeLocation(exportDecl),
      isReExport: false,
    });
  }
}

export class TypeScriptParser implements LanguageParser {
  name = 'typescript';
  extensions = ['.ts', '.tsx', '.mts', '.cts'];

  private readonly loadModule: EstreeModuleLoader;
  private resolved?: Promise<Result<EstreeModule, ParseError>>;

  constructor(loadModule: EstreeModuleLoader = loadEstreeModule) {
    this.loadModule = loadModule;
  }

  /**
   * Resolve (once) the estree module, reporting a resolution failure as
   * `PARSER_UNAVAILABLE` rather than letting it escape as a module-load throw.
   * Memoized on the promise so concurrent `parseFile` calls share one resolve.
   */
  private resolveModule(): Promise<Result<EstreeModule, ParseError>> {
    this.resolved ??= (async (): Promise<Result<EstreeModule, ParseError>> => {
      let mod: EstreeModule;
      try {
        mod = await this.loadModule();
        // Inside the `try` on purpose: a module namespace can be a proxy whose
        // property access throws, so reading `parse` is itself fallible and a
        // throw here must become an abstention, not an unhandled rejection.
        if (typeof mod.parse !== 'function') {
          return Err(
            parserUnavailable(
              '@typescript-eslint/typescript-estree resolved without a callable `parse` export'
            )
          );
        }
      } catch (e) {
        return Err(
          parserUnavailable(
            `@typescript-eslint/typescript-estree could not be loaded: ${
              e instanceof Error ? e.message : String(e)
            }`
          )
        );
      }
      return Ok(mod);
    })();
    return this.resolved;
  }

  async parseFile(path: string): Promise<Result<AST, ParseError>> {
    const moduleResult = await this.resolveModule();
    if (!moduleResult.ok) return Err(moduleResult.error);

    const contentResult = await readFileContent(path);
    if (!contentResult.ok) {
      return Err(
        createParseError('NOT_FOUND', `File not found: ${path}`, { path }, [
          'Check that the file exists',
          'Verify the path is correct',
        ])
      );
    }

    try {
      const ast = moduleResult.value.parse(
        contentResult.value,
        parseOptions(path.endsWith('.tsx'))
      );

      return Ok({
        type: 'Program',
        body: ast,
        language: 'typescript',
      });
    } catch (e) {
      const error = e as Error;
      return Err(
        createParseError('SYNTAX_ERROR', `Failed to parse ${path}: ${error.message}`, { path }, [
          'Check for syntax errors in the file',
          'Ensure valid TypeScript syntax',
        ])
      );
    }
  }

  extractImports(ast: AST): Result<Import[], ParseError> {
    const imports: Import[] = [];
    const program = ast.body as TSESTree.Program;

    walk(program, (node) => {
      if (node.type === 'ImportDeclaration') {
        const importDecl = node as TSESTree.ImportDeclaration;
        const imp: Import = {
          source: importDecl.source.value as string,
          specifiers: [],
          location: makeLocation(importDecl),
          kind: importDecl.importKind === 'type' ? 'type' : 'value',
        };
        processImportSpecifiers(importDecl, imp);
        imports.push(imp);
        return;
      }

      if (node.type === 'ImportExpression') {
        const importExpr = node as TSESTree.ImportExpression;
        if (importExpr.source.type === 'Literal' && typeof importExpr.source.value === 'string') {
          imports.push({
            source: importExpr.source.value,
            specifiers: [],
            location: makeLocation(importExpr),
            kind: 'value',
          });
        }
      }
    });

    return Ok(imports);
  }

  extractExports(ast: AST): Result<Export[], ParseError> {
    const exports: Export[] = [];
    const program = ast.body as TSESTree.Program;

    walk(program, (node) => {
      if (node.type === 'ExportNamedDeclaration') {
        const exportDecl = node as TSESTree.ExportNamedDeclaration;

        if (exportDecl.source) {
          processReExportSpecifiers(exportDecl, exports);
          return;
        }

        processExportDeclaration(exportDecl, exports);
        processExportListSpecifiers(exportDecl, exports);
        return;
      }

      if (node.type === 'ExportDefaultDeclaration') {
        const exportDecl = node as TSESTree.ExportDefaultDeclaration;
        exports.push({
          name: 'default',
          type: 'default',
          location: makeLocation(exportDecl),
          isReExport: false,
        });
        return;
      }

      if (node.type === 'ExportAllDeclaration') {
        const exportDecl = node as TSESTree.ExportAllDeclaration;
        exports.push({
          name: exportDecl.exported?.name ?? '*',
          type: 'namespace',
          location: makeLocation(exportDecl),
          isReExport: true,
          source: exportDecl.source.value as string,
        });
      }
    });

    return Ok(exports);
  }

  /**
   * Run the extractors over a trial-parse AST and describe what is wrong with
   * it, or `undefined` when it is usable.
   *
   * Split out of `health()` because the two have different jobs: this one knows
   * what {@link HEALTH_PROBE_SOURCE} must yield, `health()` only decides what to
   * report. Asserting on the EXTRACTED values (source, default specifier, named
   * specifier, line number) rather than on the raw node shape is deliberate —
   * the contract consumers hold is the extractor output, not the AST.
   */
  private describeUnusableProbe(program: TSESTree.Program): string | undefined {
    const probeAst: AST = { type: 'Program', body: program, language: 'typescript' };
    const imports = this.extractImports(probeAst);
    const exports = this.extractExports(probeAst);
    const probeImport = imports.ok ? imports.value[0] : undefined;
    const importUsable =
      imports.ok &&
      imports.value.length === 1 &&
      probeImport?.source === './probe-module' &&
      probeImport.default === 'probeDefault' &&
      probeImport.specifiers.includes('probeNamed') &&
      probeImport.location.line > 0;
    const exportUsable = exports.ok && exports.value.some((e) => e.name === 'probeExport');
    if (importUsable && exportUsable) return undefined;
    return (
      'typescript parser trial parse produced an AST its extractors cannot read ' +
      `(imports usable: ${importUsable}, exports usable: ${exportUsable})`
    );
  }

  /**
   * Probe the parser rather than assert it.
   *
   * "Available" means: the estree module resolves, exposes a callable `parse`,
   * and a trial parse of {@link HEALTH_PROBE_SOURCE} yields an AST that this
   * parser's own `extractImports`/`extractExports` can read. That last clause is
   * the point — the contract consumers depend on is not "parse did not throw",
   * it is "the extracted imports and exports are usable", and only an
   * end-to-end probe covers an API that drifts without erroring.
   *
   * Returns `Ok({ available: false, message })` (not `Err`) for every failure,
   * because an unavailable parser is an answer to the health question, not a
   * failure to answer it; `validateDependencies` then applies the caller's
   * `fallbackBehavior`. The reported `version` is the module's own, so it tracks
   * the installed package instead of a hardcoded literal (#2267).
   */
  async health(): Promise<Result<HealthCheckResult, ParseError>> {
    const moduleResult = await this.resolveModule();
    if (!moduleResult.ok) {
      return Ok({ available: false, message: moduleResult.error.message });
    }
    const { parse, version } = moduleResult.value;

    let program: TSESTree.Program;
    try {
      program = parse(HEALTH_PROBE_SOURCE, parseOptions(false));
    } catch (e) {
      return Ok({
        available: false,
        message: `typescript parser trial parse failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
    }

    const unusable = this.describeUnusableProbe(program);
    if (unusable !== undefined) {
      return Ok({ available: false, message: unusable });
    }

    return Ok({
      available: true,
      ...(typeof version === 'string' && version.length > 0 ? { version } : {}),
    });
  }
}
