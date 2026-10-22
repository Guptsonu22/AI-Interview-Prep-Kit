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
    alias: [
      { find: /^@interview-prep\/shared\/scheduler$/, replacement: path.resolve(__dirname, '../shared/src/scheduler/index.ts') },
      { find: /^@interview-prep\/shared\/schema\/kit$/, replacement: path.resolve(__dirname, '../shared/src/schema/kit.ts') },
      { find: /^@interview-prep\/shared\/pipeline$/, replacement: path.resolve(__dirname, '../shared/src/pipeline/index.ts') },
      { find: /^@interview-prep\/shared$/, replacement: path.resolve(__dirname, '../shared/src/index.ts') },
    ],
    conditions: ['import', 'node', 'default'],
    mainFields: ['module', 'jsnext:main', 'main'],
  },
});
