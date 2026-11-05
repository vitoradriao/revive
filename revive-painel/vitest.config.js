import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // A paridade importa funções puras do mobile sem depender da configuração do Expo.
  esbuild: { tsconfigRaw: '{"compilerOptions":{}}' },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setupTests.js',
    globals: true,
    include: ['src/**/*.test.{js,jsx}']
  }
});
