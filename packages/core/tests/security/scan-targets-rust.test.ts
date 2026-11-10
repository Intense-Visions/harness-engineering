import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { glob } from 'glob';
import { SecurityScanner } from '../../src/security/scanner';
import { SECURITY_SCAN_EXTENSIONS, SECURITY_SCAN_GLOB } from '../../src/security/scan-targets';
import { DEFAULT_SECURITY_CONFIG } from '../../src/security/types';

/**
 * #2274: Rust sources were outside the scan glob, so a Rust project's security
 * gate read zero files and abstained — the rust-base template shipped
 * `security.enabled: false` to paper over it. The language-agnostic rules
 * (secrets above all) apply to `.rs` text as-is, so the file must be read.
 */
describe('security scan covers Rust sources (#2274)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'sec-scan-rust-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src', 'main.rs'),
      [
        'const AWS_ACCESS_KEY_ID: &str = "AKIAIOSFODNN7EXAMPLE";',
        '',
        'fn main() {',
        '    println!("{}", AWS_ACCESS_KEY_ID);',
        '}',
        '',
      ].join('\n')
    );
    // Cargo build output must stay out of the scan like any other build dir.
    mkdirSync(join(root, 'target', 'debug', 'build'), { recursive: true });
    writeFileSync(
      join(root, 'target', 'debug', 'build', 'generated.rs'),
      'const K: &str = "AKIAIOSFODNN7EXAMPLE";\n'
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('includes rs in the shared extension list', () => {
    expect(SECURITY_SCAN_EXTENSIONS).toContain('rs');
  });

  it('matches a .rs file and flags a hardcoded AWS key in it', async () => {
    const files = await glob(SECURITY_SCAN_GLOB, {
      cwd: root,
      absolute: true,
      // The default exclude (what a config without `security.exclude` resolves to)
      // carries the shared skip-dirs, `target` included.
      ignore: [...(DEFAULT_SECURITY_CONFIG.exclude ?? [])],
    });
    expect(files.map((f) => f.replace(/\\/g, '/'))).toEqual([
      expect.stringMatching(/\/src\/main\.rs$/),
    ]);

    const scanner = new SecurityScanner({ enabled: true, strict: false });
    scanner.configureForProject(root);
    const result = await scanner.scanFiles(files);

    expect(result.scannedFiles).toBe(1);
    const aws = result.findings.filter((f) => f.ruleId === 'SEC-SEC-001');
    expect(aws).toHaveLength(1);
    expect(aws[0]!.line).toBe(1);
  });
});

/**
 * Validation of the rule set against idiomatic Rust (#2274 asked for this before
 * claiming coverage). Benign idioms must stay quiet — a gate that fires on every
 * `Command::new` would be switched off — and the language-agnostic secret rules
 * must still catch real credentials in Rust syntax.
 */
describe('rule set on idiomatic Rust (#2274)', () => {
  const scanner = new SecurityScanner({ enabled: true, strict: false });

  const benign: Record<string, string> = {
    'command.rs':
      'use std::process::Command;\nfn list(dir: &str) -> std::io::Result<std::process::Output> {\n    Command::new("ls").arg("-la").arg(dir).output()\n}\n',
    'format.rs':
      'fn greet(name: &str) -> String {\n    let msg = format!("Hello, {}!", name);\n    println!("{msg}");\n    eprintln!("debug: {:?}", msg);\n    msg\n}\n',
    'unsafe_block.rs': 'fn read_raw(p: *const u8) -> u8 {\n    unsafe { *p }\n}\n',
    'serde.rs':
      'fn parse(s: &str) -> serde_json::Result<Config> {\n    serde_json::from_str(s)\n}\n',
    'include.rs':
      'const SCHEMA: &str = include_str!("../schema.sql");\nconst LOGO: &[u8] = include_bytes!("../assets/logo.png");\n',
    'paths.rs':
      'use std::path::{Path, PathBuf};\nfn parent_config() -> PathBuf {\n    Path::new("../config").join("app.toml")\n}\n',
    'checksum.rs':
      'use sha1::{Digest, Sha1};\nfn etag(bytes: &[u8]) -> String {\n    let mut h = Sha1::new();\n    h.update(bytes);\n    let digest = md5::compute(bytes);\n    format!("{:x}-{:x}", h.finalize(), digest)\n}\n',
    'raw_strings.rs':
      'const QUERY: &str = r#"SELECT id, name FROM users WHERE id = $1"#;\nconst JSON: &str = r#"{"key": "value"}"#;\n',
    'env.rs':
      'fn password() -> String {\n    std::env::var("DB_PASSWORD").expect("DB_PASSWORD must be set")\n}\n',
    'tests_mod.rs':
      '#[cfg(test)]\nmod tests {\n    #[test]\n    fn it_works() {\n        assert_eq!(2 + 2, 4);\n    }\n}\n',
  };

  for (const [name, content] of Object.entries(benign)) {
    it(`stays quiet on benign ${name}`, () => {
      expect(scanner.scanFileContent(content, `src/${name}`)).toEqual([]);
    });
  }

  const positives: Array<[string, string, string]> = [
    ['AWS access key', 'const K: &str = "AKIAIOSFODNN7EXAMPLE";\n', 'SEC-SEC-001'],
    [
      'PEM private key',
      'const KEY: &str = "-----BEGIN RSA PRIVATE KEY-----\\nMIIEow...";\n',
      'SEC-SEC-003',
    ],
    [
      'password literal',
      'fn connect() {\n    let password = "hunter2-SuperSecret!";\n}\n',
      'SEC-SEC-004',
    ],
  ];

  for (const [label, content, ruleId] of positives) {
    it(`flags a ${label} in a .rs file`, () => {
      const ids = scanner.scanFileContent(content, 'src/lib.rs').map((f) => f.ruleId);
      expect(ids).toContain(ruleId);
    });
  }
});
