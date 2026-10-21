import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@interview-prep/shared/pipeline': path.resolve(__dirname, './src/pipeline/index.ts'),
      '@interview-prep/shared/scheduler': path.resolve(__dirname, './src/scheduler/index.ts'),
      '@interview-prep/shared/schema/kit': path.resolve(__dirname, './src/schema/kit.ts'),
      '@interview-prep/shared': path.resolve(__dirname, './src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
});