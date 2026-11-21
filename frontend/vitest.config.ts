import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      name: 'frontend',
      include: ['test/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: ['test/setup.ts'],
    },
  }),
);
