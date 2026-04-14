import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/client'),
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env['DASHBOARD_CLIENT_PORT'] ?? 3700),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env['DASHBOARD_API_PORT'] ?? '3701'}`,
        changeOrigin: true,
      },
      '/api/v1': {
        target: `http://localhost:${process.env['ORCHESTRATOR_PORT'] ?? '8080'}`,
        changeOrigin: true,
      },
      '/api/interactions': {
        target: `http://localhost:${process.env['ORCHESTRATOR_PORT'] ?? '8080'}`,
        changeOrigin: true,
      },
      '/api/chat': {
        target: `http://localhost:${process.env['ORCHESTRATOR_PORT'] ?? '8080'}`,
        changeOrigin: true,
      },
      '/api/plans': {
        target: `http://localhost:${process.env['ORCHESTRATOR_PORT'] ?? '8080'}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `http://localhost:${process.env['ORCHESTRATOR_PORT'] ?? '8080'}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
