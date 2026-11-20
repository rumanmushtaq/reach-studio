import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'] },
  // `server-only` throws outside a React server build; tests run plain Node.
  resolve: { alias: { 'server-only': path.resolve('src/test/empty.ts'), '@': path.resolve('src') } },
});
