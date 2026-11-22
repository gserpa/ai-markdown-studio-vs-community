import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/ai-markdown-studio-vs-community/test/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
    ],
    globals: true,
  },
});
