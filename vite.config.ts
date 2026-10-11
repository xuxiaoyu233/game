import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  define: {
    __APP_TARGET__: JSON.stringify(mode === 'desktop' ? 'desktop' : 'web'),
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/.cache/**', '**/.tools/**', '**/src-tauri/target/**'] },
  },
  build: { outDir: mode === 'desktop' ? 'dist-desktop' : 'dist', target: 'es2022' },
}));
