import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PATTERN_CHECKS } from '../../../../src/audit/component-anatomy/catalog/patterns/index';
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy';

function run(code: string, file: string, contents: string) {
  const pattern = PATTERN_CHECKS.find((p) => p.code === code)!;
  return pattern.detect(file, contents, null);
}

describe('ANAT-P001 map-without-empty', () => {
  it('flags a .map render with no empty-state branch', () => {
    const findings = run(
      'ANAT-P001',
      'List.tsx',
      `export const List = ({ items }) => <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>;`
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe('ANAT-P001');
    expect(findings[0]!.severity).toBe('warn');
    expect(findings[0]!.line).toBe(1);
  });

  it('does not flag when a length-zero guard is present', () => {
    expect(
      run(
        'ANAT-P001',
        'List.tsx',
        `export const List = ({ items }) =>
           items.length === 0 ? <EmptyState/> : <ul>{items.map((i) => <li>{i}</li>)}</ul>;`
      )
    ).toEqual([]);
  });

  it('does not flag a file with no .map', () => {
    expect(run('ANAT-P001', 'X.tsx', 'export const X = () => <div/>;')).toEqual([]);
  });
});

describe('ANAT-P002 fetch-without-loading', () => {
  it('flags async fetching with no loading affordance', () => {
    const findings = run(
      'ANAT-P002',
      'Users.tsx',
      `export function Users() {
         const [data, setData] = useState(null);
         useEffect(() => { fetch('/api/users').then((r) => r.json()).then(setData); }, []);
         return <div>{data?.length}</div>;
       }`
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe('ANAT-P002');
  });

  it('does not flag when a loading state is present', () => {
    expect(
      run(
        'ANAT-P002',
        'Users.tsx',
        `export function Users() {
           const { data, isLoading } = useQuery('users');
           if (isLoading) return <Skeleton/>;
           return <div>{data}</div>;
         }`
      )
    ).toEqual([]);
  });

  it('does not flag a file with no async loading', () => {
    expect(run('ANAT-P002', 'Static.tsx', 'export const Static = () => <p>hi</p>;')).toEqual([]);
  });
});

describe('runAudit pattern wiring', () => {
  let dir = '';
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it('full mode emits ANAT-P findings + patternsApplied; fast mode does not', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anat-pat-'));
    const file = path.join(dir, 'List.tsx');
    fs.writeFileSync(
      file,
      `export const List = ({ items }) => <ul>{items.map((i) => <li>{i}</li>)}</ul>;`
    );

    const full = await runAudit({ path: dir, mode: 'full', files: [file] });
    const pCodes = full.findings.filter((f) => f.code.startsWith('ANAT-P')).map((f) => f.code);
    expect(pCodes).toContain('ANAT-P001');
    expect(full.catalog.patternsApplied).toContain('map-without-empty');

    const fast = await runAudit({ path: dir, mode: 'fast', files: [file] });
    expect(fast.findings.some((f) => f.code.startsWith('ANAT-P'))).toBe(false);
    expect(fast.catalog.patternsApplied).toEqual([]);
  });
});
