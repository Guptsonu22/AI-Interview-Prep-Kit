import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  css: false,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@interview-prep/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
