import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { PlantUmlParser } from '../../src/ingest/PlantUmlParser.js';

const FIXTURES_DIR = path.resolve(__dirname, '../__fixtures__/diagrams');

describe('PlantUmlParser', () => {
  const parser = new PlantUmlParser();

  describe('canParse()', () => {
    it('returns true for .puml extension', () => {
      expect(parser.canParse('', '.puml')).toBe(true);
    });

    it('returns true for .plantuml extension', () => {
      expect(parser.canParse('', '.plantuml')).toBe(true);
    });

    it('returns false for .mmd', () => {
      expect(parser.canParse('', '.mmd')).toBe(false);
    });
  });

  describe('class diagram parsing', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'class.puml'), 'utf-8');
    const result = parser.parse(content, 'class.puml');

    it('extracts 2 classes (AuthService, TokenStore)', () => {
      expect(result.entities).toHaveLength(2);
      const ids = result.entities.map((e) => e.id);
      expect(ids).toContain('AuthService');
      expect(ids).toContain('TokenStore');
    });

    it('extracts 1 relationship (AuthService -> TokenStore)', () => {
      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0].from).toBe('AuthService');
      expect(result.relationships[0].to).toBe('TokenStore');
    });

    it('captures relationship label (uses)', () => {
      expect(result.relationships[0].label).toBe('uses');
    });

    it('sets metadata.format to plantuml and diagramType to class', () => {
      expect(result.metadata.format).toBe('plantuml');
      expect(result.metadata.diagramType).toBe('class');
    });
  });

  describe('edge cases', () => {
    it('returns empty result for empty content', () => {
      const result = parser.parse('', 'empty.puml');
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
      expect(result.metadata.format).toBe('plantuml');
      expect(result.metadata.diagramType).toBe('unknown');
    });

    it('strips @startuml/@enduml wrappers', () => {
      const content = `@startuml
class Foo {
  +bar(): void
}
@enduml`;
      const result = parser.parse(content, 'simple.puml');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].id).toBe('Foo');
    });
  });
});
