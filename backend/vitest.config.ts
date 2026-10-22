import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
    fileParallelism: false,
    deps: {
      inline: ['@interview-prep/shared'],
    },
    transform: {
      '^.+\\.ts$': 'tsx',
    },
    transformMode: {
      web: [/\.[jt]sx?$/],
    },
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@interview-prep/shared/scheduler': path.resolve(__dirname, '../shared/src/scheduler/index.ts'),
      '@interview-prep/shared/schema/kit': path.resolve(__dirname, '../shared/src/schema/kit.ts'),
      '@interview-prep/shared/pipeline': path.resolve(__dirname, '../shared/src/pipeline/index.ts'),
      [/^@interview-prep\/shared$/]: path.resolve(__dirname, '../shared/src/index.ts'),
    },
    conditions: ['import', 'node', 'default'],
    mainFields: ['module', 'jsnext:main', 'main'],
  },
});
