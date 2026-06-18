import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        statement: resolve(__dirname, 'statement.html'),
      },
    },
  },
  server: {
    port: 5181,
    open: true,
  },
});
