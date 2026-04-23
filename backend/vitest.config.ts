import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: [
        'node_modules',
        'dist',
        'prisma',
        '**/*.test.ts',
        '**/*.config.ts',
        'src/server.ts', // entry point, not unit-testable
      ],
    },
  },
})
