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

const fires = (code: string, src: string) => run(code, 'F.tsx', src).length === 1;

describe('ANAT-P catalog completeness', () => {
  it('ships at least 10 patterns with unique codes and slugs', () => {
    expect(PATTERN_CHECKS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(PATTERN_CHECKS.map((p) => p.code)).size).toBe(PATTERN_CHECKS.length);
    expect(new Set(PATTERN_CHECKS.map((p) => p.id)).size).toBe(PATTERN_CHECKS.length);
    for (const p of PATTERN_CHECKS) expect(p.code).toMatch(/^ANAT-P\d{3}$/);
  });
});

describe('ANAT-P003..P010 fire / suppress', () => {
  it('P003 fetch-without-error: fires on fetch with no error handling, suppressed by catch', () => {
    expect(fires('ANAT-P003', `useEffect(() => { fetch('/x').then(setData); }, []);`)).toBe(true);
    expect(fires('ANAT-P003', `try { await fetch('/x'); } catch (e) { setError(e); }`)).toBe(false);
  });

  it('P004 conditional-render-without-fallback: fires on `{data && <…>}`, suppressed by ternary', () => {
    expect(fires('ANAT-P004', `return <div>{data && <Profile user={data} />}</div>;`)).toBe(true);
    expect(fires('ANAT-P004', `return <div>{data ? <Profile/> : <EmptyState/>}</div>;`)).toBe(
      false
    );
  });

  it('P005 form-without-submit-feedback: fires on onSubmit, suppressed by isSubmitting', () => {
    expect(fires('ANAT-P005', `<form onSubmit={save}><button>Save</button></form>`)).toBe(true);
    expect(
      fires(
        'ANAT-P005',
        `<form onSubmit={save}><button disabled={isSubmitting}>Save</button></form>`
      )
    ).toBe(false);
  });

  it('P006 modal-without-dismiss: fires on <Modal> with no close, suppressed by onClose', () => {
    expect(fires('ANAT-P006', `return <Modal><Body/></Modal>;`)).toBe(true);
    expect(fires('ANAT-P006', `return <Modal onClose={hide}><Body/></Modal>;`)).toBe(false);
  });

  it('P007 async-action-without-pending: fires on async handler, suppressed by disabled', () => {
    expect(fires('ANAT-P007', `<button onClick={async () => { await save(); }}>Go</button>`)).toBe(
      true
    );
    expect(
      fires(
        'ANAT-P007',
        `<button disabled={pending} onClick={async () => { await save(); }}>Go</button>`
      )
    ).toBe(false);
  });

  it('P008 list-without-key: fires on keyless map, suppressed by key=', () => {
    expect(fires('ANAT-P008', `{items.map((i) => <Row data={i} />)}`)).toBe(true);
    expect(fires('ANAT-P008', `{items.map((i) => <Row key={i.id} data={i} />)}`)).toBe(false);
  });

  it('P009 router-without-not-found: fires on <Routes> with no catch-all, suppressed by path="*"', () => {
    expect(fires('ANAT-P009', `<Routes><Route path="/" element={<Home/>} /></Routes>`)).toBe(true);
    expect(fires('ANAT-P009', `<Routes><Route path="*" element={<NotFound/>} /></Routes>`)).toBe(
      false
    );
  });

  it('P010 destructive-action-without-confirm: fires on delete handler, suppressed by confirm', () => {
    expect(fires('ANAT-P010', `const onDelete = () => api.remove(id);`)).toBe(true);
    expect(
      fires('ANAT-P010', `const onDelete = () => { if (confirm('Sure?')) api.remove(id); };`)
    ).toBe(false);
  });
});

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
