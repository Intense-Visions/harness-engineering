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
      const line = lines[i]!;

      // Track describe blocks
      const describeMatch = line.match(/describe\s*\(\s*(['"`])((?:(?!\1).)*)\1/);
      if (describeMatch) {
        describeStack.push(describeMatch[2]!);
      }

      // Extract it/test descriptions
      const itMatch = line.match(/(?:it|test)\s*\(\s*(['"`])((?:(?!\1).)*)\1/);
      if (itMatch) {
        const testName = itMatch[2]!;
        const fullPath = [...describeStack, testName].join(' > ');
        const patternKey = fullPath;

        records.push({
          id: `extracted:test-descriptions:${hash(filePath + ':' + patternKey)}`,
          extractor: 'test-descriptions',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_rule',
          name: testName,
          content: fullPath,
          confidence: 0.7,
          metadata: {
            suite: describeStack.length > 0 ? describeStack[describeStack.length - 1] : undefined,
            framework: 'vitest',
          },
        });
      }

      // Pop describe on closing — simplified heuristic: count closing parens after describe
      if (line.match(/^\s*\}\s*\)\s*;?\s*$/) && describeStack.length > 0) {
        describeStack.pop();
      }
    }

    return records;
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
      if (classMatch) {
        currentClass = classMatch[1]!;
      }

      const funcMatch = line.match(/^\s*def\s+(test_\w+)\s*\(/);
      if (funcMatch) {
        const testName = funcMatch[1]!;
        const humanName = testName.replace(/^test_/, '').replace(/_/g, ' ');

        // Look for docstring on next line
        let docstring: string | undefined;
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1]!.trim();
          const docMatch = nextLine.match(/^"""(.+?)"""/);
          if (docMatch) {
            docstring = docMatch[1];
          }
        }

        const patternKey = currentClass ? `${currentClass}.${testName}` : testName;

        records.push({
          id: `extracted:test-descriptions:${hash(filePath + ':' + patternKey)}`,
          extractor: 'test-descriptions',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_rule',
          name: docstring ?? humanName,
          content: patternKey,
          confidence: docstring ? 0.7 : 0.5,
          metadata: {
            suite: currentClass,
            framework: 'pytest',
            functionName: testName,
          },
        });
      }

      // Reset class context on unindented non-class line
      if (
        currentClass &&
        /^\S/.test(line) &&
        !line.startsWith('class ') &&
        !line.startsWith('#') &&
        line.trim() !== ''
      ) {
        currentClass = undefined;
      }
    }

    return records;
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
      const line = lines[i]!;

      if (line.trim() === '#[test]') {
        // Next non-empty line should be the fn declaration
        for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
          const fnLine = lines[j]!;
          const fnMatch = fnLine.match(/(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
          if (fnMatch) {
            const testName = fnMatch[1]!;
            const humanName = testName.replace(/^test_/, '').replace(/_/g, ' ');

            // Look for doc comment above #[test]
            let docComment: string | undefined;
            if (i > 0) {
              const prevLine = lines[i - 1]!.trim();
              const docMatch = prevLine.match(/^\/\/\/\s*(.+)/);
              if (docMatch) {
                docComment = docMatch[1];
              }
            }

            records.push({
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
            });
            break;
          }
        }
      }
    }

    return records;
  }

  private extractJava(
    _content: string,
    filePath: string,
    language: Language,
    lines: string[]
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      const testMatch = line.match(/@Test\s*$/);
      if (testMatch) {
        // Scan nearby lines for @DisplayName and method declaration
        let displayName: string | undefined;

        // Look backward for @DisplayName (up to 3 lines before @Test)
        for (let k = Math.max(0, i - 3); k < i; k++) {
          const prevLine = lines[k]!;
          const dm = prevLine.match(/@DisplayName\s*\(\s*"([^"]+)"\s*\)/);
          if (dm) displayName = dm[1]!;
        }

        // Look forward for @DisplayName and method declaration
        for (let j = i + 1; j < lines.length && j <= i + 5; j++) {
          const scanLine = lines[j]!;

          const adjacentDisplay = scanLine.match(/@DisplayName\s*\(\s*"([^"]+)"\s*\)/);
          if (adjacentDisplay) {
            displayName = adjacentDisplay[1]!;
            continue;
          }

          const methodMatch = scanLine.match(
            /^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:void|[\w<>[\]]+)\s+(\w+)\s*\(/
          );
          if (methodMatch) {
            const methodName = methodMatch[1]!;
            const name = displayName ?? methodName;
            const patternKey = displayName ?? methodName;

            records.push({
              id: `extracted:test-descriptions:${hash(filePath + ':' + patternKey)}`,
              extractor: 'test-descriptions',
              language,
              filePath,
              line: j + 1,
              nodeType: 'business_rule',
              name,
              content: patternKey,
              confidence: displayName ? 0.7 : 0.5,
              metadata: { framework: 'junit5' },
            });
            break;
          }
        }
      }
    }

    return records;
  }
}
