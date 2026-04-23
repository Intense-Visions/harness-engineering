import { hash } from '../ingestUtils.js';
import type { ExtractionRecord, Language, SignalExtractor } from './types.js';

/**
 * Extracts domain vocabulary from enum and constant definitions.
 * Finds enum declarations (all langs), as const objects (TS),
 * Object.freeze (JS), StrEnum/IntEnum (Python), iota (Go).
 */
export class EnumConstantExtractor implements SignalExtractor {
  readonly name = 'enum-constants';
  readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];

  extract(content: string, filePath: string, language: Language): ExtractionRecord[] {
    switch (language) {
      case 'typescript':
        return this.extractTypeScript(content, filePath, language);
      case 'javascript':
        return this.extractJavaScript(content, filePath, language);
      case 'python':
        return this.extractPython(content, filePath, language);
      case 'go':
        return this.extractGo(content, filePath, language);
      case 'rust':
        return this.extractRust(content, filePath, language);
      case 'java':
        return this.extractJava(content, filePath, language);
    }
  }

  private extractTypeScript(
    content: string,
    filePath: string,
    language: Language
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // enum declarations
      const enumMatch = line.match(/(?:export\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        const enumName = enumMatch[1]!;
        // Collect members until closing brace
        const members = this.collectEnumMembers(lines, i + 1);
        records.push({
          id: `extracted:enum-constants:${hash(filePath + ':' + enumName)}`,
          extractor: 'enum-constants',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_term',
          name: enumName,
          content: `enum ${enumName} { ${members.join(', ')} }`,
          confidence: 0.8,
          metadata: { kind: 'enum', members },
        });
      }

      // as const objects
      const constMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*\{/);
      if (constMatch && content.includes('as const')) {
        // Check if this particular const has `as const`
        const blockEnd = this.findClosingBrace(lines, i);
        const block = lines.slice(i, blockEnd + 1).join('\n');
        if (block.includes('as const')) {
          const constName = constMatch[1]!;
          const members = this.collectObjectKeys(lines, i + 1);
          records.push({
            id: `extracted:enum-constants:${hash(filePath + ':' + constName)}`,
            extractor: 'enum-constants',
            language,
            filePath,
            line: i + 1,
            nodeType: 'business_term',
            name: constName,
            content: `const ${constName} = { ${members.join(', ')} } as const`,
            confidence: 0.8,
            metadata: { kind: 'as-const', members },
          });
        }
      }

      // Union types
      const unionMatch = line.match(
        /(?:export\s+)?type\s+(\w+)\s*=\s*(['"`][\w]+['"`](?:\s*\|\s*['"`][\w]+['"`])+)/
      );
      if (unionMatch) {
        const typeName = unionMatch[1]!;
        const values = unionMatch[2]!.split('|').map((v) => v.trim().replace(/['"`]/g, ''));
        records.push({
          id: `extracted:enum-constants:${hash(filePath + ':' + typeName)}`,
          extractor: 'enum-constants',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_term',
          name: typeName,
          content: `type ${typeName} = ${values.map((v) => `'${v}'`).join(' | ')}`,
          confidence: 0.7,
          metadata: { kind: 'union-type', members: values },
        });
      }
    }

    return records;
  }

  private extractJavaScript(
    content: string,
    filePath: string,
    language: Language
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Object.freeze patterns
      const freezeMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*Object\.freeze\s*\(\s*\{/);
      if (freezeMatch) {
        const name = freezeMatch[1]!;
        const members = this.collectObjectKeys(lines, i + 1);
        records.push({
          id: `extracted:enum-constants:${hash(filePath + ':' + name)}`,
          extractor: 'enum-constants',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_term',
          name,
          content: `const ${name} = Object.freeze({ ${members.join(', ')} })`,
          confidence: 0.8,
          metadata: { kind: 'frozen-object', members },
        });
      }

      // Const objects with UPPER_CASE keys
      const constMatch = line.match(/(?:export\s+)?const\s+([A-Z][A-Z_\d]*)\s*=\s*\{/);
      if (constMatch && !freezeMatch) {
        const name = constMatch[1]!;
        const members = this.collectObjectKeys(lines, i + 1);
        if (members.length > 0 && members.every((m) => /^[A-Z][A-Z_\d]*$/.test(m))) {
          records.push({
            id: `extracted:enum-constants:${hash(filePath + ':' + name)}`,
            extractor: 'enum-constants',
            language,
            filePath,
            line: i + 1,
            nodeType: 'business_term',
            name,
            content: `const ${name} = { ${members.join(', ')} }`,
            confidence: 0.6,
            metadata: { kind: 'const-object', members },
          });
        }
      }
    }

    return records;
  }

  private extractPython(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Enum subclasses
      const enumMatch = line.match(
        /^class\s+(\w+)\s*\(\s*(?:str\s*,\s*)?(?:Enum|StrEnum|IntEnum|Flag|IntFlag)\s*\)/
      );
      if (enumMatch) {
        const enumName = enumMatch[1]!;
        const members = this.collectPythonEnumMembers(lines, i + 1);
        records.push({
          id: `extracted:enum-constants:${hash(filePath + ':' + enumName)}`,
          extractor: 'enum-constants',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_term',
          name: enumName,
          content: `class ${enumName}(Enum) { ${members.join(', ')} }`,
          confidence: 0.8,
          metadata: { kind: 'enum', members },
        });
      }

      // Literal type annotation
      const literalMatch = line.match(/(\w+)\s*=\s*Literal\s*\[([^\]]+)\]/);
      if (literalMatch) {
        const typeName = literalMatch[1]!;
        const values = literalMatch[2]!.split(',').map((v) => v.trim().replace(/["']/g, ''));
        records.push({
          id: `extracted:enum-constants:${hash(filePath + ':' + typeName)}`,
          extractor: 'enum-constants',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_term',
          name: typeName,
          content: `${typeName} = Literal[${values.map((v) => `"${v}"`).join(', ')}]`,
          confidence: 0.7,
          metadata: { kind: 'literal-type', members: values },
        });
      }
    }

    return records;
  }

  private extractGo(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Type declaration before iota
      const typeMatch = line.match(/^type\s+(\w+)\s+(?:int|string|uint|int32|int64|uint32|uint64)/);
      if (typeMatch) {
        // type declaration — just note the name for const blocks
      }

      // const block with iota or typed consts
      const constBlockMatch = line.match(/^const\s*\(/);
      if (constBlockMatch) {
        const consts: string[] = [];
        let typeName: string | undefined;
        for (let j = i + 1; j < lines.length; j++) {
          const constLine = lines[j]!.trim();
          if (constLine === ')') break;
          if (constLine === '' || constLine.startsWith('//')) continue;

          // First const with type + iota
          const iotaMatch = constLine.match(/^(\w+)\s+(\w+)\s*=\s*iota/);
          if (iotaMatch) {
            typeName = iotaMatch[2]!;
            consts.push(iotaMatch[1]!);
            continue;
          }

          // Typed const with value
          const typedMatch = constLine.match(/^(\w+)\s+(\w+)\s*=\s*"[^"]*"/);
          if (typedMatch) {
            typeName = typeName ?? typedMatch[2]!;
            consts.push(typedMatch[1]!);
            continue;
          }

          // Bare name (continuation of iota)
          const bareMatch = constLine.match(/^(\w+)\s*$/);
          if (bareMatch) {
            consts.push(bareMatch[1]!);
          }
        }

        if (consts.length > 0) {
          const name = typeName ?? consts[0]!;
          records.push({
            id: `extracted:enum-constants:${hash(filePath + ':' + name)}`,
            extractor: 'enum-constants',
            language,
            filePath,
            line: i + 1,
            nodeType: 'business_term',
            name,
            content: `const ( ${consts.join(', ')} )`,
            confidence: typeName ? 0.8 : 0.6,
            metadata: { kind: typeName ? 'typed-const' : 'const-block', members: consts },
          });
        }
      }
    }

    return records;
  }

  private extractRust(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      const enumMatch = line.match(/^(?:pub\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        const enumName = enumMatch[1]!;
        const members = this.collectRustEnumVariants(lines, i + 1);
        records.push({
          id: `extracted:enum-constants:${hash(filePath + ':' + enumName)}`,
          extractor: 'enum-constants',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_term',
          name: enumName,
          content: `enum ${enumName} { ${members.join(', ')} }`,
          confidence: 0.8,
          metadata: { kind: 'enum', members },
        });
      }
    }

    return records;
  }

  private extractJava(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      const enumMatch = line.match(/(?:public\s+|private\s+|protected\s+)?enum\s+(\w+)/);
      if (enumMatch) {
        const enumName = enumMatch[1]!;
        const members = this.collectJavaEnumConstants(lines, i + 1);
        records.push({
          id: `extracted:enum-constants:${hash(filePath + ':' + enumName)}`,
          extractor: 'enum-constants',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_term',
          name: enumName,
          content: `enum ${enumName} { ${members.join(', ')} }`,
          confidence: 0.8,
          metadata: { kind: 'enum', members },
        });
      }
    }

    return records;
  }

  // --- Helper methods ---

  private collectEnumMembers(lines: string[], startLine: number): string[] {
    const members: string[] = [];
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line === '}') break;
      if (line === '' || line.startsWith('//')) continue;
      const match = line.match(/^(\w+)/);
      if (match) members.push(match[1]!);
    }
    return members;
  }

  private collectObjectKeys(lines: string[], startLine: number): string[] {
    const keys: string[] = [];
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line.startsWith('}')) break;
      if (line === '' || line.startsWith('//')) continue;
      const match = line.match(/^(\w+)\s*:/);
      if (match) keys.push(match[1]!);
    }
    return keys;
  }

  private findClosingBrace(lines: string[], startLine: number): number {
    let depth = 0;
    for (let i = startLine; i < lines.length; i++) {
      for (const ch of lines[i]!) {
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) return i;
        }
      }
    }
    return lines.length - 1;
  }

  private collectPythonEnumMembers(lines: string[], startLine: number): string[] {
    const members: string[] = [];
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^\S/.test(line) && line.trim() !== '') break; // unindented line = end of class
      const match = line.match(/^\s+(\w+)\s*=/);
      if (match) members.push(match[1]!);
    }
    return members;
  }

  private collectRustEnumVariants(lines: string[], startLine: number): string[] {
    const variants: string[] = [];
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line === '}') break;
      if (line === '' || line.startsWith('//')) continue;
      const match = line.match(/^(\w+)/);
      if (match) variants.push(match[1]!);
    }
    return variants;
  }

  private collectJavaEnumConstants(lines: string[], startLine: number): string[] {
    const constants: string[] = [];
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line === '}') break;
      if (line === '' || line.startsWith('//') || line.startsWith('/*')) continue;
      // Stop at first method/field (non-constant)
      if (line.match(/^\s*(?:private|public|protected|static)/)) break;
      const match = line.match(/^(\w+)[\s(,;]/);
      if (match) constants.push(match[1]!);
      // Single-word constant at end
      const singleMatch = line.match(/^(\w+)$/);
      if (singleMatch) constants.push(singleMatch[1]!);
    }
    return constants;
  }
}
