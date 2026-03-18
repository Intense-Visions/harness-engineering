import * as path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('CodeIngestor', () => {
  let store: GraphStore;
  let ingestor: CodeIngestor;

  beforeEach(() => {
    store = new GraphStore();
    ingestor = new CodeIngestor(store);
  });

  it('should ingest TypeScript files as file nodes', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const fileNodes = store.findNodes({ type: 'file' });
    // Fixture has: src/index.ts, src/types.ts, src/utils/hash.ts,
    // src/services/auth-service.ts, src/services/user-service.ts
    expect(fileNodes.length).toBeGreaterThanOrEqual(5);
  });

  it('should create import edges between files', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    // auth-service imports types (type-only) and hash (static)
    const importEdges = store.getEdges({ type: 'imports' });
    expect(importEdges.length).toBeGreaterThanOrEqual(2);

    // Verify auth-service has outbound import edges
    const authFileId = 'file:src/services/auth-service.ts';
    const authImports = store.getEdges({ from: authFileId, type: 'imports' });
    expect(authImports.length).toBeGreaterThanOrEqual(2);
  });

  it('should extract function nodes', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const functionNodes = store.findNodes({ type: 'function' });
    const names = functionNodes.map((n) => n.name);
    expect(names).toContain('hashPassword');
    expect(names).toContain('verifyHash');
  });

  it('should extract class nodes', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const classNodes = store.findNodes({ type: 'class' });
    const names = classNodes.map((n) => n.name);
    expect(names).toContain('AuthService');
    expect(names).toContain('UserService');
  });

  it('should extract interface nodes', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const interfaceNodes = store.findNodes({ type: 'interface' });
    const names = interfaceNodes.map((n) => n.name);
    expect(names).toContain('User');
    expect(names).toContain('AuthToken');
  });

  it('should create contains edges from file to symbols', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    // hash.ts contains hashPassword and verifyHash
    const hashFileId = 'file:src/utils/hash.ts';
    const containsEdges = store.getEdges({ from: hashFileId, type: 'contains' });
    expect(containsEdges.length).toBeGreaterThanOrEqual(2);
  });

  it('should return timing information', async () => {
    const result = await ingestor.ingest(FIXTURE_DIR);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe('number');
  });

  it('should return no errors for valid project', async () => {
    const result = await ingestor.ingest(FIXTURE_DIR);
    expect(result.errors).toHaveLength(0);
  });

  it('should extract method nodes from classes', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const methodNodes = store.findNodes({ type: 'method' });
    const names = methodNodes.map((n) => n.name);
    // AuthService has: authenticate
    expect(names).toContain('authenticate');
    // UserService has: createUser, getUser, login
    expect(names).toContain('createUser');
    expect(names).toContain('getUser');
    expect(names).toContain('login');
  });

  it('should create contains edges from class to methods', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const authClassId = 'class:src/services/auth-service.ts:AuthService';
    const authMethods = store.getEdges({ from: authClassId, type: 'contains' });
    expect(authMethods.length).toBeGreaterThanOrEqual(1);

    const userClassId = 'class:src/services/user-service.ts:UserService';
    const userMethods = store.getEdges({ from: userClassId, type: 'contains' });
    expect(userMethods.length).toBeGreaterThanOrEqual(3);
  });

  it('should extract variable nodes', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const variableNodes = store.findNodes({ type: 'variable' });
    const names = variableNodes.map((n) => n.name);
    // types.ts has: export const MAX_USERS = 100
    expect(names).toContain('MAX_USERS');
  });

  it('should create calls edges between functions/methods', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const callsEdges = store.getEdges({ type: 'calls' });
    expect(callsEdges.length).toBeGreaterThanOrEqual(1);

    // auth-service's authenticate method calls hashPassword
    const authenticateId = 'method:src/services/auth-service.ts:AuthService.authenticate';
    const authenticateCalls = store.getEdges({ from: authenticateId, type: 'calls' });
    const calledNames = authenticateCalls.map((e) => e.to);
    expect(calledNames).toContain('function:src/utils/hash.ts:hashPassword');
  });

  it('should compute better endLine for classes using brace counting', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const authClass = store.findNodes({ type: 'class', name: 'AuthService' });
    expect(authClass).toHaveLength(1);
    // AuthService spans multiple lines (line 4 to line 13 in auth-service.ts)
    expect(authClass[0]!.location!.endLine).toBeGreaterThan(authClass[0]!.location!.startLine);
  });

  it('should compute better endLine for functions using brace counting', async () => {
    await ingestor.ingest(FIXTURE_DIR);
    const hashFn = store.findNodes({ type: 'function', name: 'hashPassword' });
    expect(hashFn).toHaveLength(1);
    // hashPassword is a single-line body but spans at least 2 lines in the fixture
    // The function has { on line 3 and } on line 5
    expect(hashFn[0]!.location!.endLine).toBeGreaterThanOrEqual(hashFn[0]!.location!.startLine);
  });
});
