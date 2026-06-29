import { hash } from '../ingestUtils.js';
import type { ExtractionRecord, Language, SignalExtractor } from './types.js';

/** Regex patterns for extracting test descriptions by language. */
const PATTERNS: Record<Language, RegExp[]> = {
  typescript: [/(?:describe|it|test)\s*\(\s*(['"`])((?:(?!\1).)*)\1/g],
  javascript: [/(?:describe|it|test)\s*\(\s*(['"`])((?:(?!\1).)*)\1/g],
  python: [/def\s+(test_\w+)\s*\(/g, /"""((?:(?!""").)*?)"""/gs, /class\s+(Test\w+)/g],
  go: [/func\s+(Test\w+)\s*\(/g, /t\.Run\(\s*"([^"]+)"/g],
  rust: [/#\[test\]\s*\n\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g, /\/\/\/\s*(.+)/g],
  java: [
    /@DisplayName\s*\(\s*"([^"]+)"\s*\)/g,
    /@Test\s*\n\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:void|[\w<>]+)\s+(\w+)\s*\(/g,
  ],
};

/** Matches a Rust `fn` declaration following a `#[test]` attribute. */
const RUST_FN_RE = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/;
/** Matches a JUnit `@DisplayName("...")` annotation. */
const JAVA_DISPLAY_RE = /@DisplayName\s*\(\s*"([^"]+)"\s*\)/;
/** Matches a Java method declaration (the test method name). */
const JAVA_METHOD_RE =
  /^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:void|[\w<>[\]]+)\s+(\w+)\s*\(/;

/**
 * Extracts business rules from test descriptions.
 * Finds describe/it/test blocks (TS/JS), test_ functions (Python),
 * Test* functions + t.Run subtests (Go), #[test] fns (Rust),
 * @Test + @DisplayName (Java).
 */
export class TestDescriptionExtractor implements SignalExtractor {
  readonly name = 'test-descriptions';
  readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];

  extract(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const patterns = PATTERNS[language];
    if (!patterns) return records;

    const lines = content.split('\n');

    // Track describe context for TS/JS
    if (language === 'typescript' || language === 'javascript') {
      return this.extractJsTs(content, filePath, language, lines);
    }

    if (language === 'python') {
      return this.extractPython(content, filePath, language, lines);
    }

    if (language === 'go') {
      return this.extractGo(content, filePath, language, lines);
    }

    if (language === 'rust') {
      return this.extractRust(content, filePath, language, lines);
    }

    if (language === 'java') {
      return this.extractJava(content, filePath, language, lines);
    }

    return records;
  }

  private extractJsTs(
    _content: string,
    filePath: string,
    language: Language,
    lines: string[]
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const describeStack: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      this.scanJsTsLine(lines[i]!, i, language, filePath, describeStack, records);
    }

    return records;
  }

  private scanJsTsLine(
    line: string,
    index: number,
    language: Language,
    filePath: string,
    describeStack: string[],
    records: ExtractionRecord[]
  ): void {
    // Track describe blocks
    const describeMatch = line.match(/describe\s*\(\s*(['"`])((?:(?!\1).)*)\1/);
    if (describeMatch) describeStack.push(describeMatch[2]!);

    // Extract it/test descriptions
    const itMatch = line.match(/(?:it|test)\s*\(\s*(['"`])((?:(?!\1).)*)\1/);
    if (itMatch) {
      records.push(this.buildJsTsRecord(itMatch[2]!, index, language, filePath, describeStack));
    }

    // Pop describe on closing — simplified heuristic: count closing parens after describe
    if (/^\s*\}\s*\)\s*;?\s*$/.test(line) && describeStack.length > 0) describeStack.pop();
  }

  private buildJsTsRecord(
    testName: string,
    index: number,
    language: Language,
    filePath: string,
    describeStack: string[]
  ): ExtractionRecord {
    const fullPath = [...describeStack, testName].join(' > ');
    const patternKey = fullPath;

    return {
      id: `extracted:test-descriptions:${hash(filePath + ':' + patternKey)}`,
      extractor: 'test-descriptions',
      language,
      filePath,
      line: index + 1,
      nodeType: 'business_rule',
      name: testName,
      content: fullPath,
      confidence: 0.7,
      metadata: {
        suite: describeStack.length > 0 ? describeStack[describeStack.length - 1] : undefined,
        framework: 'vitest',
      },
    };
  }

  private extractPython(
    _content: string,
    filePath: string,
    language: Language,
    lines: string[]
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    let currentClass: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      const classMatch = line.match(/^class\s+(Test\w+)/);
      if (classMatch) currentClass = classMatch[1]!;

      const funcMatch = line.match(/^\s*def\s+(test_\w+)\s*\(/);
      if (funcMatch) {
        records.push(
          this.buildPythonRecord(funcMatch[1]!, i, language, filePath, currentClass, lines)
        );
      }

      // Reset class context on unindented non-class line
      if (this.isPythonClassReset(line, currentClass)) currentClass = undefined;
    }

    return records;
  }

  private isPythonClassReset(line: string, currentClass: string | undefined): boolean {
    return Boolean(
      currentClass &&
      /^\S/.test(line) &&
      !line.startsWith('class ') &&
      !line.startsWith('#') &&
      line.trim() !== ''
    );
  }

  private findPythonDocstring(lines: string[], index: number): string | undefined {
    // Look for docstring on next line
    if (index + 1 >= lines.length) return undefined;
    const nextLine = lines[index + 1]!.trim();
    const docMatch = nextLine.match(/^"""(.+?)"""/);
    return docMatch ? docMatch[1] : undefined;
  }

  private buildPythonRecord(
    testName: string,
    index: number,
    language: Language,
    filePath: string,
    currentClass: string | undefined,
    lines: string[]
  ): ExtractionRecord {
    const humanName = testName.replace(/^test_/, '').replace(/_/g, ' ');
    const docstring = this.findPythonDocstring(lines, index);
    const patternKey = currentClass ? `${currentClass}.${testName}` : testName;

    return {
      id: `extracted:test-descriptions:${hash(filePath + ':' + patternKey)}`,
      extractor: 'test-descriptions',
      language,
      filePath,
      line: index + 1,
      nodeType: 'business_rule',
      name: docstring ?? humanName,
      content: patternKey,
      confidence: docstring ? 0.7 : 0.5,
      metadata: {
        suite: currentClass,
        framework: 'pytest',
        functionName: testName,
      },
    };
  }

  private extractGo(
    _content: string,
    filePath: string,
    language: Language,
    lines: string[]
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    let currentTest: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      const funcMatch = line.match(/^func\s+(Test\w+)\s*\(/);
      if (funcMatch) {
        currentTest = funcMatch[1]!;
        const humanName = currentTest
          .replace(/^Test/, '')
          .replace(/([A-Z])/g, ' $1')
          .trim();

        records.push({
          id: `extracted:test-descriptions:${hash(filePath + ':' + currentTest)}`,
          extractor: 'test-descriptions',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_rule',
          name: humanName,
          content: currentTest,
          confidence: 0.5,
          metadata: { framework: 'testing' },
        });
      }

      const runMatch = line.match(/t\.Run\(\s*"([^"]+)"/);
      if (runMatch && currentTest) {
        const subtestName = runMatch[1]!;
        const patternKey = `${currentTest} > ${subtestName}`;

        records.push({
          id: `extracted:test-descriptions:${hash(filePath + ':' + patternKey)}`,
          extractor: 'test-descriptions',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_rule',
          name: subtestName,
          content: patternKey,
          confidence: 0.7,
          metadata: {
            suite: currentTest,
            framework: 'testing',
          },
        });
      }
    }

    return records;
  }

  private extractRust(
    _content: string,
    filePath: string,
    language: Language,
    lines: string[]
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim() !== '#[test]') continue;
      const record = this.buildRustRecord(lines, i, language, filePath);
      if (record) records.push(record);
    }

    return records;
  }

  private buildRustRecord(
    lines: string[],
    testIdx: number,
    language: Language,
    filePath: string
  ): ExtractionRecord | undefined {
    // Next non-empty line should be the fn declaration
    for (let j = testIdx + 1; j < lines.length && j <= testIdx + 3; j++) {
      const fnMatch = lines[j]!.match(RUST_FN_RE);
      if (!fnMatch) continue;

      const testName = fnMatch[1]!;
      const humanName = testName.replace(/^test_/, '').replace(/_/g, ' ');
      const docComment = this.findRustDocComment(lines, testIdx);

      return {
        id: `extracted:test-descriptions:${hash(filePath + ':' + testName)}`,
        extractor: 'test-descriptions',
        language,
        filePath,
        line: j + 1,
        nodeType: 'business_rule',
        name: docComment ?? humanName,
        content: testName,
        confidence: docComment ? 0.7 : 0.5,
        metadata: { framework: 'rust-test' },
      };
    }

    return undefined;
  }

  private findRustDocComment(lines: string[], testIdx: number): string | undefined {
    // Look for doc comment above #[test]
    if (testIdx <= 0) return undefined;
    const prevLine = lines[testIdx - 1]!.trim();
    const docMatch = prevLine.match(/^\/\/\/\s*(.+)/);
    return docMatch ? docMatch[1] : undefined;
  }

  private extractJava(
    _content: string,
    filePath: string,
    language: Language,
    lines: string[]
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (!/@Test\s*$/.test(lines[i]!)) continue;
      const record = this.buildJavaRecord(lines, i, language, filePath);
      if (record) records.push(record);
    }

    return records;
  }

  private buildJavaRecord(
    lines: string[],
    testIdx: number,
    language: Language,
    filePath: string
  ): ExtractionRecord | undefined {
    // Scan nearby lines for @DisplayName and method declaration
    let displayName = this.findJavaDisplayNameBefore(lines, testIdx);

    // Look forward for @DisplayName and method declaration
    for (let j = testIdx + 1; j < lines.length && j <= testIdx + 5; j++) {
      const scanLine = lines[j]!;

      const adjacentDisplay = scanLine.match(JAVA_DISPLAY_RE);
      if (adjacentDisplay) {
        displayName = adjacentDisplay[1]!;
        continue;
      }

      const methodMatch = scanLine.match(JAVA_METHOD_RE);
      if (methodMatch) {
        return this.buildJavaRecordFromMethod(methodMatch[1]!, displayName, j, language, filePath);
      }
    }

    return undefined;
  }

  private findJavaDisplayNameBefore(lines: string[], testIdx: number): string | undefined {
    // Look backward for @DisplayName (up to 3 lines before @Test)
    let displayName: string | undefined;
    for (let k = Math.max(0, testIdx - 3); k < testIdx; k++) {
      const dm = lines[k]!.match(JAVA_DISPLAY_RE);
      if (dm) displayName = dm[1]!;
    }
    return displayName;
  }

  private buildJavaRecordFromMethod(
    methodName: string,
    displayName: string | undefined,
    index: number,
    language: Language,
    filePath: string
  ): ExtractionRecord {
    const name = displayName ?? methodName;
    const patternKey = displayName ?? methodName;

    return {
      id: `extracted:test-descriptions:${hash(filePath + ':' + patternKey)}`,
      extractor: 'test-descriptions',
      language,
      filePath,
      line: index + 1,
      nodeType: 'business_rule',
      name,
      content: patternKey,
      confidence: displayName ? 0.7 : 0.5,
      metadata: { framework: 'junit5' },
    };
  }
}
