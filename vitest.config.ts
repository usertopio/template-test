import { defineConfig } from 'vitest/config';

// One test run over every workspace. Tests live in <workspace>/test/unit and <workspace>/test/integration;
// `npm run test:unit` / `npm run test:integration` pick one kind by path.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', root: 'shared', include: ['test/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'core', root: 'core', include: ['test/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'backend', root: 'backend', include: ['test/**/*.test.ts'], environment: 'node' } },
      'frontend/vitest.config.ts',
    ],
  },
});
