// Spawned as a separate OS process (distinct writerId per INV-1) by concurrency.test.ts.
// Args: <projectDir> <count>. Env: HARNESS_EVENT_WRITER_ID (distinct per worker).
//
// NOTE: @harness-engineering/core is a CommonJS package, so when this ESM worker is run
// under tsx the log module is transpiled to CJS and exposed via the default (module.exports)
// binding — named imports cannot be statically linked across that CJS→ESM boundary. Import
// the default and destructure; with esModuleInterop this also typechecks cleanly.
import logModule from '../../../src/state/event-sourcing/log.js';

const { emitEvent } = logModule;

const [, , projectDir, countStr] = process.argv;
const count = Number(countStr);

async function main() {
  for (let i = 0; i < count; i++) {
    const r = await emitEvent(projectDir, {
      type: 'position_set',
      payload: { position: `p${i}` },
    });
    if (!r.ok) {
      console.error(String(r.error));
      process.exit(1);
    }
  }
  process.exit(0);
}
void main();
