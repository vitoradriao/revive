import { defineConfig, loadEnv } from 'vite';
import { cwd } from 'node:process';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, cwd(), '');
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: env.REVIVE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
          // Keep the browser Host/Origin pair so same-origin validation also works locally.
          changeOrigin: false
        }
      }
    }
  };
});
