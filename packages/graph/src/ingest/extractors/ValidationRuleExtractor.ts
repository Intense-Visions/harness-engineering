import { hash } from '../ingestUtils.js';
import type { ExtractionRecord, Language, SignalExtractor } from './types.js';

/**
 * Extracts business constraints from validation schemas and decorators.
 * Finds Zod schemas (TS/JS), Pydantic models (Python), struct validate
 * tags (Go), #[validate] macros (Rust), Bean Validation (Java).
 */
export class ValidationRuleExtractor implements SignalExtractor {
  readonly name = 'validation-rules';
  readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];

  extract(content: string, filePath: string, language: Language): ExtractionRecord[] {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.extractZod(content, filePath, language);
      case 'python':
        return this.extractPydantic(content, filePath, language);
      case 'go':
        return this.extractGoValidate(content, filePath, language);
      case 'rust':
        return this.extractRustValidate(content, filePath, language);
      case 'java':
        return this.extractBeanValidation(content, filePath, language);
    }
  }

  private extractZod(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Zod schema declarations: const XSchema = z.object({...})
      const schemaMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*z\.object\s*\(\s*\{/);
      if (schemaMatch) {
        const schemaName = schemaMatch[1]!;
        // Collect field-level validations
        const constraints = this.collectZodConstraints(lines, i + 1);

        records.push({
          id: `extracted:validation-rules:${hash(filePath + ':' + schemaName)}`,
          extractor: 'validation-rules',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_rule',
          name: schemaName,
          content: `${schemaName}: ${constraints.join('; ')}`,
          confidence: 0.8,
          metadata: { kind: 'zod-schema', constraints, framework: 'zod' },
        });
      }
    }

    return records;
  }

  private collectZodConstraints(lines: string[], startLine: number): string[] {
    const constraints: string[] = [];
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line.startsWith('}') || line.startsWith(')')) break;
      if (line === '' || line.startsWith('//')) continue;

      // Match field: z.type().constraint()
      const fieldMatch = line.match(/(\w+)\s*:\s*z\.(.+?)(?:,?\s*$)/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1]!;
        const chain = fieldMatch[2]!;
        constraints.push(`${fieldName}: ${chain}`);
      }
    }
    return constraints;
  }

  private extractPydantic(
    content: string,
    filePath: string,
    language: Language
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Pydantic BaseModel classes
      const modelMatch = line.match(/^class\s+(\w+)\s*\(\s*BaseModel\s*\)/);
      if (modelMatch) {
        const modelName = modelMatch[1]!;
        const constraints = this.collectPydanticConstraints(lines, i + 1);

        records.push({
          id: `extracted:validation-rules:${hash(filePath + ':' + modelName)}`,
          extractor: 'validation-rules',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_rule',
          name: modelName,
          content: `${modelName}: ${constraints.join('; ')}`,
          confidence: 0.8,
          metadata: { kind: 'pydantic-model', constraints, framework: 'pydantic' },
        });
      }
    }

    return records;
  }

  private collectPydanticConstraints(lines: string[], startLine: number): string[] {
    const constraints: string[] = [];
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^\S/.test(line) && line.trim() !== '') break;
      if (line.trim() === '' || line.trim().startsWith('#')) continue;

      // Match field: type = Field(...)
      const fieldMatch = line.match(/^\s+(\w+)\s*:\s*(.+?)(?:\s*$)/);
      if (fieldMatch) {
        constraints.push(`${fieldMatch[1]}: ${fieldMatch[2]}`);
      }
    }
    return constraints;
  }

  private extractGoValidate(
    content: string,
    filePath: string,
    language: Language
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Struct type declarations
      const structMatch = line.match(/^type\s+(\w+)\s+struct\s*\{/);
      if (structMatch) {
        const structName = structMatch[1]!;
        const constraints = this.collectGoValidateTags(lines, i + 1);

        if (constraints.length > 0) {
          records.push({
            id: `extracted:validation-rules:${hash(filePath + ':' + structName)}`,
            extractor: 'validation-rules',
            language,
            filePath,
            line: i + 1,
            nodeType: 'business_rule',
            name: structName,
            content: `${structName}: ${constraints.join('; ')}`,
            confidence: 0.8,
            metadata: { kind: 'struct-tags', constraints, framework: 'go-playground/validator' },
          });
        }
      }
    }

    return records;
  }

  private collectGoValidateTags(lines: string[], startLine: number): string[] {
    const constraints: string[] = [];
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line === '}') break;
      if (line === '' || line.startsWith('//')) continue;

      const tagMatch = line.match(/(\w+)\s+\S+\s+`[^`]*validate:"([^"]+)"[^`]*`/);
      if (tagMatch) {
        constraints.push(`${tagMatch[1]}: ${tagMatch[2]}`);
      }
    }
    return constraints;
  }

  private extractRustValidate(
    content: string,
    filePath: string,
    language: Language
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // #[derive(Validate)] struct
      const deriveMatch = line.match(/#\[derive\([^)]*Validate[^)]*\)\]/);
      if (deriveMatch) {
        // Next line should be struct declaration
        for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
          const structLine = lines[j]!;
          const structMatch = structLine.match(/^(?:pub\s+)?struct\s+(\w+)/);
          if (structMatch) {
            const structName = structMatch[1]!;
            const constraints = this.collectRustValidateAttrs(lines, j + 1);

            if (constraints.length > 0) {
              records.push({
                id: `extracted:validation-rules:${hash(filePath + ':' + structName)}`,
                extractor: 'validation-rules',
                language,
                filePath,
                line: j + 1,
                nodeType: 'business_rule',
                name: structName,
                content: `${structName}: ${constraints.join('; ')}`,
                confidence: 0.8,
                metadata: { kind: 'validate-derive', constraints, framework: 'validator' },
              });
            }
            break;
          }
        }
      }
    }

    return records;
  }

  private collectRustValidateAttrs(lines: string[], startLine: number): string[] {
    const constraints: string[] = [];
    let pendingValidate: string | undefined;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line === '}') break;

      const attrMatch = line.match(/#\[validate\((.+?)\)\]/);
      if (attrMatch) {
        pendingValidate = attrMatch[1]!;
        continue;
      }

      if (pendingValidate) {
        const fieldMatch = line.match(/(?:pub\s+)?(\w+)\s*:/);
        if (fieldMatch) {
          constraints.push(`${fieldMatch[1]}: ${pendingValidate}`);
          pendingValidate = undefined;
        }
      }
    }
    return constraints;
  }

  private extractBeanValidation(
    content: string,
    filePath: string,
    language: Language
  ): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    // Find classes with validation annotations
    const classRanges = this.findJavaClasses(lines);

    for (const { name: className, startLine, endLine } of classRanges) {
      const constraints = this.collectBeanConstraints(lines, startLine, endLine);
      if (constraints.length > 0) {
        records.push({
          id: `extracted:validation-rules:${hash(filePath + ':' + className)}`,
          extractor: 'validation-rules',
          language,
          filePath,
          line: startLine + 1,
          nodeType: 'business_rule',
          name: className,
          content: `${className}: ${constraints.join('; ')}`,
          confidence: 0.8,
          metadata: { kind: 'bean-validation', constraints, framework: 'javax.validation' },
        });
      }
    }

    return records;
  }

  private findJavaClasses(
    lines: string[]
  ): Array<{ name: string; startLine: number; endLine: number }> {
    const classes: Array<{ name: string; startLine: number; endLine: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const match = line.match(/(?:public\s+|private\s+|protected\s+)?class\s+(\w+)/);
      if (match) {
        const endLine = this.findClosingBrace(lines, i);
        classes.push({ name: match[1]!, startLine: i, endLine });
      }
    }
    return classes;
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

  private collectBeanConstraints(lines: string[], startLine: number, endLine: number): string[] {
    const constraints: string[] = [];
    const validationAnnotations = [
      '@NotNull',
      '@NotBlank',
      '@NotEmpty',
      '@Size',
      '@Min',
      '@Max',
      '@DecimalMin',
      '@DecimalMax',
      '@Email',
      '@Pattern',
      '@Positive',
      '@Negative',
      '@Past',
      '@Future',
    ];

    let pendingAnnotations: string[] = [];

    for (let i = startLine + 1; i < endLine; i++) {
      const line = lines[i]!.trim();

      // Check for validation annotations
      for (const anno of validationAnnotations) {
        if (line.startsWith(anno)) {
          pendingAnnotations.push(line.replace(/;?\s*$/, ''));
        }
      }

      // Field declaration after annotations
      if (pendingAnnotations.length > 0) {
        const fieldMatch = line.match(
          /(?:private|public|protected)\s+(?:[\w<>[\]]+)\s+(\w+)\s*[;=]/
        );
        if (fieldMatch) {
          constraints.push(`${fieldMatch[1]}: ${pendingAnnotations.join(', ')}`);
          pendingAnnotations = [];
        }
      }
    }
    return constraints;
  }
}
