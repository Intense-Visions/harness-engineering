import { defineConfig } from 'tsup';

// Library entry only. Unlike packages/burn there is no hot-path binary here:
// every consumer (routing, fleet-command, roadmap) imports this as a library.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  outDir: 'dist',
  tsconfig: 'tsconfig.build.json',
});
