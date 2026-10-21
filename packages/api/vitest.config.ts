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
    resolve: {
      alias: {
        '@interview-prep/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      },
      conditions: ['import', 'node', 'default'],
      mainFields: ['module', 'jsnext:main', 'main'],
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
});