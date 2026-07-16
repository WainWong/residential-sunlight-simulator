import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /node_modules[\\/]three[\\/]/
            },
            {
              name: 'three-csg',
              test: /node_modules[\\/]three-(?:bvh-csg|mesh-bvh)[\\/]/
            }
          ]
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js']
  }
});

