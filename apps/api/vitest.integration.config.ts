import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.int.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/**/*.test.ts'],
    },
  },
});
