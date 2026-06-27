// Spawned as a separate OS process (distinct writerId per INV-1) by concurrency.test.ts.
// Args: <projectDir> <count> [mode]. mode='big' emits oversized payloads that force blob
// spill under concurrency. Env: HARNESS_EVENT_WRITER_ID (distinct per worker).
//
// NOTE: @harness-engineering/core is a CommonJS package, so when this ESM worker is run
// under tsx the log module is transpiled to CJS and exposed via the default (module.exports)
// binding — named imports cannot be statically linked across that CJS→ESM boundary. Import
// the default and destructure; with esModuleInterop this also typechecks cleanly.
import logModule from '../../../src/state/event-sourcing/log.js';

const { emitEvent } = logModule;

const [, , projectDir, countStr, mode] = process.argv;
const count = Number(countStr);
const writerId = process.env.HARNESS_EVENT_WRITER_ID ?? 'unknown';

// Filler large enough that the serialized line crosses MAX_LINE_BYTES (4096) → forces spill.
const FILLER = 'x'.repeat(5000);

async function main() {
  for (let i = 0; i < count; i++) {
    const input =
      mode === 'big'
        ? ({
            type: 'state_imported' as const,
            // i===0: identical payload across ALL writers → races the content-addressed,
            // idempotent blob write (same hash, atomic temp+rename). i>0: unique per
            // (writer,i) → concurrent distinct-blob spills.
            payload:
              i === 0
                ? { legacyState: { shared: true, filler: FILLER } }
                : { legacyState: { writer: writerId, i, filler: FILLER } },
          })
        : ({ type: 'position_set' as const, payload: { phase: `p${i}` } });
    const r = await emitEvent(projectDir, input);
    if (!r.ok) {
      console.error(String(r.error));
      process.exit(1);
    }
  }
  process.exit(0);
}
void main();
