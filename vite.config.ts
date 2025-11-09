import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../../dist/assets',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/dashboard/index.html'),
    },
  },
  root: 'src/dashboard',
  server: {
    port: 5173,
    proxy: {
      '/rpc': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
