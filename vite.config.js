import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 650
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js']
  }
});

