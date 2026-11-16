import type { AST, Export, Import, LanguageParser, ParseError } from '../../shared/parsers';
import type { ParserLookup } from '../../constraints/dependencies';
import { getDefaultRegistry } from '../../shared/parsers/registry';
import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';

/**
 * State shared by every collector in ONE `runAll` invocation (#2270).
 *
 * circular-deps, layer-violations and forbidden-imports each read an
 * overlapping set of source files, and before this each parsed every file it
 * read — so a file all three cover was parsed three times per `check-arch`. The
 * context is created by `runAll`, handed to every collector, and dropped when
 * `runAll` returns: nothing is held at module level, so the long-lived MCP
 * server, dashboard and orchestrator never carry one run's parse into the next
 * (and never serve a stale parse of a file that changed between runs).
 *
 * A collector called directly, without a context, makes its own — it then
 * shares nothing, which is exactly the pre-#2270 behavior.
 */
export interface CollectorRunContext {
  /** Memoizes each file's extracted imports for the lifetime of the run. */
  readonly imports: SharedImportParser;
}

export function createCollectorRunContext(): CollectorRunContext {
  return { imports: new SharedImportParser() };
}

const IMPORTS_ONLY = 'harness:imports-only';

/**
 * What the memoizing parser hands back from `parseFile`: the imports already
 * extracted, not the syntax tree. Retaining every file's full AST until the run
 * ends would hold the whole repository's trees in memory at once; the import
 * list is all the dependency collectors read.
 */
interface ImportsOnlyAST extends AST {
  type: typeof IMPORTS_ONLY;
  body: Result<Import[], ParseError>;
}

function isImportsOnly(ast: AST): ast is ImportsOnlyAST {
  return ast.type === IMPORTS_ONLY;
}

/**
 * A per-run memo of `parseFile` + `extractImports`, keyed by parser and file.
 *
 * It sits behind the `LanguageParser` / `ParserLookup` seams that
 * `buildDependencyGraph`, `validateDependencies` and the forbidden-import scan
 * already accept, so every collector still runs its own engine end to end over
 * its own file set; only the parse underneath is shared. Each parse is stored
 * as a promise, so collectors running concurrently under `runAll`'s fan-out
 * that reach the same file wait on one parse rather than starting a second.
 * Failed parses are memoized too: every reader sees the identical error a
 * fresh parse would have produced, which keeps a `PARSER_UNAVAILABLE`
 * fail-closed (#2267) and a skipped syntax error exactly as they were.
 */
export class SharedImportParser {
  private readonly parsed = new Map<
    LanguageParser,
    Map<string, Promise<Result<ImportsOnlyAST, ParseError>>>
  >();
  private readonly wrappers = new Map<LanguageParser, LanguageParser>();
  private realParses = 0;

  /** How many files were actually parsed — the memo's misses. */
  get parseCount(): number {
    return this.realParses;
  }

  /** A lookup whose parsers share this memo. */
  forLookup(lookup: ParserLookup): ParserLookup {
    return {
      getForFile: (file) => {
        const parser = lookup.getForFile(file);
        return parser ? this.forParser(parser) : null;
      },
    };
  }

  /** `parser`, with `parseFile` / `extractImports` answered from this memo. */
  forParser(parser: LanguageParser): LanguageParser {
    let wrapper = this.wrappers.get(parser);
    if (!wrapper) {
      wrapper = this.wrap(parser);
      this.wrappers.set(parser, wrapper);
    }
    return wrapper;
  }

  private wrap(parser: LanguageParser): LanguageParser {
    const source = canonicalParser(parser);
    return {
      name: parser.name,
      extensions: parser.extensions,
      parseFile: (file) => this.parse(source, file),
      extractImports: (ast) => (isImportsOnly(ast) ? ast.body : parser.extractImports(ast)),
      extractExports: (ast): Result<Export[], ParseError> => {
        if (isImportsOnly(ast)) {
          // A programming error, not a parse failure: the memo keeps imports
          // only. Throw rather than return an empty export list a caller could
          // mistake for a file that exports nothing.
          throw new Error(
            `SharedImportParser(${parser.name}) retains imports only; parse the file with the parser itself to read its exports`
          );
        }
        return parser.extractExports(ast);
      },
      health: () => parser.health(),
    };
  }

  private parse(parser: LanguageParser, file: string): Promise<Result<ImportsOnlyAST, ParseError>> {
    let byFile = this.parsed.get(parser);
    if (!byFile) {
      byFile = new Map();
      this.parsed.set(parser, byFile);
    }
    const hit = byFile.get(file);
    if (hit) return hit;
    const pending = this.parseImports(parser, file);
    byFile.set(file, pending);
    return pending;
  }

  private async parseImports(
    parser: LanguageParser,
    file: string
  ): Promise<Result<ImportsOnlyAST, ParseError>> {
    this.realParses++;
    const ast = await parser.parseFile(file);
    if (!ast.ok) return ast;
    return Ok({
      type: IMPORTS_ONLY,
      language: ast.value.language,
      body: parser.extractImports(ast.value),
    });
  }
}

/**
 * The parser whose parse a memo entry is keyed under.
 *
 * The default registry's `javascript` entry is the `typescript` parser's own
 * `parseFile` / `extractImports`, bound to the same instance (see
 * `shared/parsers/registry.ts`), so a `.js` file parses identically through
 * either. Keying both under the `typescript` instance lets the layer collector
 * (which parses every layer file with the `typescript` parser) reuse the
 * circular-deps collector's parse of a `.js` file (which looks it up as
 * `javascript`). Any other parser is its own key.
 */
function canonicalParser(parser: LanguageParser): LanguageParser {
  const registry = getDefaultRegistry();
  if (parser !== registry.getByLanguage('javascript')) return parser;
  return registry.getByLanguage('typescript') ?? parser;
}
