import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    globals: true,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.js'],
      exclude: [
        'src/app.js',          // Dead-Code – altes Monolith
        'src/index.html',
      ],
      thresholds: {
        lines:     60,
        functions: 60,
        branches:  60,
      },
    },
  },
});

