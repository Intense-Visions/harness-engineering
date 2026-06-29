import { hash } from '../ingestUtils.js';
import type { ExtractionRecord, Language, SignalExtractor } from './types.js';

// Detection patterns are hoisted to module scope so their literal braces
// (e.g. `\{`) and optional groups don't confuse the brace-counting / decision
// counting complexity detector that scans the bodies of the loops below.
const TS_ENUM_RE = /(?:export\s+)?enum\s+(\w+)/;
const TS_AS_CONST_RE = /(?:export\s+)?const\s+(\w+)\s*=\s*\{/;
const TS_UNION_RE =
  /(?:export\s+)?type\s+(\w+)\s*=\s*(['"`][\w]+['"`](?:\s*\|\s*['"`][\w]+['"`])+)/;
const JS_FREEZE_RE = /(?:export\s+)?const\s+(\w+)\s*=\s*Object\.freeze\s*\(\s*\{/;
const JS_CONST_OBJECT_RE = /(?:export\s+)?const\s+([A-Z][A-Z_\d]*)\s*=\s*\{/;
const JS_UPPER_KEY_RE = /^[A-Z][A-Z_\d]*$/;
const PY_ENUM_RE =
  /^class\s+(\w+)\s*\(\s*(?:str\s*,\s*)?(?:Enum|StrEnum|IntEnum|Flag|IntFlag)\s*\)/;
const PY_LITERAL_RE = /(\w+)\s*=\s*Literal\s*\[([^\]]+)\]/;
const GO_TYPE_RE = /^type\s+(\w+)\s+(?:int|string|uint|int32|int64|uint32|uint64)/;
const GO_CONST_BLOCK_RE = /^const\s*\(/;
const GO_IOTA_RE = /^(\w+)\s+(\w+)\s*=\s*iota/;
const GO_TYPED_RE = /^(\w+)\s+(\w+)\s*=\s*"[^"]*"/;
const GO_BARE_RE = /^(\w+)\s*$/;
const RUST_ENUM_RE = /^(?:pub\s+)?enum\s+(\w+)/;
const JAVA_ENUM_RE = /(?:public\s+|private\s+|protected\s+)?enum\s+(\w+)/;

interface GoConstLine {
  name: string;
  typeName?: string;
  overwriteType?: boolean;
}

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
      const enumRecord = this.matchTsEnum(lines, i, filePath, language);
      if (enumRecord) records.push(enumRecord);

      const asConstRecord = this.matchTsAsConst(content, lines, i, filePath, language);
      if (asConstRecord) records.push(asConstRecord);

      const unionRecord = this.matchTsUnion(lines, i, filePath, language);
      if (unionRecord) records.push(unionRecord);
    }

    return records;
  }

  private matchTsEnum(
    lines: string[],
    i: number,
    filePath: string,
    language: Language
  ): ExtractionRecord | undefined {
    const enumMatch = lines[i]!.match(TS_ENUM_RE);
    if (!enumMatch) return undefined;
    const enumName = enumMatch[1]!;
    const members = this.collectEnumMembers(lines, i + 1);
    return {
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
    };
  }

  private matchTsAsConst(
    content: string,
    lines: string[],
    i: number,
    filePath: string,
    language: Language
  ): ExtractionRecord | undefined {
    const constMatch = lines[i]!.match(TS_AS_CONST_RE);
    if (!constMatch || !content.includes('as const')) return undefined;
    // Check if this particular const has `as const`
    const blockEnd = this.findClosingBrace(lines, i);
    const block = lines.slice(i, blockEnd + 1).join('\n');
    if (!block.includes('as const')) return undefined;
    const constName = constMatch[1]!;
    const members = this.collectObjectKeys(lines, i + 1);
    return {
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
    };
  }

  private matchTsUnion(
    lines: string[],
    i: number,
    filePath: string,
    language: Language
  ): ExtractionRecord | undefined {
    const unionMatch = lines[i]!.match(TS_UNION_RE);
    if (!unionMatch) return undefined;
    const typeName = unionMatch[1]!;
    const values = unionMatch[2]!.split('|').map((v) => v.trim().replace(/['"`]/g, ''));
    return {
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
    };
  }

  private extractJavaScript(
    content: string,
    filePath: string,
    language: Language
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Object.freeze patterns
      const freezeMatch = lines[i]!.match(JS_FREEZE_RE);
      if (freezeMatch) {
        records.push(this.buildJsFreezeRecord(freezeMatch[1]!, lines, i, filePath, language));
      }

      // Const objects with UPPER_CASE keys
      if (!freezeMatch) {
        const constRecord = this.matchJsConstObject(lines, i, filePath, language);
        if (constRecord) records.push(constRecord);
      }
    }

    return records;
  }

  private buildJsFreezeRecord(
    name: string,
    lines: string[],
    i: number,
    filePath: string,
    language: Language
  ): ExtractionRecord {
    const members = this.collectObjectKeys(lines, i + 1);
    return {
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
    };
  }

  private matchJsConstObject(
    lines: string[],
    i: number,
    filePath: string,
    language: Language
  ): ExtractionRecord | undefined {
    const constMatch = lines[i]!.match(JS_CONST_OBJECT_RE);
    if (!constMatch) return undefined;
    const name = constMatch[1]!;
    const members = this.collectObjectKeys(lines, i + 1);
    if (members.length === 0 || !members.every((m) => JS_UPPER_KEY_RE.test(m))) return undefined;
    return {
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
    };
  }

  private extractPython(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const enumRecord = this.matchPythonEnum(lines, i, filePath, language);
      if (enumRecord) records.push(enumRecord);

      const literalRecord = this.matchPythonLiteral(lines, i, filePath, language);
      if (literalRecord) records.push(literalRecord);
    }

    return records;
  }

  private matchPythonEnum(
    lines: string[],
    i: number,
    filePath: string,
    language: Language
  ): ExtractionRecord | undefined {
    const enumMatch = lines[i]!.match(PY_ENUM_RE);
    if (!enumMatch) return undefined;
    const enumName = enumMatch[1]!;
    const members = this.collectPythonEnumMembers(lines, i + 1);
    return {
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
    };
  }

  private matchPythonLiteral(
    lines: string[],
    i: number,
    filePath: string,
    language: Language
  ): ExtractionRecord | undefined {
    const literalMatch = lines[i]!.match(PY_LITERAL_RE);
    if (!literalMatch) return undefined;
    const typeName = literalMatch[1]!;
    const values = literalMatch[2]!.split(',').map((v) => v.trim().replace(/["']/g, ''));
    return {
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
    };
  }

  private extractGo(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Type declaration before iota
      const typeMatch = line.match(GO_TYPE_RE);
      if (typeMatch) {
        // type declaration — just note the name for const blocks
      }

      // const block with iota or typed consts
      const constBlockMatch = line.match(GO_CONST_BLOCK_RE);
      if (constBlockMatch) {
        const record = this.buildGoConstBlockRecord(lines, i, filePath, language);
        if (record) records.push(record);
      }
    }

    return records;
  }

  private buildGoConstBlockRecord(
    lines: string[],
    i: number,
    filePath: string,
    language: Language
  ): ExtractionRecord | undefined {
    const { consts, typeName } = this.collectGoConsts(lines, i + 1);
    if (consts.length === 0) return undefined;
    const name = typeName ?? consts[0]!;
    return {
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
    };
  }

  private collectGoConsts(
    lines: string[],
    startLine: number
  ): { consts: string[]; typeName: string | undefined } {
    const consts: string[] = [];
    let typeName: string | undefined;
    for (let j = startLine; j < lines.length; j++) {
      const constLine = lines[j]!.trim();
      if (constLine === ')') break;
      if (constLine === '' || constLine.startsWith('//')) continue;
      const parsed = this.parseGoConstLine(constLine);
      if (!parsed) continue;
      typeName = this.resolveGoTypeName(typeName, parsed);
      consts.push(parsed.name);
    }
    return { consts, typeName };
  }

  private parseGoConstLine(constLine: string): GoConstLine | undefined {
    // First const with type + iota
    const iotaMatch = constLine.match(GO_IOTA_RE);
    if (iotaMatch) return { name: iotaMatch[1]!, typeName: iotaMatch[2]!, overwriteType: true };

    // Typed const with value
    const typedMatch = constLine.match(GO_TYPED_RE);
    if (typedMatch) return { name: typedMatch[1]!, typeName: typedMatch[2]!, overwriteType: false };

    // Bare name (continuation of iota)
    const bareMatch = constLine.match(GO_BARE_RE);
    if (bareMatch) return { name: bareMatch[1]! };

    return undefined;
  }

  private resolveGoTypeName(current: string | undefined, parsed: GoConstLine): string | undefined {
    if (parsed.overwriteType) return parsed.typeName;
    if (parsed.typeName !== undefined && current === undefined) return parsed.typeName;
    return current;
  }

  private extractRust(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      const enumMatch = line.match(RUST_ENUM_RE);
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

      const enumMatch = line.match(JAVA_ENUM_RE);
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
        else if (ch === '}' && --depth === 0) return i;
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
