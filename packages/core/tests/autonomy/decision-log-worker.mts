// Spawned as a separate OS process by decision-log-concurrency.test.ts.
// Args: <projectDir> <slug> <writer> <count>. Core is CommonJS; under tsx the module is
// exposed via the default binding (see tests/state/event-sourcing/concurrency-worker.mts).
import logModule from '../../src/autonomy/decision-log.js';

const { appendAutoDecision } = logModule;
const [, , projectDir, slug, writer, countStr] = process.argv;
const count = Number(countStr);
// > 4 KiB per line (above PIPE_BUF), still under every field cap.
const question = 'q'.repeat(1500);
const pad = 'r'.repeat(3900);

for (let i = 0; i < count; i++) {
  const r = appendAutoDecision(
    projectDir as string,
    slug as string,
    {
      ts: new Date().toISOString(),
      skill: 'harness-planning',
      phase: writer as string,
      pauseClass: 'ceremony',
      question: `${question} ${i}`,
      options: ['approve'],
      chosen: 'approve',
      rationale: `${writer}:${i}:${pad}`.slice(0, 4000),
      autonomySource: 'user-config',
    },
    { gitToplevel: () => undefined, gitCommonDir: () => undefined }
  );
  if (!r.ok) {
    console.error(String(r.error));
    process.exit(1);
  }
}
process.exit(0);
