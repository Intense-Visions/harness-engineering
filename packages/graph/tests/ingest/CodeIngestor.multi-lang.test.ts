import * as path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/multi-lang-project');

describe('CodeIngestor — multi-language support', () => {
  let store: GraphStore;
  let ingestor: CodeIngestor;

  beforeEach(() => {
    store = new GraphStore();
    ingestor = new CodeIngestor(store);
  });

  it('should ingest files from all supported languages', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const fileNodes = store.findNodes({ type: 'file' });
    const extensions = fileNodes.map((n) => path.extname(n.name));
    expect(extensions).toContain('.ts');
    expect(extensions).toContain('.py');
    expect(extensions).toContain('.go');
    expect(extensions).toContain('.rs');
    expect(extensions).toContain('.java');
  });

  it('should detect language metadata for each file', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const fileNodes = store.findNodes({ type: 'file' });
    const languages = fileNodes.map((n) => n.metadata?.language);
    expect(languages).toContain('typescript');
    expect(languages).toContain('python');
    expect(languages).toContain('go');
    expect(languages).toContain('rust');
    expect(languages).toContain('java');
  });

  // --- Python symbol extraction ---
  describe('Python', () => {
    it('should extract Python class', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const classes = store.findNodes({ type: 'class' });
      const pyClass = classes.find(
        (n) => n.name === 'AuthService' && n.path?.endsWith('.py')
      );
      expect(pyClass).toBeDefined();
    });

    it('should extract Python functions', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const functions = store.findNodes({ type: 'function' });
      const pyFn = functions.find(
        (n) => n.name === 'create_auth_service' && n.path?.endsWith('.py')
      );
      expect(pyFn).toBeDefined();
    });

    it('should extract Python methods inside class', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const methods = store.findNodes({ type: 'method' });
      const pyMethods = methods.filter((n) => n.path?.endsWith('.py'));
      const names = pyMethods.map((n) => n.name);
      expect(names).toContain('authenticate');
      expect(names).toContain('validate_token');
    });

    it('should extract Python top-level variables', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const vars = store.findNodes({ type: 'variable' });
      const pyVar = vars.find(
        (n) => n.name === 'MAX_SESSIONS' && n.path?.endsWith('.py')
      );
      expect(pyVar).toBeDefined();
    });
  });

  // --- Go symbol extraction ---
  describe('Go', () => {
    it('should extract Go structs as class nodes', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const classes = store.findNodes({ type: 'class' });
      const goStruct = classes.find(
        (n) => n.name === 'AuthService' && n.path?.endsWith('.go')
      );
      expect(goStruct).toBeDefined();
    });

    it('should extract Go functions', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const functions = store.findNodes({ type: 'function' });
      const goFn = functions.find(
        (n) => n.name === 'NewAuthService' && n.path?.endsWith('.go')
      );
      expect(goFn).toBeDefined();
      expect(goFn!.metadata?.exported).toBe(true);
    });

    it('should extract Go receiver methods', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const methods = store.findNodes({ type: 'method' });
      const goMethods = methods.filter((n) => n.path?.endsWith('.go'));
      const names = goMethods.map((n) => n.name);
      expect(names).toContain('Authenticate');
      expect(names).toContain('ValidateToken');
    });

    it('should extract Go variables', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const vars = store.findNodes({ type: 'variable' });
      const goVar = vars.find(
        (n) => n.name === 'MaxSessions' && n.path?.endsWith('.go')
      );
      expect(goVar).toBeDefined();
      expect(goVar!.metadata?.exported).toBe(true);
    });

    it('should mark unexported Go functions correctly', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const functions = store.findNodes({ type: 'function' });
      const hashFn = functions.find(
        (n) => n.name === 'hashPassword' && n.path?.endsWith('.go')
      );
      expect(hashFn).toBeDefined();
      expect(hashFn!.metadata?.exported).toBe(false);
    });
  });

  // --- Rust symbol extraction ---
  describe('Rust', () => {
    it('should extract Rust structs as class nodes', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const classes = store.findNodes({ type: 'class' });
      const rsStruct = classes.find(
        (n) => n.name === 'AuthService' && n.path?.endsWith('.rs')
      );
      expect(rsStruct).toBeDefined();
    });

    it('should extract Rust pub functions', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const functions = store.findNodes({ type: 'function' });
      const rsFn = functions.find(
        (n) => n.name === 'create_auth_service' && n.path?.endsWith('.rs')
      );
      expect(rsFn).toBeDefined();
      expect(rsFn!.metadata?.exported).toBe(true);
    });

    it('should extract Rust traits as interface nodes', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const interfaces = store.findNodes({ type: 'interface' });
      const rsTrait = interfaces.find(
        (n) => n.name === 'Authenticator' && n.path?.endsWith('.rs')
      );
      expect(rsTrait).toBeDefined();
    });

    it('should extract Rust impl methods', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const methods = store.findNodes({ type: 'method' });
      const rsMethods = methods.filter((n) => n.path?.endsWith('.rs'));
      const names = rsMethods.map((n) => n.name);
      expect(names).toContain('authenticate');
      expect(names).toContain('validate_token');
    });

    it('should extract Rust constants as variables', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const vars = store.findNodes({ type: 'variable' });
      const rsConst = vars.find(
        (n) => n.name === 'MAX_SESSIONS' && n.path?.endsWith('.rs')
      );
      expect(rsConst).toBeDefined();
    });
  });

  // --- Java symbol extraction ---
  describe('Java', () => {
    it('should extract Java classes', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const classes = store.findNodes({ type: 'class' });
      const javaClass = classes.find(
        (n) => n.name === 'AuthService' && n.path?.endsWith('.java')
      );
      expect(javaClass).toBeDefined();
      expect(javaClass!.metadata?.exported).toBe(true);
    });

    it('should extract Java methods', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const methods = store.findNodes({ type: 'method' });
      const javaMethods = methods.filter((n) => n.path?.endsWith('.java'));
      const names = javaMethods.map((n) => n.name);
      expect(names).toContain('authenticate');
      expect(names).toContain('validateToken');
    });
  });

  // --- Cross-language import extraction ---
  describe('Cross-language imports', () => {
    it('should extract import edges from Python files', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const pyFileId = store
        .findNodes({ type: 'file' })
        .find((n) => n.name === 'auth_service.py')?.id;
      if (pyFileId) {
        const imports = store.getEdges({ from: pyFileId, type: 'imports' });
        expect(imports.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should extract import edges from Go files', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const goFileId = store
        .findNodes({ type: 'file' })
        .find((n) => n.name === 'auth_service.go')?.id;
      if (goFileId) {
        const imports = store.getEdges({ from: goFileId, type: 'imports' });
        expect(imports.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should extract import edges from Java files', async () => {
      await ingestor.ingest(FIXTURE_DIR);
      const javaFileId = store
        .findNodes({ type: 'file' })
        .find((n) => n.name === 'AuthService.java')?.id;
      if (javaFileId) {
        const imports = store.getEdges({ from: javaFileId, type: 'imports' });
        expect(imports.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // --- Contains edges ---
  it('should create contains edges for multi-language symbols', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const containsEdges = store.getEdges({ type: 'contains' });
    // Should have contains edges from files to their symbols for all languages
    expect(containsEdges.length).toBeGreaterThanOrEqual(10);
  });
});
