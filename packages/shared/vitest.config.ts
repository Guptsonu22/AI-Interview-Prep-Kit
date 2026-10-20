import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
    deps: {
      inline: ['@interview-prep/shared'],
    },
    resolve: {
      alias: {
        '@interview-prep/shared': path.resolve(__dirname, './src/index.ts'),
        '@interview-prep/shared/pipeline': path.resolve(__dirname, './src/pipeline/index.ts'),
        '@interview-prep/shared/scheduler': path.resolve(__dirname, './src/scheduler/index.ts'),
        '@interview-prep/shared/schema/kit': path.resolve(__dirname, './src/schema/kit.ts'),
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
  },
});