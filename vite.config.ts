import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  resolve: {
    alias: {
      $contracts: fileURLToPath(new URL('./src/contracts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
  },
});
