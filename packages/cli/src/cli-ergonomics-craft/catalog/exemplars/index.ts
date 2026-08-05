/**
 * Living catalog (ADR 0020) — curated CLI exemplars for cli-ergonomics-craft.
 *
 * These are REFERENCE POINTS, not fabricated content: each entry names a real,
 * publicly available command-line tool and states the single ergonomic
 * dimension it best exemplifies. They ground the rubric catalog (so a critique
 * can cite "the bar gh sets for --json composability") and seed a future
 * BENCHMARK phase — the direct analogue of docs-craft's exemplar corpus.
 *
 * v1 is CRITIQUE-only; the exemplar set exists to anchor rubric sources and to
 * give the growth catalog a place to accrete. No exemplar output is reproduced.
 */

export interface CliExemplar {
  /** Stable id in the cli-ergonomics-craft exemplar namespace. */
  id: string;
  /** Human name of the tool. */
  name: string;
  /** Public URL of the tool. */
  url: string;
  /** The one ergonomic dimension this tool best exemplifies. */
  exemplifies: string;
  /** Which seed rubric ids this exemplar most directly anchors. */
  anchors: ReadonlyArray<string>;
}

export const SEED_EXEMPLARS: ReadonlyArray<CliExemplar> = [
  {
    id: 'gh-cli',
    name: 'GitHub CLI (gh)',
    url: 'https://cli.github.com',
    exemplifies:
      'A uniform noun-verb command grammar across the whole surface, and first-class ' +
      'machine-readable output (--json with explicit field selection) alongside the human view.',
    anchors: ['CLI-R001', 'CLI-R006'],
  },
  {
    id: 'cargo',
    name: 'Cargo (Rust)',
    url: 'https://doc.rust-lang.org/cargo/',
    exemplifies:
      'Task-oriented help, a zero-config common path with sane defaults, and errors that carry ' +
      'the fix ("did you mean") instead of a stack trace.',
    anchors: ['CLI-R002', 'CLI-R004', 'CLI-R003'],
  },
  {
    id: 'ripgrep',
    name: 'ripgrep (rg)',
    url: 'https://github.com/BurntSushi/ripgrep',
    exemplifies:
      'Output that adapts to its destination — colored and grouped on a terminal, plain and ' +
      'script-safe the moment it is piped — so it stays both human-scannable and composable.',
    anchors: ['CLI-R005', 'CLI-R006'],
  },
  {
    id: 'docker',
    name: 'Docker CLI',
    url: 'https://docs.docker.com/reference/cli/docker/',
    exemplifies:
      'A consistent docker-noun-verb subcommand structure, and guarded destructive operations — ' +
      'prune states what it will remove and confirms, with --force to override for scripts.',
    anchors: ['CLI-R007', 'CLI-R001'],
  },
  {
    id: 'stripe-cli',
    name: 'Stripe CLI',
    url: 'https://docs.stripe.com/stripe-cli',
    exemplifies:
      'Help that opens with the job to be done, actionable errors that point at the next step, ' +
      'and structured output for scripting alongside the interactive experience.',
    anchors: ['CLI-R002', 'CLI-R003', 'CLI-R006'],
  },
];
